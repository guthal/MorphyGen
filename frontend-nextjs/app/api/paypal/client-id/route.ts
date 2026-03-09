import { NextResponse } from "next/server";

export const runtime = "nodejs";

export const GET = async () => {
  const paypalEnv = process.env.PAYPAL_ENV || "sandbox";
  const clientId =
    paypalEnv === "live"
      ? process.env.PAYPAL_CLIENT_ID
      : process.env.TEST_PAYPAL_CLIENT_ID || process.env.PAYPAL_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json({ error: "Missing PayPal client id" }, { status: 500 });
  }

  return NextResponse.json({ clientId }, { status: 200 });
};
