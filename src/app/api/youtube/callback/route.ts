import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import {
  fetchUserProfile,
  getOAuthCredentials,
  normalizeSession,
  parseCookieJson,
  serializeCookieJson,
  StoredOAuthConfig,
  StoredYouTubeSession,
  YT_OAUTH_CFG_COOKIE,
  YT_SESSION_COOKIE,
} from "@/lib/youtube";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");
  const state = url.searchParams.get("state") || "youtube";
  const errorBase = state === "hoy" ? "/?" : "/?tab=youtube&";

  if (error || !code) {
    return NextResponse.redirect(
      new URL(`${errorBase}yt_error=${encodeURIComponent(error || "no_code")}`, req.url)
    );
  }

  const cookieStore = await cookies();
  const cfgCookie = parseCookieJson<StoredOAuthConfig>(
    cookieStore.get(YT_OAUTH_CFG_COOKIE)?.value
  );
  const existingSession = normalizeSession(
    parseCookieJson<StoredYouTubeSession>(
      cookieStore.get(YT_SESSION_COOKIE)?.value
    )
  );
  const creds = getOAuthCredentials(cfgCookie);

  if (!creds) {
    return NextResponse.redirect(
      new URL(`${errorBase}yt_error=missing_oauth_config`, req.url)
    );
  }

  const redirectUri = `${url.origin}/api/youtube/callback`;

  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: creds.clientId,
        client_secret: creds.clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });

    if (!tokenRes.ok) {
      return NextResponse.redirect(
        new URL(`${errorBase}yt_error=token_exchange_failed`, req.url)
      );
    }

    const tokens = (await tokenRes.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
    };

    if (!tokens.access_token) {
      return NextResponse.redirect(
        new URL(`${errorBase}yt_error=missing_access_token`, req.url)
      );
    }

    const refreshToken =
      tokens.refresh_token || existingSession?.refresh_token || "";
    const expiryDate = Date.now() + (tokens.expires_in ?? 3500) * 1000;
    const user = await fetchUserProfile(tokens.access_token);

    const sessionPayload: StoredYouTubeSession = {
      access_token: tokens.access_token,
      refresh_token: refreshToken,
      expiry_date: expiryDate,
      ...(user ? { name: user.name, email: user.email } : {}),
    } as StoredYouTubeSession;

    const encodedSession = serializeCookieJson(sessionPayload);

    const successPath =
      state === "hoy" ? "/?yt_sync=1&cal_sync=1" : "/?tab=youtube&yt_sync=1";
    const response = NextResponse.redirect(new URL(successPath, req.url), {
      status: 302,
    });

    response.headers.set(
      "Cache-Control",
      "no-store, no-cache, must-revalidate"
    );

    response.cookies.set(YT_SESSION_COOKIE, encodedSession, {
      httpOnly: true,
      secure: url.protocol === "https:",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });

    return response;
  } catch {
    return NextResponse.redirect(
      new URL(`${errorBase}yt_error=oauth_exception`, req.url)
    );
  }
}
