const { DynamoDBClient } = require("@aws-sdk/client-dynamodb")
const { DynamoDBDocumentClient, GetCommand, PutCommand } = require("@aws-sdk/lib-dynamodb")
const crypto = require("node:crypto")

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}))

const API_KEYS_TABLE_NAME = process.env.API_KEYS_TABLE_NAME
const TENANT_CONFIG_TABLE_NAME = process.env.TENANT_CONFIG_TABLE_NAME

if (!API_KEYS_TABLE_NAME || !TENANT_CONFIG_TABLE_NAME) {
  throw new Error("Missing API_KEYS_TABLE_NAME or TENANT_CONFIG_TABLE_NAME")
}

const SUPPORTED_EVENT_TYPES = [
  "job.started",
  "job.succeeded",
  "job.failed",
  "webhook.test",
]

const json = (statusCode, body) => ({
  statusCode,
  headers: {
    "Content-Type": "application/json",
  },
  body: JSON.stringify(body),
})

const parseJsonBody = (event) => {
  if (!event?.body) return {}
  try {
    return JSON.parse(event.body)
  } catch {
    return null
  }
}

const getApiKeyFromHeaders = (headers) => {
  const h = {}
  Object.entries(headers || {}).forEach(([k, v]) => {
    h[k.toLowerCase()] = v
  })
  const auth = h.authorization || ""
  if (auth.toLowerCase().startsWith("bearer ")) {
    return auth.slice(7).trim()
  }
  if (h["x-api-key"]) return String(h["x-api-key"]).trim()
  return null
}

const getTenantIdForApiKey = async (apiKey) => {
  if (!apiKey) return null
  const result = await dynamo.send(
    new GetCommand({
      TableName: API_KEYS_TABLE_NAME,
      Key: { apiKey },
    })
  )
  return result?.Item?.tenantId ?? null
}

const getTenantConfig = async (tenantId) => {
  const result = await dynamo.send(
    new GetCommand({
      TableName: TENANT_CONFIG_TABLE_NAME,
      Key: { tenantId },
    })
  )
  return result?.Item ?? null
}

const validateWebhookUrl = (url) => {
  if (url === null) return true
  if (typeof url !== "string" || !url.trim()) return false
  try {
    const parsed = new URL(url)
    return parsed.protocol === "https:"
  } catch {
    return false
  }
}

const normalizeEnabledEventTypes = (value) => {
  if (value == null) return null
  if (!Array.isArray(value)) return null
  const cleaned = value.map((v) => String(v))
  const invalid = cleaned.filter((v) => !SUPPORTED_EVENT_TYPES.includes(v))
  if (invalid.length) return null
  return cleaned
}

const signPayload = (secret, payload) => {
  if (!secret) return null
  const hmac = crypto.createHmac("sha256", secret)
  hmac.update(payload, "utf8")
  return `v1=${hmac.digest("hex")}`
}

const sendTestWebhook = async ({ webhookUrl, webhookSecret, tenantId }) => {
  const payload = {
    id: `evt_test_${crypto.randomUUID()}`,
    type: "webhook.test",
    createdAt: new Date().toISOString(),
    tenantId,
    data: { message: "test event" },
  }

  const body = JSON.stringify(payload)
  const signature = signPayload(webhookSecret, body)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10000)

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Morphy-Event-Id": payload.id,
        "X-Morphy-Event-Type": payload.type,
        "X-Morphy-Timestamp": payload.createdAt,
        ...(signature ? { "X-Morphy-Signature": signature } : {}),
      },
      body,
      signal: controller.signal,
    })
    return {
      ok: response.ok,
      status: response.status,
      body: await response.text(),
    }
  } finally {
    clearTimeout(timeout)
  }
}

const handleGet = async ({ tenantId }) => {
  const config = await getTenantConfig(tenantId)
  return json(200, {
    tenantId,
    webhookUrl: config?.webhookUrl ?? null,
    enabledEventTypes: config?.enabledEventTypes ?? [],
    hasWebhookSecret: Boolean(config?.webhookSecret),
    updatedAt: config?.updatedAt ?? null,
  })
}

const handlePut = async ({ tenantId, body }) => {
  if (!body || typeof body !== "object") {
    return json(400, { error: "Invalid JSON body" })
  }

  const existing = await getTenantConfig(tenantId)
  const next = {
    tenantId,
    webhookUrl: body.webhookUrl ?? existing?.webhookUrl ?? null,
    webhookSecret:
      Object.prototype.hasOwnProperty.call(body, "webhookSecret")
        ? body.webhookSecret || null
        : existing?.webhookSecret ?? null,
    enabledEventTypes:
      Object.prototype.hasOwnProperty.call(body, "enabledEventTypes")
        ? body.enabledEventTypes
        : existing?.enabledEventTypes ?? [],
    updatedAt: new Date().toISOString(),
  }

  if (!validateWebhookUrl(next.webhookUrl)) {
    return json(400, { error: "webhookUrl must be a valid https URL or null" })
  }

  const normalizedEvents = normalizeEnabledEventTypes(next.enabledEventTypes)
  if (normalizedEvents === null) {
    return json(400, { error: "enabledEventTypes is invalid" })
  }
  next.enabledEventTypes = normalizedEvents

  await dynamo.send(
    new PutCommand({
      TableName: TENANT_CONFIG_TABLE_NAME,
      Item: next,
    })
  )

  return json(200, {
    tenantId,
    webhookUrl: next.webhookUrl,
    enabledEventTypes: next.enabledEventTypes,
    hasWebhookSecret: Boolean(next.webhookSecret),
    updatedAt: next.updatedAt,
  })
}

const handleTest = async ({ tenantId }) => {
  const config = await getTenantConfig(tenantId)
  if (!config?.webhookUrl) {
    return json(400, { error: "Webhook is not configured" })
  }

  const result = await sendTestWebhook({
    webhookUrl: config.webhookUrl,
    webhookSecret: config.webhookSecret || null,
    tenantId,
  })

  if (!result.ok) {
    return json(502, {
      error: "Webhook test failed",
      status: result.status,
      body: result.body,
    })
  }

  return json(200, { ok: true })
}

exports.handler = async (event) => {
  const method = event?.requestContext?.http?.method || "GET"
  const path = event?.rawPath || "/"

  const apiKey = getApiKeyFromHeaders(event?.headers || {})
  const tenantId = await getTenantIdForApiKey(apiKey)
  if (!tenantId) {
    return json(401, { error: "Unauthorized" })
  }

  if (path === "/v1/webhooks" && method === "GET") {
    return await handleGet({ tenantId })
  }
  if (path === "/v1/webhooks" && method === "PUT") {
    const body = parseJsonBody(event)
    if (body === null) return json(400, { error: "Invalid JSON body" })
    return await handlePut({ tenantId, body })
  }
  if (path === "/v1/webhooks/test" && method === "POST") {
    return await handleTest({ tenantId })
  }

  return json(404, { error: "Not found" })
}
