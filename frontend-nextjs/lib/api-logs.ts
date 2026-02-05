import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { NextRequest } from "next/server";

type LogContext = {
  userId: string;
  apiKey: string;
  method: string;
  endpoint: string;
  statusCode: number;
  latencyMs: number;
  inputType?: string | null;
  jobId?: string | null;
  errorMessage?: string | null;
  ip?: string | null;
  userAgent?: string | null;
};

const getClientIp = (req: NextRequest) => {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() || null;
  }
  return req.headers.get("x-real-ip");
};

export const recordApiLog = async (req: NextRequest, ctx: LogContext) => {
  try {
    await supabaseAdmin.from("api_request_logs").insert({
      user_id: ctx.userId,
      api_key: ctx.apiKey,
      method: ctx.method,
      endpoint: ctx.endpoint,
      status_code: ctx.statusCode,
      latency_ms: ctx.latencyMs,
      input_type: ctx.inputType ?? null,
      job_id: ctx.jobId ?? null,
      error_message: ctx.errorMessage ?? null,
      ip: ctx.ip ?? getClientIp(req),
      user_agent: ctx.userAgent ?? req.headers.get("user-agent"),
    });
  } catch (error) {
    console.error("Failed to record API log", error);
  }
};
