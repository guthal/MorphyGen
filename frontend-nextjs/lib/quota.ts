const DAY_SECONDS = 60 * 60 * 24

const memoryStore: Map<string, { count: number; resetAt: number }> =
  (globalThis as unknown as { __quotaStore?: Map<string, { count: number; resetAt: number }> })
    .__quotaStore ?? new Map()

;(globalThis as unknown as { __quotaStore?: Map<string, { count: number; resetAt: number }> }).__quotaStore =
  memoryStore

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

const quotaKey = (tenantId: string) => {
  const today = new Date().toISOString().slice(0, 10)
  return `quota:${tenantId}:${today}`
}

export const enforceDailyQuota = async (tenantId: string) => {
  const rawQuota = process.env.DAILY_JOB_QUOTA
  if (!rawQuota) {
    return { allowed: true, remaining: null }
  }

  const quota = Number.parseInt(rawQuota, 10)
  if (!Number.isFinite(quota) || quota <= 0) {
    return { allowed: true, remaining: null }
  }

  const key = quotaKey(tenantId)

  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    const incr = await upstashRequest(`incr/${encodeURIComponent(key)}`)
    const count = incr?.result ?? quota + 1
    if (count === 1) {
      await upstashRequest(`expire/${encodeURIComponent(key)}/${DAY_SECONDS}`)
    }
    return {
      allowed: count <= quota,
      remaining: Math.max(quota - count, 0),
    }
  }

  const now = Date.now()
  const entry = memoryStore.get(key)
  if (!entry || entry.resetAt <= now) {
    memoryStore.set(key, { count: 1, resetAt: now + DAY_SECONDS * 1000 })
    return { allowed: true, remaining: quota - 1 }
  }

  entry.count += 1
  memoryStore.set(key, entry)
  return {
    allowed: entry.count <= quota,
    remaining: Math.max(quota - entry.count, 0),
  }
}
