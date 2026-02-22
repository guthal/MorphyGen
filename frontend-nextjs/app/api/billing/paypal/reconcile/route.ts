import { NextResponse, type NextRequest } from "next/server";
import { getUserFromRequest } from "@/lib/supabaseAuth";
import { paypalGet } from "@/lib/paypalAdmin";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

type PlanMap = Record<string, string>;

const parsePlanMap = () => {
  const raw = process.env.PAYPAL_PLAN_MAP || process.env.PAYPAL_PLAN_MAP_SANDBOX || "";
  if (!raw) return {};
  try {
    return JSON.parse(raw) as PlanMap;
  } catch {
    return {};
  }
};

const getPlanCodeFromPlanId = (
  planId: string | undefined,
  fallbackPlanCode: string | undefined
) => {
  if (!planId) return fallbackPlanCode ?? "free";
  const map = parsePlanMap();
  const planCode = Object.entries(map).find(([, value]) => value === planId)?.[0];
  return planCode ?? fallbackPlanCode ?? planId;
};

const normalizeStatus = (value: string | undefined) => {
  const raw = String(value || "").trim().toUpperCase();
  if (!raw) return "APPROVAL_PENDING";
  if (raw === "COMPLETED") return "ACTIVE";
  return raw;
};

export const POST = async (req: NextRequest) => {
  const user = await getUserFromRequest(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: { subscriptionId?: string } = {};
  try {
    payload = (await req.json()) as { subscriptionId?: string };
  } catch {
    payload = {};
  }

  const requestedSubscriptionId = payload.subscriptionId?.trim();
  const { data: existing } = await supabaseAdmin
    .from("subscriptions")
    .select("id,paypal_subscription_id,plan_code")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(20);

  const targetSubscriptionId =
    requestedSubscriptionId ||
    existing?.find((row) => Boolean(row.paypal_subscription_id))?.paypal_subscription_id ||
    null;

  if (!targetSubscriptionId) {
    return NextResponse.json(
      { error: "No PayPal subscription found for this user" },
      { status: 404 }
    );
  }

  const existingForTarget =
    existing?.find((row) => row.paypal_subscription_id === targetSubscriptionId) ?? null;

  const subscription = await paypalGet<Record<string, any>>(
    `/v1/billing/subscriptions/${targetSubscriptionId}`
  );

  const ownerUserId = (subscription.custom_id as string | undefined) ?? user.id;
  if (ownerUserId !== user.id) {
    return NextResponse.json({ error: "Subscription does not belong to user" }, { status: 403 });
  }

  const planId = subscription.plan_id as string | undefined;
  const status = normalizeStatus(subscription.status as string | undefined);
  const startTime = subscription.start_time as string | undefined;
  const nextBilling = subscription.billing_info?.next_billing_time as string | undefined;
  const now = new Date().toISOString();
  const planCode = getPlanCodeFromPlanId(planId, existingForTarget?.plan_code);

  const updatePayload = {
    plan_code: planCode,
    status,
    paypal_subscription_id: targetSubscriptionId,
    current_period_start: startTime ?? null,
    current_period_end: nextBilling ?? null,
    updated_at: now,
  };

  if (existingForTarget?.id) {
    await supabaseAdmin.from("subscriptions").update(updatePayload).eq("id", existingForTarget.id);
  } else {
    await supabaseAdmin.from("subscriptions").insert({
      user_id: user.id,
      ...updatePayload,
      created_at: now,
    });
  }

  if (startTime && nextBilling) {
    await supabaseAdmin.from("credit_usage_cycles").upsert({
      user_id: user.id,
      subscription_id: targetSubscriptionId,
      period_start: startTime,
      period_end: nextBilling,
      updated_at: now,
    });
  }

  await supabaseAdmin.from("payment_events").insert({
    user_id: user.id,
    provider: "paypal",
    event_type: "BILLING.SUBSCRIPTION.RECONCILED",
    event_id: targetSubscriptionId,
    payload: subscription,
  });

  return NextResponse.json(
    {
      success: true,
      subscriptionId: targetSubscriptionId,
      status,
      planCode,
      currentPeriodStart: startTime ?? null,
      currentPeriodEnd: nextBilling ?? null,
    },
    { status: 200 }
  );
};
