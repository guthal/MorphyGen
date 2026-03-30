import { NextResponse, type NextRequest } from "next/server";
import { getUserFromRequest } from "@/lib/supabaseAuth";
import { getPayPalConfigSnapshot, logPayPalEvent, paypalRequest } from "@/lib/paypalAdmin";
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
      "PayPal subscription plan map JSON is invalid",
      {
        route: "api.billing.paypal.subscription",
        paypalEnv,
        rawLength: raw.length,
        error: error instanceof Error ? error.message : String(error),
      },
      "error"
    );
    return {};
  }
};

export const POST = async (req: NextRequest) => {
  const requestId = crypto.randomUUID();
  const user = await getUserFromRequest(req);
  if (!user) {
    logPayPalEvent(
      "PayPal subscription request unauthorized",
      {
        route: "api.billing.paypal.subscription",
        requestId,
      },
      "warn"
    );
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: { planCode?: string } = {};
  try {
    payload = (await req.json()) as { planCode?: string };
  } catch {
    payload = {};
  }

  const planCode = payload.planCode?.trim();
  if (!planCode) {
    logPayPalEvent(
      "PayPal subscription request missing plan code",
      {
        route: "api.billing.paypal.subscription",
        requestId,
        userId: user.id,
      },
      "warn"
    );
    return NextResponse.json({ error: "planCode is required" }, { status: 400 });
  }

  const map = parsePlanMap();
  const planId = map[planCode] || planCode;
  const planMapSource =
    (process.env.PAYPAL_ENV || "sandbox") === "live"
      ? "PAYPAL_PLAN_MAP"
      : process.env.PAYPAL_PLAN_MAP_SANDBOX
        ? "PAYPAL_PLAN_MAP_SANDBOX"
        : "PAYPAL_PLAN_MAP";

  logPayPalEvent("PayPal subscription request starting", {
    route: "api.billing.paypal.subscription",
    requestId,
    userId: user.id,
    userEmail: user.email ?? null,
    planCode,
    resolvedPlanId: planId,
    planMapSource,
    planMapKeys: Object.keys(map),
  });

  try {
    if (!planId) {
      logPayPalEvent(
        "PayPal subscription request could not resolve plan id",
        {
          route: "api.billing.paypal.subscription",
          requestId,
          userId: user.id,
          planCode,
          planMapSource,
          config: getPayPalConfigSnapshot(),
        },
        "error"
      );
      return NextResponse.json({ error: "Plan id not found" }, { status: 400 });
    }

    const data = await paypalRequest<{
      id: string;
      status: string;
      links?: { href: string; rel: string; method: string }[];
    }>("/v1/billing/subscriptions", {
      plan_id: planId,
      custom_id: user.id,
      subscriber: user.email
        ? {
            name: {
              given_name: user.user_metadata?.full_name ?? "MorphyGen",
              surname: "User",
            },
            email_address: user.email,
          }
        : undefined,
      application_context: {
        brand_name: "MorphyGen",
        locale: "en-US",
        user_action: "SUBSCRIBE_NOW",
        shipping_preference: "NO_SHIPPING",
      },
    });

    const approveUrl = data.links?.find((link) => link.rel === "approve")?.href ?? null;
    const now = new Date().toISOString();
    const { error: insertError } = await supabaseAdmin.from("subscriptions").insert({
      user_id: user.id,
      plan_code: planCode,
      status: data.status ?? "APPROVAL_PENDING",
      paypal_subscription_id: data.id,
      created_at: now,
      updated_at: now,
    });

    if (insertError) {
      logPayPalEvent(
        "PayPal subscription insert failed",
        {
          route: "api.billing.paypal.subscription",
          requestId,
          userId: user.id,
          subscriptionId: data.id,
          error: insertError.message,
          code: insertError.code,
          details: insertError.details,
        },
        "error"
      );
      throw new Error(`Failed to persist PayPal subscription: ${insertError.message}`);
    }

    logPayPalEvent("PayPal subscription request succeeded", {
      route: "api.billing.paypal.subscription",
      requestId,
      userId: user.id,
      subscriptionId: data.id,
      status: data.status,
      hasApproveUrl: Boolean(approveUrl),
    });

    return NextResponse.json(
      {
        id: data.id,
        status: data.status,
        approveUrl,
      },
      { status: 200 }
    );
  } catch (error) {
    logPayPalEvent(
      "PayPal subscription request failed",
      {
        route: "api.billing.paypal.subscription",
        requestId,
        userId: user.id,
        planCode,
        error: error instanceof Error ? error.message : String(error),
      },
      "error"
    );
    return NextResponse.json(
      {
        error: "Failed to create PayPal subscription",
        requestId,
      },
      { status: 500 }
    );
  }
};
