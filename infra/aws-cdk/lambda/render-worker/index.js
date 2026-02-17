const { S3Client, GetObjectCommand, PutObjectCommand } = require("@aws-sdk/client-s3")
const { SQSClient, SendMessageCommand } = require("@aws-sdk/client-sqs")
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb")
const { DynamoDBDocumentClient, UpdateCommand } = require("@aws-sdk/lib-dynamodb")
const crypto = require("node:crypto")
const chromium = require("@sparticuz/chromium")
const playwright = require("playwright-core")

const s3 = new S3Client({})
const sqs = new SQSClient({})
const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}))

const INPUT_PREFIX = process.env.INPUT_PREFIX || "inputs/"
const OUTPUT_PREFIX = process.env.OUTPUT_PREFIX || "outputs/"
const JOBS_TABLE_NAME = process.env.JOBS_TABLE_NAME
const JOBS_BUCKET_NAME = process.env.JOBS_BUCKET_NAME
const WEBHOOK_QUEUE_URL = process.env.WEBHOOK_QUEUE_URL
const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!JOBS_TABLE_NAME || !JOBS_BUCKET_NAME) {
  throw new Error("Missing JOBS_TABLE_NAME or JOBS_BUCKET_NAME")
}

const updateJob = async (jobId, fields) => {
  const updateExpressions = []
  const names = {}
  const values = {}

  Object.entries(fields).forEach(([key, value]) => {
    const nameKey = `#${key}`
    const valueKey = `:${key}`
    names[nameKey] = key
    values[valueKey] = value
    updateExpressions.push(`${nameKey} = ${valueKey}`)
  })

  await dynamo.send(
    new UpdateCommand({
      TableName: JOBS_TABLE_NAME,
      Key: { jobId },
      UpdateExpression: `SET ${updateExpressions.join(", ")}`,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
    })
  )
}

const fetchHtml = async (inputType, inputRef) => {
  if (inputType === "URL") {
    const response = await fetch(inputRef)
    if (!response.ok) {
      throw new Error(`Failed to fetch URL: ${response.status}`)
    }
    return await response.text()
  }

  if (!inputRef || typeof inputRef !== "string") {
    throw new Error("Missing inputRef for HTML input")
  }

  const key = inputRef.startsWith(INPUT_PREFIX) ? inputRef : `${INPUT_PREFIX}${inputRef}`
  const obj = await s3.send(
    new GetObjectCommand({
      Bucket: JOBS_BUCKET_NAME,
      Key: key,
    })
  )

  const chunks = []
  for await (const chunk of obj.Body) {
    chunks.push(chunk)
  }
  return Buffer.concat(chunks).toString("utf8")
}

const renderPdf = async ({ html, url, options }) => {
  const browser = await playwright.chromium.launch({
    args: chromium.args,
    executablePath: await chromium.executablePath(),
    headless: chromium.headless,
  })

  try {
    const contextOptions = {}
    if (options?.auth) {
      contextOptions.httpCredentials = {
        username: options.auth.username,
        password: options.auth.password,
      }
    }
    if (options?.httpHeaders) {
      contextOptions.extraHTTPHeaders = options.httpHeaders
    }

    const context = await browser.newContext(contextOptions)
    const page = await context.newPage()

    if (options?.cookies?.length) {
      await context.addCookies(options.cookies)
    }

    if (url) {
      await page.goto(url, { waitUntil: "networkidle" })
    } else {
      await page.setContent(html, { waitUntil: "networkidle" })
    }

    return await page.pdf({
      printBackground: true,
      format: "A4",
    })
  } finally {
    await browser.close()
  }
}

const incrementCreditsForUser = async (userId, amount) => {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return
  if (!userId || !Number.isFinite(amount) || amount <= 0) return

  try {
    console.log("Credit usage: increment request", {
      userId,
      amount,
      hasSupabaseUrl: Boolean(SUPABASE_URL),
      hasServiceRoleKey: Boolean(SUPABASE_SERVICE_ROLE_KEY),
    })
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/rpc/increment_credit_usage_for_user`,
      {
        method: "POST",
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ p_user_id: userId, p_amount: amount }),
      }
    )

    if (!response.ok) {
      const text = await response.text()
      console.error("Credit usage RPC failed", text)
    } else {
      console.log("Credit usage RPC success")
    }
  } catch (error) {
    console.error("Credit usage RPC error", error)
  }
}

const enqueueWebhookEvent = async ({ tenantId, type, data }) => {
  if (!WEBHOOK_QUEUE_URL) return
  if (!tenantId || !type) return

  const event = {
    id: `evt_${crypto.randomUUID()}`,
    type,
    createdAt: new Date().toISOString(),
    tenantId,
    data: data || {},
  }

  try {
    await sqs.send(
      new SendMessageCommand({
        QueueUrl: WEBHOOK_QUEUE_URL,
        MessageBody: JSON.stringify(event),
      })
    )
  } catch (error) {
    console.error("Webhook enqueue failed", error)
  }
}

exports.handler = async (event) => {
  const records = event?.Records ?? []

  for (const record of records) {
    const body = JSON.parse(record.body || "{}")
    const jobId = body.jobId
    const tenantId = body.tenantId
    const inputType = body.inputType
    const inputRef = body.inputRef
    const options = body.options ?? null

    if (!jobId || !tenantId) {
      console.warn("Missing jobId or tenantId", body)
      continue
    }

    const now = new Date().toISOString()

    try {
      await updateJob(jobId, {
        status: "RUNNING",
        startedAt: now,
        updatedAt: now,
      })

      await enqueueWebhookEvent({
        tenantId,
        type: "job.started",
        data: {
          jobId,
          status: "RUNNING",
          inputType,
        },
      })

      const html = inputType === "URL" ? null : await fetchHtml(inputType, inputRef)
      const pdfBuffer = await renderPdf({
        html,
        url: inputType === "URL" ? inputRef : null,
        options,
      })
      const outputKey = `${OUTPUT_PREFIX}${tenantId}/${jobId}.pdf`

      const credits = Math.max(1, Math.ceil(pdfBuffer.length / (5 * 1024 * 1024)))
      await incrementCreditsForUser(tenantId, credits)

      await s3.send(
        new PutObjectCommand({
          Bucket: JOBS_BUCKET_NAME,
          Key: outputKey,
          Body: pdfBuffer,
          ContentType: "application/pdf",
        })
      )

      await updateJob(jobId, {
        status: "SUCCEEDED",
        resultS3Key: outputKey,
        finishedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        errorCode: null,
        errorMessage: null,
      })

      await enqueueWebhookEvent({
        tenantId,
        type: "job.succeeded",
        data: {
          jobId,
          status: "SUCCEEDED",
          inputType,
          resultS3Key: outputKey,
          resultSizeBytes: pdfBuffer.length,
        },
      })
    } catch (error) {
      console.error("Render failed", error)
      await updateJob(jobId, {
        status: "FAILED",
        errorCode: "RENDER_FAILED",
        errorMessage: String(error?.message || error),
        finishedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })

      await enqueueWebhookEvent({
        tenantId,
        type: "job.failed",
        data: {
          jobId,
          status: "FAILED",
          inputType,
          errorCode: "RENDER_FAILED",
          errorMessage: String(error?.message || error),
        },
      })
    }
  }
}
