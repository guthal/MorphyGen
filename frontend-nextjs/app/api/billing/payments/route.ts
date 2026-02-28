import { NextResponse, type NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getUserFromRequest } from "@/lib/supabaseAuth";
import { getSubscriptionReceipts } from "@/lib/paypalReceipts";
import { getRazorpayAuthHeader } from "@/lib/razorpay";

export const runtime = "nodejs";

type PaymentItem = {
  id: string;
  provider: "paypal" | "razorpay";
  status: string;
  amount: string;
  currency: string;
  time: string;
  receiptId?: string;
  invoiceUrl?: string | null;
};

const getDateRange = (req: NextRequest) => {
  const url = new URL(req.url);
  const start = url.searchParams.get("start");
  const end = url.searchParams.get("end");
  if (start && end) {
    const startDate = new Date(start);
    const endDate = new Date(end);
    if (!Number.isNaN(startDate.getTime()) && !Number.isNaN(endDate.getTime())) {
      return { startTime: startDate.toISOString(), endTime: endDate.toISOString() };
    }
  }

  const endTime = new Date();
  const startTime = new Date();
  startTime.setUTCFullYear(endTime.getUTCFullYear() - 1);

  return { startTime: startTime.toISOString(), endTime: endTime.toISOString() };
};

const sortByTimeDesc = (items: PaymentItem[]) =>
  items.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());

export const GET = async (req: NextRequest) => {
  const user = await getUserFromRequest(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: sub } = await supabaseAdmin
    .from("subscriptions")
    .select("paypal_subscription_id,razorpay_customer_id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const payments: PaymentItem[] = [];
  const { startTime, endTime } = getDateRange(req);

  if (sub?.paypal_subscription_id) {
    const receipts = await getSubscriptionReceipts({
      subscriptionId: sub.paypal_subscription_id,
      startTime,
      endTime,
    });

    payments.push(
      ...receipts.map((receipt) => ({
        id: receipt.id,
        provider: "paypal" as const,
        status: receipt.status,
        amount: receipt.amount,
        currency: receipt.currency,
        time: receipt.time || new Date().toISOString(),
        receiptId: receipt.id,
      }))
    );
  }

  if (sub?.razorpay_customer_id) {
    const { authHeader } = getRazorpayAuthHeader();
    const url = new URL("https://api.razorpay.com/v1/invoices");
    url.searchParams.set("customer_id", sub.razorpay_customer_id);
    url.searchParams.set("count", "20");

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: authHeader,
      },
    });

    if (response.ok) {
      const data = (await response.json()) as {
        items?: Array<{
          id: string;
          status: string;
          amount: number;
          currency: string;
          issued_at?: number;
          short_url?: string;
        }>;
      };

      payments.push(
        ...(data.items ?? []).map((invoice) => ({
          id: invoice.id,
          provider: "razorpay" as const,
          status: invoice.status,
          amount: String((invoice.amount ?? 0) / 100),
          currency: invoice.currency?.toUpperCase() ?? "INR",
          time: invoice.issued_at
            ? new Date(invoice.issued_at * 1000).toISOString()
            : new Date().toISOString(),
          invoiceUrl: invoice.short_url ?? null,
        }))
      );
    }
  }

  return NextResponse.json({ payments: sortByTimeDesc(payments) }, { status: 200 });
};
