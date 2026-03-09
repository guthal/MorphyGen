import { NextResponse, type NextRequest } from "next/server";
import { getUserFromRequest } from "@/lib/supabaseAuth";
import { isAdminEmail } from "@/lib/adminAuth";

export const GET = async (req: NextRequest) => {
  const user = await getUserFromRequest(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({ isAdmin: isAdminEmail(user.email) }, { status: 200 });
};
