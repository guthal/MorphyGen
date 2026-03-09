import { NextResponse, type NextRequest } from "next/server";
import { getUserFromRequest } from "@/lib/supabaseAuth";
import { paypalGet } from "@/lib/paypalAdmin";
import { isAdminEmail } from "@/lib/adminAuth";

export const runtime = "nodejs";

export const GET = async (req: NextRequest) => {
  const user = await getUserFromRequest(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isAdminEmail(user.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const data = await paypalGet<Record<string, unknown>>("/v1/catalogs/products", {
    page_size: req.nextUrl.searchParams.get("page_size") || "20",
    page: req.nextUrl.searchParams.get("page") || "1",
  });

  return NextResponse.json({ products: data }, { status: 200 });
};
