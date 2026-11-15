import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import {
  getOAuthCredentials,
  parseCookieJson,
  StoredOAuthConfig,
  YT_OAUTH_CFG_COOKIE,
} from "@/lib/youtube";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const returnTo = url.searchParams.get("returnTo") || "youtube";

  const cookieStore = await cookies();
  const cfgCookie = parseCookieJson<StoredOAuthConfig>(
    cookieStore.get(YT_OAUTH_CFG_COOKIE)?.value
  );
  const creds = getOAuthCredentials(cfgCookie);

  if (!creds) {
    const errorBase = returnTo === "hoy" ? "/?" : "/?tab=youtube&";
    return NextResponse.redirect(
      new URL(`${errorBase}yt_error=missing_oauth_config`, req.url)
    );
  }

  const redirectUri = `${url.origin}/api/youtube/callback`;
  const scopes = [
    "https://www.googleapis.com/auth/youtube.readonly",
    "https://www.googleapis.com/auth/calendar.readonly",
    "https://www.googleapis.com/auth/calendar.events",
    "https://www.googleapis.com/auth/userinfo.profile",
    "https://www.googleapis.com/auth/userinfo.email",
    "openid",
  ].join(" ");

  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", creds.clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", scopes);
  authUrl.searchParams.set("access_type", "offline");
  authUrl.searchParams.set("prompt", "consent");
  authUrl.searchParams.set("state", returnTo);

  return NextResponse.redirect(authUrl.toString());
}
