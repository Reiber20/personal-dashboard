"use client";

import {
  Bookmark,
  Cloud,
  CloudUpload,
  Home,
  Moon,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Sparkles,
  Sun,
  Video,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CompactHeadlinesWidget } from "@/components/CompactHeadlinesWidget";
import { InstallAppButton } from "@/components/InstallBanner";
import { NewsCard } from "@/components/NewsCard";
import { PersonalProjectsWidget } from "@/components/PersonalProjectsWidget";
import { SettingsModal } from "@/components/SettingsModal";
import { TrendStrip } from "@/components/TrendStrip";
import { WeatherClockWidgets } from "@/components/WeatherClockWidgets";
import { WeeklyCalendarWidget } from "@/components/WeeklyCalendarWidget";
import { YouTubeSection } from "@/components/YouTubeSection";
import { CATEGORIES } from "@/config/sources";
import { CategoryId, NewsItem, NewsSource, TrendTopic } from "@/types/news";

type ActiveTab = CategoryId | "guardados";
type CloudSyncStatus = "idle" | "syncing" | "saving" | "synced" | "error";

const STORAGE_KEYS = {
  saved: "pulso_saved_items_v1",
  disabled: "pulso_disabled_sources_v1",
  custom: "pulso_custom_sources_v1",
  theme: "pulso_theme_v1",
  icsUrls: "hola_rober_gcal_ics_v1",
  calendarEvents: "hola_rober_calendar_events_v1",
  youtubeChannels: "hola_rober_yt_channels_v1",
  projects: "hola_rober_projects_v1",
  weatherLocation: "hola_rober_weather_loc_v1",
} as const;

const SYNCED_STORAGE_KEYS = new Set<string>(Object.values(STORAGE_KEYS));
const CLOUD_SYNC_DEBOUNCE_MS = 800;

interface CloudSyncPayload {
  version?: number;
  updatedAt?: string;
  icsUrls?: string[];
  calendarEvents?: unknown[];
  youtubeChannels?: unknown[];
  projects?: unknown[];
  weatherLocation?: unknown;
  savedItems?: NewsItem[];
  disabledSourceIds?: string[];
  customSources?: NewsSource[];
  theme?: "dark" | "light";
  [key: string]: unknown;
}

interface SyncApiGetResponse {
  synced?: boolean;
  email?: string | null;
  data?: CloudSyncPayload | null;
}

function sanitizeSavedItems(items: unknown): NewsItem[] {
  if (!Array.isArray(items)) return [];
  const seenLinks = new Set<string>();
  const seenIds = new Set<string>();
  const cleaned: NewsItem[] = [];
  for (const rawItem of items) {
    const item = rawItem as NewsItem;
    if (!item?.link || seenLinks.has(item.link)) continue;
    seenLinks.add(item.link);
    let uniqueId = item.id || item.link;
    if (seenIds.has(uniqueId)) {
      uniqueId = `${uniqueId}-${cleaned.length}`;
    }
    seenIds.add(uniqueId);
    cleaned.push({ ...item, id: uniqueId });
  }
  return cleaned;
}

function readJsonFromStorage<T>(key: string): T | undefined {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return undefined;
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}

function parseMaybeJson<T>(value: unknown): T | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch {
      return value as unknown as T;
    }
  }
  return value as T;
}

function pickCloudField(
  cloudData: Record<string, unknown>,
  semanticKey: string,
  storageKey: string
): unknown {
  if (semanticKey in cloudData && cloudData[semanticKey] !== undefined) {
    return cloudData[semanticKey];
  }
  if (storageKey in cloudData && cloudData[storageKey] !== undefined) {
    return cloudData[storageKey];
  }
  return undefined;
}

function collectLocalSyncPayload(): CloudSyncPayload {
  const payload: CloudSyncPayload = {
    version: 1,
    updatedAt: new Date().toISOString(),
  };

  const icsUrls = readJsonFromStorage<string[]>(STORAGE_KEYS.icsUrls);
  if (Array.isArray(icsUrls)) payload.icsUrls = icsUrls;

  const calendarEvents = readJsonFromStorage<unknown[]>(
    STORAGE_KEYS.calendarEvents
  );
  if (Array.isArray(calendarEvents)) payload.calendarEvents = calendarEvents;

  const youtubeChannels = readJsonFromStorage<unknown[]>(
    STORAGE_KEYS.youtubeChannels
  );
  if (Array.isArray(youtubeChannels)) payload.youtubeChannels = youtubeChannels;

  const projects = readJsonFromStorage<unknown[]>(STORAGE_KEYS.projects);
  if (Array.isArray(projects)) payload.projects = projects;

  const weatherLocation = readJsonFromStorage<unknown>(
    STORAGE_KEYS.weatherLocation
  );
  if (weatherLocation !== undefined) payload.weatherLocation = weatherLocation;

  const savedItems = readJsonFromStorage<NewsItem[]>(STORAGE_KEYS.saved);
  if (Array.isArray(savedItems)) {
    payload.savedItems = sanitizeSavedItems(savedItems);
  }

  const disabledSourceIds = readJsonFromStorage<string[]>(
    STORAGE_KEYS.disabled
  );
  if (Array.isArray(disabledSourceIds)) {
    payload.disabledSourceIds = disabledSourceIds;
  }

  const customSources = readJsonFromStorage<NewsSource[]>(STORAGE_KEYS.custom);
  if (Array.isArray(customSources)) payload.customSources = customSources;

  try {
    const savedTheme = window.localStorage.getItem(STORAGE_KEYS.theme);
    if (savedTheme === "dark" || savedTheme === "light") {
      payload.theme = savedTheme;
    }
  } catch {
    // Ignore storage errors
  }

  return payload;
}

function hasMeaningfulLocalData(payload: CloudSyncPayload): boolean {
  if (Array.isArray(payload.icsUrls) && payload.icsUrls.length > 0) return true;
  if (Array.isArray(payload.calendarEvents) && payload.calendarEvents.length > 0) {
    return true;
  }
  if (
    Array.isArray(payload.youtubeChannels) &&
    payload.youtubeChannels.length > 0
  ) {
    return true;
  }
  if (Array.isArray(payload.savedItems) && payload.savedItems.length > 0) {
    return true;
  }
  if (
    Array.isArray(payload.disabledSourceIds) &&
    payload.disabledSourceIds.length > 0
  ) {
    return true;
  }
  if (Array.isArray(payload.customSources) && payload.customSources.length > 0) {
    return true;
  }
  if (payload.weatherLocation !== undefined && payload.weatherLocation !== null) {
    return true;
  }
  if (payload.theme === "dark" || payload.theme === "light") return true;
  if (Array.isArray(payload.projects)) return true;
  return false;
}

export function DashboardClient() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("hoy");
  const [news, setNews] = useState<NewsItem[]>([]);
  const [trends, setTrends] = useState<TrendTopic[]>([]);
  const [loadingNews, setLoadingNews] = useState(true);
  const [loadingTrends, setLoadingTrends] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [darkMode, setDarkMode] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const [savedItems, setSavedItems] = useState<NewsItem[]>([]);
  const [disabledSourceIds, setDisabledSourceIds] = useState<string[]>([]);
  const [customSources, setCustomSources] = useState<NewsSource[]>([]);
  const [hydrated, setHydrated] = useState(false);

  const [syncStatus, setSyncStatus] = useState<CloudSyncStatus>("idle");
  const [syncEmail, setSyncEmail] = useState<string | null>(null);
  const [widgetRevs, setWidgetRevs] = useState({
    weather: 0,
    calendar: 0,
    projects: 0,
    youtube: 0,
  });

  const newsAbortRef = useRef<AbortController | null>(null);
  const requestSeqRef = useRef(0);
  const isSyncAuthedRef = useRef(false);
  const initialSyncDoneRef = useRef(false);
  const isApplyingCloudRef = useRef(false);
  const syncInFlightRef = useRef(false);
  const syncDebounceTimerRef = useRef<number | null>(null);
  const lastPullTimestampRef = useRef(0);

  // Hydrate persisted preferences & theme
  useEffect(() => {
    try {
      const savedRaw = localStorage.getItem(STORAGE_KEYS.saved);
      if (savedRaw) {
        setSavedItems(sanitizeSavedItems(JSON.parse(savedRaw)));
      }

      const disabledRaw = localStorage.getItem(STORAGE_KEYS.disabled);
      if (disabledRaw) setDisabledSourceIds(JSON.parse(disabledRaw));

      const customRaw = localStorage.getItem(STORAGE_KEYS.custom);
      if (customRaw) setCustomSources(JSON.parse(customRaw));

      const savedTheme = localStorage.getItem(STORAGE_KEYS.theme);
      const prefersDark =
        savedTheme !== null
          ? savedTheme === "dark"
          : window.matchMedia("(prefers-color-scheme: dark)").matches;
      setDarkMode(prefersDark);
      document.documentElement.classList.toggle("dark", prefersDark);

      const params = new URLSearchParams(window.location.search);
      if (params.get("tab") === "youtube") {
        setActiveTab("youtube");
      }
    } catch {
      // Ignore storage errors
    } finally {
      setHydrated(true);
    }
  }, []);

  const applyCloudSyncData = useCallback(
    (cloudData: Record<string, unknown>) => {
      if (syncDebounceTimerRef.current !== null) {
        window.clearTimeout(syncDebounceTimerRef.current);
        syncDebounceTimerRef.current = null;
      }

      let weatherChanged = false;
      let calendarChanged = false;
      let projectsChanged = false;
      let youtubeChanged = false;

      const writeIfChanged = (key: string, serialized: string): boolean => {
        if (window.localStorage.getItem(key) === serialized) return false;
        window.localStorage.setItem(key, serialized);
        return true;
      };

      isApplyingCloudRef.current = true;
      try {
        const savedVal = parseMaybeJson<NewsItem[]>(
          pickCloudField(cloudData, "savedItems", STORAGE_KEYS.saved)
        );
        if (Array.isArray(savedVal)) {
          const cleaned = sanitizeSavedItems(savedVal);
          writeIfChanged(STORAGE_KEYS.saved, JSON.stringify(cleaned));
          setSavedItems(cleaned);
        }

        const disabledVal = parseMaybeJson<string[]>(
          pickCloudField(
            cloudData,
            "disabledSourceIds",
            STORAGE_KEYS.disabled
          )
        );
        if (Array.isArray(disabledVal)) {
          writeIfChanged(STORAGE_KEYS.disabled, JSON.stringify(disabledVal));
          setDisabledSourceIds(disabledVal);
        }

        const customVal = parseMaybeJson<NewsSource[]>(
          pickCloudField(cloudData, "customSources", STORAGE_KEYS.custom)
        );
        if (Array.isArray(customVal)) {
          writeIfChanged(STORAGE_KEYS.custom, JSON.stringify(customVal));
          setCustomSources(customVal);
        }

        const themeVal = pickCloudField(
          cloudData,
          "theme",
          STORAGE_KEYS.theme
        );
        if (themeVal === "dark" || themeVal === "light") {
          writeIfChanged(STORAGE_KEYS.theme, themeVal);
          const prefersDark = themeVal === "dark";
          setDarkMode(prefersDark);
          document.documentElement.classList.toggle("dark", prefersDark);
        }

        const icsVal = parseMaybeJson<string[]>(
          pickCloudField(cloudData, "icsUrls", STORAGE_KEYS.icsUrls)
        );
        if (Array.isArray(icsVal)) {
          if (writeIfChanged(STORAGE_KEYS.icsUrls, JSON.stringify(icsVal))) {
            calendarChanged = true;
          }
        }

        const calEventsVal = parseMaybeJson<unknown[]>(
          pickCloudField(
            cloudData,
            "calendarEvents",
            STORAGE_KEYS.calendarEvents
          )
        );
        if (Array.isArray(calEventsVal)) {
          if (
            writeIfChanged(
              STORAGE_KEYS.calendarEvents,
              JSON.stringify(calEventsVal)
            )
          ) {
            calendarChanged = true;
          }
        }

        const ytVal = parseMaybeJson<unknown[]>(
          pickCloudField(
            cloudData,
            "youtubeChannels",
            STORAGE_KEYS.youtubeChannels
          )
        );
        if (Array.isArray(ytVal)) {
          if (
            writeIfChanged(STORAGE_KEYS.youtubeChannels, JSON.stringify(ytVal))
          ) {
            youtubeChanged = true;
          }
        }

        const projectsVal = parseMaybeJson<unknown[]>(
          pickCloudField(cloudData, "projects", STORAGE_KEYS.projects)
        );
        if (Array.isArray(projectsVal)) {
          if (
            writeIfChanged(STORAGE_KEYS.projects, JSON.stringify(projectsVal))
          ) {
            projectsChanged = true;
          }
        }

        const weatherVal = parseMaybeJson<unknown>(
          pickCloudField(
            cloudData,
            "weatherLocation",
            STORAGE_KEYS.weatherLocation
          )
        );
        if (weatherVal !== undefined) {
          if (weatherVal === null) {
            if (
              window.localStorage.getItem(STORAGE_KEYS.weatherLocation) !== null
            ) {
              window.localStorage.removeItem(STORAGE_KEYS.weatherLocation);
              weatherChanged = true;
            }
          } else if (
            writeIfChanged(
              STORAGE_KEYS.weatherLocation,
              JSON.stringify(weatherVal)
            )
          ) {
            weatherChanged = true;
          }
        }
      } catch {
        // Ignore storage errors while applying cloud sync
      } finally {
        isApplyingCloudRef.current = false;
      }

      if (
        weatherChanged ||
        calendarChanged ||
        projectsChanged ||
        youtubeChanged
      ) {
        setWidgetRevs((prev) => ({
          weather: prev.weather + (weatherChanged ? 1 : 0),
          calendar: prev.calendar + (calendarChanged ? 1 : 0),
          projects: prev.projects + (projectsChanged ? 1 : 0),
          youtube: prev.youtube + (youtubeChanged ? 1 : 0),
        }));
      }
    },
    []
  );

  const pushToCloudNow = useCallback(
    async (payloadOverride?: CloudSyncPayload, keepalive = false) => {
      if (!isSyncAuthedRef.current) return;
      const payload = payloadOverride ?? collectLocalSyncPayload();
      if (!keepalive) setSyncStatus("saving");
      try {
        const res = await fetch("/api/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          keepalive,
          body: JSON.stringify({ data: payload }),
        });
        if (res.status === 401) {
          isSyncAuthedRef.current = false;
          setSyncEmail(null);
          setSyncStatus("idle");
          return;
        }
        if (res.ok) {
          setSyncStatus("synced");
        } else {
          setSyncStatus("error");
        }
      } catch {
        if (!keepalive) setSyncStatus("error");
      }
    },
    []
  );

  const scheduleCloudPush = useCallback(() => {
    if (
      !isSyncAuthedRef.current ||
      !initialSyncDoneRef.current ||
      isApplyingCloudRef.current
    ) {
      return;
    }

    if (syncDebounceTimerRef.current !== null) {
      window.clearTimeout(syncDebounceTimerRef.current);
    }

    setSyncStatus("saving");
    syncDebounceTimerRef.current = window.setTimeout(() => {
      syncDebounceTimerRef.current = null;
      void pushToCloudNow();
    }, CLOUD_SYNC_DEBOUNCE_MS);
  }, [pushToCloudNow]);

  const syncFromCloud = useCallback(
    async (force = false) => {
      if (syncInFlightRef.current) return;
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        return;
      }
      if (!force && syncDebounceTimerRef.current !== null) return;

      const now = Date.now();
      if (!force && now - lastPullTimestampRef.current < 4000) return;
      lastPullTimestampRef.current = now;

      syncInFlightRef.current = true;
      if (!initialSyncDoneRef.current) {
        setSyncStatus("syncing");
      }

      try {
        const res = await fetch("/api/sync", { cache: "no-store" });
        if (!res.ok) {
          if (res.status === 401) {
            isSyncAuthedRef.current = false;
            setSyncEmail(null);
            setSyncStatus("idle");
            initialSyncDoneRef.current = true;
          } else if (isSyncAuthedRef.current) {
            setSyncStatus("error");
          }
          return;
        }

        const result = (await res.json()) as SyncApiGetResponse;
        const authenticated = Boolean(result?.email || result?.synced);
        isSyncAuthedRef.current = authenticated;
        setSyncEmail(result?.email ?? null);

        if (!authenticated) {
          setSyncStatus("idle");
          initialSyncDoneRef.current = true;
          return;
        }

        const cloudData = result.data;
        const hasCloudData =
          cloudData !== null &&
          cloudData !== undefined &&
          typeof cloudData === "object" &&
          Object.keys(cloudData).length > 0;

        if (hasCloudData) {
          applyCloudSyncData(cloudData as Record<string, unknown>);
          setSyncStatus("synced");
        } else {
          const localPayload = collectLocalSyncPayload();
          if (hasMeaningfulLocalData(localPayload)) {
            await pushToCloudNow(localPayload);
          } else {
            setSyncStatus("synced");
          }
        }

        initialSyncDoneRef.current = true;
      } catch {
        if (isSyncAuthedRef.current) {
          setSyncStatus("error");
        }
      } finally {
        syncInFlightRef.current = false;
      }
    },
    [applyCloudSyncData, pushToCloudNow]
  );

  // 1) Initial load & re-sync when returning to the tab/PWA
  useEffect(() => {
    if (!hydrated) return;
    void syncFromCloud(true);

    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === "visible") {
        void syncFromCloud(false);
      } else if (
        document.visibilityState === "hidden" &&
        syncDebounceTimerRef.current !== null
      ) {
        window.clearTimeout(syncDebounceTimerRef.current);
        syncDebounceTimerRef.current = null;
        void pushToCloudNow(undefined, true);
      }
    };

    const handlePageHide = () => {
      if (syncDebounceTimerRef.current !== null) {
        window.clearTimeout(syncDebounceTimerRef.current);
        syncDebounceTimerRef.current = null;
        void pushToCloudNow(undefined, true);
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityOrFocus);
    window.addEventListener("focus", handleVisibilityOrFocus);
    window.addEventListener("pagehide", handlePageHide);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityOrFocus);
      window.removeEventListener("focus", handleVisibilityOrFocus);
      window.removeEventListener("pagehide", handlePageHide);
    };
  }, [hydrated, syncFromCloud, pushToCloudNow]);

  // 2) Watch localStorage updates from DashboardClient & all child widgets (800ms debounce)
  useEffect(() => {
    let proto: Storage | null = null;
    let originalSetItem: Storage["setItem"] | null = null;
    let originalRemoveItem: Storage["removeItem"] | null = null;

    try {
      proto = Storage.prototype;
      const originalGetItem = proto.getItem;
      originalSetItem = proto.setItem;
      originalRemoveItem = proto.removeItem;

      proto.setItem = function (key: string, value: string) {
        const prevValue =
          this === window.localStorage
            ? originalGetItem.call(this, key)
            : null;
        originalSetItem!.call(this, key, value);
        if (
          this === window.localStorage &&
          SYNCED_STORAGE_KEYS.has(key) &&
          prevValue !== value &&
          !isApplyingCloudRef.current
        ) {
          scheduleCloudPush();
        }
      };

      proto.removeItem = function (key: string) {
        const prevValue =
          this === window.localStorage
            ? originalGetItem.call(this, key)
            : null;
        originalRemoveItem!.call(this, key);
        if (
          this === window.localStorage &&
          SYNCED_STORAGE_KEYS.has(key) &&
          prevValue !== null &&
          !isApplyingCloudRef.current
        ) {
          scheduleCloudPush();
        }
      };
    } catch {
      proto = null;
    }

    return () => {
      try {
        if (proto && originalSetItem) proto.setItem = originalSetItem;
        if (proto && originalRemoveItem) proto.removeItem = originalRemoveItem;
      } catch {}
      if (syncDebounceTimerRef.current !== null) {
        window.clearTimeout(syncDebounceTimerRef.current);
        syncDebounceTimerRef.current = null;
      }
    };
  }, [scheduleCloudPush]);

  const toggleTheme = () => {
    const next = !darkMode;
    setDarkMode(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem(STORAGE_KEYS.theme, next ? "dark" : "light");
    } catch {}
  };

  const fetchTrends = useCallback(async () => {
    setLoadingTrends(true);
    try {
      const res = await fetch("/api/trends");
      if (res.ok) {
        const data = (await res.json()) as { trends?: TrendTopic[] };
        setTrends(data.trends || []);
      }
    } catch {
      // Offline or transient error
    } finally {
      setLoadingTrends(false);
    }
  }, []);

  const fetchNews = useCallback(
    async (category: CategoryId) => {
      newsAbortRef.current?.abort();
      const controller = new AbortController();
      newsAbortRef.current = controller;
      const seq = ++requestSeqRef.current;

      setLoadingNews(true);
      try {
        let res: Response;
        if (customSources.length > 0 || disabledSourceIds.length > 0) {
          res = await fetch("/api/news", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            cache: "no-store",
            signal: controller.signal,
            body: JSON.stringify({
              category,
              disabledIds: disabledSourceIds,
              customSources,
            }),
          });
        } else {
          res = await fetch(`/api/news?category=${encodeURIComponent(category)}`, {
            cache: "no-store",
            signal: controller.signal,
          });
        }

        if (seq !== requestSeqRef.current) return;

        if (res.ok) {
          const data = (await res.json()) as {
            items?: NewsItem[];
            updatedAt?: string;
          };
          if (seq !== requestSeqRef.current) return;
          setNews(data.items || []);
          if (data.updatedAt) setUpdatedAt(data.updatedAt);
        }
      } catch (err) {
        if ((err as Error)?.name === "AbortError") return;
        // Offline or transient error
      } finally {
        if (seq === requestSeqRef.current) {
          setLoadingNews(false);
        }
      }
    },
    [customSources, disabledSourceIds]
  );

  const handleSelectTab = (tab: ActiveTab) => {
    if (tab === activeTab) return;
    setActiveTab(tab);
    if (tab !== "guardados" && tab !== "youtube") {
      setLoadingNews(true);
      setNews([]);
    } else {
      newsAbortRef.current?.abort();
      setLoadingNews(false);
    }
  };

  useEffect(() => {
    if (!hydrated) return;
    fetchTrends();
  }, [hydrated, fetchTrends]);

  useEffect(() => {
    if (!hydrated || activeTab === "guardados" || activeTab === "youtube") return;
    fetchNews(activeTab);
    return () => {
      newsAbortRef.current?.abort();
    };
  }, [hydrated, activeTab, fetchNews]);

  const toggleSaveItem = (item: NewsItem) => {
    setSavedItems((prev) => {
      const exists = prev.some((s) => s.link === item.link);
      const next = exists
        ? prev.filter((s) => s.link !== item.link)
        : [item, ...prev];
      try {
        localStorage.setItem(STORAGE_KEYS.saved, JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  const toggleSource = (sourceId: string) => {
    setDisabledSourceIds((prev) => {
      const next = prev.includes(sourceId)
        ? prev.filter((id) => id !== sourceId)
        : [...prev, sourceId];
      try {
        localStorage.setItem(STORAGE_KEYS.disabled, JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  const addCustomSource = (source: NewsSource) => {
    setCustomSources((prev) => {
      const next = [source, ...prev];
      try {
        localStorage.setItem(STORAGE_KEYS.custom, JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  const removeCustomSource = (sourceId: string) => {
    setCustomSources((prev) => {
      const next = prev.filter((s) => s.id !== sourceId);
      try {
        localStorage.setItem(STORAGE_KEYS.custom, JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  const savedLinks = useMemo(
    () => new Set(savedItems.map((i) => i.link)),
    [savedItems]
  );

  const displayedItems = useMemo(() => {
    const rawBase = activeTab === "guardados" ? savedItems : news;
    const categoryFiltered =
      activeTab !== "hoy" && activeTab !== "guardados"
        ? rawBase.filter((item) => item.category === activeTab)
        : rawBase;

    const seenLinks = new Set<string>();
    const base = categoryFiltered.filter((item) => {
      if (seenLinks.has(item.link)) return false;
      seenLinks.add(item.link);
      return true;
    });

    const q = searchQuery.trim().toLowerCase();
    if (!q) return base;
    return base.filter(
      (item) =>
        item.title.toLowerCase().includes(q) ||
        item.source.toLowerCase().includes(q) ||
        item.snippet.toLowerCase().includes(q)
    );
  }, [activeTab, savedItems, news, searchQuery]);

  const todayFormatted = useMemo(() => {
    const raw = new Intl.DateTimeFormat("es-ES", {
      weekday: "long",
      day: "numeric",
      month: "long",
    }).format(new Date());
    return raw.charAt(0).toUpperCase() + raw.slice(1);
  }, []);

  const handleRefresh = () => {
    fetchTrends();
    if (activeTab !== "guardados" && activeTab !== "youtube") {
      fetchNews(activeTab);
    }
  };

  return (
    <div className="min-h-screen pb-24 md:pb-10">
      {/* Sticky Top Header */}
      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-slate-50/85 backdrop-blur-md dark:border-slate-700/70 dark:bg-slate-900/85">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-sky-500 text-xs font-black text-white shadow-sm">
                HR
              </span>
              <h1 className="truncate text-lg font-extrabold tracking-tight">
                Hola Rober
              </h1>
            </div>
            <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
              {todayFormatted}
              {updatedAt &&
                ` · Act. ${new Date(updatedAt).toLocaleTimeString("es-ES", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}`}
            </p>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2">
            {syncStatus !== "idle" && (
              <button
                type="button"
                onClick={() => void syncFromCloud(true)}
                title={
                  syncStatus === "saving"
                    ? "Guardando cambios en la nube..."
                    : syncStatus === "syncing"
                      ? "Sincronizando desde la nube..."
                      : syncStatus === "error"
                        ? "Error al sincronizar. Pulsa para reintentar"
                        : `Sincronizado en la nube${syncEmail ? ` (${syncEmail})` : ""}`
                }
                aria-label="Estado de sincronización en la nube"
                className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-medium transition active:scale-95 ${
                  syncStatus === "error"
                    ? "border-rose-200 bg-rose-50 text-rose-600 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300"
                    : syncStatus === "saving" || syncStatus === "syncing"
                      ? "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/15 dark:text-sky-300"
                      : "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300"
                }`}
              >
                {syncStatus === "saving" || syncStatus === "syncing" ? (
                  <CloudUpload className="h-3.5 w-3.5 animate-pulse" />
                ) : (
                  <Cloud className="h-3.5 w-3.5" />
                )}
                <span className="hidden sm:inline">
                  {syncStatus === "saving"
                    ? "Guardando..."
                    : syncStatus === "syncing"
                      ? "Sync..."
                      : syncStatus === "error"
                        ? "Reintentar"
                        : "Sync"}
                </span>
              </button>
            )}

            <InstallAppButton />

            <button
              type="button"
              onClick={handleRefresh}
              className="rounded-full border border-slate-200 bg-white p-2 text-slate-600 transition hover:bg-slate-100 active:scale-95 dark:border-slate-700/70 dark:bg-slate-800/90 dark:text-slate-200 dark:hover:bg-slate-700"
              title="Actualizar noticias"
              aria-label="Actualizar noticias"
            >
              <RefreshCw
                className={`h-4 w-4 ${loadingNews ? "animate-spin text-sky-400" : ""}`}
              />
            </button>

            <button
              type="button"
              onClick={toggleTheme}
              className="rounded-full border border-slate-200 bg-white p-2 text-slate-600 transition hover:bg-slate-100 active:scale-95 dark:border-slate-700/70 dark:bg-slate-800/90 dark:text-slate-200 dark:hover:bg-slate-700"
              title={darkMode ? "Modo claro" : "Modo oscuro"}
              aria-label="Cambiar tema"
            >
              {darkMode ? (
                <Sun className="h-4 w-4 text-amber-300" />
              ) : (
                <Moon className="h-4 w-4" />
              )}
            </button>

            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              className="hidden rounded-full border border-slate-200 bg-white p-2 text-slate-600 transition hover:bg-slate-100 sm:inline-flex dark:border-slate-700/70 dark:bg-slate-800/90 dark:text-slate-200 dark:hover:bg-slate-700"
              title="Configurar fuentes"
              aria-label="Configurar fuentes"
            >
              <SlidersHorizontal className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Search + Category Pills */}
        <div className="mx-auto max-w-6xl space-y-2.5 px-4 pb-3">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filtrar titulares, medios o temas..."
              className="w-full rounded-xl border border-slate-200 bg-white py-2 pr-3 pl-9 text-sm outline-none transition focus:border-indigo-500 dark:border-slate-700/70 dark:bg-slate-800/85 dark:text-slate-100 dark:placeholder:text-slate-400 dark:focus:border-sky-400"
            />
          </div>

          <nav className="flex items-center gap-2 overflow-x-auto pb-0.5 no-scrollbar">
            {CATEGORIES.map((cat) => {
              const active = activeTab === cat.id;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => handleSelectTab(cat.id)}
                  className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold transition active:scale-95 ${
                    active
                      ? "bg-slate-900 text-white dark:border dark:border-sky-400/40 dark:bg-sky-500/20 dark:text-sky-200"
                      : "border border-slate-200 bg-white text-slate-600 hover:border-slate-300 dark:border-slate-700/70 dark:bg-slate-800/85 dark:text-slate-300 dark:hover:border-slate-600"
                  }`}
                >
                  {cat.shortLabel}
                </button>
              );
            })}

            <button
              type="button"
              onClick={() => handleSelectTab("guardados")}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition active:scale-95 ${
                activeTab === "guardados"
                  ? "bg-indigo-600 text-white dark:bg-sky-600"
                  : "border border-slate-200 bg-white text-slate-600 hover:border-slate-300 dark:border-slate-700/70 dark:bg-slate-800/85 dark:text-slate-300 dark:hover:border-slate-600"
              }`}
            >
              <Bookmark className="h-3.5 w-3.5" />
              <span>Guardados ({savedItems.length})</span>
            </button>
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-6xl px-4 pt-5">
        {activeTab === "hoy" ? (
          <>
            <WeatherClockWidgets key={`weather-${widgetRevs.weather}`} />
            <TrendStrip trends={trends} loading={loadingTrends} />

            <div className="mb-5 grid grid-cols-1 items-start gap-5 lg:grid-cols-12">
              <div className="h-auto overflow-visible lg:col-span-7">
                <WeeklyCalendarWidget key={`cal-${widgetRevs.calendar}`} />
              </div>
              <div className="h-auto overflow-visible lg:col-span-5">
                <PersonalProjectsWidget key={`proj-${widgetRevs.projects}`} />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
              <div className="lg:col-span-7">
                <YouTubeSection
                  key={`yt-compact-${widgetRevs.youtube}`}
                  searchQuery={searchQuery}
                  compact
                  onOpenFullTab={() => handleSelectTab("youtube")}
                />
              </div>
              <div className="lg:col-span-5">
                <CompactHeadlinesWidget
                  items={displayedItems}
                  loading={loadingNews}
                  savedLinks={savedLinks}
                  onToggleSave={toggleSaveItem}
                  onSelectCategory={(cat) => handleSelectTab(cat)}
                />
              </div>
            </div>
          </>
        ) : activeTab === "youtube" ? (
          <YouTubeSection
            key={`yt-full-${widgetRevs.youtube}`}
            searchQuery={searchQuery}
          />
        ) : (
          <>
            <div className="mb-4 flex items-baseline justify-between">
              <h2 className="text-base font-bold tracking-tight sm:text-lg">
                {activeTab === "guardados"
                  ? "Noticias guardadas"
                  : CATEGORIES.find((c) => c.id === activeTab)?.label}
              </h2>
              {activeTab !== "guardados" && !loadingNews && (
                <span className="text-xs text-slate-400 dark:text-slate-400">
                  {displayedItems.length} titulares
                </span>
              )}
            </div>

            {activeTab !== "guardados" && loadingNews ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 6 }).map((_, idx) => (
                  <div
                    key={idx}
                    className={`animate-pulse rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700/70 dark:bg-slate-800/85 ${
                      idx === 0 ? "h-64 sm:col-span-2" : "h-64"
                    }`}
                  >
                    <div className="h-32 rounded-xl bg-slate-200 dark:bg-slate-700/60" />
                    <div className="mt-4 h-4 w-3/4 rounded bg-slate-200 dark:bg-slate-700/60" />
                    <div className="mt-2 h-3 w-1/2 rounded bg-slate-200 dark:bg-slate-700/60" />
                  </div>
                ))}
              </div>
            ) : displayedItems.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center dark:border-slate-700/70 dark:bg-slate-800/75">
                <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
                  {activeTab === "guardados"
                    ? "Aún no tienes noticias guardadas. Pulsa el icono de marcador en cualquier noticia para leerla más tarde."
                    : "No se encontraron noticias para este filtro o tus fuentes están desactivadas."}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {displayedItems.map((item, idx) => (
                  <NewsCard
                    key={`${item.sourceId}-${item.link}-${idx}`}
                    item={item}
                    featured={idx === 0 && activeTab !== "guardados" && !searchQuery}
                    isSaved={savedLinks.has(item.link)}
                    onToggleSave={toggleSaveItem}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </main>

      {/* Mobile Bottom Navigation */}
      <nav className="fixed right-0 bottom-0 left-0 z-30 border-t border-slate-200 bg-white/95 px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur-md md:hidden dark:border-slate-700/70 dark:bg-slate-900/95">
        <div className="grid grid-cols-5 gap-1 text-[11px] font-medium">
          <button
            type="button"
            onClick={() => handleSelectTab("hoy")}
            className={`flex flex-col items-center gap-0.5 rounded-xl py-1 ${
              activeTab === "hoy"
                ? "text-indigo-600 dark:text-sky-300"
                : "text-slate-500 dark:text-slate-400"
            }`}
          >
            <Home className="h-5 w-5" />
            <span>Hoy</span>
          </button>

          <button
            type="button"
            onClick={() => handleSelectTab("youtube")}
            className={`flex flex-col items-center gap-0.5 rounded-xl py-1 ${
              activeTab === "youtube"
                ? "text-rose-600 dark:text-rose-400"
                : "text-slate-500 dark:text-slate-400"
            }`}
          >
            <Video className="h-5 w-5" />
            <span>YouTube</span>
          </button>

          <button
            type="button"
            onClick={() => handleSelectTab("ia")}
            className={`flex flex-col items-center gap-0.5 rounded-xl py-1 ${
              activeTab === "ia"
                ? "text-indigo-600 dark:text-sky-300"
                : "text-slate-500 dark:text-slate-400"
            }`}
          >
            <Sparkles className="h-5 w-5" />
            <span>IA</span>
          </button>

          <button
            type="button"
            onClick={() => handleSelectTab("guardados")}
            className={`flex flex-col items-center gap-0.5 rounded-xl py-1 ${
              activeTab === "guardados"
                ? "text-indigo-600 dark:text-sky-300"
                : "text-slate-500 dark:text-slate-400"
            }`}
          >
            <Bookmark className="h-5 w-5" />
            <span>Guardados</span>
          </button>

          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="flex flex-col items-center gap-0.5 rounded-xl py-1 text-slate-500 dark:text-slate-400"
          >
            <SlidersHorizontal className="h-5 w-5" />
            <span>Fuentes</span>
          </button>
        </div>
      </nav>

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        disabledSourceIds={disabledSourceIds}
        onToggleSource={toggleSource}
        customSources={customSources}
        onAddCustomSource={addCustomSource}
        onRemoveCustomSource={removeCustomSource}
      />
    </div>
  );
}
