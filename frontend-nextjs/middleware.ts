import { NextResponse, type NextRequest } from "next/server"

const API_KEY_HEADER = "x-api-key"
const TENANT_HEADER = "x-tenant-id"
const RATE_LIMIT_HEADER = "x-rate-limit-remaining"

const RATE_LIMIT_PER_MIN = Number.parseInt(
  process.env.RATE_LIMIT_PER_MIN ?? "60",
  10
)
const WINDOW_SECONDS = 60

const parseApiKeyMap = () => {
  const raw = process.env.API_KEY_TENANT_MAP
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === "object") {
      return parsed as Record<string, string>
    }
  } catch {
    return null
  }
  return null
}

const apiKeyMap = parseApiKeyMap()
const memoryStore: Map<string, { count: number; resetAt: number }> =
  (globalThis as unknown as { __rlStore?: Map<string, { count: number; resetAt: number }> })
    .__rlStore ?? new Map()

;(globalThis as unknown as { __rlStore?: Map<string, { count: number; resetAt: number }> }).__rlStore =
  memoryStore

const getTenantIdFromApiKey = (apiKey: string | null): string | null => {
  if (!apiKey) return null
  if (apiKeyMap && apiKeyMap[apiKey]) return apiKeyMap[apiKey]

  const devApiKey = process.env.DEV_API_KEY
  const devTenantId = process.env.DEV_TENANT_ID
  if (devApiKey && devTenantId && apiKey === devApiKey) {
    return devTenantId
  }

  return `key:${apiKey}`
}

const upstashRequest = async (path: string) => {
  const baseUrl = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!baseUrl || !token) return null

  const res = await fetch(`${baseUrl}/${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })

  if (!res.ok) {
    return null
  }

  return (await res.json()) as { result?: number }
}

const rateLimit = async (tenantId: string) => {
  const windowKey = Math.floor(Date.now() / 1000 / WINDOW_SECONDS)
  const key = `rl:${tenantId}:${windowKey}`

  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    const incr = await upstashRequest(`incr/${encodeURIComponent(key)}`)
    const count = incr?.result ?? RATE_LIMIT_PER_MIN + 1
    if (count === 1) {
      await upstashRequest(
        `expire/${encodeURIComponent(key)}/${WINDOW_SECONDS}`
      )
    }
    return {
      allowed: count <= RATE_LIMIT_PER_MIN,
      remaining: Math.max(RATE_LIMIT_PER_MIN - count, 0),
    }
  }

  const now = Date.now()
  const entry = memoryStore.get(key)
  if (!entry || entry.resetAt <= now) {
    memoryStore.set(key, { count: 1, resetAt: now + WINDOW_SECONDS * 1000 })
    return { allowed: true, remaining: RATE_LIMIT_PER_MIN - 1 }
  }

  entry.count += 1
  memoryStore.set(key, entry)
  return {
    allowed: entry.count <= RATE_LIMIT_PER_MIN,
    remaining: Math.max(RATE_LIMIT_PER_MIN - entry.count, 0),
  }
}

export const middleware = async (req: NextRequest) => {
  const apiKey = req.headers.get(API_KEY_HEADER)
  const tenantId = getTenantIdFromApiKey(apiKey)

  if (!tenantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { allowed, remaining } = await rateLimit(tenantId)
  if (!allowed) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 })
  }

  const requestHeaders = new Headers(req.headers)
  requestHeaders.set(TENANT_HEADER, tenantId)
  requestHeaders.set(RATE_LIMIT_HEADER, String(remaining))

  return NextResponse.next({
    request: { headers: requestHeaders },
  })
}

export const config = {
  matcher: ["/api/jobs/:path*"],
}
