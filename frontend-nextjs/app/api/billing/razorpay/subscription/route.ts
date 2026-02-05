import { NextResponse, type NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getUserFromRequest } from "@/lib/supabaseAuth";
import {
  createRazorpayCustomer,
  createRazorpaySubscription,
  getPlanId,
  getRazorpayAuthHeader,
} from "@/lib/razorpay";

export const runtime = "nodejs";

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

  const { data: existing } = await supabaseAdmin
    .from("subscriptions")
    .select("id,status,razorpay_subscription_id,razorpay_customer_id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const customerId =
    existing?.razorpay_customer_id ??
    (await createRazorpayCustomer({
      name: user.user_metadata?.full_name ?? user.email ?? undefined,
      email: user.email ?? undefined,
    })).id;

  const planId = getPlanId(planCode);
  const subscription = await createRazorpaySubscription({
    planId,
    customerId,
  });

  const now = new Date().toISOString();
  await supabaseAdmin.from("subscriptions").insert({
    user_id: user.id,
    plan_code: planCode,
    status: subscription.status ?? "PENDING",
    razorpay_subscription_id: subscription.id,
    razorpay_customer_id: customerId,
    created_at: now,
    updated_at: now,
  });

  const { keyId } = getRazorpayAuthHeader();

  return NextResponse.json(
    {
      keyId,
      subscriptionId: subscription.id,
      planCode,
    },
    { status: 200 }
  );
};
