import { NextResponse, type NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getUserFromRequest } from "@/lib/supabaseAuth";
import { getSubscriptionReceipts } from "@/lib/paypalReceipts";
import { buildReceiptHtml } from "@/lib/receipt";
import { renderPdf } from "@/lib/render-pdf";

export const runtime = "nodejs";

const resendKey = process.env.RESEND_KEY || "";
const resendFrom = process.env.RESEND_FROM || "";

const PLAN_LABELS: Record<string, string> = {
  free: "Free",
  starter: "Starter",
  boost: "Boost",
  growth: "Growth",
  scale_25k: "Scale 25K",
  scale_50k: "Scale 50K",
  scale_100k: "Scale 100K",
  scale_250k: "Scale 250K",
  scale_500k: "Scale 500K",
  scale_1m: "Scale 1M",
};

const requireEnv = (value: string, name: string) => {
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
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

export const POST = async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  const { id } = await params;
  const user = await getUserFromRequest(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: sub } = await supabaseAdmin
    .from("subscriptions")
    .select("paypal_subscription_id,plan_code")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!sub?.paypal_subscription_id) {
    return NextResponse.json({ error: "No PayPal subscription found" }, { status: 404 });
  }

  const { startTime, endTime } = getDateRange(req);
  const receipts = await getSubscriptionReceipts({
    subscriptionId: sub.paypal_subscription_id,
    startTime,
    endTime,
  });

  const receipt = receipts.find((item) => item.id === id);
  if (!receipt) {
    return NextResponse.json({ error: "Receipt not found" }, { status: 404 });
  }

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("full_name,company_name,company_address,country,vat_number,billing_email")
    .eq("user_id", user.id)
    .maybeSingle();

  const name =
    profile?.company_name ||
    profile?.full_name ||
    receipt.payerName ||
    user.email ||
    "Customer";
  const email = user.email ?? null;
  if (!email) {
    return NextResponse.json({ error: "No email address found" }, { status: 400 });
  }

  const address = [profile?.company_address, profile?.country]
    .filter(Boolean)
    .join(", ");

  const planLabel = PLAN_LABELS[sub.plan_code ?? "free"] ?? "Subscription";
  const html = buildReceiptHtml({
    id: receipt.id,
    issuedAt: receipt.time || new Date().toISOString(),
    status: receipt.status,
    merchantName: "MorphyGen",
    customer: {
      name,
      email,
      address: address || null,
      vatNumber: profile?.vat_number ?? null,
    },
    line: {
      description: `${planLabel} plan`,
      amount: receipt.amount,
      currency: receipt.currency,
    },
    subtotal: receipt.amount,
    total: receipt.amount,
    currency: receipt.currency,
  });

  const pdfBuffer = await renderPdf({ html, url: null, options: null });
  const attachment = Buffer.from(pdfBuffer).toString("base64");
  const filename = `receipt-${receipt.id}.pdf`;

  const from = requireEnv(resendFrom, "RESEND_FROM");
  const key = requireEnv(resendKey, "RESEND_KEY");

  const emailResponse = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [email],
      subject: `Your receipt ${receipt.id}`,
      html: `<p>Attached is your receipt for the ${planLabel} plan.</p>`,
      attachments: [
        {
          filename,
          content: attachment,
          content_type: "application/pdf",
        },
      ],
    }),
  });

  if (!emailResponse.ok) {
    const text = await emailResponse.text();
    return NextResponse.json({ error: `Failed to send email: ${text}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true }, { status: 200 });
};
