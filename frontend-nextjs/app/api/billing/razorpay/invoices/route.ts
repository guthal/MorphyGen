import { NextResponse, type NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getUserFromRequest } from "@/lib/supabaseAuth";
import { getRazorpayAuthHeader } from "@/lib/razorpay";

export const runtime = "nodejs";

export const GET = async (req: NextRequest) => {
  const user = await getUserFromRequest(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: sub } = await supabaseAdmin
    .from("subscriptions")
    .select("razorpay_customer_id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!sub?.razorpay_customer_id) {
    return NextResponse.json({ invoices: [] }, { status: 200 });
  }

  const { authHeader } = getRazorpayAuthHeader();
  const url = new URL("https://api.razorpay.com/v1/invoices");
  url.searchParams.set("customer_id", sub.razorpay_customer_id);
  url.searchParams.set("count", "20");

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: authHeader,
    },
  });

  if (!response.ok) {
    const text = await response.text();
    return NextResponse.json({ error: text }, { status: 500 });
  }

  const data = (await response.json()) as {
    items?: Array<{
      id: string;
      status: string;
      amount: number;
      currency: string;
      issued_at?: number;
      short_url?: string;
      customer_id?: string;
    }>;
  };

  return NextResponse.json({ invoices: data.items ?? [] }, { status: 200 });
};
