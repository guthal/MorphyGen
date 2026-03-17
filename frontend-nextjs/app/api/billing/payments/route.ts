import { NextResponse, type NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getUserFromRequest } from "@/lib/supabaseAuth";
import { getSubscriptionReceipts } from "@/lib/paypalReceipts";
import { isPayPalResourceNotFoundError } from "@/lib/paypalAdmin";
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

  const { data: subs } = await supabaseAdmin
    .from("subscriptions")
    .select("paypal_subscription_id,razorpay_customer_id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(20);

  const paypalSubscriptionIds = Array.from(
    new Set(
      (subs ?? [])
        .map((row) => row.paypal_subscription_id)
        .filter((value): value is string => Boolean(value))
    )
  );
  const razorpayCustomerId =
    subs?.find((row) => Boolean(row.razorpay_customer_id))?.razorpay_customer_id ?? null;

  const payments: PaymentItem[] = [];
  const { startTime, endTime } = getDateRange(req);

  if (paypalSubscriptionIds.length > 0) {
    const seenIds = new Set<string>();
    for (const subscriptionId of paypalSubscriptionIds) {
      try {
        const receipts = await getSubscriptionReceipts({
          subscriptionId,
          startTime,
          endTime,
        });

        payments.push(
          ...receipts
            .filter((receipt) => {
              if (!receipt.id || seenIds.has(receipt.id)) return false;
              seenIds.add(receipt.id);
              return true;
            })
            .map((receipt) => ({
              id: receipt.id,
              provider: "paypal" as const,
              status: receipt.status,
              amount: receipt.amount,
              currency: receipt.currency,
              time: receipt.time || new Date().toISOString(),
              receiptId: receipt.id,
            }))
        );
      } catch (error) {
        if (isPayPalResourceNotFoundError(error)) {
          console.warn("Skipping stale PayPal subscription while loading payments", {
            subscriptionId,
          });
          continue;
        }
        console.warn("Failed to load PayPal payments", { subscriptionId, error });
      }
    }
  }

  if (razorpayCustomerId) {
    const { authHeader } = getRazorpayAuthHeader();
    const url = new URL("https://api.razorpay.com/v1/invoices");
    url.searchParams.set("customer_id", razorpayCustomerId);
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
