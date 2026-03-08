import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export const config = {
  verify_jwt: false,
};

const getEnv = (name: string) => Deno.env.get(name) ?? "";

const requireEnv = (value: string, name: string) => {
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
};

const paypalEnv = getEnv("PAYPAL_ENV") || "sandbox";
const isLive = paypalEnv === "live";
const paypalClientId = isLive
  ? getEnv("PAYPAL_CLIENT_ID")
  : getEnv("TEST_PAYPAL_CLIENT_ID");
const paypalSecret = isLive
  ? getEnv("PAYPAL_SECRET")
  : getEnv("TEST_PAYPAL_SECRET");
const paypalBaseUrl =
  getEnv("PAYPAL_API_BASE") ||
  (paypalEnv === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com");
const webhookId = getEnv("PAYPAL_WEBHOOK_ID");

const supabaseUrl = requireEnv(getEnv("SUPABASE_URL"), "SUPABASE_URL");
const supabaseServiceKey = requireEnv(
  getEnv("SUPABASE_SERVICE_ROLE_KEY"),
  "SUPABASE_SERVICE_ROLE_KEY"
);

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

const credentialSource = isLive
  ? "PAYPAL_CLIENT_ID/PAYPAL_SECRET"
  : "TEST_PAYPAL_CLIENT_ID/TEST_PAYPAL_SECRET";

const getHeader = (req: Request, name: string) => req.headers.get(name) || "";

const normalizeStatus = (value: string | undefined) => {
  const raw = String(value || "").trim().toUpperCase();
  if (!raw) return "ACTIVE";
  if (raw === "COMPLETED") return "ACTIVE";
  return raw;
};

const getPayPalAccessToken = async () => {
  const clientId = requireEnv(paypalClientId, "PAYPAL_CLIENT_ID");
  const secret = requireEnv(paypalSecret, "PAYPAL_SECRET");
  const auth = btoa(`${clientId}:${secret}`);
  const response = await fetch(`${paypalBaseUrl}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`PayPal token request failed: ${response.status} ${text}`);
  }

  const data = (await response.json()) as { access_token?: string };
  if (!data.access_token) throw new Error("PayPal token response missing access_token");
  return data.access_token;
};

const paypalRequest = async <T>(path: string, payload: Record<string, unknown>) => {
  const token = await getPayPalAccessToken();
  const response = await fetch(`${paypalBaseUrl}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`PayPal API error: ${response.status} ${text}`);
  }

  return JSON.parse(text) as T;
};

const paypalGet = async <T>(path: string) => {
  const token = await getPayPalAccessToken();
  const response = await fetch(`${paypalBaseUrl}${path}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`PayPal API error: ${response.status} ${text}`);
  }

  return JSON.parse(text) as T;
};

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  let rawBody = "";
  try {
    rawBody = await req.text();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid request body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  let event: Record<string, unknown> = {};
  try {
    event = JSON.parse(rawBody);
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const transmissionId = getHeader(req, "paypal-transmission-id");
  const transmissionTime = getHeader(req, "paypal-transmission-time");
  const certUrl = getHeader(req, "paypal-cert-url");
  const authAlgo = getHeader(req, "paypal-auth-algo");
  const transmissionSig = getHeader(req, "paypal-transmission-sig");

  const missingHeaders = [
    ["paypal-transmission-id", transmissionId],
    ["paypal-transmission-time", transmissionTime],
    ["paypal-cert-url", certUrl],
    ["paypal-auth-algo", authAlgo],
    ["paypal-transmission-sig", transmissionSig],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);

  if (missingHeaders.length) {
    console.warn("PayPal webhook missing headers", {
      missingHeaders,
      allHeaders: Object.fromEntries(req.headers.entries()),
    });
    return new Response(JSON.stringify({ error: "Missing PayPal headers", missingHeaders }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  console.log("PayPal webhook env", {
    paypalEnv,
    paypalBaseUrl,
    credentialSource,
    clientIdSuffix: paypalClientId ? paypalClientId.slice(-6) : null,
  });

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
    console.warn("PayPal webhook signature invalid", {
      verificationStatus: verification?.verification_status,
      eventType: event.event_type,
      eventId: event.id,
    });
    return new Response(JSON.stringify({ error: "Webhook signature invalid" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
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

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
