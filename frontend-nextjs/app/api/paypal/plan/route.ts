import { NextResponse, type NextRequest } from "next/server";
import { getUserFromRequest } from "@/lib/supabaseAuth";
import { paypalGet, paypalRequest } from "@/lib/paypalAdmin";

export const runtime = "nodejs";

const adminEmails = (process.env.PAYPAL_ADMIN_EMAILS || "")
  .split(",")
  .map((value) => value.trim().toLowerCase())
  .filter(Boolean);

const requireAdmin = (email: string | null | undefined) => {
  if (adminEmails.length === 0) return true;
  if (!email) return false;
  return adminEmails.includes(email.toLowerCase());
};

export const POST = async (req: NextRequest) => {
  const user = await getUserFromRequest(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!requireAdmin(user.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let payload: {
    productId?: string;
    name?: string;
    description?: string;
    price?: string;
    currency?: string;
    intervalUnit?: "DAY" | "WEEK" | "MONTH" | "YEAR";
    intervalCount?: number;
  } = {};
  try {
    payload = (await req.json()) as typeof payload;
  } catch {
    payload = {};
  }

  const productId = payload.productId?.trim();
  const name = payload.name?.trim();
  const price = payload.price?.trim();
  const currency = payload.currency?.trim() || "USD";
  const intervalUnit = payload.intervalUnit || "MONTH";
  const intervalCount = payload.intervalCount || 1;

  if (!productId) {
    return NextResponse.json({ error: "productId is required" }, { status: 400 });
  }
  if (!name) {
    return NextResponse.json({ error: "Plan name is required" }, { status: 400 });
  }
  if (!price || Number.isNaN(Number(price))) {
    return NextResponse.json({ error: "Valid price is required" }, { status: 400 });
  }

  const data = await paypalRequest<{
    id: string;
    name: string;
    status?: string;
    create_time?: string;
  }>("/v1/billing/plans", {
    product_id: productId,
    name,
    description: payload.description?.trim() || undefined,
    billing_cycles: [
      {
        frequency: { interval_unit: intervalUnit, interval_count: intervalCount },
        tenure_type: "REGULAR",
        sequence: 1,
        total_cycles: 0,
        pricing_scheme: {
          fixed_price: { value: price, currency_code: currency },
        },
      },
    ],
    payment_preferences: {
      auto_bill_outstanding: true,
      setup_fee_failure_action: "CONTINUE",
      payment_failure_threshold: 3,
    },
  });

  return NextResponse.json({ plan: data }, { status: 201 });
};

export const GET = async (req: NextRequest) => {
  const user = await getUserFromRequest(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!requireAdmin(user.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const id = req.nextUrl.searchParams.get("id")?.trim();
  if (!id) {
    return NextResponse.json({ error: "Plan id is required" }, { status: 400 });
  }

  const data = await paypalGet<Record<string, unknown>>(`/v1/billing/plans/${id}`);
  return NextResponse.json({ plan: data }, { status: 200 });
};
