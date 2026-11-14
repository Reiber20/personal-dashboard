"use client";

import { Bookmark, ExternalLink, Newspaper } from "lucide-react";
import { useState } from "react";
import { CategoryId, NewsItem } from "@/types/news";

interface CompactHeadlinesWidgetProps {
  items: NewsItem[];
  loading: boolean;
  savedLinks: Set<string>;
  onToggleSave: (item: NewsItem) => void;
  onSelectCategory: (cat: CategoryId) => void;
}

const QUICK_CATEGORIES: Array<{ id: Exclude<CategoryId, "hoy" | "youtube">; label: string }> = [
  { id: "ia", label: "IA" },
  { id: "fisica", label: "Física" },
  { id: "espacio", label: "Espacio" },
  { id: "hardware", label: "Hardware" },
  { id: "motor", label: "F1" },
  { id: "futbol", label: "Fútbol" },
];

const BADGE_COLORS: Record<NewsItem["category"], string> = {
  youtube: "bg-red-500/10 text-red-600 dark:text-red-400",
  ia: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  hardware: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
  espacio: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  fisica: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400",
  motor: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
  futbol: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  videojuegos: "bg-teal-500/10 text-teal-600 dark:text-teal-400",
  cine: "bg-pink-500/10 text-pink-600 dark:text-pink-400",
};

const CATEGORY_SHORT: Record<NewsItem["category"], string> = {
  youtube: "YouTube",
  ia: "IA",
  hardware: "Hardware",
  espacio: "Espacio",
  fisica: "Física",
  motor: "Motor",
  futbol: "Fútbol",
  videojuegos: "Juegos",
  cine: "Cine",
};

function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 2) return "ahora";
  if (mins < 60) return `hace ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "ayer";
  return `hace ${days} d`;
}

function CompactThumb({ item }: { item: NewsItem }) {
  const [err, setErr] = useState(false);
  const [useFb, setUseFb] = useState(false);

  const src = useFb ? item.imageFallbackUrl : item.imageUrl;
  if (!src || err) return null;

  const fallbackOrHide = () => {
    if (!useFb && item.imageFallbackUrl && item.imageFallbackUrl !== item.imageUrl) {
      setUseFb(true);
    } else {
      setErr(true);
    }
  };

  return (
    <a
      href={item.link}
      target="_blank"
      rel="noopener noreferrer"
      className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-slate-100 dark:bg-slate-700/60"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        key={src}
        src={src}
        alt={item.title}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        onError={fallbackOrHide}
        onLoad={(e) => {
          const { naturalWidth, naturalHeight } = e.currentTarget;
          if (naturalWidth > 0 && (naturalWidth < 180 || naturalHeight < 100)) {
            fallbackOrHide();
          }
        }}
        className="h-full w-full object-cover"
      />
    </a>
  );
}

export function CompactHeadlinesWidget({
  items,
  loading,
  savedLinks,
  onToggleSave,
  onSelectCategory,
}: CompactHeadlinesWidgetProps) {
  const topItems = items.slice(0, 8);

  return (
    <section className="flex h-full flex-col rounded-2xl border border-slate-200/90 bg-white p-4 shadow-xs dark:border-slate-700/70 dark:bg-slate-800/85">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-500/12 text-indigo-600 dark:bg-sky-500/15 dark:text-sky-300">
            <Newspaper className="h-4.5 w-4.5" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              Titulares Actuales
            </h2>
            <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
              Resumen rápido de hoy
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => onSelectCategory("ia")}
          className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-600 hover:underline dark:text-sky-300"
        >
          <span>Explorar</span>
          <ExternalLink className="h-3 w-3" />
        </button>
      </div>

      {/* Quick Category Jump Pills */}
      <div className="mb-3 flex flex-wrap gap-1.5">
        {QUICK_CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            type="button"
            onClick={() => onSelectCategory(cat.id)}
            className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[11px] font-semibold text-slate-600 transition hover:border-indigo-300 hover:text-indigo-600 dark:border-slate-700/70 dark:bg-slate-900/50 dark:text-slate-300 dark:hover:border-sky-400/60 dark:hover:text-sky-300"
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Compact Headline List */}
      <div className="flex-1 space-y-2 overflow-y-auto pr-0.5 max-h-[520px]">
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div
              key={`hd-skel-${i}`}
              className="flex animate-pulse items-center gap-3 rounded-xl border border-slate-100 p-2 dark:border-slate-700/60"
            >
              <div className="h-14 w-14 shrink-0 rounded-xl bg-slate-200 dark:bg-slate-700/60" />
              <div className="flex-1 space-y-2">
                <div className="h-3 w-1/3 rounded bg-slate-200 dark:bg-slate-700/60" />
                <div className="h-3.5 w-full rounded bg-slate-200 dark:bg-slate-700/60" />
              </div>
            </div>
          ))
        ) : topItems.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 py-8 text-center text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
            No se encontraron titulares actuales con este filtro.
          </div>
        ) : (
          topItems.map((item, idx) => {
            const isSaved = savedLinks.has(item.link);
            return (
              <article
                key={`${item.id}-${idx}`}
                className="group flex items-start gap-2.5 rounded-xl border border-slate-200/75 bg-slate-50/60 p-2 transition hover:border-slate-300 dark:border-slate-700/60 dark:bg-slate-900/45 dark:hover:border-slate-600"
              >
                <CompactThumb item={item} />

                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex items-center gap-1.5 text-[10px]">
                    <span
                      className={`rounded-full px-1.5 py-0.2 font-semibold ${BADGE_COLORS[item.category]}`}
                    >
                      {CATEGORY_SHORT[item.category]}
                    </span>
                    <span className="truncate font-medium text-slate-500 dark:text-slate-400">
                      {item.source}
                    </span>
                    <span className="ml-auto shrink-0 text-slate-400">
                      {formatRelativeTime(item.publishedAt)}
                    </span>
                  </div>

                  <a
                    href={item.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block"
                  >
                    <h3 className="line-clamp-2 text-xs font-bold leading-snug text-slate-900 transition group-hover:text-indigo-600 dark:text-slate-100 dark:group-hover:text-sky-300">
                      {item.title}
                    </h3>
                  </a>
                </div>

                <button
                  type="button"
                  onClick={() => onToggleSave(item)}
                  className={`shrink-0 rounded-lg p-1 transition ${
                    isSaved
                      ? "bg-indigo-50 text-indigo-600 dark:bg-sky-500/20 dark:text-sky-300"
                      : "text-slate-400 hover:bg-slate-200/70 hover:text-slate-700 dark:hover:bg-slate-700 dark:hover:text-slate-200"
                  }`}
                  title={isSaved ? "Quitar de guardados" : "Guardar noticia"}
                  aria-label={isSaved ? "Quitar de guardados" : "Guardar noticia"}
                >
                  <Bookmark className={`h-3.5 w-3.5 ${isSaved ? "fill-current" : ""}`} />
                </button>
              </article>
            );
          })
        )}
      </div>
    </section>
  );
}
