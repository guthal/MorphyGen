import { NextResponse, type NextRequest } from "next/server";
import { getUserFromRequest } from "@/lib/supabaseAuth";
import { isPayPalResourceNotFoundError, paypalRequest } from "@/lib/paypalAdmin";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

const CANCELED_STATUSES = new Set(["CANCELLED", "CANCELED", "EXPIRED"]);

export const POST = async (req: NextRequest) => {
  const user = await getUserFromRequest(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: { subscriptionId?: string; reason?: string } = {};
  try {
    payload = (await req.json()) as typeof payload;
  } catch {
    payload = {};
  }

  const requestedSubscriptionId = payload.subscriptionId?.trim() || null;
  const reason = payload.reason?.trim() || "Cancelled by customer";

  const { data: existing } = await supabaseAdmin
    .from("subscriptions")
    .select("id,paypal_subscription_id,status")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(20);

  const target =
    (requestedSubscriptionId
      ? existing?.find((row) => row.paypal_subscription_id === requestedSubscriptionId)
      : existing?.find(
          (row) =>
            Boolean(row.paypal_subscription_id) &&
            !CANCELED_STATUSES.has(String(row.status || "").toUpperCase())
        )) ??
    existing?.find((row) => Boolean(row.paypal_subscription_id)) ??
    null;

  const targetSubscriptionId = requestedSubscriptionId || target?.paypal_subscription_id || null;
  if (!targetSubscriptionId) {
    return NextResponse.json({ error: "No PayPal subscription found for this user" }, { status: 404 });
  }

  try {
    await paypalRequest<Record<string, unknown>>(
      `/v1/billing/subscriptions/${targetSubscriptionId}/cancel`,
      { reason }
    );
  } catch (error) {
    if (isPayPalResourceNotFoundError(error)) {
      return NextResponse.json(
        {
          error:
            "PayPal subscription not found. The stored subscription id is stale or belongs to a different PayPal environment.",
        },
        { status: 404 }
      );
    }
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to cancel PayPal subscription",
      },
      { status: 400 }
    );
  }

  const now = new Date().toISOString();
  if (target?.id) {
    await supabaseAdmin
      .from("subscriptions")
      .update({ status: "CANCELLED", updated_at: now })
      .eq("id", target.id);
  } else {
    await supabaseAdmin
      .from("subscriptions")
      .update({ status: "CANCELLED", updated_at: now })
      .eq("user_id", user.id)
      .eq("paypal_subscription_id", targetSubscriptionId);
  }

  await supabaseAdmin.from("payment_events").insert({
    user_id: user.id,
    provider: "paypal",
    event_type: "BILLING.SUBSCRIPTION.CANCELLED",
    event_id: targetSubscriptionId,
    payload: {
      reason,
      source: "api.billing.paypal.cancel",
      canceled_at: now,
    },
  });

  return NextResponse.json(
    {
      success: true,
      subscriptionId: targetSubscriptionId,
      status: "CANCELLED",
    },
    { status: 200 }
  );
};
