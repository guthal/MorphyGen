import { NextResponse, type NextRequest } from "next/server";
import { GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { getUserFromRequest } from "@/lib/supabaseAuth";
import { dynamoDocClient } from "@/lib/aws";

export const runtime = "nodejs";

const tenantConfigTableName = process.env.TENANT_CONFIG_TABLE_NAME;

const requireEnv = (value: string | undefined, name: string) => {
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
};

const SUPPORTED_EVENT_TYPES = [
  "job.started",
  "job.succeeded",
  "job.failed",
  "webhook.test",
];

const validateWebhookUrl = (url: unknown) => {
  if (url === null) return true;
  if (typeof url !== "string" || !url.trim()) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:";
  } catch {
    return false;
  }
};

const normalizeEnabledEventTypes = (value: unknown) => {
  if (value == null) return [];
  if (!Array.isArray(value)) return null;
  const cleaned = value.map((v) => String(v));
  const invalid = cleaned.filter((v) => !SUPPORTED_EVENT_TYPES.includes(v));
  if (invalid.length) return null;
  return cleaned;
};

const getTenantConfig = async (tenantId: string) => {
  const result = await dynamoDocClient.send(
    new GetCommand({
      TableName: requireEnv(tenantConfigTableName, "TENANT_CONFIG_TABLE_NAME"),
      Key: { tenantId },
    })
  );
  return result?.Item ?? null;
};

export const GET = async (req: NextRequest) => {
  const user = await getUserFromRequest(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const config = await getTenantConfig(user.id);
  return NextResponse.json(
    {
      tenantId: user.id,
      webhookUrl: config?.webhookUrl ?? null,
      enabledEventTypes: config?.enabledEventTypes ?? [],
      hasWebhookSecret: Boolean(config?.webhookSecret),
      updatedAt: config?.updatedAt ?? null,
    },
    { status: 200 }
  );
};

export const PUT = async (req: NextRequest) => {
  const user = await getUserFromRequest(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: {
    webhookUrl?: string | null;
    webhookSecret?: string | null;
    enabledEventTypes?: string[];
  } = {};
  try {
    payload = (await req.json()) as typeof payload;
  } catch {
    payload = {};
  }

  const existing = await getTenantConfig(user.id);
  const webhookUrl =
    payload.webhookUrl !== undefined ? payload.webhookUrl : existing?.webhookUrl ?? null;
  const enabledEventTypes =
    payload.enabledEventTypes !== undefined
      ? payload.enabledEventTypes
      : existing?.enabledEventTypes ?? [];
  const webhookSecret =
    payload.webhookSecret !== undefined
      ? payload.webhookSecret || null
      : existing?.webhookSecret ?? null;

  if (!validateWebhookUrl(webhookUrl)) {
    return NextResponse.json(
      { error: "webhookUrl must be a valid https URL or null" },
      { status: 400 }
    );
  }

  const normalizedEvents = normalizeEnabledEventTypes(enabledEventTypes);
  if (normalizedEvents === null) {
    return NextResponse.json({ error: "enabledEventTypes is invalid" }, { status: 400 });
  }

  const next = {
    tenantId: user.id,
    webhookUrl,
    webhookSecret,
    enabledEventTypes: normalizedEvents,
    updatedAt: new Date().toISOString(),
  };

  await dynamoDocClient.send(
    new PutCommand({
      TableName: requireEnv(tenantConfigTableName, "TENANT_CONFIG_TABLE_NAME"),
      Item: next,
    })
  );

  return NextResponse.json(
    {
      tenantId: user.id,
      webhookUrl: next.webhookUrl,
      enabledEventTypes: next.enabledEventTypes,
      hasWebhookSecret: Boolean(next.webhookSecret),
      updatedAt: next.updatedAt,
    },
    { status: 200 }
  );
};
