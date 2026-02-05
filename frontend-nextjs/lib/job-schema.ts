import { z } from "zod"

export const UlidSchema = z
  .string()
  .regex(/^[0-9A-HJKMNP-TV-Z]{26}$/, "Invalid ULID")

export const JobStatusSchema = z.enum([
  "QUEUED",
  "RUNNING",
  "SUCCEEDED",
  "FAILED",
])

export const JobInputTypeSchema = z.enum(["HTML", "URL"])

export const INLINE_INPUT_REF = "INLINE"

export const InputRefSchema = z.string().min(1)

export const RenderAuthSchema = z.object({
  username: z.string().min(1),
  password: z.string(),
})

export const RenderCookieSchema = z
  .object({
    name: z.string().min(1),
    value: z.string(),
    url: z.string().url().optional(),
    domain: z.string().min(1).optional(),
    path: z.string().min(1).optional(),
    expires: z.number().optional(),
    httpOnly: z.boolean().optional(),
    secure: z.boolean().optional(),
    sameSite: z.enum(["Strict", "Lax", "None"]).optional(),
  })
  .refine((cookie) => Boolean(cookie.url || cookie.domain), {
    message: "cookies must include either url or domain",
  })

export const RenderOptionsSchema = z
  .object({
    auth: RenderAuthSchema.optional(),
    httpHeaders: z.record(z.string(), z.string()).optional(),
    cookies: z.array(RenderCookieSchema).optional(),
  })
  .strict()

export const JobSchema = z.object({
  id: UlidSchema,
  tenantId: z.string().min(1),
  status: JobStatusSchema,
  inputType: JobInputTypeSchema,
  inputRef: InputRefSchema,
  options: RenderOptionsSchema.nullable().optional(),
  resultS3Key: z.string().min(1).nullable().optional(),
  errorCode: z.string().min(1).nullable().optional(),
  errorMessage: z.string().min(1).nullable().optional(),
  idempotencyKey: z.string().min(1).nullable().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  startedAt: z.string().datetime().nullable().optional(),
  finishedAt: z.string().datetime().nullable().optional(),
})

export const CreateJobRequestSchema = z.object({
  inputType: JobInputTypeSchema,
  inputRef: InputRefSchema,
  options: RenderOptionsSchema.nullable().optional(),
  idempotencyKey: z.string().min(1).optional(),
})

export const CreateJobResponseSchema = z.object({
  job: JobSchema,
})

export const JobStatusResponseSchema = z.object({
  job: JobSchema,
  downloadUrl: z.string().url().optional(),
})

export type Job = z.infer<typeof JobSchema>
export type CreateJobRequest = z.infer<typeof CreateJobRequestSchema>
export type CreateJobResponse = z.infer<typeof CreateJobResponseSchema>
export type JobStatusResponse = z.infer<typeof JobStatusResponseSchema>
export type RenderOptions = z.infer<typeof RenderOptionsSchema>
export type RenderCookie = z.infer<typeof RenderCookieSchema>
