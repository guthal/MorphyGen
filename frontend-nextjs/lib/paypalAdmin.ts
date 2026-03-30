const paypalEnv = process.env.PAYPAL_ENV || "sandbox";
const isLive = paypalEnv === "live";
const paypalClientId = isLive
  ? process.env.PAYPAL_CLIENT_ID || ""
  : process.env.TEST_PAYPAL_CLIENT_ID || "";
const paypalSecret = isLive
  ? process.env.PAYPAL_SECRET || ""
  : process.env.TEST_PAYPAL_SECRET || "";
const credentialSource = isLive
  ? "PAYPAL_CLIENT_ID/PAYPAL_SECRET"
  : "TEST_PAYPAL_CLIENT_ID/TEST_PAYPAL_SECRET";
const paypalBaseUrl =
  process.env.PAYPAL_API_BASE ||
  (paypalEnv === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com");

const maskValue = (value: string | undefined | null, visible = 6) => {
  if (!value) return null;
  return value.length <= visible ? value : `***${value.slice(-visible)}`;
};

const truncate = (value: string, max = 500) =>
  value.length <= max ? value : `${value.slice(0, max)}...`;

const summarizePayload = (payload: Record<string, unknown>) => ({
  keys: Object.keys(payload),
  planId:
    typeof payload.plan_id === "string"
      ? payload.plan_id
      : typeof payload.plan_id === "number"
        ? String(payload.plan_id)
        : null,
  customId:
    typeof payload.custom_id === "string"
      ? maskValue(payload.custom_id, 8)
      : typeof payload.custom_id === "number"
        ? String(payload.custom_id)
        : null,
  hasSubscriber: Boolean(payload.subscriber),
  hasApplicationContext: Boolean(payload.application_context),
  hasWebhookEvent: Boolean(payload.webhook_event),
  hasWebhookId: Boolean(payload.webhook_id),
});

export const getPayPalConfigSnapshot = () => ({
  paypalEnv,
  isLive,
  paypalBaseUrl,
  credentialSource,
  hasClientId: Boolean(paypalClientId),
  hasSecret: Boolean(paypalSecret),
  clientIdSuffix: maskValue(paypalClientId),
  hasWebhookId: Boolean(process.env.PAYPAL_WEBHOOK_ID),
  hasPlanMap: Boolean(process.env.PAYPAL_PLAN_MAP),
  hasSandboxPlanMap: Boolean(process.env.PAYPAL_PLAN_MAP_SANDBOX),
  nodeEnv: process.env.NODE_ENV || "development",
});

export const logPayPalEvent = (
  message: string,
  details?: Record<string, unknown>,
  level: "info" | "warn" | "error" = "info"
) => {
  console[level](message, {
    ...getPayPalConfigSnapshot(),
    ...(details || {}),
  });
};

if (process.env.NODE_ENV !== "production") {
  logPayPalEvent("PayPal env loaded");
}

const requireEnv = (value: string, name: string) => {
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
};

export class PayPalApiError extends Error {
  status: number;
  body: string;

  constructor(status: number, body: string) {
    super(`PayPal API error: ${status} ${body}`);
    this.name = "PayPalApiError";
    this.status = status;
    this.body = body;
  }
}

export const isPayPalResourceNotFoundError = (error: unknown) => {
  if (!(error instanceof PayPalApiError) || error.status !== 404) {
    return false;
  }

  return (
    error.body.includes('"name":"RESOURCE_NOT_FOUND"') ||
    error.body.includes('"issue":"INVALID_RESOURCE_ID"')
  );
};

export const getPayPalAccessToken = async () => {
  const clientId = requireEnv(
    paypalClientId,
    isLive ? "PAYPAL_CLIENT_ID" : "TEST_PAYPAL_CLIENT_ID"
  );
  const secret = requireEnv(
    paypalSecret,
    isLive ? "PAYPAL_SECRET" : "TEST_PAYPAL_SECRET"
  );
  const auth = Buffer.from(`${clientId}:${secret}`).toString("base64");
  const startedAt = Date.now();

  logPayPalEvent("PayPal access token request starting", {
    endpoint: `${paypalBaseUrl}/v1/oauth2/token`,
  });

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
    logPayPalEvent(
      "PayPal access token request failed",
      {
        status: response.status,
        durationMs: Date.now() - startedAt,
        body: truncate(text),
      },
      "error"
    );
    throw new Error(`PayPal token request failed: ${response.status} ${text}`);
  }

  const data = (await response.json()) as { access_token?: string; expires_in?: number };
  if (!data.access_token) {
    logPayPalEvent(
      "PayPal token response missing access token",
      {
        durationMs: Date.now() - startedAt,
      },
      "error"
    );
    throw new Error("PayPal token response missing access_token");
  }

  logPayPalEvent("PayPal access token request succeeded", {
    durationMs: Date.now() - startedAt,
    expiresIn: data.expires_in ?? null,
  });

  return data.access_token;
};

export const paypalRequest = async <T>(
  path: string,
  payload: Record<string, unknown>
) => {
  const startedAt = Date.now();
  logPayPalEvent("PayPal POST request starting", {
    method: "POST",
    path,
    payload: summarizePayload(payload),
  });

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
    logPayPalEvent(
      "PayPal POST request failed",
      {
        method: "POST",
        path,
        status: response.status,
        durationMs: Date.now() - startedAt,
        body: truncate(text),
      },
      "error"
    );
    throw new PayPalApiError(response.status, text);
  }

  logPayPalEvent("PayPal POST request succeeded", {
    method: "POST",
    path,
    status: response.status,
    durationMs: Date.now() - startedAt,
    hasBody: Boolean(text),
  });

  if (!text) {
    return {} as T;
  }

  return JSON.parse(text) as T;
};

export const paypalGet = async <T>(
  path: string,
  params?: Record<string, string | number | undefined>
) => {
  const startedAt = Date.now();
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

  logPayPalEvent("PayPal GET request starting", {
    method: "GET",
    path,
    query: query || null,
  });

  const response = await fetch(`${paypalBaseUrl}${path}${query}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  const text = await response.text();
  if (!response.ok) {
    logPayPalEvent(
      "PayPal GET request failed",
      {
        method: "GET",
        path,
        query: query || null,
        status: response.status,
        durationMs: Date.now() - startedAt,
        body: truncate(text),
      },
      "error"
    );
    throw new PayPalApiError(response.status, text);
  }

  logPayPalEvent("PayPal GET request succeeded", {
    method: "GET",
    path,
    query: query || null,
    status: response.status,
    durationMs: Date.now() - startedAt,
  });

  return JSON.parse(text) as T;
};
