const { DynamoDBClient } = require("@aws-sdk/client-dynamodb")
const { DynamoDBDocumentClient, GetCommand } = require("@aws-sdk/lib-dynamodb")
const { S3Client, GetObjectCommand } = require("@aws-sdk/client-s3")
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner")
const crypto = require("node:crypto")

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}))
const s3 = new S3Client({})

const TENANT_CONFIG_TABLE_NAME = process.env.TENANT_CONFIG_TABLE_NAME
const JOBS_BUCKET_NAME = process.env.JOBS_BUCKET_NAME

if (!TENANT_CONFIG_TABLE_NAME) {
  throw new Error("Missing TENANT_CONFIG_TABLE_NAME")
}

const getTenantConfig = async (tenantId) => {
  if (!tenantId) return null
  const result = await dynamo.send(
    new GetCommand({
      TableName: TENANT_CONFIG_TABLE_NAME,
      Key: { tenantId },
    })
  )
  return result?.Item ?? null
}

const buildSignedUrl = async (key) => {
  if (!JOBS_BUCKET_NAME || !key) return null
  try {
    return await getSignedUrl(
      s3,
      new GetObjectCommand({
        Bucket: JOBS_BUCKET_NAME,
        Key: key,
      }),
      { expiresIn: 60 * 30 }
    )
  } catch (error) {
    console.warn("Failed to generate signed URL", error)
    return null
  }
}

const signPayload = (secret, payload) => {
  if (!secret) return null
  const hmac = crypto.createHmac("sha256", secret)
  hmac.update(payload, "utf8")
  return `v1=${hmac.digest("hex")}`
}

const shouldSendEvent = (enabledEventTypes, type) => {
  if (!type) return false
  if (!enabledEventTypes || enabledEventTypes.length === 0) return true
  return enabledEventTypes.includes(type)
}

const dispatchWebhook = async (event) => {
  const tenantId = event?.tenantId
  const type = event?.type
  const createdAt = event?.createdAt || new Date().toISOString()

  const tenantConfig = await getTenantConfig(tenantId)
  const webhookUrl = tenantConfig?.webhookUrl
  const webhookSecret = tenantConfig?.webhookSecret
  const enabledEventTypes = tenantConfig?.enabledEventTypes

  if (!webhookUrl) {
    console.log("Webhook skipped: missing webhookUrl", { tenantId })
    return
  }

  if (!shouldSendEvent(enabledEventTypes, type)) {
    console.log("Webhook skipped: event not enabled", { tenantId, type })
    return
  }

  const data = event?.data || {}
  const resultS3Key = data.resultS3Key || data?.result?.s3Key || null
  const signedUrl = await buildSignedUrl(resultS3Key)

  const payload = {
    id: event?.id,
    type,
    createdAt,
    tenantId,
    data: {
      jobId: data.jobId,
      status: data.status,
      inputType: data.inputType,
      result: resultS3Key
        ? {
            s3Key: resultS3Key,
            url: signedUrl,
            contentType: "application/pdf",
            sizeBytes: data.resultSizeBytes ?? null,
          }
        : null,
      error:
        data.errorCode || data.errorMessage
          ? { code: data.errorCode ?? null, message: data.errorMessage ?? null }
          : null,
    },
  }

  const body = JSON.stringify(payload)
  const signature = signPayload(webhookSecret, body)

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Morphy-Event-Id": payload.id || "",
      "X-Morphy-Event-Type": payload.type || "",
      "X-Morphy-Timestamp": payload.createdAt,
      ...(signature ? { "X-Morphy-Signature": signature } : {}),
    },
    body,
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Webhook delivery failed: ${response.status} ${text}`)
  }
}

exports.handler = async (event) => {
  const records = event?.Records ?? []
  const failures = []

  for (const record of records) {
    try {
      const payload = JSON.parse(record.body || "{}")
      await dispatchWebhook(payload)
    } catch (error) {
      console.error("Webhook dispatch error", error)
      failures.push({ itemIdentifier: record.messageId })
    }
  }

  return { batchItemFailures: failures }
}
