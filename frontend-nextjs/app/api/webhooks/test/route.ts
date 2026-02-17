import { NextResponse, type NextRequest } from "next/server";
import { GetCommand } from "@aws-sdk/lib-dynamodb";
import crypto from "node:crypto";
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

const signPayload = (secret: string | null, payload: string) => {
  if (!secret) return null;
  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(payload, "utf8");
  return `v1=${hmac.digest("hex")}`;
};

const sendTestWebhook = async ({
  webhookUrl,
  webhookSecret,
  tenantId,
}: {
  webhookUrl: string;
  webhookSecret: string | null;
  tenantId: string;
}) => {
  const payload = {
    id: `evt_test_${crypto.randomUUID()}`,
    type: "webhook.test",
    createdAt: new Date().toISOString(),
    tenantId,
    data: { message: "test event" },
  };

  const body = JSON.stringify(payload);
  const signature = signPayload(webhookSecret, body);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

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
    });
    return {
      ok: response.ok,
      status: response.status,
      body: await response.text(),
    };
  } finally {
    clearTimeout(timeout);
  }
};

export const POST = async (req: NextRequest) => {
  const user = await getUserFromRequest(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await dynamoDocClient.send(
    new GetCommand({
      TableName: requireEnv(tenantConfigTableName, "TENANT_CONFIG_TABLE_NAME"),
      Key: { tenantId: user.id },
    })
  );

  const config = result?.Item ?? null;
  if (!config?.webhookUrl) {
    return NextResponse.json({ error: "Webhook is not configured" }, { status: 400 });
  }

  const testResult = await sendTestWebhook({
    webhookUrl: config.webhookUrl,
    webhookSecret: config.webhookSecret || null,
    tenantId: user.id,
  });

  if (!testResult.ok) {
    return NextResponse.json(
      {
        error: "Webhook test failed",
        status: testResult.status,
        body: testResult.body,
      },
      { status: 502 }
    );
  }

  return NextResponse.json({ ok: true }, { status: 200 });
};
