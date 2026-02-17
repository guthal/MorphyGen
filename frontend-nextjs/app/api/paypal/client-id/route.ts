import { NextResponse } from "next/server";

export const runtime = "nodejs";

export const GET = async () => {
  const clientId =
    process.env.PAYPAL_CLIENT_ID || process.env.TEST_PAYPAL_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json({ error: "Missing PayPal client id" }, { status: 500 });
  }

  return NextResponse.json({ clientId }, { status: 200 });
};
