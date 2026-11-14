import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import {
  fetchSubscriptionsFeed,
  fetchUserProfile,
  fetchUserSubscriptions,
  getOAuthCredentials,
  getSessionCookieOptions,
  normalizeSession,
  parseCookieJson,
  refreshAccessToken,
  resolveYouTubeChannel,
  serializeCookieJson,
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
  rawSession: StoredYouTubeSession | null,
  creds: StoredOAuthConfig | null
): Promise<{
  authenticated: boolean;
  updatedSession: StoredYouTubeSession | null;
  sessionChanged: boolean;
}> {
  const normalized = normalizeSession(rawSession);
  if (!normalized) {
    return { authenticated: false, updatedSession: null, sessionChanged: false };
  }

  let current = { ...normalized };
  let sessionChanged = false;

  // Silently refresh access_token if expired (or near expiry) whenever refresh_token exists
  if (
    Date.now() > current.expiry_date - 60_000 &&
    current.refresh_token &&
    creds
  ) {
    const refreshed = await refreshAccessToken(
      current.refresh_token,
      creds.clientId,
      creds.clientSecret
    );
    if (refreshed) {
      current = {
        ...current,
        access_token: refreshed.accessToken,
        expiry_date: refreshed.expiresAt,
      };
      sessionChanged = true;
    }
  }

  const hasValidToken =
    Boolean(current.refresh_token) ||
    (Boolean(current.access_token) && Date.now() < current.expiry_date);

  if (!hasValidToken) {
    return { authenticated: false, updatedSession: null, sessionChanged: false };
  }

  if (!current.user && current.access_token) {
    const profile = await fetchUserProfile(current.access_token);
    if (profile) {
      current = { ...current, user: profile };
      sessionChanged = true;
    }
  }

  return {
    authenticated: true,
    updatedSession: current,
    sessionChanged,
  };
}

export async function GET() {
  const cookieStore = await cookies();
  const cfgCookie = parseCookieJson<StoredOAuthConfig>(
    cookieStore.get(YT_OAUTH_CFG_COOKIE)?.value
  );
  const sessionCookie = parseCookieJson<StoredYouTubeSession>(
    cookieStore.get(YT_SESSION_COOKIE)?.value
  );
  const creds = getOAuthCredentials(cfgCookie);

  const { authenticated, updatedSession, sessionChanged } =
    await resolveActiveSession(sessionCookie, creds);

  const channels =
    authenticated && updatedSession?.access_token
      ? await fetchUserSubscriptions(updatedSession.access_token)
      : [];
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
    res.cookies.set(
      YT_SESSION_COOKIE,
      serializeCookieJson(updatedSession),
      getSessionCookieOptions()
    );
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
        ...getSessionCookieOptions(),
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
        serializeCookieJson({ clientId, clientSecret }),
        getSessionCookieOptions()
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
      await resolveActiveSession(sessionCookie, creds);

    const localChannels = Array.isArray(body.channels) ? body.channels : [];
    const shouldFetchSubs =
      authenticated &&
      Boolean(updatedSession?.access_token) &&
      (Boolean(body.forceSync) || localChannels.length === 0);

    const syncedChannels = shouldFetchSubs
      ? await fetchUserSubscriptions(updatedSession!.access_token)
      : [];
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
      res.cookies.set(
        YT_SESSION_COOKIE,
        serializeCookieJson(updatedSession),
        getSessionCookieOptions()
      );
    }

    return res;
  } catch {
    return NextResponse.json(
      { error: "Error procesando la petición de YouTube." },
      { status: 400 }
    );
  }
}
