"use client";

import {
  Bookmark,
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

const STORAGE_KEYS = {
  saved: "pulso_saved_items_v1",
  disabled: "pulso_disabled_sources_v1",
  custom: "pulso_custom_sources_v1",
  theme: "pulso_theme_v1",
};

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

  const newsAbortRef = useRef<AbortController | null>(null);
  const requestSeqRef = useRef(0);

  // Hydrate persisted preferences & theme
  useEffect(() => {
    try {
      const savedRaw = localStorage.getItem(STORAGE_KEYS.saved);
      if (savedRaw) {
        const parsed = JSON.parse(savedRaw) as NewsItem[];
        const seenLinks = new Set<string>();
        const seenIds = new Set<string>();
        const cleaned: NewsItem[] = [];
        for (const item of parsed) {
          if (!item?.link || seenLinks.has(item.link)) continue;
          seenLinks.add(item.link);
          let uniqueId = item.id || item.link;
          if (seenIds.has(uniqueId)) {
            uniqueId = `${uniqueId}-${cleaned.length}`;
          }
          seenIds.add(uniqueId);
          cleaned.push({ ...item, id: uniqueId });
        }
        setSavedItems(cleaned);
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
            <WeatherClockWidgets />
            <TrendStrip trends={trends} loading={loadingTrends} />

            <div className="mb-5 grid grid-cols-1 gap-5 lg:grid-cols-12">
              <div className="lg:col-span-7">
                <WeeklyCalendarWidget />
              </div>
              <div className="lg:col-span-5">
                <PersonalProjectsWidget />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
              <div className="lg:col-span-7">
                <YouTubeSection
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
          <YouTubeSection searchQuery={searchQuery} />
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
