import { NextResponse, type NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getUserFromRequest } from "@/lib/supabaseAuth";
import { verifySubscriptionSignature } from "@/lib/razorpay";

export const runtime = "nodejs";

export const POST = async (req: NextRequest) => {
  const user = await getUserFromRequest(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: {
    razorpay_subscription_id?: string;
    razorpay_payment_id?: string;
    razorpay_signature?: string;
  } = {};

  try {
    payload = (await req.json()) as typeof payload;
  } catch {
    payload = {};
  }

  const subscriptionId = payload.razorpay_subscription_id;
  const paymentId = payload.razorpay_payment_id;
  const signature = payload.razorpay_signature;

  if (!subscriptionId || !paymentId || !signature) {
    return NextResponse.json({ error: "Missing verification fields" }, { status: 400 });
  }

  const isValid = verifySubscriptionSignature({
    subscriptionId,
    paymentId,
    signature,
  });

  if (!isValid) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  await supabaseAdmin
    .from("subscriptions")
    .update({ status: "ACTIVE", updated_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .eq("razorpay_subscription_id", subscriptionId);

  return NextResponse.json({ success: true }, { status: 200 });
};
