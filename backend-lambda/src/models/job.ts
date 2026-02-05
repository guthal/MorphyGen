export const JOB_STATUS_VALUES = [
  "QUEUED",
  "RUNNING",
  "SUCCEEDED",
  "FAILED",
] as const

export type JobStatus = (typeof JOB_STATUS_VALUES)[number]

export const JOB_INPUT_TYPE_VALUES = ["HTML", "URL"] as const

export type JobInputType = (typeof JOB_INPUT_TYPE_VALUES)[number]

export const INLINE_INPUT_REF = "INLINE"

export type RenderAuth = {
  username: string
  password: string
}

export type RenderCookie = {
  name: string
  value: string
  url?: string
  domain?: string
  path?: string
  expires?: number
  httpOnly?: boolean
  secure?: boolean
  sameSite?: "Strict" | "Lax" | "None"
}

export type RenderOptions = {
  auth?: RenderAuth
  httpHeaders?: Record<string, string>
  cookies?: RenderCookie[]
}

export type Job = {
  id: string
  tenantId: string
  status: JobStatus
  inputType: JobInputType
  inputRef: string
  options?: RenderOptions | null
  resultS3Key?: string | null
  errorCode?: string | null
  errorMessage?: string | null
  idempotencyKey?: string | null
  createdAt: string
  updatedAt: string
  startedAt?: string | null
  finishedAt?: string | null
}
