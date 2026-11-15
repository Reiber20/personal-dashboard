"use client";

import {
  Calendar as CalendarIcon,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Link2,
  LogIn,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarEvent, YouTubeUserProfile } from "@/types/news";

const LOCAL_EVENTS_KEY = "hola_rober_calendar_events_v1";
const ICAL_URLS_KEY = "hola_rober_gcal_ics_v1";

type EventColor = NonNullable<CalendarEvent["color"]>;

const COLOR_STYLES: Record<EventColor, string> = {
  indigo:
    "border-indigo-200 bg-indigo-50/90 text-indigo-800 dark:border-indigo-400/30 dark:bg-indigo-500/15 dark:text-indigo-200",
  sky: "border-sky-200 bg-sky-50/90 text-sky-800 dark:border-sky-400/30 dark:bg-sky-500/15 dark:text-sky-200",
  emerald:
    "border-emerald-200 bg-emerald-50/90 text-emerald-800 dark:border-emerald-400/30 dark:bg-emerald-500/15 dark:text-emerald-200",
  amber:
    "border-amber-200 bg-amber-50/90 text-amber-800 dark:border-amber-400/30 dark:bg-amber-500/15 dark:text-amber-200",
  rose: "border-rose-200 bg-rose-50/90 text-rose-800 dark:border-rose-400/30 dark:bg-rose-500/15 dark:text-rose-200",
};

const COLOR_DOTS: Record<EventColor, string> = {
  indigo: "bg-indigo-500",
  sky: "bg-sky-500",
  emerald: "bg-emerald-500",
  amber: "bg-amber-500",
  rose: "bg-rose-500",
};

function formatLocalYmd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getWeekDays(weekOffset: number): Date[] {
  const now = new Date();
  const dayOfWeek = (now.getDay() + 6) % 7; // Monday = 0 ... Sunday = 6
  const monday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() - dayOfWeek + weekOffset * 7
  );
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

function formatEventTime(ev: CalendarEvent): string {
  if (ev.allDay || ev.start.length <= 10) return "Todo el día";
  const parsed = new Date(ev.start);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toLocaleTimeString("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function WeeklyCalendarWidget() {
  const [weekOffset, setWeekOffset] = useState(0);
  const [remoteEvents, setRemoteEvents] = useState<CalendarEvent[]>([]);
  const [localEvents, setLocalEvents] = useState<CalendarEvent[]>([]);
  const [icsUrls, setIcsUrls] = useState<string[]>([]);

  const [authenticated, setAuthenticated] = useState(false);
  const [hasOAuthConfig, setHasOAuthConfig] = useState(false);
  const [calendarScopeGranted, setCalendarScopeGranted] = useState(false);
  const [user, setUser] = useState<YouTubeUserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [hydrated, setHydrated] = useState(false);

  // Panels
  const [showAddForm, setShowAddForm] = useState(false);
  const [showConnectPanel, setShowConnectPanel] = useState(false);
  const [calMessage, setCalMessage] = useState("");

  // Add event fields
  const [newTitle, setNewTitle] = useState("");
  const [newDate, setNewDate] = useState(() => formatLocalYmd(new Date()));
  const [newTime, setNewTime] = useState("");
  const [newColor, setNewColor] = useState<EventColor>("indigo");
  const [savingEvent, setSavingEvent] = useState(false);

  // iCal & OAuth config fields
  const [icsInput, setIcsInput] = useState("");
  const [clientIdInput, setClientIdInput] = useState("");
  const [clientSecretInput, setClientSecretInput] = useState("");
  const [savingOAuth, setSavingOAuth] = useState(false);

  const weekDays = useMemo(() => getWeekDays(weekOffset), [weekOffset]);
  const todayYmd = useMemo(() => formatLocalYmd(new Date()), []);

  useEffect(() => {
    try {
      const savedLocal = localStorage.getItem(LOCAL_EVENTS_KEY);
      if (savedLocal) {
        const parsed = JSON.parse(savedLocal) as CalendarEvent[];
        if (Array.isArray(parsed)) setLocalEvents(parsed);
      }
      const savedIcs = localStorage.getItem(ICAL_URLS_KEY);
      if (savedIcs) {
        const parsed = JSON.parse(savedIcs) as string[];
        if (Array.isArray(parsed)) setIcsUrls(parsed);
      }

      const url = new URL(window.location.href);
      const calErr = url.searchParams.get("cal_error");
      if (calErr === "missing_oauth_config") {
        setShowConnectPanel(true);
        url.searchParams.delete("cal_error");
        window.history.replaceState({}, "", url.pathname + url.search);
      } else if (url.searchParams.has("cal_sync")) {
        url.searchParams.delete("cal_sync");
        window.history.replaceState({}, "", url.pathname + url.search);
      }
    } catch {}
    setHydrated(true);
  }, []);

  const fetchWeekEvents = useCallback(
    async (urls: string[], days: Date[]) => {
      setLoading(true);
      try {
        const start = new Date(days[0]);
        start.setHours(0, 0, 0, 0);
        const end = new Date(days[6]);
        end.setHours(23, 59, 59, 999);

        const res = await fetch("/api/calendar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          body: JSON.stringify({
            action: "fetch_week",
            timeMin: start.toISOString(),
            timeMax: end.toISOString(),
            icsUrls: urls,
          }),
        });

        if (res.ok) {
          const data = (await res.json()) as {
            authenticated: boolean;
            hasOAuthConfig: boolean;
            calendarScopeGranted: boolean;
            user: YouTubeUserProfile | null;
            events: CalendarEvent[];
          };
          setAuthenticated(Boolean(data.authenticated));
          setHasOAuthConfig(Boolean(data.hasOAuthConfig));
          setCalendarScopeGranted(Boolean(data.calendarScopeGranted));
          setUser(data.user || null);
          setRemoteEvents(Array.isArray(data.events) ? data.events : []);
        }
      } catch {
        // Offline or transient error
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    if (!hydrated) return;
    fetchWeekEvents(icsUrls, weekDays);
  }, [hydrated, icsUrls, weekDays, fetchWeekEvents]);

  const persistLocalEvents = (next: CalendarEvent[]) => {
    setLocalEvents(next);
    try {
      localStorage.setItem(LOCAL_EVENTS_KEY, JSON.stringify(next));
    } catch {}
  };

  const persistIcsUrls = (next: string[]) => {
    setIcsUrls(next);
    try {
      localStorage.setItem(ICAL_URLS_KEY, JSON.stringify(next));
    } catch {}
  };

  const handleAddEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    const title = newTitle.trim();
    if (!title || !newDate) return;

    setSavingEvent(true);
    setCalMessage("");

    const startValue = newTime
      ? new Date(`${newDate}T${newTime}:00`).toISOString()
      : newDate;

    // If Google Calendar OAuth with write permission is connected, create in Google Calendar too
    if (authenticated && calendarScopeGranted) {
      try {
        const res = await fetch("/api/calendar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "create_google_event",
            event: {
              title,
              date: newDate,
              startTime: newTime || undefined,
            },
          }),
        });
        if (res.ok) {
          setNewTitle("");
          setNewTime("");
          setShowAddForm(false);
          await fetchWeekEvents(icsUrls, weekDays);
          setSavingEvent(false);
          return;
        }
      } catch {
        // Fallback to local save below
      }
    }

    const created: CalendarEvent = {
      id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      title,
      start: startValue,
      allDay: !newTime,
      color: newColor,
      source: "local",
    };

    persistLocalEvents([...localEvents, created]);
    setNewTitle("");
    setNewTime("");
    setShowAddForm(false);
    setSavingEvent(false);
  };

  const handleDeleteLocalEvent = (id: string) => {
    persistLocalEvents(localEvents.filter((ev) => ev.id !== id));
  };

  const handleAddIcs = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = icsInput.trim();
    if (!clean) return;
    if (!/^(https?|webcal):\/\//i.test(clean)) {
      setCalMessage("Introduce una URL válida que empiece por https:// o webcal://");
      return;
    }
    if (!icsUrls.includes(clean)) {
      persistIcsUrls([...icsUrls, clean]);
    }
    setIcsInput("");
    setCalMessage("");
  };

  const handleSaveOAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setCalMessage("");
    setSavingOAuth(true);
    try {
      const res = await fetch("/api/youtube", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save_oauth_config",
          clientId: clientIdInput,
          clientSecret: clientSecretInput,
        }),
      });
      if (res.ok) {
        window.location.href = "/api/youtube/auth?returnTo=hoy";
      } else {
        const data = (await res.json()) as { error?: string };
        setCalMessage(data.error || "Credenciales OAuth inválidas.");
      }
    } catch {
      setCalMessage("Error al guardar credenciales de Google.");
    } finally {
      setSavingOAuth(false);
    }
  };

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const d of weekDays) {
      map.set(formatLocalYmd(d), []);
    }

    const combined = [...remoteEvents, ...localEvents];
    for (const ev of combined) {
      const ymd =
        ev.allDay || ev.start.length <= 10
          ? ev.start.slice(0, 10)
          : formatLocalYmd(new Date(ev.start));

      if (map.has(ymd)) {
        map.get(ymd)!.push(ev);
      }
    }

    for (const [k, list] of map.entries()) {
      list.sort((a, b) => {
        if (a.allDay && !b.allDay) return -1;
        if (!a.allDay && b.allDay) return 1;
        return new Date(a.start).getTime() - new Date(b.start).getTime();
      });
      map.set(k, list);
    }

    return map;
  }, [weekDays, remoteEvents, localEvents]);

  const weekRangeLabel = useMemo(() => {
    const first = weekDays[0];
    const last = weekDays[6];
    const fmt = (d: Date) =>
      d.toLocaleDateString("es-ES", { day: "numeric", month: "short" });
    return `${fmt(first)} – ${fmt(last)}`;
  }, [weekDays]);

  const callbackOrigin =
    typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";

  const needsCalendarReauth = authenticated && !calendarScopeGranted;

  return (
    <section className="flex h-auto flex-col rounded-2xl border border-slate-200/90 bg-white p-4 shadow-xs md:h-auto md:max-h-none md:overflow-visible dark:border-slate-700/70 dark:bg-slate-800/85">
      {/* Header */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-500/12 text-indigo-600 dark:bg-sky-500/15 dark:text-sky-300">
            <CalendarIcon className="h-4.5 w-4.5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Calendario de la semana
              </h2>
              {authenticated && calendarScopeGranted ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-300">
                  <CheckCircle2 className="h-3 w-3" />
                  Google {user?.name ? `· ${user.name.split(" ")[0]}` : "conectado"}
                </span>
              ) : icsUrls.length > 0 ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-sky-500/15 px-2 py-0.5 text-[10px] font-semibold text-sky-600 dark:text-sky-300">
                  <CheckCircle2 className="h-3 w-3" />
                  iCal sincronizado
                </span>
              ) : null}
            </div>
            <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
              {weekRangeLabel}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <div className="flex items-center rounded-full border border-slate-200 bg-slate-50 p-0.5 dark:border-slate-700 dark:bg-slate-900/60">
            <button
              type="button"
              onClick={() => setWeekOffset((w) => w - 1)}
              className="rounded-full p-1 text-slate-500 hover:bg-white hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-100"
              aria-label="Semana anterior"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setWeekOffset(0)}
              className="px-2 text-[11px] font-semibold text-slate-600 hover:text-indigo-600 dark:text-slate-300 dark:hover:text-sky-300"
            >
              Hoy
            </button>
            <button
              type="button"
              onClick={() => setWeekOffset((w) => w + 1)}
              className="rounded-full p-1 text-slate-500 hover:bg-white hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-100"
              aria-label="Semana siguiente"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>

          <button
            type="button"
            onClick={() => fetchWeekEvents(icsUrls, weekDays)}
            className="rounded-full border border-slate-200 bg-white p-1.5 text-slate-500 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-300 dark:hover:bg-slate-700"
            title="Sincronizar eventos"
            aria-label="Sincronizar eventos"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>

          <button
            type="button"
            onClick={() => setShowConnectPanel((v) => !v)}
            className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${
              needsCalendarReauth
                ? "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/15 dark:text-amber-300"
                : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-200 dark:hover:bg-slate-700"
            }`}
          >
            <Link2 className="h-3 w-3" />
            <span>{needsCalendarReauth ? "Autorizar Calendar" : "Google Calendar"}</span>
          </button>

          <button
            type="button"
            onClick={() => setShowAddForm((v) => !v)}
            className="inline-flex items-center gap-1 rounded-full bg-indigo-600 px-2.5 py-1 text-[11px] font-semibold text-white transition hover:bg-indigo-500 dark:bg-sky-600 dark:hover:bg-sky-500"
          >
            <Plus className="h-3 w-3" />
            <span>Evento</span>
          </button>
        </div>
      </div>

      {/* Google Calendar / iCal Connection Panel */}
      {showConnectPanel && (
        <div className="mb-3 space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900/70">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200">
                Conectar con Google Calendar
              </h3>
              <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                Sincroniza tu calendario con sesión permanente de Google OAuth o mediante tu enlace privado iCal (<code>.ics</code>).
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowConnectPanel(false)}
              className="rounded-lg p-1 text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {hasOAuthConfig ? (
              <a
                href="/api/youtube/auth?returnTo=hoy"
                className="inline-flex items-center gap-1.5 rounded-full bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500 dark:bg-sky-600 dark:hover:bg-sky-500"
              >
                <LogIn className="h-3.5 w-3.5" />
                <span>
                  {authenticated
                    ? "Reautorizar Google (Calendar + YouTube)"
                    : "Conectar cuenta Google"}
                </span>
              </a>
            ) : (
              <form onSubmit={handleSaveOAuth} className="w-full space-y-2">
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Habilita <strong>Google Calendar API</strong> y{" "}
                  <strong>YouTube Data API v3</strong> en{" "}
                  <a
                    href="https://console.cloud.google.com/apis/credentials"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-semibold text-indigo-600 underline dark:text-sky-300"
                  >
                    Google Cloud Console
                  </a>{" "}
                  con redirección <code>{callbackOrigin}/api/youtube/callback</code>:
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  <input
                    type="text"
                    placeholder="GOOGLE_CLIENT_ID"
                    value={clientIdInput}
                    onChange={(e) => setClientIdInput(e.target.value)}
                    className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs outline-none focus:border-sky-400 dark:border-slate-600 dark:bg-slate-800"
                  />
                  <input
                    type="password"
                    placeholder="GOOGLE_CLIENT_SECRET"
                    value={clientSecretInput}
                    onChange={(e) => setClientSecretInput(e.target.value)}
                    className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs outline-none focus:border-sky-400 dark:border-slate-600 dark:bg-slate-800"
                  />
                </div>
                <button
                  type="submit"
                  disabled={savingOAuth}
                  className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500 dark:bg-sky-600"
                >
                  {savingOAuth ? "Guardando..." : "Guardar OAuth y conectar Google"}
                </button>
              </form>
            )}
          </div>

          <form onSubmit={handleAddIcs} className="border-t border-slate-200 pt-2.5 dark:border-slate-700/70">
            <label className="mb-1 block text-[11px] font-semibold text-slate-600 dark:text-slate-300">
              Opción rápida sin API: enlace iCal (.ics) de Google Calendar
            </label>
            <div className="flex flex-wrap gap-2">
              <input
                type="url"
                value={icsInput}
                onChange={(e) => setIcsInput(e.target.value)}
                placeholder="https://calendar.google.com/calendar/ical/.../basic.ics"
                className="min-w-[200px] flex-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs outline-none focus:border-sky-400 dark:border-slate-600 dark:bg-slate-800"
              />
              <button
                type="submit"
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
              >
                Añadir .ics
              </button>
            </div>
            {icsUrls.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {icsUrls.map((u, i) => (
                  <span
                    key={`${u}-${i}`}
                    className="inline-flex items-center gap-1 rounded-full bg-slate-200/80 px-2 py-0.5 text-[10px] text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                  >
                    <span className="max-w-[180px] truncate">{u}</span>
                    <button
                      type="button"
                      onClick={() =>
                        persistIcsUrls(icsUrls.filter((_, idx) => idx !== i))
                      }
                      className="text-slate-400 hover:text-rose-500"
                      aria-label="Quitar calendario"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </form>

          {calMessage && <p className="text-xs text-rose-500">{calMessage}</p>}
        </div>
      )}

      {/* Inline Add Event Form */}
      {showAddForm && (
        <form
          onSubmit={handleAddEvent}
          className="mb-3 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900/70"
        >
          <div className="grid gap-2 sm:grid-cols-12">
            <input
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Título del evento..."
              required
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs outline-none focus:border-sky-400 sm:col-span-5 dark:border-slate-600 dark:bg-slate-800"
            />
            <input
              type="date"
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
              required
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs outline-none focus:border-sky-400 sm:col-span-4 dark:border-slate-600 dark:bg-slate-800"
            />
            <input
              type="time"
              value={newTime}
              onChange={(e) => setNewTime(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs outline-none focus:border-sky-400 sm:col-span-3 dark:border-slate-600 dark:bg-slate-800"
            />
          </div>
          <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                Color:
              </span>
              {(Object.keys(COLOR_DOTS) as EventColor[]).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setNewColor(c)}
                  className={`h-4 w-4 rounded-full ${COLOR_DOTS[c]} transition ${
                    newColor === c
                      ? "ring-2 ring-slate-900 ring-offset-1 dark:ring-white dark:ring-offset-slate-900"
                      : "opacity-60 hover:opacity-100"
                  }`}
                  aria-label={`Color ${c}`}
                />
              ))}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="rounded-lg px-2.5 py-1 text-xs font-medium text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={savingEvent}
                className="rounded-lg bg-indigo-600 px-3 py-1 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-60 dark:bg-sky-600 dark:hover:bg-sky-500"
              >
                {savingEvent ? "Guardando..." : "Guardar evento"}
              </button>
            </div>
          </div>
        </form>
      )}

      {/* 7-Day Weekly Grid */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:h-auto md:max-h-none md:grid-cols-4 md:overflow-visible xl:grid-cols-7">
        {weekDays.map((day) => {
          const ymd = formatLocalYmd(day);
          const isToday = ymd === todayYmd;
          const weekdayLabel = day
            .toLocaleDateString("es-ES", { weekday: "short" })
            .replace(".", "");
          const dayNum = day.getDate();
          const dayEvents = eventsByDay.get(ymd) ?? [];

          return (
            <div
              key={ymd}
              className={`flex min-h-[120px] min-w-0 flex-col rounded-xl border p-2 transition md:h-auto md:max-h-none md:overflow-visible ${
                isToday
                  ? "border-indigo-300 bg-indigo-50/45 dark:border-sky-500/50 dark:bg-sky-500/10"
                  : "border-slate-200/80 bg-slate-50/60 dark:border-slate-700/60 dark:bg-slate-900/45"
              }`}
            >
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400">
                    {weekdayLabel}
                  </span>
                  <span
                    className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold ${
                      isToday
                        ? "bg-indigo-600 text-white dark:bg-sky-500 dark:text-slate-950"
                        : "text-slate-700 dark:text-slate-200"
                    }`}
                  >
                    {dayNum}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setNewDate(ymd);
                    setShowAddForm(true);
                  }}
                  className="rounded p-0.5 text-slate-400 transition hover:bg-slate-200 hover:text-slate-700 dark:hover:bg-slate-700 dark:hover:text-slate-200"
                  title={`Añadir evento el ${dayNum}`}
                  aria-label={`Añadir evento el ${dayNum}`}
                >
                  <Plus className="h-3 w-3" />
                </button>
              </div>

              <div className="space-y-1.5 md:h-auto md:max-h-none md:overflow-visible">
                {dayEvents.length === 0 ? (
                  <p className="py-3 text-center text-[10px] text-slate-400 dark:text-slate-500">
                    Sin eventos
                  </p>
                ) : (
                  dayEvents.map((ev) => {
                    const colorClass = COLOR_STYLES[ev.color || "sky"];
                    const timeText = formatEventTime(ev);
                    return (
                      <div
                        key={ev.id}
                        className={`group rounded-lg border px-1.5 py-1 text-[11px] ${colorClass}`}
                      >
                        <div className="flex items-start justify-between gap-1">
                          <div className="min-w-0 flex-1">
                            {timeText && (
                              <span className="block text-[9px] font-bold opacity-80">
                                {timeText}
                              </span>
                            )}
                            {ev.htmlLink ? (
                              <a
                                href={ev.htmlLink}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="block font-semibold whitespace-normal break-words leading-snug hover:underline"
                              >
                                <span className="whitespace-normal break-words">
                                  {ev.title}
                                </span>
                                <ExternalLink className="ml-1 inline-block h-2.5 w-2.5 shrink-0 align-baseline opacity-70" />
                              </a>
                            ) : (
                              <p className="font-semibold whitespace-normal break-words leading-snug">
                                {ev.title}
                              </p>
                            )}
                          </div>
                          {ev.source === "local" && (
                            <button
                              type="button"
                              onClick={() => handleDeleteLocalEvent(ev.id)}
                              className="opacity-60 hover:text-rose-600 hover:opacity-100"
                              title="Eliminar evento"
                              aria-label={`Eliminar ${ev.title}`}
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
