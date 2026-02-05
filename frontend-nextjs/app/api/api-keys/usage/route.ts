import { NextResponse, type NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getUserFromRequest } from "@/lib/supabaseAuth";

export const runtime = "nodejs";

const startOfMonthUtc = (date: Date) =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));

export const GET = async (req: NextRequest) => {
  const user = await getUserFromRequest(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const monthStart = startOfMonthUtc(now).toISOString().slice(0, 10);

  const { data: keys, error: keysError } = await supabaseAdmin
    .from("api_keys")
    .select("id,name,key")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  if (keysError) {
    return NextResponse.json({ error: keysError.message }, { status: 500 });
  }

  const { data: usageRows, error: usageError } = await supabaseAdmin
    .from("api_key_usage_daily")
    .select("api_key,count,usage_date")
    .eq("user_id", user.id)
    .gte("usage_date", monthStart);

  if (usageError) {
    return NextResponse.json({ error: usageError.message }, { status: 500 });
  }

  const totals = new Map<string, number>();
  for (const row of usageRows ?? []) {
    const current = totals.get(row.api_key) ?? 0;
    totals.set(row.api_key, current + (row.count ?? 0));
  }

  const usage = (keys ?? []).map((key) => ({
    id: key.id,
    name: key.name,
    key: key.key,
    count: totals.get(key.key) ?? 0,
  }));

  return NextResponse.json(
    {
      monthStart,
      usage,
    },
    { status: 200 }
  );
};
