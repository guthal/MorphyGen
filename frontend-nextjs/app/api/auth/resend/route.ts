import { NextResponse, type NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

const resendKey = process.env.RESEND_KEY || "";
const resendFrom = process.env.RESEND_FROM || "";
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

const requireEnv = (value: string, name: string) => {
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
};

const isValidEmail = (value: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

export const POST = async (req: NextRequest) => {
  let payload: { email?: string } = {};
  try {
    payload = (await req.json()) as { email?: string };
  } catch {
    payload = {};
  }

  const email = payload.email?.trim().toLowerCase() ?? "";
  if (!email || !isValidEmail(email)) {
    return NextResponse.json({ error: "Valid email is required" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin.auth.admin.generateLink({
    type: "signup",
    email,
    options: {
      redirectTo: `${siteUrl}/auth-callback`,
    },
  });

  if (error || !data?.properties?.action_link) {
    return NextResponse.json(
      { error: error?.message ?? "Failed to generate verification link" },
      { status: 500 }
    );
  }

  const actionLink = data.properties.action_link;
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
      subject: "Confirm your MorphyGen account",
      html: `<p>Click the button below to verify your email:</p>
             <p><a href="${actionLink}">Verify email</a></p>
             <p>If you did not request this, you can ignore this email.</p>`,
      text: `Verify your email: ${actionLink}`,
    }),
  });

  if (!emailResponse.ok) {
    const text = await emailResponse.text();
    return NextResponse.json(
      { error: `Failed to send email: ${text}` },
      { status: 500 }
    );
  }

  return NextResponse.json({ sent: true }, { status: 200 });
};
