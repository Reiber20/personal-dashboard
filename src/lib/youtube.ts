import { XMLParser } from "fast-xml-parser";
import { YouTubeChannel, YouTubeUserProfile, YouTubeVideo } from "@/types/news";

export const YT_SESSION_COOKIE = "hr_yt_session";
export const YT_OAUTH_CFG_COOKIE = "hr_yt_oauth_cfg";
export const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export interface StoredYouTubeSession {
  access_token: string;
  refresh_token: string;
  expiry_date: number;
  user?: YouTubeUserProfile;
  // Optional legacy aliases for backward compatibility
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
}

export interface StoredOAuthConfig {
  clientId: string;
  clientSecret: string;
}

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  trimValues: true,
});

const VIDEO_CACHE_TTL_MS = 10 * 60 * 1000;
const channelVideosCache = new Map<
  string,
  { expiresAt: number; videos: YouTubeVideo[] }
>();

function toArray<T>(val: T | T[] | undefined | null): T[] {
  if (!val) return [];
  return Array.isArray(val) ? val : [val];
}

function asText(val: unknown): string {
  if (typeof val === "string") return val;
  if (typeof val === "number") return String(val);
  if (val && typeof val === "object") {
    const obj = val as Record<string, unknown>;
    if (typeof obj["#text"] === "string") return obj["#text"];
  }
  return "";
}

export function getOAuthCredentials(
  cookieConfig?: StoredOAuthConfig | null
): StoredOAuthConfig | null {
  const envId = process.env.GOOGLE_CLIENT_ID?.trim();
  const envSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (envId && envSecret) {
    return { clientId: envId, clientSecret: envSecret };
  }
  if (cookieConfig?.clientId && cookieConfig?.clientSecret) {
    return {
      clientId: cookieConfig.clientId.trim(),
      clientSecret: cookieConfig.clientSecret.trim(),
    };
  }
  return null;
}

export function getSessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: ONE_YEAR_SECONDS,
  };
}

export function serializeCookieJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

export function parseCookieJson<T>(rawValue: string | undefined): T | null {
  if (!rawValue) return null;
  const trimmed = rawValue.trim();
  const candidates = [trimmed];

  try {
    candidates.push(decodeURIComponent(trimmed));
  } catch {}

  try {
    candidates.push(Buffer.from(trimmed, "base64url").toString("utf8"));
  } catch {}

  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      return JSON.parse(candidate) as T;
    } catch {
      // Try next decoding strategy
    }
  }
  return null;
}

export function normalizeSession(
  raw: StoredYouTubeSession | null
): StoredYouTubeSession | null {
  if (!raw || typeof raw !== "object") return null;
  const access_token = raw.access_token || raw.accessToken || "";
  const refresh_token = raw.refresh_token || raw.refreshToken || "";
  const expiry_date =
    typeof raw.expiry_date === "number"
      ? raw.expiry_date
      : typeof raw.expiresAt === "number"
        ? raw.expiresAt
        : 0;
  if (!access_token && !refresh_token) return null;
  return {
    access_token,
    refresh_token,
    expiry_date,
    ...(raw.user ? { user: raw.user } : {}),
  };
}

export async function refreshAccessToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string
): Promise<{ accessToken: string; expiresAt: number } | null> {
  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) return null;
    const data = (await res.json()) as {
      access_token?: string;
      expires_in?: number;
    };
    if (!data.access_token) return null;

    return {
      accessToken: data.access_token,
      expiresAt: Date.now() + (data.expires_in ?? 3500) * 1000,
    };
  } catch {
    return null;
  }
}

export async function fetchUserProfile(
  accessToken: string
): Promise<YouTubeUserProfile | undefined> {
  try {
    const res = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return undefined;
    const data = (await res.json()) as {
      name?: string;
      email?: string;
      picture?: string;
    };
    if (!data.name && !data.email) return undefined;
    return {
      name: data.name || data.email || "Usuario de Google",
      email: data.email,
      picture: data.picture,
    };
  } catch {
    return undefined;
  }
}

export async function fetchUserSubscriptions(
  accessToken: string
): Promise<YouTubeChannel[]> {
  const channels: YouTubeChannel[] = [];
  let pageToken = "";

  for (let page = 0; page < 3; page++) {
    const url = new URL("https://www.googleapis.com/youtube/v3/subscriptions");
    url.searchParams.set("part", "snippet");
    url.searchParams.set("mine", "true");
    url.searchParams.set("maxResults", "50");
    url.searchParams.set("order", "alphabetical");
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    try {
      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) break;

      const data = (await res.json()) as {
        nextPageToken?: string;
        items?: Array<{
          snippet?: {
            title?: string;
            resourceId?: { channelId?: string };
            thumbnails?: {
              default?: { url?: string };
              medium?: { url?: string };
            };
          };
        }>;
      };

      for (const item of data.items || []) {
        const channelId = item.snippet?.resourceId?.channelId;
        const title = item.snippet?.title;
        if (!channelId || !title) continue;
        channels.push({
          channelId,
          title,
          thumbnail:
            item.snippet?.thumbnails?.medium?.url ||
            item.snippet?.thumbnails?.default?.url,
        });
      }

      if (!data.nextPageToken) break;
      pageToken = data.nextPageToken;
    } catch {
      break;
    }
  }

  return channels;
}

export async function resolveYouTubeChannel(
  rawInput: string
): Promise<YouTubeChannel | null> {
  const input = rawInput.trim();
  if (!input) return null;

  // Direct UC... channel ID
  const directMatch = input.match(/(?:^|\/channel\/)(UC[a-zA-Z0-9_-]{20,})/);
  if (directMatch?.[1]) {
    const channelId = directMatch[1];
    try {
      const videos = await fetchChannelVideos({ channelId, title: channelId }, 1);
      return {
        channelId,
        title: videos[0]?.channelTitle || channelId,
      };
    } catch {
      return { channelId, title: channelId };
    }
  }

  // Build channel URL from @handle, plain handle, or URL
  let targetUrl = input;
  if (!input.startsWith("http")) {
    const cleanHandle = input.startsWith("@") ? input : `@${input}`;
    targetUrl = `https://www.youtube.com/${cleanHandle}`;
  }

  try {
    const res = await fetch(targetUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(7000),
    });
    if (!res.ok) return null;
    const html = await res.text();

    const idMatch =
      html.match(/<meta[^>]+itemprop="channelId"[^>]+content="(UC[a-zA-Z0-9_-]{20,})"/i) ||
      html.match(/"externalId"\s*:\s*"(UC[a-zA-Z0-9_-]{20,})"/) ||
      html.match(/"channelId"\s*:\s*"(UC[a-zA-Z0-9_-]{20,})"/);

    if (!idMatch?.[1]) return null;
    const channelId = idMatch[1];

    const titleMatch =
      html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]+)"/i) ||
      html.match(/<title>([^<]+)<\/title>/i);
    const title = (titleMatch?.[1] || channelId)
      .replace(/\s*-\s*YouTube$/i, "")
      .trim();

    const thumbMatch = html.match(
      /<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i
    );

    return {
      channelId,
      title: title || channelId,
      thumbnail: thumbMatch?.[1],
    };
  } catch {
    return null;
  }
}

export async function fetchChannelVideos(
  channel: YouTubeChannel,
  maxVideos = 4
): Promise<YouTubeVideo[]> {
  const cached = channelVideosCache.get(channel.channelId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.videos.slice(0, maxVideos);
  }

  try {
    const res = await fetch(
      `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(
        channel.channelId
      )}`,
      {
        headers: {
          "User-Agent": "HolaRoberDashboard/1.0",
          Accept: "application/atom+xml, application/xml, text/xml",
        },
        cache: "no-store",
        signal: AbortSignal.timeout(6000),
      }
    );

    if (!res.ok) return [];
    const xml = await res.text();
    const doc = xmlParser.parse(xml) as {
      feed?: {
        title?: unknown;
        entry?: Record<string, unknown> | Record<string, unknown>[];
      };
    };

    const feedTitle = asText(doc.feed?.title);
    const rawEntries = toArray(doc.feed?.entry);
    const videos: YouTubeVideo[] = [];

    for (const raw of rawEntries.slice(0, 10)) {
      const videoId = asText(raw["yt:videoId"]);
      const title = asText(raw.title);
      if (!videoId || !title) continue;

      const mediaGroup = (raw["media:group"] || {}) as Record<string, unknown>;
      const mediaThumb = mediaGroup["media:thumbnail"] as
        | Record<string, unknown>
        | undefined;
      const mediaComm = mediaGroup["media:community"] as
        | Record<string, unknown>
        | undefined;
      const mediaStats = mediaComm?.["media:statistics"] as
        | Record<string, unknown>
        | undefined;

      const authorObj = raw.author as Record<string, unknown> | undefined;
      const channelTitle =
        asText(authorObj?.name) || feedTitle || channel.title;

      const linkObj = toArray(
        raw.link as Record<string, unknown> | Record<string, unknown>[]
      )[0];
      const link =
        (typeof linkObj?.["@_href"] === "string" && linkObj["@_href"]) ||
        `https://www.youtube.com/watch?v=${videoId}`;

      const thumbUrl =
        (typeof mediaThumb?.["@_url"] === "string" && mediaThumb["@_url"]) ||
        `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

      const views =
        mediaStats?.["@_views"] !== undefined
          ? String(mediaStats["@_views"])
          : undefined;

      const description = asText(mediaGroup["media:description"]).slice(0, 180);
      const publishedAt = asText(raw.published) || new Date().toISOString();

      videos.push({
        id: `yt-${channel.channelId}-${videoId}`,
        videoId,
        title,
        link,
        channelId: channel.channelId,
        channelTitle,
        publishedAt,
        thumbnail: thumbUrl,
        views,
        description,
      });
    }

    channelVideosCache.set(channel.channelId, {
      expiresAt: Date.now() + VIDEO_CACHE_TTL_MS,
      videos,
    });
    return videos.slice(0, maxVideos);
  } catch {
    return [];
  }
}

export async function fetchSubscriptionsFeed(
  channels: YouTubeChannel[],
  maxVideosPerChannel = 4
): Promise<YouTubeVideo[]> {
  if (channels.length === 0) return [];

  const allVideos: YouTubeVideo[] = [];
  const batchSize = 15;

  for (let i = 0; i < channels.length; i += batchSize) {
    const batch = channels.slice(i, i + batchSize);
    const results = await Promise.all(
      batch.map((ch) => fetchChannelVideos(ch, maxVideosPerChannel))
    );
    allVideos.push(...results.flat());
  }

  const seenVideoIds = new Set<string>();
  const unique: YouTubeVideo[] = [];

  allVideos.sort(
    (a, b) =>
      new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
  );

  for (const video of allVideos) {
    if (seenVideoIds.has(video.videoId)) continue;
    seenVideoIds.add(video.videoId);
    unique.push(video);
  }

  return unique.slice(0, 60);
}
