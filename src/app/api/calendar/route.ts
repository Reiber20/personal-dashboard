import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import {
  getOAuthCredentials,
  ONE_YEAR_SECONDS,
  parseCookieJson,
  refreshAccessToken,
  StoredOAuthConfig,
  StoredYouTubeSession,
  YT_OAUTH_CFG_COOKIE,
  YT_SESSION_COOKIE,
} from "@/lib/youtube";
import { CalendarEvent } from "@/types/news";

export const dynamic = "force-dynamic";

function decodeIcsText(val: string): string {
  return val
    .replace(/\\n/gi, " ")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\")
    .trim();
}

function parseIcsDateValue(rawVal: string): {
  iso: string;
  ms: number;
  allDay: boolean;
} | null {
  const val = rawVal.trim();
  // Pure date: YYYYMMDD
  const dateOnly = val.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (dateOnly) {
    const [, y, m, d] = dateOnly;
    const isoDate = `${y}-${m}-${d}`;
    const ms = new Date(`${isoDate}T00:00:00`).getTime();
    return Number.isNaN(ms) ? null : { iso: isoDate, ms, allDay: true };
  }

  // DateTime: YYYYMMDDTHHMMSS(Z?)
  const dtMatch = val.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/i);
  if (dtMatch) {
    const [, y, m, d, hh, mm, ss, z] = dtMatch;
    const base = `${y}-${m}-${d}T${hh}:${mm}:${ss}${z ? "Z" : ""}`;
    const parsed = new Date(base);
    if (Number.isNaN(parsed.getTime())) return null;
    return { iso: parsed.toISOString(), ms: parsed.getTime(), allDay: false };
  }

  const fallback = new Date(val);
  if (Number.isNaN(fallback.getTime())) return null;
  return { iso: fallback.toISOString(), ms: fallback.getTime(), allDay: false };
}

/** Parses VEVENT blocks from an iCalendar (.ics) feed overlapping [timeMinMs, timeMaxMs]. */
function parseIcsEvents(
  icsText: string,
  timeMinMs: number,
  timeMaxMs: number
): CalendarEvent[] {
  const unfolded = icsText.replace(/\r?\n[ \t]/g, "");
  const blocks = unfolded.match(/BEGIN:VEVENT[\s\S]*?END:VEVENT/gi) ?? [];
  const events: CalendarEvent[] = [];

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const lines = block.split(/\r?\n/);

    let uid = `ics-${i}`;
    let summary = "";
    let dtStartRaw = "";
    let dtEndRaw = "";
    let location = "";
    let url = "";

    for (const line of lines) {
      const colonIdx = line.indexOf(":");
      if (colonIdx === -1) continue;
      const keyPart = line.slice(0, colonIdx).toUpperCase();
      const key = keyPart.split(";")[0];
      const val = line.slice(colonIdx + 1);

      if (key === "UID") uid = val.trim();
      else if (key === "SUMMARY") summary = decodeIcsText(val);
      else if (key === "DTSTART") dtStartRaw = val;
      else if (key === "DTEND") dtEndRaw = val;
      else if (key === "LOCATION") location = decodeIcsText(val);
      else if (key === "URL") url = val.trim();
    }

    if (!summary || !dtStartRaw) continue;
    const startParsed = parseIcsDateValue(dtStartRaw);
    if (!startParsed) continue;

    const endParsed = dtEndRaw ? parseIcsDateValue(dtEndRaw) : null;
    const endMs = endParsed ? endParsed.ms - (startParsed.allDay ? 1 : 0) : startParsed.ms;

    if (endMs < timeMinMs || startParsed.ms > timeMaxMs) continue;

    events.push({
      id: `ics-${uid}-${startParsed.iso}`,
      title: summary,
      start: startParsed.iso,
      end: endParsed?.iso,
      allDay: startParsed.allDay,
      location: location || undefined,
      htmlLink: url || undefined,
      color: "emerald",
      source: "ical",
    });
  }

  return events;
}

const GOOGLE_COLOR_MAP: Record<string, CalendarEvent["color"]> = {
  "1": "indigo",
  "2": "emerald",
  "3": "indigo",
  "4": "rose",
  "5": "amber",
  "6": "amber",
  "7": "sky",
  "9": "indigo",
  "10": "emerald",
  "11": "rose",
};

async function fetchGoogleCalendarEvents(
  accessToken: string,
  timeMinIso: string,
  timeMaxIso: string
): Promise<{ events: CalendarEvent[]; scopeGranted: boolean }> {
  try {
    const apiUrl = new URL(
      "https://www.googleapis.com/calendar/v3/calendars/primary/events"
    );
    apiUrl.searchParams.set("timeMin", timeMinIso);
    apiUrl.searchParams.set("timeMax", timeMaxIso);
    apiUrl.searchParams.set("singleEvents", "true");
    apiUrl.searchParams.set("orderBy", "startTime");
    apiUrl.searchParams.set("maxResults", "100");

    const res = await fetch(apiUrl.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
      signal: AbortSignal.timeout(7000),
    });

    if (res.status === 401 || res.status === 403) {
      return { events: [], scopeGranted: false };
    }
    if (!res.ok) {
      return { events: [], scopeGranted: true };
    }

    const data = (await res.json()) as {
      items?: Array<{
        id?: string;
        summary?: string;
        location?: string;
        htmlLink?: string;
        colorId?: string;
        start?: { date?: string; dateTime?: string };
        end?: { date?: string; dateTime?: string };
      }>;
    };

    const events: CalendarEvent[] = (data.items || [])
      .filter((item) => Boolean(item.summary && (item.start?.dateTime || item.start?.date)))
      .map((item, idx) => {
        const allDay = Boolean(item.start?.date && !item.start?.dateTime);
        return {
          id: `gcal-${item.id || idx}`,
          title: item.summary || "Evento",
          start: item.start?.dateTime || item.start?.date || timeMinIso,
          end: item.end?.dateTime || item.end?.date,
          allDay,
          location: item.location,
          htmlLink: item.htmlLink,
          color: (item.colorId && GOOGLE_COLOR_MAP[item.colorId]) || "sky",
          source: "google",
        };
      });

    return { events, scopeGranted: true };
  } catch {
    return { events: [], scopeGranted: true };
  }
}

async function resolveSessionWithRefresh(
  session: StoredYouTubeSession | null,
  creds: StoredOAuthConfig | null
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

  const valid = Boolean(current.refreshToken) || Date.now() < current.expiresAt;
  return {
    authenticated: valid,
    updatedSession: valid ? current : null,
    sessionChanged,
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      action?: "fetch_week" | "create_google_event";
      timeMin?: string;
      timeMax?: string;
      icsUrls?: string[];
      event?: {
        title: string;
        date: string;
        startTime?: string;
        endTime?: string;
      };
    };

    const cookieStore = await cookies();
    const cfgCookie = parseCookieJson<StoredOAuthConfig>(
      cookieStore.get(YT_OAUTH_CFG_COOKIE)?.value
    );
    const sessionCookie = parseCookieJson<StoredYouTubeSession>(
      cookieStore.get(YT_SESSION_COOKIE)?.value
    );
    const creds = getOAuthCredentials(cfgCookie);

    const { authenticated, updatedSession, sessionChanged } =
      await resolveSessionWithRefresh(sessionCookie, creds);

    if (body.action === "create_google_event") {
      if (!authenticated || !updatedSession?.accessToken || !body.event?.title) {
        return NextResponse.json(
          { ok: false, error: "Se requiere sesión de Google Calendar activa." },
          { status: 401 }
        );
      }

      const { title, date, startTime, endTime } = body.event;
      let startObj: { date?: string; dateTime?: string };
      let endObj: { date?: string; dateTime?: string };

      if (startTime) {
        const startDt = new Date(`${date}T${startTime}:00`);
        const endDt = endTime
          ? new Date(`${date}T${endTime}:00`)
          : new Date(startDt.getTime() + 60 * 60 * 1000);
        startObj = { dateTime: startDt.toISOString() };
        endObj = { dateTime: endDt.toISOString() };
      } else {
        const nextDay = new Date(`${date}T12:00:00Z`);
        nextDay.setUTCDate(nextDay.getUTCDate() + 1);
        startObj = { date };
        endObj = { date: nextDay.toISOString().slice(0, 10) };
      }

      const gcalRes = await fetch(
        "https://www.googleapis.com/calendar/v3/calendars/primary/events",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${updatedSession.accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            summary: title,
            start: startObj,
            end: endObj,
          }),
          signal: AbortSignal.timeout(7000),
        }
      );

      if (!gcalRes.ok) {
        return NextResponse.json(
          { ok: false, error: "Google Calendar rechazó la creación del evento." },
          { status: gcalRes.status }
        );
      }

      const created = (await gcalRes.json()) as {
        id?: string;
        summary?: string;
        htmlLink?: string;
        start?: { date?: string; dateTime?: string };
        end?: { date?: string; dateTime?: string };
      };

      const createdEvent: CalendarEvent = {
        id: `gcal-${created.id || Date.now()}`,
        title: created.summary || title,
        start: created.start?.dateTime || created.start?.date || date,
        end: created.end?.dateTime || created.end?.date,
        allDay: !startTime,
        htmlLink: created.htmlLink,
        color: "sky",
        source: "google",
      };

      const res = NextResponse.json({ ok: true, createdEvent });
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

    // Default: fetch_week
    const now = new Date();
    const defaultMin = new Date(now);
    defaultMin.setDate(now.getDate() - 7);
    const defaultMax = new Date(now);
    defaultMax.setDate(now.getDate() + 7);

    const timeMinIso = body.timeMin || defaultMin.toISOString();
    const timeMaxIso = body.timeMax || defaultMax.toISOString();
    const timeMinMs = new Date(timeMinIso).getTime();
    const timeMaxMs = new Date(timeMaxIso).getTime();

    const googlePromise =
      authenticated && updatedSession?.accessToken
        ? fetchGoogleCalendarEvents(updatedSession.accessToken, timeMinIso, timeMaxIso)
        : Promise.resolve({ events: [] as CalendarEvent[], scopeGranted: false });

    const icsUrls = Array.isArray(body.icsUrls)
      ? body.icsUrls
          .map((u) => u.trim().replace(/^webcal:\/\//i, "https://"))
          .filter((u) => /^https?:\/\//i.test(u))
          .slice(0, 5)
      : [];

    const icsPromises = icsUrls.map(async (icsUrl) => {
      try {
        const res = await fetch(icsUrl, {
          headers: { "User-Agent": "HolaRoberDashboard/1.0" },
          cache: "no-store",
          signal: AbortSignal.timeout(7000),
        });
        if (!res.ok) return [] as CalendarEvent[];
        const text = await res.text();
        return parseIcsEvents(text, timeMinMs, timeMaxMs);
      } catch {
        return [] as CalendarEvent[];
      }
    });

    const [googleResult, ...icsResults] = await Promise.all([
      googlePromise,
      ...icsPromises,
    ]);

    const combined = [...googleResult.events, ...icsResults.flat()];
    const seen = new Set<string>();
    const events = combined
      .filter((ev) => {
        if (seen.has(ev.id)) return false;
        seen.add(ev.id);
        return true;
      })
      .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

    const res = NextResponse.json(
      {
        authenticated,
        hasOAuthConfig: Boolean(creds),
        calendarScopeGranted: googleResult.scopeGranted,
        user: updatedSession?.user || null,
        events,
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
      { error: "Error cargando el calendario." },
      { status: 400 }
    );
  }
}
