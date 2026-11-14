import crypto from "node:crypto";
import { XMLParser } from "fast-xml-parser";
import { NewsItem, NewsSource, TrendRelatedNews, TrendTopic } from "@/types/news";

function makeItemId(
  sourceId: string,
  link: string,
  title: string,
  idx: number
): string {
  const hash = crypto
    .createHash("sha1")
    .update(`${sourceId}|${link}|${title}|${idx}`)
    .digest("hex")
    .slice(0, 16);
  return `${sourceId}-${hash}`;
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  trimValues: true,
});

function toArray<T>(val: T | T[] | undefined | null): T[] {
  if (!val) return [];
  return Array.isArray(val) ? val : [val];
}

function extractText(val: unknown): string {
  if (typeof val === "string") return val;
  if (typeof val === "number") return String(val);
  if (val && typeof val === "object") {
    const obj = val as Record<string, unknown>;
    if (typeof obj["#text"] === "string") return obj["#text"];
    if (typeof obj["@_href"] === "string") return obj["@_href"];
  }
  return "";
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

function stripHtml(html: string): string {
  return decodeHtmlEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
}

interface ImageCandidate {
  url: string;
  width: number;
  priority: number;
}

const NON_ARTICLE_IMAGE_RE =
  /s\.w\.org\/images\/core\/emoji|gravatar\.com\/avatar|pixel\.wp\.com|feeds\.feedburner\.com\/~r\/|doubleclick\.net|googlesyndication|statcounter|latex\.php|quicklatex\.com|codecogs\.com|mimetex|1x1|spacer\.gif|blank\.gif/i;

function normalizeAndFilterImageUrl(
  rawUrl: string,
  baseLink?: string
): string | null {
  let url = decodeHtmlEntities(rawUrl).trim();
  if (!url || /^data:/i.test(url) || /\.svg(\?|$)/i.test(url)) {
    return null;
  }

  if (url.startsWith("//")) {
    url = `https:${url}`;
  } else if (!/^https?:\/\//i.test(url)) {
    if (!baseLink) return null;
    try {
      url = new URL(url, baseLink).toString();
    } catch {
      return null;
    }
  }

  if (!/^https?:\/\//i.test(url)) return null;
  url = url.replace(/^http:\/\//i, "https://");

  if (NON_ARTICLE_IMAGE_RE.test(url)) return null;
  return url;
}

/** Upgrades known low-resolution feed thumbnail URLs to high-resolution variants. */
function upgradeImageResolution(url: string): {
  primary: string;
  fallback?: string;
} {
  // Phys.org / ScienceX 90x90 thumbnails -> 800px / hires images
  if (/(?:scx\d\.b-cdn\.net|phys\.org)/i.test(url)) {
    if (/\/csz\/news\/tmb\//i.test(url)) {
      return { primary: url.replace(/\/csz\/news\/tmb\//i, "/csz/news/800a/") };
    }
    if (/\/gfx\/news\/tmb\//i.test(url)) {
      return { primary: url.replace(/\/gfx\/news\/tmb\//i, "/gfx/news/hires/") };
    }
  }

  // Webedia (Xataka, Xataka Ciencia, Applesfera, VidaExtra, Espinof, Motorpasión)
  if (/i\.blogs\.es\/.*\/(?:150_150|200_200|450_1000|650_1200)\./i.test(url)) {
    return {
      primary: url.replace(
        /(?:150_150|200_200|450_1000|650_1200)\./i,
        "1366_2000."
      ),
      fallback: url,
    };
  }

  // APS Physics thumbnails
  if (
    /(?:physics|feeds)\.aps\.org/i.test(url) &&
    /\/(?:thumbnail|small)\.(png|jpe?g)(?:\?.*)?$/i.test(url)
  ) {
    return {
      primary: url.replace(
        /\/(?:thumbnail|small)\.(png|jpe?g)(\?.*)?$/i,
        "/medium.$1$2"
      ),
      fallback: url,
    };
  }

  // Googleusercontent thumbnails
  if (/lh\d\.googleusercontent\.com/i.test(url)) {
    const gMatch = url.match(/=(?:s0-)?w(\d+)/i);
    if (gMatch && Number(gMatch[1]) < 600) {
      return {
        primary: url.replace(/=(?:s0-)?w\d+/i, "=w800"),
        fallback: url,
      };
    }
  }

  // WordPress / Jetpack resize & width query parameters
  try {
    const parsed = new URL(url);
    const resizeOrFit = parsed.searchParams.get("resize") ?? parsed.searchParams.get("fit");
    if (resizeOrFit) {
      const widthMatch = resizeOrFit.match(/^(\d+)/);
      if (widthMatch && Number(widthMatch[1]) < 600) {
        parsed.searchParams.delete("resize");
        parsed.searchParams.delete("fit");
        parsed.searchParams.delete("h");
        parsed.searchParams.delete("height");
        parsed.searchParams.set("w", "800");
        return { primary: parsed.toString(), fallback: url };
      }
    }

    const wParamName = parsed.searchParams.has("w")
      ? "w"
      : parsed.searchParams.has("width")
        ? "width"
        : null;
    if (wParamName) {
      const wVal = Number(parsed.searchParams.get(wParamName));
      if (!Number.isNaN(wVal) && wVal > 0 && wVal < 600) {
        parsed.searchParams.set(wParamName, "800");
        parsed.searchParams.delete("h");
        parsed.searchParams.delete("height");
        return { primary: parsed.toString(), fallback: url };
      }
    }
  } catch {
    // Fall through to filename suffix check
  }

  // WordPress -WxH cropped filename suffix
  const wpSuffix = url.match(
    /^(https?:\/\/[^?]+?)-(\d{2,3})x(\d{2,3})(\.(?:jpe?g|png|webp))(\?.*)?$/i
  );
  if (wpSuffix) {
    const [, prefix, wStr, hStr, ext, query] = wpSuffix;
    const w = Number(wStr);
    const h = Number(hStr);
    if (w < 600 || h < 300) {
      return {
        primary: `${prefix}${ext}${query ?? ""}`,
        fallback: w >= 240 ? url : undefined,
      };
    }
  }

  return { primary: url };
}

function extractHtmlAttr(tag: string, attrName: string): string | undefined {
  const re = new RegExp(
    `(?:^|\\s)${attrName}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'=<>` + "`" + `]+))`,
    "i"
  );
  const match = tag.match(re);
  if (!match) return undefined;
  return match[1] ?? match[2] ?? match[3];
}

function parsePositiveInt(val: unknown): number {
  const n = Number(val);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function pickBestSrcsetCandidate(
  srcset: string,
  baseLink?: string
): { url: string; width: number } | null {
  let best: { url: string; width: number } | null = null;
  for (const part of srcset.split(/,\s+/)) {
    const tokens = part.trim().split(/\s+/);
    const rawCandidateUrl = tokens[0];
    if (!rawCandidateUrl) continue;
    const normalized = normalizeAndFilterImageUrl(rawCandidateUrl, baseLink);
    if (!normalized) continue;

    let width = 400;
    const descriptor = tokens[1] || "";
    const wMatch = descriptor.match(/^(\d+)w$/i);
    const xMatch = descriptor.match(/^(\d+(?:\.\d+)?)x$/i);
    if (wMatch) {
      width = Number(wMatch[1]);
    } else if (xMatch) {
      width = Math.round(Number(xMatch[1]) * 400);
    }

    if (!best || width > best.width) {
      best = { url: normalized, width };
    }
  }
  return best;
}

function extractImageFromItem(
  item: Record<string, unknown>,
  rawHtml: string,
  itemLink?: string
): { imageUrl?: string; imageFallbackUrl?: string } {
  const candidates: ImageCandidate[] = [];
  const mediaGroup = item["media:group"] as Record<string, unknown> | undefined;

  const mediaContents = [
    ...toArray(
      item["media:content"] as Record<string, unknown> | Record<string, unknown>[]
    ),
    ...toArray(
      mediaGroup?.["media:content"] as
        | Record<string, unknown>
        | Record<string, unknown>[]
    ),
  ];

  for (const media of mediaContents) {
    if (!media || typeof media !== "object") continue;
    const medium = String(media["@_medium"] ?? "").toLowerCase();
    const mimeType = String(media["@_type"] ?? "").toLowerCase();
    if (medium === "video" || mimeType.startsWith("video") || mimeType.startsWith("audio")) {
      continue;
    }

    const urlAttr = media["@_url"];
    if (typeof urlAttr !== "string") continue;
    const url = normalizeAndFilterImageUrl(urlAttr, itemLink);
    if (!url) continue;

    const parsedWidth = parsePositiveInt(media["@_width"]);
    const parsedHeight = parsePositiveInt(media["@_height"]);
    const isUpgradable = upgradeImageResolution(url).primary !== url;
    if (
      !isUpgradable &&
      ((parsedWidth > 0 && parsedWidth < 140) ||
        (parsedHeight > 0 && parsedHeight < 80))
    ) {
      continue;
    }

    candidates.push({
      url,
      width: isUpgradable ? Math.max(parsedWidth, 800) : parsedWidth || 650,
      priority: 3,
    });
  }

  const enclosures = toArray(
    item["enclosure"] as Record<string, unknown> | Record<string, unknown>[]
  );
  for (const enc of enclosures) {
    if (!enc || typeof enc !== "object") continue;
    const mimeType = String(enc["@_type"] ?? "").toLowerCase();
    if (mimeType && !mimeType.startsWith("image")) continue;

    const urlAttr = enc["@_url"];
    if (typeof urlAttr !== "string") continue;
    const url = normalizeAndFilterImageUrl(urlAttr, itemLink);
    if (!url) continue;

    const parsedWidth = parsePositiveInt(enc["@_width"]);
    candidates.push({
      url,
      width: parsedWidth || 650,
      priority: 3,
    });
  }

  const htmlToScan = rawHtml.includes("<img") ? rawHtml : decodeHtmlEntities(rawHtml);
  const imgTags = htmlToScan.match(/<img\b[^>]*>/gi) ?? [];
  for (const tag of imgTags) {
    const classAttr = extractHtmlAttr(tag, "class") ?? "";
    const altAttr = extractHtmlAttr(tag, "alt") ?? "";
    if (/emoji|wp-smiley|avatar|icon|logo/i.test(`${classAttr} ${altAttr}`)) {
      continue;
    }

    const attrWidth = parsePositiveInt(extractHtmlAttr(tag, "width"));
    const attrHeight = parsePositiveInt(extractHtmlAttr(tag, "height"));

    let chosenUrl: string | null = null;
    let width = 0;

    for (const fullAttr of ["data-orig-file", "data-large-file", "data-full-url"]) {
      const val = extractHtmlAttr(tag, fullAttr);
      if (val) {
        const normalized = normalizeAndFilterImageUrl(val, itemLink);
        if (normalized) {
          chosenUrl = normalized;
          width = Math.max(attrWidth, 1000);
          break;
        }
      }
    }

    if (!chosenUrl) {
      for (const srcsetAttr of ["srcset", "data-srcset"]) {
        const val = extractHtmlAttr(tag, srcsetAttr);
        if (val) {
          const best = pickBestSrcsetCandidate(val, itemLink);
          if (best) {
            chosenUrl = best.url;
            width = best.width;
            break;
          }
        }
      }
    }

    if (!chosenUrl) {
      for (const srcAttr of ["data-lazy-src", "data-src", "src"]) {
        const val = extractHtmlAttr(tag, srcAttr);
        if (val) {
          const normalized = normalizeAndFilterImageUrl(val, itemLink);
          if (normalized) {
            chosenUrl = normalized;
            width = attrWidth || 550;
            break;
          }
        }
      }
    }

    if (!chosenUrl) continue;
    const isUpgradable = upgradeImageResolution(chosenUrl).primary !== chosenUrl;
    if (
      !isUpgradable &&
      ((attrWidth > 0 && attrWidth < 140) || (attrHeight > 0 && attrHeight < 80))
    ) {
      continue;
    }

    candidates.push({
      url: chosenUrl,
      width: isUpgradable ? Math.max(width, 800) : width || 550,
      priority: 2,
    });
  }

  const mediaThumbs = [
    ...toArray(
      item["media:thumbnail"] as Record<string, unknown> | Record<string, unknown>[]
    ),
    ...toArray(
      mediaGroup?.["media:thumbnail"] as
        | Record<string, unknown>
        | Record<string, unknown>[]
    ),
  ];

  for (const thumb of mediaThumbs) {
    if (!thumb || typeof thumb !== "object") continue;
    const urlAttr = thumb["@_url"];
    if (typeof urlAttr !== "string") continue;
    const url = normalizeAndFilterImageUrl(urlAttr, itemLink);
    if (!url) continue;

    const parsedWidth = parsePositiveInt(thumb["@_width"]);
    const parsedHeight = parsePositiveInt(thumb["@_height"]);
    const isUpgradable = upgradeImageResolution(url).primary !== url;
    if (isUpgradable) {
      candidates.push({ url, width: 800, priority: 3 });
      continue;
    }

    if (
      (parsedWidth > 0 && parsedWidth < 150) ||
      (parsedHeight > 0 && parsedHeight < 90)
    ) {
      continue;
    }

    candidates.push({
      url,
      width: parsedWidth || 300,
      priority: 1,
    });
  }

  if (candidates.length === 0) return {};

  candidates.sort((a, b) => b.width - a.width || b.priority - a.priority);
  const { primary, fallback } = upgradeImageResolution(candidates[0].url);
  return {
    imageUrl: primary,
    ...(fallback && fallback !== primary ? { imageFallbackUrl: fallback } : {}),
  };
}

function extractAtomLink(linkField: unknown): string {
  const links = toArray(
    linkField as
      | Record<string, unknown>
      | string
      | Array<Record<string, unknown> | string>
  );
  for (const l of links) {
    if (typeof l === "string") return l;
    if (l && typeof l === "object") {
      const obj = l as Record<string, unknown>;
      const rel = obj["@_rel"];
      const href = obj["@_href"];
      if ((!rel || rel === "alternate") && typeof href === "string") return href;
    }
  }
  const first = links[0];
  if (first && typeof first === "object") {
    const href = (first as Record<string, unknown>)["@_href"];
    if (typeof href === "string") return href;
  }
  return "";
}

function parseDate(rawDate: unknown): string {
  const str = extractText(rawDate);
  if (!str) return new Date().toISOString();
  const parsed = new Date(str);
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

const CACHE_TTL_MS = 10 * 60 * 1000;
const feedCache = new Map<string, { expiresAt: number; items: NewsItem[] }>();
let trendsCache: { expiresAt: number; trends: TrendTopic[] } | null = null;
let xTrendsCache: { expiresAt: number; trends: TrendTopic[] } | null = null;

export async function fetchFeedItems(source: NewsSource, maxItems = 12): Promise<NewsItem[]> {
  const cacheKey = `${source.id}::${source.url}`;
  const cached = feedCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.items.slice(0, maxItems);
  }

  try {
    const res = await fetch(source.url, {
      headers: {
        "User-Agent": "DailyPulsePersonalDashboard/1.0 (+https://vercel.app)",
        Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
      },
      signal: AbortSignal.timeout(6500),
      cache: "no-store",
    });

    if (!res.ok) return [];
    const xml = await res.text();
    const doc = parser.parse(xml) as Record<string, unknown>;

    const items: NewsItem[] = [];

    // RSS 2.0
    const rssChannel = (doc.rss as Record<string, unknown> | undefined)?.channel as
      | Record<string, unknown>
      | undefined;
    if (rssChannel?.item) {
      const rawItems = toArray(rssChannel.item as Record<string, unknown> | Record<string, unknown>[]);
      for (const [idx, raw] of rawItems.slice(0, 16).entries()) {
        const title = stripHtml(extractText(raw.title));
        const link = extractText(raw.link);
        if (!title || !link) continue;

        const rawDesc = extractText(raw["content:encoded"]) || extractText(raw.description);
        const snippet = stripHtml(rawDesc).slice(0, 220);
        const publishedAt = parseDate(raw.pubDate || raw["dc:date"]);
        const { imageUrl, imageFallbackUrl } = extractImageFromItem(raw, rawDesc, link);

        items.push({
          id: makeItemId(source.id, link, title, idx),
          title,
          link,
          snippet: snippet.length === 220 ? `${snippet}…` : snippet,
          source: source.name,
          sourceId: source.id,
          category: source.category,
          language: source.language,
          publishedAt,
          imageUrl,
          imageFallbackUrl,
        });
      }
      feedCache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, items });
      return items.slice(0, maxItems);
    }

    // Atom
    const atomFeed = doc.feed as Record<string, unknown> | undefined;
    if (atomFeed?.entry) {
      const rawEntries = toArray(atomFeed.entry as Record<string, unknown> | Record<string, unknown>[]);
      for (const [idx, raw] of rawEntries.slice(0, 16).entries()) {
        const title = stripHtml(extractText(raw.title));
        const link = extractAtomLink(raw.link);
        if (!title || !link) continue;

        const rawDesc = extractText(raw.content) || extractText(raw.summary);
        const snippet = stripHtml(rawDesc).slice(0, 220);
        const publishedAt = parseDate(raw.published || raw.updated);
        const { imageUrl, imageFallbackUrl } = extractImageFromItem(raw, rawDesc, link);

        items.push({
          id: makeItemId(source.id, link, title, idx),
          title,
          link,
          snippet: snippet.length === 220 ? `${snippet}…` : snippet,
          source: source.name,
          sourceId: source.id,
          category: source.category,
          language: source.language,
          publishedAt,
          imageUrl,
          imageFallbackUrl,
        });
      }
      feedCache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, items });
      return items.slice(0, maxItems);
    }

    return [];
  } catch {
    return [];
  }
}

export async function fetchGoogleTrends(url: string, limit = 15): Promise<TrendTopic[]> {
  if (trendsCache && trendsCache.expiresAt > Date.now()) {
    return trendsCache.trends.slice(0, limit);
  }

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; DailyPulse/1.0)",
        Accept: "application/rss+xml, application/xml, text/xml",
      },
      signal: AbortSignal.timeout(9000),
      cache: "no-store",
    });

    if (!res.ok) return [];
    const xml = await res.text();
    const doc = parser.parse(xml) as Record<string, unknown>;
    const channel = (doc.rss as Record<string, unknown> | undefined)?.channel as
      | Record<string, unknown>
      | undefined;

    if (!channel?.item) return [];

    const rawItems = toArray(channel.item as Record<string, unknown> | Record<string, unknown>[]);
    const trends = rawItems.slice(0, limit).map((raw, idx) => {
      const title = stripHtml(extractText(raw.title));
      const traffic = extractText(raw["ht:approx_traffic"]) || "Tendencia";
      const link = extractText(raw.link);
      const picture = extractText(raw["ht:picture"]) || undefined;
      const publishedAt = parseDate(raw.pubDate);

      const rawNewsItems = toArray(
        raw["ht:news_item"] as Record<string, unknown> | Record<string, unknown>[]
      );
      const relatedNews: TrendRelatedNews[] = rawNewsItems
        .map((n) => ({
          title: stripHtml(extractText(n["ht:news_item_title"])),
          url: extractText(n["ht:news_item_url"]),
          source: stripHtml(extractText(n["ht:news_item_source"])),
          picture: extractText(n["ht:news_item_picture"]) || undefined,
        }))
        .filter((n) => Boolean(n.title && n.url));

      const trendHash = crypto
        .createHash("sha1")
        .update(`trend|${idx}|${title}|${link}`)
        .digest("hex")
        .slice(0, 12);

      return {
        id: `trend-${idx}-${trendHash}`,
        title,
        traffic,
        link,
        picture,
        publishedAt,
        relatedNews,
        source: "google" as const,
      };
    });

    if (trends.length > 0) {
      trendsCache = { expiresAt: Date.now() + CACHE_TTL_MS, trends };
    }
    return trends;
  } catch {
    return [];
  }
}

function makeXTrendItem(
  title: string,
  traffic: string,
  idx: number,
  nowIso: string
): TrendTopic {
  const hash = crypto
    .createHash("sha1")
    .update(`x-trend|${idx}|${title}`)
    .digest("hex")
    .slice(0, 12);

  return {
    id: `x-trend-${idx}-${hash}`,
    title,
    traffic: traffic || "Tendencia en X",
    link: `https://x.com/search?q=${encodeURIComponent(title)}`,
    publishedAt: nowIso,
    relatedNews: [],
    source: "x",
  };
}

/** Fetches current X (Twitter) trending topics for Spain with multi-source fallbacks. */
export async function fetchXTrendsSpain(limit = 15): Promise<TrendTopic[]> {
  if (xTrendsCache && xTrendsCache.expiresAt > Date.now()) {
    return xTrendsCache.trends.slice(0, limit);
  }

  const nowIso = new Date().toISOString();
  const browserHeaders = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
  };

  // 1. Primary: trends24.in Spain
  try {
    const res = await fetch("https://trends24.in/spain/", {
      headers: browserHeaders,
      signal: AbortSignal.timeout(7500),
      cache: "no-store",
    });
    if (res.ok) {
      const html = await res.text();
      const listMatch = html.match(
        /<ol[^>]*class="[^"]*trend-card__list[^"]*"[^>]*>([\s\S]*?)<\/ol>/i
      );
      if (listMatch?.[1]) {
        const liMatches = listMatch[1].match(/<li[^>]*>[\s\S]*?<\/li>/gi) ?? [];
        const seen = new Set<string>();
        const parsed: TrendTopic[] = [];
        for (const li of liMatches) {
          const linkMatch = li.match(/<a[^>]*>([\s\S]*?)<\/a>/i);
          const rawTitle = linkMatch?.[1] ? stripHtml(linkMatch[1]) : "";
          if (!rawTitle || seen.has(rawTitle.toLowerCase())) continue;
          seen.add(rawTitle.toLowerCase());

          const countMatch = li.match(
            /<span[^>]*class="[^"]*(?:tweet-count|count)[^"]*"[^>]*>([\s\S]*?)<\/span>/i
          );
          const rawCount = countMatch?.[1] ? stripHtml(countMatch[1]) : "";
          const traffic = rawCount
            ? `${rawCount}${/post|tweet/i.test(rawCount) ? "" : " posts"}`
            : "Tendencia en X";

          parsed.push(makeXTrendItem(rawTitle, traffic, parsed.length, nowIso));
          if (parsed.length >= limit) break;
        }
        if (parsed.length > 0) {
          xTrendsCache = { expiresAt: Date.now() + CACHE_TTL_MS, trends: parsed };
          return parsed;
        }
      }
    }
  } catch {
    // Fall through to secondary source
  }

  // 2. Secondary fallback: getdaytrends.com Spain
  for (const gdUrl of [
    "https://getdaytrends.com/es/spain/",
    "https://getdaytrends.com/spain/",
  ]) {
    try {
      const res = await fetch(gdUrl, {
        headers: browserHeaders,
        signal: AbortSignal.timeout(7500),
        cache: "no-store",
      });
      if (!res.ok) continue;
      const html = await res.text();
      const rowRegex =
        /<td[^>]*class="[^"]*main[^"]*"[^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>[\s\S]*?(?:<span[^>]*>([\s\S]*?)<\/span>)?/gi;
      const seen = new Set<string>();
      const parsed: TrendTopic[] = [];
      let match: RegExpExecArray | null;
      while ((match = rowRegex.exec(html)) !== null) {
        const rawTitle = stripHtml(match[1]);
        if (!rawTitle || seen.has(rawTitle.toLowerCase())) continue;
        seen.add(rawTitle.toLowerCase());
        const countText = match[2] ? stripHtml(match[2]) : "";
        const traffic = countText || "Tendencia en X";
        parsed.push(makeXTrendItem(rawTitle, traffic, parsed.length, nowIso));
        if (parsed.length >= limit) break;
      }
      if (parsed.length > 0) {
        xTrendsCache = { expiresAt: Date.now() + CACHE_TTL_MS, trends: parsed };
        return parsed;
      }
    } catch {
      // Try next URL or fallback
    }
  }

  // 3. Tertiary fallback: Google News viral/social España RSS
  try {
    const res = await fetch(
      "https://news.google.com/rss/search?q=tendencia+OR+viral+OR+redes+sociales+Espa%C3%B1a&hl=es&gl=ES&ceid=ES:es",
      {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; DailyPulse/1.0)",
          Accept: "application/rss+xml, application/xml, text/xml",
        },
        signal: AbortSignal.timeout(6500),
        cache: "no-store",
      }
    );
    if (res.ok) {
      const xml = await res.text();
      const doc = parser.parse(xml) as Record<string, unknown>;
      const channel = (doc.rss as Record<string, unknown> | undefined)?.channel as
        | Record<string, unknown>
        | undefined;
      const rawItems = toArray(
        channel?.item as Record<string, unknown> | Record<string, unknown>[]
      );
      const parsed: TrendTopic[] = [];
      for (const raw of rawItems.slice(0, limit)) {
        const fullTitle = stripHtml(extractText(raw.title)).replace(/\s+-\s+[^-]+$/, "");
        if (!fullTitle) continue;
        const shortTopic =
          fullTitle.length > 48 ? `${fullTitle.slice(0, 45).trim()}…` : fullTitle;
        parsed.push(
          makeXTrendItem(shortTopic, "Viral en redes", parsed.length, parseDate(raw.pubDate))
        );
      }
      if (parsed.length > 0) {
        xTrendsCache = { expiresAt: Date.now() + CACHE_TTL_MS, trends: parsed };
        return parsed;
      }
    }
  } catch {
    // Ignore errors
  }

  return [];
}

export function deduplicateAndSortNews(items: NewsItem[]): NewsItem[] {
  const seenIds = new Set<string>();
  const seenLinks = new Set<string>();
  const seenTitles = new Set<string>();
  const unique: NewsItem[] = [];

  const sorted = [...items].sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
  );

  for (const item of sorted) {
    const normalized = item.title
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9 ]/g, "")
      .slice(0, 55);

    if (
      seenIds.has(item.id) ||
      seenLinks.has(item.link) ||
      (normalized && seenTitles.has(normalized))
    ) {
      continue;
    }
    seenIds.add(item.id);
    seenLinks.add(item.link);
    if (normalized) seenTitles.add(normalized);
    unique.push(item);
  }

  return unique;
}
