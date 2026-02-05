import crypto from "node:crypto";

const RAZORPAY_BASE = "https://api.razorpay.com/v1";

const requireEnv = (value: string | undefined, name: string) => {
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
};

export const getRazorpayAuthHeader = () => {
  const keyId = requireEnv(process.env.RAZORPAY_KEY_ID, "RAZORPAY_KEY_ID");
  const keySecret = requireEnv(
    process.env.RAZORPAY_KEY_SECRET,
    "RAZORPAY_KEY_SECRET"
  );
  const token = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
  return { keyId, authHeader: `Basic ${token}` };
};

export const getPlanId = (planCode: string) => {
  const raw = requireEnv(process.env.RAZORPAY_PLAN_MAP, "RAZORPAY_PLAN_MAP");
  const map = JSON.parse(raw) as Record<string, string>;
  const planId = map[planCode];
  if (!planId) {
    throw new Error(`Unknown plan code: ${planCode}`);
  }
  return planId;
};

export const createRazorpayCustomer = async (payload: {
  name?: string | null;
  email?: string | null;
}) => {
  const { authHeader } = getRazorpayAuthHeader();
  const response = await fetch(`${RAZORPAY_BASE}/customers`, {
    method: "POST",
    headers: {
      Authorization: authHeader,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: payload.name ?? undefined,
      email: payload.email ?? undefined,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Razorpay customer failed: ${text}`);
  }

  return (await response.json()) as { id: string };
};

export const createRazorpaySubscription = async (payload: {
  planId: string;
  customerId: string;
  totalCount?: number;
}) => {
  const { authHeader } = getRazorpayAuthHeader();
  const response = await fetch(`${RAZORPAY_BASE}/subscriptions`, {
    method: "POST",
    headers: {
      Authorization: authHeader,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      plan_id: payload.planId,
      customer_notify: 1,
      total_count: payload.totalCount ?? 1200,
      customer_id: payload.customerId,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Razorpay subscription failed: ${text}`);
  }

  return (await response.json()) as { id: string; status: string };
};

export const verifySubscriptionSignature = (params: {
  subscriptionId: string;
  paymentId: string;
  signature: string;
}) => {
  const secret = requireEnv(
    process.env.RAZORPAY_KEY_SECRET,
    "RAZORPAY_KEY_SECRET"
  );
  const payload = `${params.paymentId}|${params.subscriptionId}`;
  const expected = crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("hex");
  return crypto.timingSafeEqual(
    Buffer.from(expected),
    Buffer.from(params.signature)
  );
};

export const verifyWebhookSignature = (rawBody: string, signature: string) => {
  const secret = requireEnv(
    process.env.RAZORPAY_WEBHOOK_SECRET,
    "RAZORPAY_WEBHOOK_SECRET"
  );
  const expected = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");
  return crypto.timingSafeEqual(
    Buffer.from(expected),
    Buffer.from(signature)
  );
};
