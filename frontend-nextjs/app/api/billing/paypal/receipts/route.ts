import { NextResponse, type NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getUserFromRequest } from "@/lib/supabaseAuth";
import { getSubscriptionReceipts } from "@/lib/paypalReceipts";

export const runtime = "nodejs";

const getDateRange = (req: NextRequest) => {
  const url = new URL(req.url);
  const start = url.searchParams.get("start");
  const end = url.searchParams.get("end");
  if (start && end) {
    const startDate = new Date(start);
    const endDate = new Date(end);
    if (!Number.isNaN(startDate.getTime()) && !Number.isNaN(endDate.getTime())) {
      return { startTime: startDate.toISOString(), endTime: endDate.toISOString() };
    }
  }

  const endTime = new Date();
  const startTime = new Date();
  startTime.setUTCFullYear(endTime.getUTCFullYear() - 1);

  return { startTime: startTime.toISOString(), endTime: endTime.toISOString() };
};

export const GET = async (req: NextRequest) => {
  const user = await getUserFromRequest(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: sub } = await supabaseAdmin
    .from("subscriptions")
    .select("paypal_subscription_id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!sub?.paypal_subscription_id) {
    return NextResponse.json({ receipts: [] }, { status: 200 });
  }

  const { startTime, endTime } = getDateRange(req);
  const receipts = await getSubscriptionReceipts({
    subscriptionId: sub.paypal_subscription_id,
    startTime,
    endTime,
  });

  return NextResponse.json({ receipts }, { status: 200 });
};
