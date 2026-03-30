import { NextResponse, type NextRequest } from "next/server";
import { getUserFromRequest } from "@/lib/supabaseAuth";
import {
  getPayPalConfigSnapshot,
  isPayPalResourceNotFoundError,
  logPayPalEvent,
  paypalGet,
} from "@/lib/paypalAdmin";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

type PlanMap = Record<string, string>;

const parsePlanMap = () => {
  const paypalEnv = process.env.PAYPAL_ENV || "sandbox";
  const raw =
    paypalEnv === "live"
      ? process.env.PAYPAL_PLAN_MAP || ""
      : process.env.PAYPAL_PLAN_MAP_SANDBOX || process.env.PAYPAL_PLAN_MAP || "";
  if (!raw) return {};
  try {
    return JSON.parse(raw) as PlanMap;
  } catch (error) {
    logPayPalEvent(
      "PayPal reconcile plan map JSON is invalid",
      {
        route: "api.billing.paypal.reconcile",
        paypalEnv,
        rawLength: raw.length,
        error: error instanceof Error ? error.message : String(error),
      },
      "error"
    );
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
  const requestId = crypto.randomUUID();
  const user = await getUserFromRequest(req);
  if (!user) {
    logPayPalEvent(
      "PayPal reconcile request unauthorized",
      {
        route: "api.billing.paypal.reconcile",
        requestId,
      },
      "warn"
    );
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: { subscriptionId?: string } = {};
  try {
    payload = (await req.json()) as { subscriptionId?: string };
  } catch {
    payload = {};
  }

  const requestedSubscriptionId = payload.subscriptionId?.trim();
  logPayPalEvent("PayPal reconcile request starting", {
    route: "api.billing.paypal.reconcile",
    requestId,
    userId: user.id,
    requestedSubscriptionId,
    config: getPayPalConfigSnapshot(),
  });

  const { data: existing, error: existingError } = await supabaseAdmin
    .from("subscriptions")
    .select("id,paypal_subscription_id,plan_code")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(20);

  if (existingError) {
    logPayPalEvent(
      "PayPal reconcile failed to load existing subscriptions",
      {
        route: "api.billing.paypal.reconcile",
        requestId,
        userId: user.id,
        error: existingError.message,
        code: existingError.code,
        details: existingError.details,
      },
      "error"
    );
    return NextResponse.json(
      { error: "Failed to load existing PayPal subscriptions", requestId },
      { status: 500 }
    );
  }

  const targetSubscriptionId =
    requestedSubscriptionId ||
    existing?.find((row) => Boolean(row.paypal_subscription_id))?.paypal_subscription_id ||
    null;

  if (!targetSubscriptionId) {
    logPayPalEvent(
      "PayPal reconcile could not find target subscription id",
      {
        route: "api.billing.paypal.reconcile",
        requestId,
        userId: user.id,
        existingCount: existing?.length ?? 0,
      },
      "warn"
    );
    return NextResponse.json(
      { error: "No PayPal subscription found for this user" },
      { status: 404 }
    );
  }

  const existingForTarget =
    existing?.find((row) => row.paypal_subscription_id === targetSubscriptionId) ?? null;

  let subscription: Record<string, any>;
  try {
    subscription = await paypalGet<Record<string, any>>(
      `/v1/billing/subscriptions/${targetSubscriptionId}`
    );
  } catch (error) {
    if (isPayPalResourceNotFoundError(error)) {
      logPayPalEvent(
        "PayPal reconcile subscription not found in PayPal",
        {
          route: "api.billing.paypal.reconcile",
          requestId,
          userId: user.id,
          targetSubscriptionId,
        },
        "warn"
      );
      return NextResponse.json(
        {
          error:
            "PayPal subscription not found. The stored subscription id is stale or belongs to a different PayPal environment.",
        },
        { status: 404 }
      );
    }
    logPayPalEvent(
      "PayPal reconcile fetch failed",
      {
        route: "api.billing.paypal.reconcile",
        requestId,
        userId: user.id,
        targetSubscriptionId,
        error: error instanceof Error ? error.message : String(error),
      },
      "error"
    );
    throw error;
  }

  const ownerUserId = (subscription.custom_id as string | undefined) ?? user.id;
  if (ownerUserId !== user.id) {
    logPayPalEvent(
      "PayPal reconcile ownership mismatch",
      {
        route: "api.billing.paypal.reconcile",
        requestId,
        userId: user.id,
        ownerUserId,
        targetSubscriptionId,
      },
      "warn"
    );
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
    const { error: updateError } = await supabaseAdmin
      .from("subscriptions")
      .update(updatePayload)
      .eq("id", existingForTarget.id);
    if (updateError) {
      logPayPalEvent(
        "PayPal reconcile failed to update subscription row",
        {
          route: "api.billing.paypal.reconcile",
          requestId,
          userId: user.id,
          targetSubscriptionId,
          error: updateError.message,
          code: updateError.code,
          details: updateError.details,
        },
        "error"
      );
      return NextResponse.json(
        { error: "Failed to update PayPal subscription", requestId },
        { status: 500 }
      );
    }
  } else {
    const { error: insertError } = await supabaseAdmin.from("subscriptions").insert({
      user_id: user.id,
      ...updatePayload,
      created_at: now,
    });
    if (insertError) {
      logPayPalEvent(
        "PayPal reconcile failed to insert subscription row",
        {
          route: "api.billing.paypal.reconcile",
          requestId,
          userId: user.id,
          targetSubscriptionId,
          error: insertError.message,
          code: insertError.code,
          details: insertError.details,
        },
        "error"
      );
      return NextResponse.json(
        { error: "Failed to create PayPal subscription", requestId },
        { status: 500 }
      );
    }
  }

  if (startTime && nextBilling) {
    const { error: cycleError } = await supabaseAdmin.from("credit_usage_cycles").upsert({
      user_id: user.id,
      subscription_id: targetSubscriptionId,
      period_start: startTime,
      period_end: nextBilling,
      updated_at: now,
    });
    if (cycleError) {
      logPayPalEvent(
        "PayPal reconcile failed to upsert credit cycle",
        {
          route: "api.billing.paypal.reconcile",
          requestId,
          userId: user.id,
          targetSubscriptionId,
          error: cycleError.message,
          code: cycleError.code,
          details: cycleError.details,
        },
        "error"
      );
      return NextResponse.json(
        { error: "Failed to sync PayPal billing cycle", requestId },
        { status: 500 }
      );
    }
  }

  const { error: eventError } = await supabaseAdmin.from("payment_events").insert({
    user_id: user.id,
    provider: "paypal",
    event_type: "BILLING.SUBSCRIPTION.RECONCILED",
    event_id: targetSubscriptionId,
    payload: subscription,
  });

  if (eventError) {
    logPayPalEvent(
      "PayPal reconcile failed to insert payment event",
      {
        route: "api.billing.paypal.reconcile",
        requestId,
        userId: user.id,
        targetSubscriptionId,
        error: eventError.message,
        code: eventError.code,
        details: eventError.details,
      },
      "error"
    );
    return NextResponse.json(
      { error: "Failed to persist PayPal event", requestId },
      { status: 500 }
    );
  }

  logPayPalEvent("PayPal reconcile request succeeded", {
    route: "api.billing.paypal.reconcile",
    requestId,
    userId: user.id,
    targetSubscriptionId,
    status,
    planId: planId ?? null,
    planCode,
    currentPeriodStart: startTime ?? null,
    currentPeriodEnd: nextBilling ?? null,
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
