import { cookies } from "next/headers";
import { unseal } from "./crypto";
import { OAUTH_SCOPES } from "./config";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
export const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const COOKIE_NAME = "gh_session";

export function appUrl(): string {
  return (process.env.APP_URL || process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "http://localhost:3000"
  ).replace(/\/$/, "");
}

export function redirectUri(): string {
  return `${process.env.APP_URL?.replace(/\/$/, "") || appUrl()}/api/auth/callback`;
}

export function buildAuthUrl(): string {
  const p = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID || "",
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: OAUTH_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    // NOTE: deliberately no include_granted_scopes — mixing legacy Fit scopes
    // into the token is a known cause of 403s on the Health API data plane.
  });
  return `${AUTH_URL}?${p}`;
}

export async function exchangeCode(code: string) {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID || "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
      redirect_uri: redirectUri(),
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) throw new Error(`Token exchange failed: ${res.status} ${await res.text()}`);
  return res.json() as Promise<{ access_token: string; refresh_token?: string; expires_in: number }>;
}

export async function refreshAccessToken(refreshToken: string): Promise<string> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: process.env.GOOGLE_CLIENT_ID || "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`Token refresh failed: ${res.status} ${await res.text()}`);
  const j = await res.json();
  return j.access_token as string;
}

// Resolve a refresh token: session cookie first, env fallback (widget / single user).
export async function getRefreshToken(): Promise<string | null> {
  try {
    const jar = await cookies();
    const sealed = jar.get(COOKIE_NAME)?.value;
    if (sealed) {
      const s = unseal<{ rt: string }>(sealed);
      if (s?.rt) return s.rt;
    }
  } catch { /* not in a request context */ }
  return process.env.GOOGLE_REFRESH_TOKEN || null;
}
