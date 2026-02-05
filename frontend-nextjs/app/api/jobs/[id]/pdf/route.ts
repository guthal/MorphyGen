import { GetObjectCommand } from "@aws-sdk/client-s3"
import { GetCommand } from "@aws-sdk/lib-dynamodb"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import { NextResponse, type NextRequest } from "next/server"
import { JobSchema } from "../../../../../../packages/shared/src/schemas/job"
import { dynamoDocClient, s3Client } from "@/lib/aws"
import { resolveTenantId } from "@/lib/api-auth"
import { recordApiLog } from "@/lib/api-logs"

export const runtime = "nodejs"

const jobsTableName = process.env.JOBS_TABLE_NAME
const jobsBucketName = process.env.JOBS_BUCKET_NAME

const requireEnv = (value: string | undefined, name: string) => {
  if (!value) {
    throw new Error(`Missing required env var: ${name}`)
  }
  return value
}

const buildJob = (item: Record<string, unknown>) => {
  const job = {
    id: item.id ?? item.jobId,
    tenantId: item.tenantId,
    status: item.status,
    inputType: item.inputType,
    inputRef: item.inputRef,
    options: item.options ?? null,
    resultS3Key: item.resultS3Key ?? null,
    errorCode: item.errorCode ?? null,
    errorMessage: item.errorMessage ?? null,
    idempotencyKey: item.idempotencyKey ?? null,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    startedAt: item.startedAt ?? null,
    finishedAt: item.finishedAt ?? null,
  }

  return JobSchema.parse(job)
}

export const GET = async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  const startedAt = Date.now()
  const auth = await resolveTenantId(req)
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const logAndRespond = async (
    body: Record<string, unknown>,
    status: number,
    details: {
      inputType?: string | null
      jobId?: string | null
      errorMessage?: string | null
    } = {}
  ) => {
    await recordApiLog(req, {
      userId: auth.tenantId,
      apiKey: auth.apiKey,
      method: req.method,
      endpoint: req.nextUrl.pathname,
      statusCode: status,
      latencyMs: Date.now() - startedAt,
      inputType: details.inputType ?? null,
      jobId: details.jobId ?? null,
      errorMessage: details.errorMessage ?? null,
    })
    return NextResponse.json(body, { status })
  }

  const logAndRedirect = async (
    url: string,
    details: { inputType?: string | null; jobId?: string | null } = {}
  ) => {
    await recordApiLog(req, {
      userId: auth.tenantId,
      apiKey: auth.apiKey,
      method: req.method,
      endpoint: req.nextUrl.pathname,
      statusCode: 302,
      latencyMs: Date.now() - startedAt,
      inputType: details.inputType ?? null,
      jobId: details.jobId ?? null,
      errorMessage: null,
    })
    return NextResponse.redirect(url, { status: 302 })
  }

  const { id } = await params

  const result = await dynamoDocClient.send(
    new GetCommand({
      TableName: requireEnv(jobsTableName, "JOBS_TABLE_NAME"),
      Key: { jobId: id },
    })
  )

  if (!result.Item) {
    return logAndRespond({ error: "Not found" }, 404, {
      jobId: id,
      errorMessage: "Not found",
    })
  }

  const job = buildJob(result.Item as Record<string, unknown>)
  if (job.tenantId !== auth.tenantId) {
    return logAndRespond({ error: "Not found" }, 404, {
      jobId: job.id,
      errorMessage: "Not found",
    })
  }

  if (job.status !== "SUCCEEDED" || !job.resultS3Key) {
    return logAndRespond({ error: "Job not ready" }, 409, {
      inputType: job.inputType,
      jobId: job.id,
      errorMessage: "Job not ready",
    })
  }

  const url = await getSignedUrl(
    s3Client,
    new GetObjectCommand({
      Bucket: requireEnv(jobsBucketName, "JOBS_BUCKET_NAME"),
      Key: job.resultS3Key,
    }),
    { expiresIn: 60 * 5 }
  )

  return logAndRedirect(url, { inputType: job.inputType, jobId: job.id })
}
