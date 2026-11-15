"use client";

import { ExternalLink, Flame, Hash, TrendingUp, X } from "lucide-react";
import { useMemo, useState } from "react";
import { TrendTopic } from "@/types/news";

interface TrendStripProps {
  trends: TrendTopic[];
  loading: boolean;
}

export function TrendStrip({ trends, loading }: TrendStripProps) {
  const [selectedTrend, setSelectedTrend] = useState<TrendTopic | null>(null);
  const [filter, setFilter] = useState<"all" | "x" | "google">("all");

  const filteredTrends = useMemo(() => {
    if (filter === "x") return trends.filter((t) => t.source === "x");
    if (filter === "google") return trends.filter((t) => t.source !== "x");
    return trends;
  }, [trends, filter]);

  if (loading) {
    return (
      <section className="mb-5 min-w-0 max-w-full">
        <div className="mb-2.5 flex items-center gap-2">
          <Flame className="h-4 w-4 text-orange-500" />
          <h2 className="text-sm font-bold tracking-tight uppercase text-slate-700 dark:text-slate-300">
            Trending Topics Hoy · Google & X
          </h2>
        </div>
        <div className="custom-scrollbar flex w-full max-w-full gap-2.5 overflow-x-auto pt-0.5 pb-2.5 scroll-smooth">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-14 w-44 shrink-0 animate-pulse rounded-xl bg-slate-200 dark:bg-slate-800"
            />
          ))}
        </div>
      </section>
    );
  }

  if (trends.length === 0) return null;

  return (
    <section className="mb-5 min-w-0 max-w-full">
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Flame className="h-4 w-4 text-orange-500" />
          <h2 className="text-xs font-bold tracking-wider uppercase text-slate-600 dark:text-slate-300">
            Trending Topics Hoy · España
          </h2>
        </div>

        <div className="flex items-center gap-1.5">
          {(
            [
              { id: "all", label: "Todo" },
              { id: "x", label: "𝕏 Tendencias" },
              { id: "google", label: "Google Trends" },
            ] as const
          ).map((pill) => (
            <button
              key={pill.id}
              type="button"
              onClick={() => setFilter(pill.id)}
              className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold transition ${
                filter === pill.id
                  ? pill.id === "x"
                    ? "bg-slate-900 text-white dark:bg-sky-500 dark:text-slate-950"
                    : "bg-indigo-600 text-white dark:bg-sky-600"
                  : "border border-slate-200 bg-white text-slate-600 hover:border-slate-300 dark:border-slate-700/70 dark:bg-slate-800/85 dark:text-slate-300"
              }`}
            >
              {pill.label}
            </button>
          ))}
        </div>
      </div>

      <div className="custom-scrollbar flex w-full max-w-full gap-2.5 overflow-x-auto pt-0.5 pb-2.5 scroll-smooth">
        {filteredTrends.map((trend, index) => {
          const isSelected = selectedTrend?.id === trend.id;
          const isX = trend.source === "x";
          return (
            <button
              key={`${trend.id}-${index}`}
              type="button"
              onClick={() => setSelectedTrend(isSelected ? null : trend)}
              className={`group flex shrink-0 items-center gap-2.5 rounded-xl border px-3 py-2 text-left transition active:scale-97 ${
                isSelected
                  ? "border-indigo-500 bg-indigo-50/80 dark:border-sky-400/70 dark:bg-sky-500/15"
                  : "border-slate-200 bg-white hover:border-slate-300 dark:border-slate-700/70 dark:bg-slate-800/85 dark:hover:border-slate-600"
              }`}
            >
              {isX ? (
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-[11px] font-black text-white dark:bg-sky-500/20 dark:text-sky-200">
                  𝕏
                </span>
              ) : (
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-orange-500/10 text-xs font-bold text-orange-600 dark:text-orange-300">
                  {index + 1}
                </span>
              )}
              <div className="min-w-0">
                <p className="max-w-[170px] truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {trend.title}
                </p>
                <p className="flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400">
                  {isX ? (
                    <>
                      <Hash className="h-3 w-3 text-sky-500" />
                      <span>{trend.traffic}</span>
                    </>
                  ) : (
                    <>
                      <TrendingUp className="h-3 w-3 text-emerald-500" />
                      <span>{trend.traffic} búsquedas</span>
                    </>
                  )}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      {selectedTrend && (
        <div className="mt-2 rounded-2xl border border-indigo-200 bg-white p-4 shadow-sm dark:border-sky-500/30 dark:bg-slate-800/95">
          <div className="flex items-start justify-between gap-3">
            <div>
              <span className="text-[11px] font-semibold uppercase tracking-wide text-indigo-600 dark:text-sky-300">
                {selectedTrend.source === "x"
                  ? `Tendencia en X (Twitter) · ${selectedTrend.traffic}`
                  : `Google Trends · ${selectedTrend.traffic}`}
              </span>
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                {selectedTrend.title}
              </h3>
            </div>
            <button
              type="button"
              onClick={() => setSelectedTrend(null)}
              className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"
              aria-label="Cerrar tendencia"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {selectedTrend.relatedNews.length > 0 && (
            <div className="mt-3 space-y-2">
              {selectedTrend.relatedNews.map((item, idx) => (
                <a
                  key={`${selectedTrend.id}-rel-${idx}`}
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5 text-sm transition hover:border-indigo-300 dark:border-slate-700/70 dark:bg-slate-900/60 dark:hover:border-sky-400/60"
                >
                  <div className="min-w-0">
                    <p className="line-clamp-2 font-medium text-slate-800 dark:text-slate-200">
                      {item.title}
                    </p>
                    {item.source && (
                      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                        {item.source}
                      </p>
                    )}
                  </div>
                  <ExternalLink className="h-4 w-4 shrink-0 text-slate-400" />
                </a>
              ))}
            </div>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <a
              href={`https://x.com/search?q=${encodeURIComponent(selectedTrend.title)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white transition hover:bg-slate-700 dark:bg-sky-500/20 dark:text-sky-200 dark:hover:bg-sky-500/30"
            >
              <span>Ver en 𝕏 (Twitter)</span>
              <ExternalLink className="h-3 w-3" />
            </a>
            <a
              href={`https://www.google.com/search?q=${encodeURIComponent(selectedTrend.title)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-indigo-600 transition hover:bg-slate-50 dark:border-slate-600 dark:text-sky-300 dark:hover:bg-slate-700/50"
            >
              <span>Buscar en Google</span>
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>
      )}
    </section>
  );
}
