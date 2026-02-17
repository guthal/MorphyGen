import { NextResponse, type NextRequest } from "next/server";
import { getUserFromRequest } from "@/lib/supabaseAuth";
import { paypalGet } from "@/lib/paypalAdmin";

export const runtime = "nodejs";

const adminEmails = (process.env.PAYPAL_ADMIN_EMAILS || "")
  .split(",")
  .map((value) => value.trim().toLowerCase())
  .filter(Boolean);

const requireAdmin = (email: string | null) => {
  if (adminEmails.length === 0) return true;
  if (!email) return false;
  return adminEmails.includes(email.toLowerCase());
};

export const GET = async (req: NextRequest) => {
  const user = await getUserFromRequest(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!requireAdmin(user.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const data = await paypalGet<Record<string, unknown>>("/v1/catalogs/products", {
    page_size: req.nextUrl.searchParams.get("page_size") || "20",
    page: req.nextUrl.searchParams.get("page") || "1",
  });

  return NextResponse.json({ products: data }, { status: 200 });
};
