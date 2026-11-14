import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import {
  fetchSubscriptionsFeed,
  fetchUserSubscriptions,
  getOAuthCredentials,
  ONE_YEAR_SECONDS,
  parseCookieJson,
  refreshAccessToken,
  resolveYouTubeChannel,
  StoredOAuthConfig,
  StoredYouTubeSession,
  YT_OAUTH_CFG_COOKIE,
  YT_SESSION_COOKIE,
} from "@/lib/youtube";
import { YouTubeChannel } from "@/types/news";

export const dynamic = "force-dynamic";

function mergeChannels(
  synced: YouTubeChannel[],
  local: YouTubeChannel[]
): YouTubeChannel[] {
  const map = new Map<string, YouTubeChannel>();
  for (const ch of synced) {
    if (ch.channelId) map.set(ch.channelId, ch);
  }
  for (const ch of local) {
    if (ch.channelId && !map.has(ch.channelId)) {
      map.set(ch.channelId, ch);
    }
  }
  return Array.from(map.values());
}

async function resolveActiveSession(
  session: StoredYouTubeSession | null,
  creds: StoredOAuthConfig | null,
  forceSync: boolean
): Promise<{
  authenticated: boolean;
  updatedSession: StoredYouTubeSession | null;
  sessionChanged: boolean;
}> {
  if (!session) {
    return { authenticated: false, updatedSession: null, sessionChanged: false };
  }

  let current = { ...session };
  let sessionChanged = false;

  // Silently refresh access token if expired (or near expiry) whenever refreshToken exists
  if (Date.now() > current.expiresAt - 60_000 && current.refreshToken && creds) {
    const refreshed = await refreshAccessToken(
      current.refreshToken,
      creds.clientId,
      creds.clientSecret
    );
    if (refreshed) {
      current = {
        ...current,
        accessToken: refreshed.accessToken,
        expiresAt: refreshed.expiresAt,
      };
      sessionChanged = true;
    }
  }

  // Keep session valid whenever we have a refreshToken or unexpired accessToken
  const hasValidToken =
    Boolean(current.refreshToken) || Date.now() < current.expiresAt;

  if (!hasValidToken) {
    return { authenticated: false, updatedSession: null, sessionChanged: false };
  }

  if (forceSync || !current.syncedChannels || current.syncedChannels.length === 0) {
    if (current.accessToken) {
      const subs = await fetchUserSubscriptions(current.accessToken);
      if (subs.length > 0) {
        current.syncedChannels = subs;
        sessionChanged = true;
      }
    }
  }

  return {
    authenticated: true,
    updatedSession: current,
    sessionChanged,
  };
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const forceSync = url.searchParams.get("sync") === "1";

  const cookieStore = await cookies();
  const cfgCookie = parseCookieJson<StoredOAuthConfig>(
    cookieStore.get(YT_OAUTH_CFG_COOKIE)?.value
  );
  const sessionCookie = parseCookieJson<StoredYouTubeSession>(
    cookieStore.get(YT_SESSION_COOKIE)?.value
  );
  const creds = getOAuthCredentials(cfgCookie);

  const { authenticated, updatedSession, sessionChanged } =
    await resolveActiveSession(sessionCookie, creds, forceSync);

  const channels = updatedSession?.syncedChannels || [];
  const videos = await fetchSubscriptionsFeed(channels);

  const res = NextResponse.json(
    {
      authenticated,
      hasOAuthConfig: Boolean(creds),
      user: updatedSession?.user || null,
      channels,
      videos,
    },
    { headers: { "Cache-Control": "no-store, max-age=0" } }
  );

  if (sessionChanged && updatedSession) {
    res.cookies.set(YT_SESSION_COOKIE, JSON.stringify(updatedSession), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: ONE_YEAR_SECONDS,
    });
  }

  return res;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      action?:
        | "status_or_feed"
        | "save_oauth_config"
        | "resolve_channel"
        | "logout";
      channels?: YouTubeChannel[];
      forceSync?: boolean;
      clientId?: string;
      clientSecret?: string;
      query?: string;
    };

    const action = body.action || "status_or_feed";
    const cookieStore = await cookies();
    const cfgCookie = parseCookieJson<StoredOAuthConfig>(
      cookieStore.get(YT_OAUTH_CFG_COOKIE)?.value
    );
    const sessionCookie = parseCookieJson<StoredYouTubeSession>(
      cookieStore.get(YT_SESSION_COOKIE)?.value
    );
    const creds = getOAuthCredentials(cfgCookie);

    if (action === "logout") {
      const res = NextResponse.json({ ok: true, authenticated: false });
      res.cookies.set(YT_SESSION_COOKIE, "", {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: 0,
      });
      return res;
    }

    if (action === "save_oauth_config") {
      const clientId = body.clientId?.trim() || "";
      const clientSecret = body.clientSecret?.trim() || "";
      if (!clientId || !clientSecret) {
        return NextResponse.json(
          { error: "Introduce Client ID y Client Secret válidos." },
          { status: 400 }
        );
      }
      const res = NextResponse.json({ ok: true, hasOAuthConfig: true });
      res.cookies.set(
        YT_OAUTH_CFG_COOKIE,
        JSON.stringify({ clientId, clientSecret }),
        {
          httpOnly: true,
          sameSite: "lax",
          secure: process.env.NODE_ENV === "production",
          path: "/",
          maxAge: ONE_YEAR_SECONDS,
        }
      );
      return res;
    }

    if (action === "resolve_channel") {
      const query = body.query?.trim() || "";
      if (!query) {
        return NextResponse.json(
          { error: "Introduce un @canal, URL o ID de YouTube." },
          { status: 400 }
        );
      }
      const channel = await resolveYouTubeChannel(query);
      if (!channel) {
        return NextResponse.json(
          { error: "No se pudo encontrar ese canal de YouTube." },
          { status: 404 }
        );
      }
      return NextResponse.json({ channel });
    }

    // Default: status_or_feed
    const { authenticated, updatedSession, sessionChanged } =
      await resolveActiveSession(sessionCookie, creds, Boolean(body.forceSync));

    const localChannels = Array.isArray(body.channels) ? body.channels : [];
    const syncedChannels = updatedSession?.syncedChannels || [];
    const mergedChannels = mergeChannels(syncedChannels, localChannels);

    const videos = await fetchSubscriptionsFeed(mergedChannels);

    const res = NextResponse.json(
      {
        authenticated,
        hasOAuthConfig: Boolean(creds),
        user: updatedSession?.user || null,
        channels: mergedChannels,
        videos,
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );

    if (sessionChanged && updatedSession) {
      res.cookies.set(YT_SESSION_COOKIE, JSON.stringify(updatedSession), {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: ONE_YEAR_SECONDS,
      });
    }

    return res;
  } catch {
    return NextResponse.json(
      { error: "Error procesando la petición de YouTube." },
      { status: 400 }
    );
  }
}
