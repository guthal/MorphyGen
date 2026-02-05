import { NextResponse, type NextRequest } from "next/server";
import { UpdateCommand } from "@aws-sdk/lib-dynamodb";
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

export const PATCH = async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  const user = await getUserFromRequest(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  let payload: { name?: string } = {};
  try {
    payload = (await req.json()) as { name?: string };
  } catch {
    payload = {};
  }

  const name = payload.name?.trim();
  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("api_keys")
    .update({ name })
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id,name,key,created_at,last_used_at")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Update failed" }, { status: 500 });
  }

  await dynamoDocClient.send(
    new UpdateCommand({
      TableName: requireEnv(apiKeysTableName, "API_KEYS_TABLE_NAME"),
      Key: { apiKey: data.key },
      UpdateExpression: "SET #name = :name",
      ExpressionAttributeNames: { "#name": "name" },
      ExpressionAttributeValues: { ":name": name },
    })
  );

  return NextResponse.json({ key: data }, { status: 200 });
};

export const DELETE = async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  const user = await getUserFromRequest(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const { data: existing, error: fetchError } = await supabaseAdmin
    .from("api_keys")
    .select("id,key")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (fetchError || !existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { error } = await supabaseAdmin
    .from("api_keys")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await dynamoDocClient.send(
    new UpdateCommand({
      TableName: requireEnv(apiKeysTableName, "API_KEYS_TABLE_NAME"),
      Key: { apiKey: existing.key },
      UpdateExpression: "SET #status = :status",
      ExpressionAttributeNames: { "#status": "status" },
      ExpressionAttributeValues: { ":status": "REVOKED" },
    })
  );

  return NextResponse.json({ success: true }, { status: 200 });
};
