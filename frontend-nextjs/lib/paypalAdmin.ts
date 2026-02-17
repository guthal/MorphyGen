const paypalEnv = process.env.PAYPAL_ENV || "sandbox";
const paypalClientId =
  process.env.PAYPAL_CLIENT_ID || process.env.TEST_PAYPAL_CLIENT_ID || "";
const paypalSecret =
  process.env.PAYPAL_SECRET || process.env.TEST_PAYPAL_SECRET || "";
const paypalBaseUrl =
  process.env.PAYPAL_API_BASE ||
  (paypalEnv === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com");

const requireEnv = (value: string, name: string) => {
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
};

export const getPayPalAccessToken = async () => {
  const clientId = requireEnv(paypalClientId, "TEST_PAYPAL_CLIENT_ID");
  const secret = requireEnv(paypalSecret, "TEST_PAYPAL_SECRET");
  const auth = Buffer.from(`${clientId}:${secret}`).toString("base64");

  const response = await fetch(`${paypalBaseUrl}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`PayPal token request failed: ${response.status} ${text}`);
  }

  const data = (await response.json()) as { access_token?: string };
  if (!data.access_token) {
    throw new Error("PayPal token response missing access_token");
  }
  return data.access_token;
};

export const paypalRequest = async <T>(
  path: string,
  payload: Record<string, unknown>
) => {
  const token = await getPayPalAccessToken();
  const response = await fetch(`${paypalBaseUrl}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`PayPal API error: ${response.status} ${text}`);
  }

  return JSON.parse(text) as T;
};

export const paypalGet = async <T>(
  path: string,
  params?: Record<string, string | number | undefined>
) => {
  const token = await getPayPalAccessToken();
  const query = params
    ? `?${new URLSearchParams(
        Object.entries(params).reduce<Record<string, string>>((acc, [key, value]) => {
          if (value === undefined || value === null || value === "") return acc;
          acc[key] = String(value);
          return acc;
        }, {})
      ).toString()}`
    : "";

  const response = await fetch(`${paypalBaseUrl}${path}${query}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`PayPal API error: ${response.status} ${text}`);
  }

  return JSON.parse(text) as T;
};
