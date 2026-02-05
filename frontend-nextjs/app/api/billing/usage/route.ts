import { NextResponse, type NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getUserFromRequest } from "@/lib/supabaseAuth";

export const runtime = "nodejs";

const PLAN_CREDITS: Record<string, number> = {
  free: 50,
  starter: 500,
  boost: 2500,
  growth: 5000,
  scale_25k: 25000,
  scale_50k: 50000,
  scale_100k: 100000,
  scale_250k: 250000,
  scale_500k: 500000,
  scale_1m: 1000000,
};

export const GET = async (req: NextRequest) => {
  const user = await getUserFromRequest(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: sub } = await supabaseAdmin
    .from("subscriptions")
    .select("plan_code,status,razorpay_subscription_id,current_period_start,current_period_end")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!sub?.razorpay_subscription_id || !sub.current_period_start || !sub.current_period_end) {
    return NextResponse.json(
      {
        planCode: sub?.plan_code ?? "free",
        planCredits: PLAN_CREDITS[sub?.plan_code ?? "free"] ?? 50,
        creditsUsed: 0,
        creditsRemaining: PLAN_CREDITS[sub?.plan_code ?? "free"] ?? 50,
        periodStart: null,
        periodEnd: null,
        status: sub?.status ?? "FREE",
      },
      { status: 200 }
    );
  }

  const { data: cycle } = await supabaseAdmin
    .from("credit_usage_cycles")
    .select("credits_used,period_start,period_end")
    .eq("user_id", user.id)
    .eq("subscription_id", sub.razorpay_subscription_id)
    .eq("period_start", sub.current_period_start)
    .eq("period_end", sub.current_period_end)
    .maybeSingle();

  const planCredits = PLAN_CREDITS[sub.plan_code] ?? 0;
  const creditsUsed = cycle?.credits_used ?? 0;
  const creditsRemaining = Math.max(planCredits - creditsUsed, 0);

  return NextResponse.json(
    {
      planCode: sub.plan_code,
      planCredits,
      creditsUsed,
      creditsRemaining,
      periodStart: sub.current_period_start,
      periodEnd: sub.current_period_end,
      status: sub.status,
    },
    { status: 200 }
  );
};
