import { NextResponse, type NextRequest } from "next/server";
import { getPayPalConfigSnapshot, logPayPalEvent, paypalGet, paypalRequest } from "@/lib/paypalAdmin";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

const webhookId = process.env.PAYPAL_WEBHOOK_ID;

const requireEnv = (value: string | undefined, name: string) => {
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
};

const getHeader = (req: NextRequest, name: string) => req.headers.get(name) || "";
const normalizeStatus = (value: string | undefined) => {
  const raw = String(value || "").trim().toUpperCase();
  if (!raw) return "ACTIVE";
  if (raw === "COMPLETED") return "ACTIVE";
  return raw;
};

export const POST = async (req: NextRequest) => {
  const requestId = crypto.randomUUID();
  const rawBody = await req.text();
  let event: Record<string, unknown> = {};
  try {
    event = JSON.parse(rawBody);
  } catch {
    logPayPalEvent(
      "PayPal webhook received invalid JSON",
      {
        route: "api.billing.paypal.webhook",
        requestId,
        bodyLength: rawBody.length,
      },
      "warn"
    );
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const transmissionId = getHeader(req, "paypal-transmission-id");
  const transmissionTime = getHeader(req, "paypal-transmission-time");
  const certUrl = getHeader(req, "paypal-cert-url");
  const authAlgo = getHeader(req, "paypal-auth-algo");
  const transmissionSig = getHeader(req, "paypal-transmission-sig");

  logPayPalEvent("PayPal webhook received", {
    route: "api.billing.paypal.webhook",
    requestId,
    eventType: String(event.event_type || "unknown"),
    eventId: String(event.id || "unknown"),
    bodyLength: rawBody.length,
    hasTransmissionId: Boolean(transmissionId),
    hasTransmissionTime: Boolean(transmissionTime),
    hasCertUrl: Boolean(certUrl),
    hasAuthAlgo: Boolean(authAlgo),
    hasTransmissionSig: Boolean(transmissionSig),
    config: getPayPalConfigSnapshot(),
  });

  if (!transmissionId || !transmissionTime || !certUrl || !authAlgo || !transmissionSig) {
    logPayPalEvent(
      "PayPal webhook missing verification headers",
      {
        route: "api.billing.paypal.webhook",
        requestId,
      },
      "warn"
    );
    return NextResponse.json({ error: "Missing PayPal headers" }, { status: 400 });
  }

  const verification = await paypalRequest<{ verification_status?: string }>(
    "/v1/notifications/verify-webhook-signature",
    {
      transmission_id: transmissionId,
      transmission_time: transmissionTime,
      cert_url: certUrl,
      auth_algo: authAlgo,
      transmission_sig: transmissionSig,
      webhook_id: requireEnv(webhookId, "PAYPAL_WEBHOOK_ID"),
      webhook_event: event,
    }
  );

  if (verification?.verification_status !== "SUCCESS") {
    logPayPalEvent(
      "PayPal webhook signature verification failed",
      {
        route: "api.billing.paypal.webhook",
        requestId,
        verificationStatus: verification?.verification_status ?? null,
      },
      "warn"
    );
    return NextResponse.json({ error: "Webhook signature invalid" }, { status: 400 });
  }

  logPayPalEvent("PayPal webhook signature verified", {
    route: "api.billing.paypal.webhook",
    requestId,
    verificationStatus: verification?.verification_status ?? null,
  });

  const eventType = String(event.event_type || "unknown");
  const eventId = String(event.id || "unknown");
  const resource = (event.resource || {}) as Record<string, any>;
  let userId = resource.custom_id as string | undefined;
  let planId = resource.plan_id as string | undefined;
  let status = (resource.status as string | undefined) ?? (resource.state as string | undefined);
  let subscriptionId = resource.id as string | undefined;
  let startTime = resource.start_time as string | undefined;
  let nextBilling = resource.billing_info?.next_billing_time as string | undefined;

  if (eventType.startsWith("PAYMENT.SALE.") && resource.billing_agreement_id) {
    subscriptionId = resource.billing_agreement_id as string;
  } else if (!subscriptionId) {
    subscriptionId =
      (resource.subscription_id as string | undefined) ||
      (resource.billing_agreement_id as string | undefined);
  }

  let existingByProviderId: { id: string; user_id: string } | null = null;
  if (subscriptionId) {
    const { data, error } = await supabaseAdmin
      .from("subscriptions")
      .select("id,user_id")
      .eq("paypal_subscription_id", subscriptionId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      logPayPalEvent(
        "PayPal webhook failed to load subscription by provider id",
        {
          route: "api.billing.paypal.webhook",
          requestId,
          subscriptionId,
          error: error.message,
          code: error.code,
          details: error.details,
        },
        "error"
      );
      return NextResponse.json({ error: "Failed to query subscription", requestId }, { status: 500 });
    }
    existingByProviderId = data;
    userId = userId ?? data?.user_id;
  }

  if (subscriptionId && (!userId || !planId || !status || !startTime || !nextBilling)) {
    try {
      const subscription = await paypalGet<Record<string, any>>(
        `/v1/billing/subscriptions/${subscriptionId}`
      );
      userId = subscription.custom_id as string | undefined;
      planId = planId ?? (subscription.plan_id as string | undefined);
      status = status ?? (subscription.status as string | undefined);
      startTime = startTime ?? (subscription.start_time as string | undefined);
      nextBilling =
        nextBilling ?? (subscription.billing_info?.next_billing_time as string | undefined);
    } catch (error) {
      logPayPalEvent(
        "PayPal webhook failed to enrich subscription from PayPal API",
        {
          route: "api.billing.paypal.webhook",
          requestId,
          subscriptionId,
          error: error instanceof Error ? error.message : String(error),
        },
        "warn"
      );
    }
  }

  logPayPalEvent("PayPal webhook normalized event", {
    route: "api.billing.paypal.webhook",
    requestId,
    eventType,
    eventId,
    userId: userId ?? null,
    subscriptionId: subscriptionId ?? null,
    planId: planId ?? null,
    status: status ?? null,
    currentPeriodStart: startTime ?? null,
    currentPeriodEnd: nextBilling ?? null,
    matchedExistingSubscription: Boolean(existingByProviderId?.id),
  });

  if (
    userId &&
    subscriptionId &&
    (eventType.startsWith("BILLING.SUBSCRIPTION.") || eventType.startsWith("PAYMENT.SALE."))
  ) {
    const now = new Date().toISOString();
    const updatePayload = {
      plan_code: planId ?? "free",
      status: normalizeStatus(status),
      paypal_subscription_id: subscriptionId,
      current_period_start: startTime ?? null,
      current_period_end: nextBilling ?? null,
      updated_at: now,
    };

    if (existingByProviderId?.id) {
      const { error } = await supabaseAdmin
        .from("subscriptions")
        .update(updatePayload)
        .eq("id", existingByProviderId.id);
      if (error) {
        logPayPalEvent(
          "PayPal webhook failed to update subscription row",
          {
            route: "api.billing.paypal.webhook",
            requestId,
            userId,
            subscriptionId,
            error: error.message,
            code: error.code,
            details: error.details,
          },
          "error"
        );
        return NextResponse.json(
          { error: "Failed to update subscription from webhook", requestId },
          { status: 500 }
        );
      }
    } else {
      const { data: existingByUser, error: existingByUserError } = await supabaseAdmin
        .from("subscriptions")
        .select("id")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingByUserError) {
        logPayPalEvent(
          "PayPal webhook failed to load fallback subscription by user",
          {
            route: "api.billing.paypal.webhook",
            requestId,
            userId,
            subscriptionId,
            error: existingByUserError.message,
            code: existingByUserError.code,
            details: existingByUserError.details,
          },
          "error"
        );
        return NextResponse.json(
          { error: "Failed to resolve user subscription from webhook", requestId },
          { status: 500 }
        );
      }

      if (existingByUser?.id) {
        const { error } = await supabaseAdmin
          .from("subscriptions")
          .update(updatePayload)
          .eq("id", existingByUser.id);
        if (error) {
          logPayPalEvent(
            "PayPal webhook failed to update fallback subscription row",
            {
              route: "api.billing.paypal.webhook",
              requestId,
              userId,
              subscriptionId,
              error: error.message,
              code: error.code,
              details: error.details,
            },
            "error"
          );
          return NextResponse.json(
            { error: "Failed to update user subscription from webhook", requestId },
            { status: 500 }
          );
        }
      } else {
        const { error } = await supabaseAdmin.from("subscriptions").insert({
          user_id: userId,
          ...updatePayload,
          created_at: now,
        });
        if (error) {
          logPayPalEvent(
            "PayPal webhook failed to insert subscription row",
            {
              route: "api.billing.paypal.webhook",
              requestId,
              userId,
              subscriptionId,
              error: error.message,
              code: error.code,
              details: error.details,
            },
            "error"
          );
          return NextResponse.json(
            { error: "Failed to create subscription from webhook", requestId },
            { status: 500 }
          );
        }
      }
    }

    if (startTime && nextBilling) {
      const { error } = await supabaseAdmin.from("credit_usage_cycles").upsert({
        user_id: userId,
        subscription_id: subscriptionId,
        period_start: startTime,
        period_end: nextBilling,
        updated_at: now,
      });
      if (error) {
        logPayPalEvent(
          "PayPal webhook failed to upsert credit cycle",
          {
            route: "api.billing.paypal.webhook",
            requestId,
            userId,
            subscriptionId,
            error: error.message,
            code: error.code,
            details: error.details,
          },
          "error"
        );
        return NextResponse.json(
          { error: "Failed to sync billing cycle from webhook", requestId },
          { status: 500 }
        );
      }
    }

    const { error } = await supabaseAdmin.from("payment_events").insert({
      user_id: userId,
      provider: "paypal",
      event_type: eventType,
      event_id: eventId,
      payload: event,
    });
    if (error) {
      logPayPalEvent(
        "PayPal webhook failed to insert payment event",
        {
          route: "api.billing.paypal.webhook",
          requestId,
          userId,
          subscriptionId,
          eventType,
          eventId,
          error: error.message,
          code: error.code,
          details: error.details,
        },
        "error"
      );
      return NextResponse.json(
        { error: "Failed to persist webhook event", requestId },
        { status: 500 }
      );
    }

    logPayPalEvent("PayPal webhook DB sync succeeded", {
      route: "api.billing.paypal.webhook",
      requestId,
      userId,
      subscriptionId,
      eventType,
      eventId,
      status: normalizeStatus(status),
    });
  } else {
    logPayPalEvent(
      "PayPal webhook skipped DB sync",
      {
        route: "api.billing.paypal.webhook",
        requestId,
        eventType,
        eventId,
        hasUserId: Boolean(userId),
        hasSubscriptionId: Boolean(subscriptionId),
      },
      "warn"
    );
  }

  return NextResponse.json({ received: true }, { status: 200 });
};
