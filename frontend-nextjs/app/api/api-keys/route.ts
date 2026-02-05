import { NextResponse, type NextRequest } from "next/server";
import { PutCommand } from "@aws-sdk/lib-dynamodb";
import crypto from "node:crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getUserFromRequest } from "@/lib/supabaseAuth";
import { dynamoDocClient } from "@/lib/aws";

export const runtime = "nodejs";

const apiKeysTableName = process.env.API_KEYS_TABLE_NAME;

const requireEnv = (value: string | undefined, name: string) => {
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
};

const generateApiKey = () => {
  const bytes = crypto.randomBytes(24);
  return `msk_${bytes.toString("hex")}`;
};

export const GET = async (req: NextRequest) => {
  const user = await getUserFromRequest(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabaseAdmin
    .from("api_keys")
    .select("id,name,key,created_at,last_used_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ keys: data ?? [] }, { status: 200 });
};

export const POST = async (req: NextRequest) => {
  const user = await getUserFromRequest(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: { name?: string } = {};
  try {
    payload = (await req.json()) as { name?: string };
  } catch {
    payload = {};
  }

  const name = payload.name?.trim() || "API Key";
  const key = generateApiKey();
  const createdAt = new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from("api_keys")
    .insert({
      user_id: user.id,
      name,
      key,
    })
    .select("id,name,key,created_at,last_used_at")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Insert failed" }, { status: 500 });
  }

  await dynamoDocClient.send(
    new PutCommand({
      TableName: requireEnv(apiKeysTableName, "API_KEYS_TABLE_NAME"),
      Item: {
        apiKey: key,
        tenantId: user.id,
        status: "ACTIVE",
        name,
        createdAt,
      },
    })
  );

  return NextResponse.json({ key: data }, { status: 201 });
};
