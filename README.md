# MorphyGen

HTML -> PDF API as a Service (single or bulk upload). Frontend runs on Next.js (Vercel), backend runs on AWS Lambda.

## Goals
- Convert HTML to PDF reliably for single and bulk jobs
- Provide async jobs with webhooks and status polling
- Support multi-tenant usage, rate limits, and billing readiness
- Operate securely with audit logs and access controls

## Architecture (high level)
- **Frontend (Next.js / Vercel)**: dashboard, API key management, usage analytics, job submission
- **Backend (AWS Lambda + API Gateway)**: REST API for uploads and job lifecycle
- **Storage (S3)**: input HTML and output PDFs
- **Queue / Orchestration**: SQS + Lambda (or Step Functions) for bulk and retries
- **Metadata**: DynamoDB for job state and user/account data

## API (draft)
- `POST /v1/convert` — single HTML to PDF (sync or async)
- `POST /v1/bulk` — create bulk conversion job
- `GET /v1/jobs/{jobId}` — job status + outputs
- `GET /v1/jobs/{jobId}/items` — list bulk items
- `POST /v1/webhooks/test` — webhook verification

## Local Dev (planned)
- `frontend-nextjs/` for UI
- `backend-lambda/` for Lambda handlers
- `infra/` for deployment scripts/config

## Env Vars (draft)
Frontend:
- `NEXT_PUBLIC_API_BASE_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_SITE_URL`

Backend:
- `STAGE`
- `S3_BUCKET_INPUT`
- `S3_BUCKET_OUTPUT`
- `DDB_TABLE_JOBS`
- `WEBHOOK_SECRET`

## TODO (current development follow-up)
1) Finalize service scope (sync vs async defaults, max file size, supported HTML/CSS features)
2) Choose PDF engine (Chromium-based vs wkhtmltopdf) and Lambda packaging strategy
3) Define API contract + OpenAPI spec
4) Implement auth (API keys + HMAC signing) and rate limiting
5) Set up S3 + DynamoDB schema for jobs/items
6) Implement single convert flow end-to-end
7) Implement bulk flow with SQS + worker Lambda (or Step Functions)
8) Webhook delivery + retry policy
9) Observability (structured logs, metrics, tracing)
10) Frontend MVP: dashboard, job list, upload UI, webhooks UI
11) CI/CD for Vercel and AWS
12) Security: input sanitization, CORS, secrets management
13) Docs: examples in curl/Node/Python
14) Supabase auth setup (email templates + redirect URLs)

## Notes
- Consider asynchronous processing as default for reliability.
- Set timeouts and memory for PDF rendering carefully.
- Ensure PDF generation is deterministic across retries.
