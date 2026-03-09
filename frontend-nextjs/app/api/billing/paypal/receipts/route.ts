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

  const paypalSubscriptionIds = Array.from(
    new Set(
      (subs ?? [])
        .map((row) => row.paypal_subscription_id)
        .filter((value): value is string => Boolean(value))
    )
  );

  if (paypalSubscriptionIds.length === 0) {
    return NextResponse.json({ receipts: [] }, { status: 200 });
  }

  const { startTime, endTime } = getDateRange(req);
  const mergedReceipts = new Map<string, Awaited<ReturnType<typeof getSubscriptionReceipts>>[number]>();

  for (const subscriptionId of paypalSubscriptionIds) {
    try {
      const receipts = await getSubscriptionReceipts({
        subscriptionId,
        startTime,
        endTime,
      });
      for (const receipt of receipts) {
        if (!receipt.id) continue;
        mergedReceipts.set(receipt.id, receipt);
      }
    } catch (error) {
      console.warn("Failed to load PayPal receipts", { subscriptionId, error });
    }
  }

  const receipts = Array.from(mergedReceipts.values()).sort(
    (a, b) => new Date(b.time).getTime() - new Date(a.time).getTime()
  );

  return NextResponse.json({ receipts }, { status: 200 });
};
