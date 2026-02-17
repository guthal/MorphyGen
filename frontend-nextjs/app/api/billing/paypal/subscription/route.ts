import { NextResponse, type NextRequest } from "next/server";
import { getUserFromRequest } from "@/lib/supabaseAuth";
import { paypalRequest } from "@/lib/paypalAdmin";

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

export const POST = async (req: NextRequest) => {
  const user = await getUserFromRequest(req);
  if (!user) {
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
    return NextResponse.json({ error: "planCode is required" }, { status: 400 });
  }

  const map = parsePlanMap();
  const planId = map[planCode] || planCode;
  if (!planId) {
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

  return NextResponse.json(
    {
      id: data.id,
      status: data.status,
      approveUrl,
    },
    { status: 200 }
  );
};
