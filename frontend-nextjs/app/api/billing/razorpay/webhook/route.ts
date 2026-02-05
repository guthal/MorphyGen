import { NextResponse, type NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { verifyWebhookSignature } from "@/lib/razorpay";

export const runtime = "nodejs";

const getSubscriptionUpdate = (payload: Record<string, any>) => {
  const subscription = payload?.subscription?.entity ?? payload?.subscription;
  if (!subscription?.id) return null;
  return {
    id: subscription.id as string,
    status: subscription.status as string | undefined,
    currentPeriodStart: subscription.current_start
      ? new Date(subscription.current_start * 1000).toISOString()
      : null,
    currentPeriodEnd: subscription.current_end
      ? new Date(subscription.current_end * 1000).toISOString()
      : null,
    customerId: subscription.customer_id as string | undefined,
  };
};

export const POST = async (req: NextRequest) => {
  const signature = req.headers.get("x-razorpay-signature") ?? "";
  const rawBody = await req.text();

  if (!verifyWebhookSignature(rawBody, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const event = JSON.parse(rawBody) as {
    event?: string;
    payload?: Record<string, any>;
    entity?: { id?: string };
  };

  const eventType = event.event ?? "unknown";
  const payload = event.payload ?? {};
  const subscriptionUpdate = getSubscriptionUpdate(payload);

  if (subscriptionUpdate?.id) {
    await supabaseAdmin
      .from("subscriptions")
      .update({
        status: subscriptionUpdate.status ?? "ACTIVE",
        razorpay_customer_id: subscriptionUpdate.customerId ?? null,
        current_period_start: subscriptionUpdate.currentPeriodStart,
        current_period_end: subscriptionUpdate.currentPeriodEnd,
        updated_at: new Date().toISOString(),
      })
      .eq("razorpay_subscription_id", subscriptionUpdate.id);
  }

  if (subscriptionUpdate?.id) {
    const { data: sub } = await supabaseAdmin
      .from("subscriptions")
      .select("user_id")
      .eq("razorpay_subscription_id", subscriptionUpdate.id)
      .maybeSingle();

    if (sub?.user_id && subscriptionUpdate.currentPeriodStart && subscriptionUpdate.currentPeriodEnd) {
      await supabaseAdmin
        .from("credit_usage_cycles")
        .upsert({
          user_id: sub.user_id,
          subscription_id: subscriptionUpdate.id,
          period_start: subscriptionUpdate.currentPeriodStart,
          period_end: subscriptionUpdate.currentPeriodEnd,
          updated_at: new Date().toISOString(),
        });
    }

    if (sub?.user_id) {
      await supabaseAdmin.from("payment_events").insert({
        user_id: sub.user_id,
        event_type: eventType,
        event_id: event.entity?.id ?? null,
        payload: event,
      });
    }
  }

  return NextResponse.json({ received: true }, { status: 200 });
};
