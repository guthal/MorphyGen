import { NextResponse, type NextRequest } from "next/server";
import { getUserFromRequest } from "@/lib/supabaseAuth";
import { paypalGet, paypalRequest } from "@/lib/paypalAdmin";

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

export const POST = async (req: NextRequest) => {
  const user = await getUserFromRequest(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!requireAdmin(user.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let payload: {
    name?: string;
    description?: string;
    type?: "SERVICE" | "PHYSICAL" | "DIGITAL";
    category?: string;
  } = {};
  try {
    payload = (await req.json()) as typeof payload;
  } catch {
    payload = {};
  }

  const name = payload.name?.trim();
  if (!name) {
    return NextResponse.json({ error: "Product name is required" }, { status: 400 });
  }

  const data = await paypalRequest<{
    id: string;
    name: string;
    description?: string;
    create_time?: string;
  }>("/v1/catalogs/products", {
    name,
    description: payload.description?.trim() || undefined,
    type: payload.type || "SERVICE",
    category: payload.category || "SOFTWARE",
  });

  return NextResponse.json({ product: data }, { status: 201 });
};

export const GET = async (req: NextRequest) => {
  const user = await getUserFromRequest(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!requireAdmin(user.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const id = req.nextUrl.searchParams.get("id")?.trim();
  if (!id) {
    return NextResponse.json({ error: "Product id is required" }, { status: 400 });
  }

  const data = await paypalGet<Record<string, unknown>>(`/v1/catalogs/products/${id}`);
  return NextResponse.json({ product: data }, { status: 200 });
};
