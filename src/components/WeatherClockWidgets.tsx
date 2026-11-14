"use client";

import {
  Droplets,
  LocateFixed,
  MapPin,
  Search,
  Wind,
  X,
} from "lucide-react";
import { useCallback, useEffect, useId, useState } from "react";
import { CitySearchResult, WeatherData, WeatherIconKind } from "@/types/news";

const WEATHER_STORAGE_KEY = "hola_rober_weather_loc_v1";

interface SavedLocation {
  lat: number;
  lon: number;
  name?: string;
  isGps?: boolean;
}

function WeatherGlyph({
  kind,
  className = "h-6 w-6",
}: {
  kind: WeatherIconKind;
  className?: string;
}) {
  const uid = useId().replace(/:/g, "");

  switch (kind) {
    case "sun":
      return (
        <svg
          viewBox="0 0 32 32"
          fill="none"
          aria-hidden="true"
          className={className}
        >
          <defs>
            <radialGradient id={`sun-${uid}`} cx="40%" cy="35%" r="65%">
              <stop offset="0%" stopColor="#FEF08A" />
              <stop offset="55%" stopColor="#FBBF24" />
              <stop offset="100%" stopColor="#F59E0B" />
            </radialGradient>
          </defs>
          <circle cx="16" cy="16" r="10" fill="#FDE047" opacity="0.22" />
          <g stroke="#F59E0B" strokeWidth="2.4" strokeLinecap="round">
            <line x1="16" y1="2.5" x2="16" y2="5.5" />
            <line x1="16" y1="26.5" x2="16" y2="29.5" />
            <line x1="2.5" y1="16" x2="5.5" y2="16" />
            <line x1="26.5" y1="16" x2="29.5" y2="16" />
            <line x1="6.45" y1="6.45" x2="8.6" y2="8.6" />
            <line x1="23.4" y1="23.4" x2="25.55" y2="25.55" />
            <line x1="25.55" y1="6.45" x2="23.4" y2="8.6" />
            <line x1="8.6" y1="23.4" x2="6.45" y2="25.55" />
          </g>
          <circle
            cx="16"
            cy="16"
            r="7.2"
            fill={`url(#sun-${uid})`}
            stroke="#EA580C"
            strokeOpacity="0.35"
            strokeWidth="0.9"
          />
        </svg>
      );
    case "moon":
      return (
        <svg
          viewBox="0 0 32 32"
          fill="none"
          aria-hidden="true"
          className={className}
        >
          <defs>
            <linearGradient id={`moon-${uid}`} x1="6" y1="5" x2="25" y2="26" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#C7D2FE" />
              <stop offset="50%" stopColor="#818CF8" />
              <stop offset="100%" stopColor="#4F46E5" />
            </linearGradient>
          </defs>
          <path
            d="M20.8 23.8A9.8 9.8 0 0 1 11.4 7.6a.6.6 0 0 0-.7-.85 10.6 10.6 0 1 0 13.7 13.7.6.6 0 0 0-.85-.7c-.88.35-1.8.05-2.75-.05Z"
            fill={`url(#moon-${uid})`}
            stroke="#4338CA"
            strokeOpacity="0.45"
            strokeWidth="0.9"
          />
          <path
            d="M23.5 5.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8.8-2Z"
            fill="#FACC15"
          />
          <circle cx="26.5" cy="13.5" r="1.15" fill="#FDE047" />
        </svg>
      );
    case "cloud-sun":
      return (
        <svg
          viewBox="0 0 32 32"
          fill="none"
          aria-hidden="true"
          className={className}
        >
          <defs>
            <radialGradient id={`csun-${uid}`} cx="40%" cy="35%" r="65%">
              <stop offset="0%" stopColor="#FEF08A" />
              <stop offset="100%" stopColor="#F59E0B" />
            </radialGradient>
            <linearGradient id={`ccloud-${uid}`} x1="6" y1="13" x2="22" y2="26" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#FFFFFF" />
              <stop offset="100%" stopColor="#CBD5E1" />
            </linearGradient>
          </defs>
          <g stroke="#F59E0B" strokeWidth="1.9" strokeLinecap="round">
            <line x1="21" y1="3.5" x2="21" y2="5.4" />
            <line x1="28.5" y1="11" x2="26.6" y2="11" />
            <line x1="26.3" y1="5.7" x2="25" y2="7" />
            <line x1="15.7" y1="5.7" x2="17" y2="7" />
            <line x1="26.3" y1="16.3" x2="25" y2="15" />
          </g>
          <circle cx="21" cy="11" r="5" fill={`url(#csun-${uid})`} />
          <path
            d="M9.5 25.5h12.2a4.6 4.6 0 0 0 .5-9.17 6.3 6.3 0 0 0-12.1-1.38A5.2 5.2 0 0 0 9.5 25.5Z"
            fill={`url(#ccloud-${uid})`}
            stroke="#94A3B8"
            strokeWidth="1.1"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "cloud":
      return (
        <svg
          viewBox="0 0 32 32"
          fill="none"
          aria-hidden="true"
          className={className}
        >
          <defs>
            <linearGradient id={`cld-${uid}`} x1="7" y1="10" x2="23" y2="26" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#F1F5F9" />
              <stop offset="100%" stopColor="#94A3B8" />
            </linearGradient>
          </defs>
          <path
            d="M14.5 18.5h10.2a3.8 3.8 0 0 0 .4-7.58 5 5 0 0 0-9.6-1.08 4.2 4.2 0 0 0-1 8.66Z"
            fill="#64748B"
            opacity="0.65"
          />
          <path
            d="M8 25.5h13.5a4.8 4.8 0 0 0 .55-9.57 6.6 6.6 0 0 0-12.7-1.45A5.4 5.4 0 0 0 8 25.5Z"
            fill={`url(#cld-${uid})`}
            stroke="#64748B"
            strokeOpacity="0.6"
            strokeWidth="1.1"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "fog":
      return (
        <svg
          viewBox="0 0 32 32"
          fill="none"
          aria-hidden="true"
          className={className}
        >
          <path
            d="M7.5 17.5h15.2a3.8 3.8 0 0 0 .4-7.58 5.4 5.4 0 0 0-10.35-1.18A4.4 4.4 0 0 0 7.5 17.5Z"
            fill="#CBD5E1"
            stroke="#64748B"
            strokeOpacity="0.55"
            strokeWidth="1"
          />
          <g strokeLinecap="round" strokeWidth="2.3">
            <line x1="5.5" y1="21" x2="24.5" y2="21" stroke="#94A3B8" />
            <line x1="8.5" y1="25" x2="26.5" y2="25" stroke="#64748B" />
            <line x1="6.5" y1="29" x2="21.5" y2="29" stroke="#CBD5E1" />
          </g>
        </svg>
      );
    case "rain":
      return (
        <svg
          viewBox="0 0 32 32"
          fill="none"
          aria-hidden="true"
          className={className}
        >
          <defs>
            <linearGradient id={`rcld-${uid}`} x1="7" y1="6" x2="24" y2="20" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#94A3B8" />
              <stop offset="100%" stopColor="#475569" />
            </linearGradient>
          </defs>
          <path
            d="M8.5 19.5h14.2a4.3 4.3 0 0 0 .5-8.57 6 6 0 0 0-11.55-1.3A4.9 4.9 0 0 0 8.5 19.5Z"
            fill={`url(#rcld-${uid})`}
            stroke="#334155"
            strokeOpacity="0.45"
            strokeWidth="1"
          />
          <g strokeLinecap="round" strokeWidth="2.4">
            <line x1="10.5" y1="22.5" x2="8.8" y2="27.2" stroke="#0EA5E9" />
            <line x1="16" y1="23.2" x2="14.3" y2="28.6" stroke="#38BDF8" />
            <line x1="21.5" y1="22.5" x2="19.8" y2="27.2" stroke="#0284C7" />
          </g>
        </svg>
      );
    case "storm":
      return (
        <svg
          viewBox="0 0 32 32"
          fill="none"
          aria-hidden="true"
          className={className}
        >
          <defs>
            <linearGradient id={`scld-${uid}`} x1="7" y1="5" x2="24" y2="19" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#64748B" />
              <stop offset="100%" stopColor="#334155" />
            </linearGradient>
          </defs>
          <path
            d="M8.2 19h14.6a4.2 4.2 0 0 0 .5-8.37 5.9 5.9 0 0 0-11.4-1.26A4.8 4.8 0 0 0 8.2 19Z"
            fill={`url(#scld-${uid})`}
            stroke="#1E293B"
            strokeOpacity="0.5"
            strokeWidth="1"
          />
          <path
            d="M17.2 16.5l-4.5 6.8h3.7l-1.8 6.4 6.7-8.1h-3.9l2-5.1h-2.2Z"
            fill="#FACC15"
            stroke="#CA8A04"
            strokeWidth="0.9"
            strokeLinejoin="round"
          />
          <line
            x1="9.5"
            y1="22"
            x2="8"
            y2="25.8"
            stroke="#38BDF8"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <line
            x1="23.2"
            y1="22"
            x2="21.7"
            y2="25.8"
            stroke="#38BDF8"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      );
    case "snow":
      return (
        <svg
          viewBox="0 0 32 32"
          fill="none"
          aria-hidden="true"
          className={className}
        >
          <defs>
            <linearGradient id={`ncld-${uid}`} x1="7" y1="6" x2="23" y2="19" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#E0F2FE" />
              <stop offset="100%" stopColor="#93C5FD" />
            </linearGradient>
          </defs>
          <path
            d="M8.5 19.2h14.2a4.3 4.3 0 0 0 .5-8.57 6 6 0 0 0-11.55-1.3A4.9 4.9 0 0 0 8.5 19.2Z"
            fill={`url(#ncld-${uid})`}
            stroke="#60A5FA"
            strokeOpacity="0.65"
            strokeWidth="1"
          />
          <g stroke="#38BDF8" strokeWidth="1.7" strokeLinecap="round">
            <path d="M10.5 22.8v4.4M8.6 23.9l3.8 2.2M12.4 23.9l-3.8 2.2" />
            <path d="M16 24.4v4.4M14.1 25.5l3.8 2.2M17.9 25.5l-3.8 2.2" stroke="#0EA5E9" />
            <path d="M21.5 22.8v4.4M19.6 23.9l3.8 2.2M23.4 23.9l-3.8 2.2" />
          </g>
        </svg>
      );
  }
}

function formatDayShort(dateStr: string): { weekday: string; dayNum: string } {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  const weekday = new Intl.DateTimeFormat("es-ES", { weekday: "short" })
    .format(dt)
    .replace(".", "");
  return {
    weekday: weekday.charAt(0).toUpperCase() + weekday.slice(1),
    dayNum: String(d),
  };
}

export function WeatherClockWidgets() {
  const [now, setNow] = useState<Date | null>(null);
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loadingWeather, setLoadingWeather] = useState(true);
  const [locating, setLocating] = useState(false);

  const [cityPickerOpen, setCityPickerOpen] = useState(false);
  const [cityQuery, setCityQuery] = useState("");
  const [cityResults, setCityResults] = useState<CitySearchResult[]>([]);
  const [searchingCities, setSearchingCities] = useState(false);

  // Live clock tick
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const loadWeather = useCallback(async (loc?: SavedLocation) => {
    setLoadingWeather(true);
    try {
      const params = new URLSearchParams();
      if (loc) {
        params.set("lat", String(loc.lat));
        params.set("lon", String(loc.lon));
        if (loc.name) params.set("name", loc.name);
      }
      const res = await fetch(`/api/weather?${params.toString()}`);
      if (res.ok) {
        const data = (await res.json()) as WeatherData;
        setWeather(data);
      }
    } catch {
      // Keep previous weather on network failure
    } finally {
      setLoadingWeather(false);
    }
  }, []);

  const requestGpsLocation = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      loadWeather();
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const loc: SavedLocation = {
          lat: Number(pos.coords.latitude.toFixed(4)),
          lon: Number(pos.coords.longitude.toFixed(4)),
          isGps: true,
        };
        try {
          localStorage.setItem(WEATHER_STORAGE_KEY, JSON.stringify(loc));
        } catch {}
        setLocating(false);
        loadWeather(loc);
      },
      () => {
        setLocating(false);
        loadWeather();
      },
      { enableHighAccuracy: false, timeout: 6000, maximumAge: 600000 }
    );
  }, [loadWeather]);

  // On mount: load saved location or try automatic GPS (falling back to Madrid)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(WEATHER_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as SavedLocation;
        loadWeather(parsed);
        return;
      }
    } catch {}
    requestGpsLocation();
  }, [loadWeather, requestGpsLocation]);

  // City search debounce
  useEffect(() => {
    if (!cityPickerOpen) return;
    const trimmed = cityQuery.trim();
    if (trimmed.length < 2) {
      setCityResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSearchingCities(true);
      try {
        const res = await fetch(
          `/api/weather?q=${encodeURIComponent(trimmed)}`
        );
        if (res.ok) {
          const data = (await res.json()) as { results?: CitySearchResult[] };
          setCityResults(data.results || []);
        }
      } catch {
        setCityResults([]);
      } finally {
        setSearchingCities(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [cityQuery, cityPickerOpen]);

  const selectCity = (city: CitySearchResult) => {
    const loc: SavedLocation = {
      lat: city.latitude,
      lon: city.longitude,
      name: city.name,
      isGps: false,
    };
    try {
      localStorage.setItem(WEATHER_STORAGE_KEY, JSON.stringify(loc));
    } catch {}
    setCityPickerOpen(false);
    setCityQuery("");
    setCityResults([]);
    loadWeather(loc);
  };

  const hoursMinutes = now
    ? now.toLocaleTimeString("es-ES", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "--:--";
  const seconds = now
    ? String(now.getSeconds()).padStart(2, "0")
    : "--";
  const dateLabel = now
    ? new Intl.DateTimeFormat("es-ES", {
        weekday: "short",
        day: "numeric",
        month: "short",
      })
        .format(now)
        .replace(/\./g, "")
    : "";

  return (
    <section className="mb-4 grid grid-cols-1 gap-2 lg:grid-cols-12">
      {/* Widget 1: Hora actual y clima del día (compacto) */}
      <div className="relative overflow-hidden rounded-xl border border-slate-200/90 bg-gradient-to-r from-indigo-600 via-indigo-700 to-sky-600 px-3 py-2 text-white shadow-xs lg:col-span-5 dark:border-slate-700/80 dark:from-slate-800 dark:via-[#1e293b] dark:to-sky-900/90">
        <div className="flex flex-wrap items-center justify-between gap-2">
          {/* Hora + Fecha */}
          <div className="flex items-center gap-2.5">
            <div className="flex items-baseline font-mono leading-none tracking-tight">
              <span className="text-lg font-black sm:text-xl">
                {hoursMinutes}
              </span>
              <span className="text-[11px] font-semibold text-indigo-100/80">
                :{seconds}
              </span>
            </div>
            <span className="text-[11px] font-medium capitalize text-indigo-100/90">
              {dateLabel}
            </span>
          </div>

          {/* Botones GPS y Ciudad */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={requestGpsLocation}
              className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-semibold text-white transition hover:bg-white/25"
              title="Usar mi ubicación GPS"
            >
              <LocateFixed
                className={`h-2.5 w-2.5 ${locating ? "animate-spin" : ""}`}
              />
              <span>GPS</span>
            </button>
            <button
              type="button"
              onClick={() => setCityPickerOpen((v) => !v)}
              className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-semibold text-white transition hover:bg-white/25"
              title="Cambiar ciudad"
            >
              <MapPin className="h-2.5 w-2.5" />
              <span className="max-w-[95px] truncate">
                {weather?.locationName || "Madrid"}
              </span>
            </button>
          </div>
        </div>

        {/* Clima de hoy en una línea compacta */}
        {loadingWeather && !weather ? (
          <div className="mt-1.5 h-6 animate-pulse rounded-lg bg-white/15" />
        ) : weather ? (
          <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 border-t border-white/15 pt-1.5 text-[11px]">
            <div className="flex items-center gap-2">
              <WeatherGlyph
                kind={weather.current.icon}
                className="h-7 w-7 shrink-0"
              />
              <span className="text-base font-extrabold leading-none">
                {weather.current.temperature}°
              </span>
              <span className="font-medium text-indigo-100">
                {weather.current.label}
              </span>
            </div>

            <div className="flex items-center gap-2.5 text-indigo-100/95">
              <span>
                {weather.current.tempMaxToday}°/{weather.current.tempMinToday}°
              </span>
              <span
                className="inline-flex items-center gap-0.5"
                title="Probabilidad de lluvia hoy"
              >
                <Droplets className="h-3 w-3 text-sky-200" />
                {weather.current.precipProbToday}%
              </span>
              <span
                className="inline-flex items-center gap-0.5"
                title="Viento actual"
              >
                <Wind className="h-3 w-3 text-indigo-200" />
                {weather.current.windSpeed} km/h
              </span>
            </div>
          </div>
        ) : null}

        {/* City Picker Overlay */}
        {cityPickerOpen && (
          <div className="mt-2 rounded-xl bg-white p-2.5 text-slate-900 shadow-lg dark:border dark:border-slate-700/70 dark:bg-slate-800 dark:text-slate-100">
            <div className="flex items-center justify-between gap-2">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  autoFocus
                  value={cityQuery}
                  onChange={(e) => setCityQuery(e.target.value)}
                  placeholder="Buscar ciudad (ej. Sevilla, Bilbao...)"
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 py-1 pr-2 pl-8 text-xs outline-none focus:border-indigo-500 dark:border-slate-600 dark:bg-slate-900/70 dark:focus:border-sky-400"
                />
              </div>
              <button
                type="button"
                onClick={() => setCityPickerOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"
                aria-label="Cerrar buscador de ciudad"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            {searchingCities && (
              <p className="mt-1.5 text-xs text-slate-400">Buscando...</p>
            )}

            {cityResults.length > 0 && (
              <ul className="mt-1.5 max-h-36 space-y-0.5 overflow-y-auto">
                {cityResults.map((c, idx) => (
                  <li key={`${c.id}-${c.latitude}-${c.longitude}-${idx}`}>
                    <button
                      type="button"
                      onClick={() => selectCity(c)}
                      className="flex w-full items-center justify-between rounded-lg px-2 py-1 text-left text-xs hover:bg-indigo-50 dark:hover:bg-slate-700/70"
                    >
                      <span className="font-semibold">{c.name}</span>
                      <span className="text-[11px] text-slate-400">
                        {[c.admin1, c.country].filter(Boolean).join(", ")}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* Widget 2: Pronóstico próximos 7 días (compacto) */}
      <div className="flex flex-col justify-center rounded-xl border border-slate-200/90 bg-white px-3 py-1.5 shadow-xs lg:col-span-7 dark:border-slate-700/70 dark:bg-slate-800/85">
        {loadingWeather && !weather ? (
          <div className="grid grid-cols-7 gap-1.5">
            {Array.from({ length: 7 }).map((_, idx) => (
              <div
                key={`weather-skel-${idx}`}
                className="h-14 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-700/60"
              />
            ))}
          </div>
        ) : weather ? (
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar sm:grid sm:grid-cols-7 sm:overflow-visible">
            {weather.next7Days.map((day, idx) => {
              const { weekday, dayNum } = formatDayShort(day.date);
              return (
                <div
                  key={`${day.date}-${idx}`}
                  className="flex min-w-[58px] flex-1 flex-col items-center justify-between rounded-lg border border-slate-100 bg-slate-50/80 px-1.5 py-1 text-center dark:border-slate-700/60 dark:bg-slate-900/55"
                  title={`${weekday} ${dayNum}: ${day.label}`}
                >
                  <span className="text-[10px] font-semibold text-slate-700 dark:text-slate-300">
                    {weekday} {dayNum}
                  </span>

                  <WeatherGlyph kind={day.icon} className="my-0.5 h-6 w-6" />

                  <div className="leading-tight">
                    <p className="text-[11px] font-bold text-slate-900 dark:text-slate-100">
                      {day.tempMax}°
                      <span className="font-normal text-slate-400">
                        /{day.tempMin}°
                      </span>
                    </p>
                    <p className="flex items-center justify-center gap-0.5 text-[9px] text-sky-600 dark:text-sky-300">
                      <Droplets className="h-2 w-2" />
                      <span>{day.precipProb}%</span>
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            No se pudo cargar el pronóstico semanal.
          </p>
        )}
      </div>
    </section>
  );
}
