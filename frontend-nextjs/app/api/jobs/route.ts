import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3"
import { SendMessageCommand } from "@aws-sdk/client-sqs"
import { GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb"
import { ulid } from "ulid"
import { NextResponse, type NextRequest } from "next/server"
import {
  CreateJobRequestSchema,
  CreateJobResponseSchema,
  INLINE_INPUT_REF,
  JobSchema,
} from "@/lib/job-schema"
import { dynamoDocClient, s3Client, sqsClient } from "@/lib/aws"
import { resolveTenantId } from "@/lib/api-auth"
import { enforceDailyQuota } from "@/lib/quota"
import { recordApiUsage } from "@/lib/api-usage"
import { recordApiLog } from "@/lib/api-logs"

export const runtime = "nodejs"

const INPUT_PREFIX = process.env.INPUT_PREFIX ?? "inputs/"
const OUTPUT_PREFIX = process.env.OUTPUT_PREFIX ?? "outputs/"

const jobsTableName = process.env.JOBS_TABLE_NAME
const jobsBucketName = process.env.JOBS_BUCKET_NAME
const renderQueueUrl = process.env.RENDER_QUEUE_URL

const requireEnv = (value: string | undefined, name: string) => {
  if (!value) {
    throw new Error(`Missing required env var: ${name}`)
  }
  return value
}

export const POST = async (req: NextRequest) => {
  const startedAt = Date.now()
  const auth = await resolveTenantId(req)
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const isAsync =
    req.nextUrl.searchParams.get("async") === "1" ||
    req.nextUrl.searchParams.get("async") === "true"
  const isSyncViaWorker = !isAsync

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

  const logAndReturnPdf = async (
    pdfBuffer: Buffer,
    details: { inputType?: string | null; jobId?: string | null } = {}
  ) => {
    await recordApiLog(req, {
      userId: auth.tenantId,
      apiKey: auth.apiKey,
      method: req.method,
      endpoint: req.nextUrl.pathname,
      statusCode: 200,
      latencyMs: Date.now() - startedAt,
      inputType: details.inputType ?? null,
      jobId: details.jobId ?? null,
      errorMessage: null,
    })

    const body = new Uint8Array(pdfBuffer)
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="render-${Date.now()}.pdf"`,
      },
    })
  }

  await recordApiUsage(auth.apiKey, auth.tenantId)

  const quota = await enforceDailyQuota(auth.tenantId)
  if (!quota.allowed) {
    return logAndRespond({ error: "Quota exceeded" }, 429, {
      errorMessage: "Quota exceeded",
    })
  }

  let raw: Record<string, unknown>
  try {
    raw = (await req.json()) as Record<string, unknown>
  } catch {
    return logAndRespond({ error: "Invalid JSON body" }, 400, {
      errorMessage: "Invalid JSON body",
    })
  }

  let parsed
  try {
    parsed = CreateJobRequestSchema.parse(raw)
  } catch (error) {
    return logAndRespond(
      { error: "Invalid request", details: String(error) },
      400,
      {
        errorMessage: String(error),
      }
    )
  }

  const inputHtml = typeof raw.inputHtml === "string" ? raw.inputHtml : null

  const jobId = ulid()
  const now = new Date().toISOString()
  let inputRef = parsed.inputRef

  if (parsed.inputType === "HTML") {
    if (!inputHtml && parsed.inputRef === INLINE_INPUT_REF) {
      return logAndRespond(
        { error: "inputHtml is required when inputRef=INLINE" },
        400,
        {
          inputType: parsed.inputType,
          errorMessage: "inputHtml is required when inputRef=INLINE",
        }
      )
    }

    if (inputHtml) {
      const key = `${INPUT_PREFIX}${auth.tenantId}/${jobId}.html`
      await s3Client.send(
        new PutObjectCommand({
          Bucket: requireEnv(jobsBucketName, "JOBS_BUCKET_NAME"),
          Key: key,
          Body: inputHtml,
          ContentType: "text/html",
        })
      )
      inputRef = key
    }
  }

  const job = JobSchema.parse({
    id: jobId,
    tenantId: auth.tenantId,
    status: "QUEUED",
    inputType: parsed.inputType,
    inputRef,
    options: parsed.options ?? null,
    resultS3Key: null,
    errorCode: null,
    errorMessage: null,
    idempotencyKey: parsed.idempotencyKey ?? null,
    createdAt: now,
    updatedAt: now,
    startedAt: null,
    finishedAt: null,
  })

  const item = {
    jobId,
    ...job,
  }

  await dynamoDocClient.send(
    new PutCommand({
      TableName: requireEnv(jobsTableName, "JOBS_TABLE_NAME"),
      Item: item,
    })
  )

  await sqsClient.send(
    new SendMessageCommand({
      QueueUrl: requireEnv(renderQueueUrl, "RENDER_QUEUE_URL"),
      MessageBody: JSON.stringify({
        jobId,
        tenantId: auth.tenantId,
        inputType: job.inputType,
        inputRef: job.inputRef,
        options: job.options ?? null,
        outputPrefix: OUTPUT_PREFIX,
      }),
    })
  )

  const responseBody = CreateJobResponseSchema.parse({ job })

  if (isSyncViaWorker) {
    const timeoutMs = 25000
    const pollIntervalMs = 1000
    const deadline = Date.now() + timeoutMs

    while (Date.now() < deadline) {
      const result = await dynamoDocClient.send(
        new GetCommand({
          TableName: requireEnv(jobsTableName, "JOBS_TABLE_NAME"),
          Key: { jobId },
        })
      )

      const item = result.Item as Record<string, unknown> | undefined
      if (item?.status === "SUCCEEDED" && item.resultS3Key) {
        if (item.tenantId !== auth.tenantId) {
          return logAndRespond({ error: "Not found" }, 404, {
            jobId,
            errorMessage: "Not found",
          })
        }

        const obj = await s3Client.send(
          new GetObjectCommand({
            Bucket: requireEnv(jobsBucketName, "JOBS_BUCKET_NAME"),
            Key: String(item.resultS3Key),
          })
        )
        if (!obj.Body) {
          return logAndRespond({ error: "Missing output" }, 500, {
            jobId,
            errorMessage: "Missing output",
          })
        }
        const chunks = []
        for await (const chunk of obj.Body as AsyncIterable<Uint8Array>) {
          chunks.push(chunk)
        }
        const pdfBuffer = Buffer.concat(chunks)
        return logAndReturnPdf(pdfBuffer, {
          inputType: job.inputType,
          jobId,
        })
      }

      if (item?.status === "FAILED") {
        return logAndRespond({ error: "Render failed" }, 500, {
          inputType: job.inputType,
          jobId,
          errorMessage: String(item.errorMessage ?? "Render failed"),
        })
      }

      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs))
    }

    return logAndRespond(
      { error: "Render in progress", jobId },
      202,
      { inputType: job.inputType, jobId }
    )
  }

  return logAndRespond(responseBody, 201, {
    inputType: job.inputType,
    jobId: job.id,
  })
}
