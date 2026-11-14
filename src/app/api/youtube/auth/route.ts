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
  const returnTo = req.nextUrl.searchParams.get("returnTo") || "youtube";
  const cookieStore = await cookies();
  const cfgCookie = parseCookieJson<StoredOAuthConfig>(
    cookieStore.get(YT_OAUTH_CFG_COOKIE)?.value
  );
  const creds = getOAuthCredentials(cfgCookie);

  if (!creds) {
    const errorUrl =
      returnTo === "hoy"
        ? "/?cal_error=missing_oauth_config"
        : "/?tab=youtube&yt_error=missing_oauth_config";
    return NextResponse.redirect(new URL(errorUrl, req.url));
  }

  const origin = new URL(req.url).origin;
  const redirectUri = `${origin}/api/youtube/callback`;

  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", creds.clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set(
    "scope",
    "https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email"
  );
  authUrl.searchParams.set("access_type", "offline");
  authUrl.searchParams.set("prompt", "consent");
  authUrl.searchParams.set("include_granted_scopes", "false");
  authUrl.searchParams.set("state", returnTo);

  return NextResponse.redirect(authUrl.toString());
}
