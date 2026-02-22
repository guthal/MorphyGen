import { NextResponse, type NextRequest } from "next/server";
import { paypalGet, paypalRequest } from "@/lib/paypalAdmin";
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
  const rawBody = await req.text();
  let event: Record<string, unknown> = {};
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const transmissionId = getHeader(req, "paypal-transmission-id");
  const transmissionTime = getHeader(req, "paypal-transmission-time");
  const certUrl = getHeader(req, "paypal-cert-url");
  const authAlgo = getHeader(req, "paypal-auth-algo");
  const transmissionSig = getHeader(req, "paypal-transmission-sig");

  if (!transmissionId || !transmissionTime || !certUrl || !authAlgo || !transmissionSig) {
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
    return NextResponse.json({ error: "Webhook signature invalid" }, { status: 400 });
  }

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
    const { data } = await supabaseAdmin
      .from("subscriptions")
      .select("id,user_id")
      .eq("paypal_subscription_id", subscriptionId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
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
      console.warn("Failed to resolve PayPal subscription details", error);
    }
  }

  console.log("PayPal webhook received", {
    eventType,
    eventId,
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
      await supabaseAdmin
        .from("subscriptions")
        .update(updatePayload)
        .eq("id", existingByProviderId.id);
    } else {
      const { data: existingByUser } = await supabaseAdmin
        .from("subscriptions")
        .select("id")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingByUser?.id) {
        await supabaseAdmin.from("subscriptions").update(updatePayload).eq("id", existingByUser.id);
      } else {
        await supabaseAdmin.from("subscriptions").insert({
          user_id: userId,
          ...updatePayload,
          created_at: now,
        });
      }
    }

    if (startTime && nextBilling) {
      await supabaseAdmin.from("credit_usage_cycles").upsert({
        user_id: userId,
        subscription_id: subscriptionId,
        period_start: startTime,
        period_end: nextBilling,
        updated_at: now,
      });
    }

    await supabaseAdmin.from("payment_events").insert({
      user_id: userId,
      provider: "paypal",
      event_type: eventType,
      event_id: eventId,
      payload: event,
    });
  } else {
    console.warn("PayPal webhook skipped DB sync", {
      eventType,
      eventId,
      hasUserId: Boolean(userId),
      hasSubscriptionId: Boolean(subscriptionId),
    });
  }

  return NextResponse.json({ received: true }, { status: 200 });
};
