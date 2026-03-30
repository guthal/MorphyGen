import { NextResponse } from "next/server";
import { logPayPalEvent } from "@/lib/paypalAdmin";

export const runtime = "nodejs";

export const GET = async () => {
  const paypalEnv = process.env.PAYPAL_ENV || "sandbox";
  const clientId =
    paypalEnv === "live"
      ? process.env.PAYPAL_CLIENT_ID
      : process.env.TEST_PAYPAL_CLIENT_ID || process.env.PAYPAL_CLIENT_ID;
  if (!clientId) {
    logPayPalEvent(
      "PayPal client id request missing configured client id",
      {
        route: "api.paypal.client-id",
      },
      "error"
    );
    return NextResponse.json({ error: "Missing PayPal client id" }, { status: 500 });
  }

  logPayPalEvent("PayPal client id request succeeded", {
    route: "api.paypal.client-id",
    paypalEnv,
  });

  return NextResponse.json({ clientId }, { status: 200 });
};
