import { NextRequest, NextResponse } from "next/server";
import { exchangeCode, COOKIE_NAME } from "@/lib/google";
import { seal } from "@/lib/crypto";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  if (!code) return NextResponse.redirect(new URL("/?auth=denied", req.url));
  try {
    const tokens = await exchangeCode(code);
    const res = NextResponse.redirect(
      new URL(tokens.refresh_token ? `/connected?rt=${encodeURIComponent(tokens.refresh_token)}` : "/", req.url)
    );
    if (tokens.refresh_token) {
      res.cookies.set(COOKIE_NAME, seal({ rt: tokens.refresh_token }), {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * 365,
        path: "/",
      });
    }
    return res;
  } catch (e) {
    console.error(e);
    return NextResponse.redirect(new URL("/?auth=error", req.url));
  }
}
