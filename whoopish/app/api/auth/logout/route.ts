import { NextRequest, NextResponse } from "next/server";
import { COOKIE_NAME } from "@/lib/google";
export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
  const res = NextResponse.redirect(new URL("/", req.url));
  res.cookies.delete(COOKIE_NAME);
  return res;
}
