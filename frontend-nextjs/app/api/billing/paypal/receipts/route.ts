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

  const { data: subs } = await supabaseAdmin
    .from("subscriptions")
    .select("paypal_subscription_id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(20);

  const paypalSubscriptionId =
    subs?.find((row) => Boolean(row.paypal_subscription_id))?.paypal_subscription_id ?? null;

  if (!paypalSubscriptionId) {
    return NextResponse.json({ receipts: [] }, { status: 200 });
  }

  const { startTime, endTime } = getDateRange(req);
  let receipts = [] as Awaited<ReturnType<typeof getSubscriptionReceipts>>;
  try {
    receipts = await getSubscriptionReceipts({
      subscriptionId: paypalSubscriptionId,
      startTime,
      endTime,
    });
  } catch (error) {
    console.warn("Failed to load PayPal receipts", error);
  }

  return NextResponse.json({ receipts }, { status: 200 });
};
