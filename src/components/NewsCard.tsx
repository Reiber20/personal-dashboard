"use client";

import { Bookmark, Check, ExternalLink, Share2 } from "lucide-react";
import { useState } from "react";
import { NewsItem } from "@/types/news";

interface NewsCardProps {
  item: NewsItem;
  featured?: boolean;
  isSaved: boolean;
  onToggleSave: (item: NewsItem) => void;
}

const CATEGORY_COLORS: Record<NewsItem["category"], string> = {
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

const CATEGORY_LABELS: Record<NewsItem["category"], string> = {
  youtube: "YouTube",
  ia: "IA & LLMs",
  hardware: "Hardware",
  espacio: "Espacio",
  fisica: "Física",
  motor: "F1 & Motor",
  futbol: "Fútbol",
  videojuegos: "Videojuegos",
  cine: "Cine & Series",
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

export function NewsCard({
  item,
  featured = false,
  isSaved,
  onToggleSave,
}: NewsCardProps) {
  const [imgError, setImgError] = useState(false);
  const [useFallback, setUseFallback] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: item.title,
          url: item.link,
        });
        return;
      } catch {
        // User cancelled or share failed; fall back to clipboard
      }
    }
    try {
      await navigator.clipboard.writeText(item.link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Ignore clipboard failures
    }
  };

  const activeImageUrl = useFallback ? item.imageFallbackUrl : item.imageUrl;
  const showImage = Boolean(activeImageUrl) && !imgError;

  const handleImageFallbackOrHide = () => {
    if (
      !useFallback &&
      item.imageFallbackUrl &&
      item.imageFallbackUrl !== item.imageUrl
    ) {
      setUseFallback(true);
    } else {
      setImgError(true);
    }
  };

  return (
    <article
      className={`group flex flex-col justify-between overflow-hidden rounded-2xl border border-slate-200/90 bg-white transition hover:border-slate-300 hover:shadow-md dark:border-slate-700/70 dark:bg-slate-800/85 dark:hover:border-slate-600 ${
        featured ? "sm:col-span-2 lg:flex-row" : ""
      }`}
    >
      {showImage && (
        <a
          href={item.link}
          target="_blank"
          rel="noopener noreferrer"
          className={`relative block overflow-hidden bg-slate-100 dark:bg-slate-700/60 ${
            featured ? "h-48 w-full lg:h-auto lg:w-2/5 lg:shrink-0" : "h-40 w-full"
          }`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            key={activeImageUrl}
            src={activeImageUrl}
            alt={item.title}
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            onError={handleImageFallbackOrHide}
            onLoad={(e) => {
              const { naturalWidth, naturalHeight } = e.currentTarget;
              if (
                naturalWidth > 0 &&
                (naturalWidth < 180 || naturalHeight < 100)
              ) {
                handleImageFallbackOrHide();
              }
            }}
            className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"
          />
        </a>
      )}

      <div className="flex flex-1 flex-col justify-between p-4">
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
            <span
              className={`rounded-full px-2 py-0.5 font-semibold ${CATEGORY_COLORS[item.category]}`}
            >
              {CATEGORY_LABELS[item.category]}
            </span>
            <span className="font-semibold text-slate-700 dark:text-slate-300">
              {item.source}
            </span>
            {item.language === "en" && (
              <span className="rounded border border-slate-200 px-1.5 py-0.2 text-[10px] font-medium uppercase text-slate-500 dark:border-slate-600 dark:text-slate-400">
                EN
              </span>
            )}
            <span className="ml-auto text-[11px] text-slate-400 dark:text-slate-400">
              {formatRelativeTime(item.publishedAt)}
            </span>
          </div>

          <a
            href={item.link}
            target="_blank"
            rel="noopener noreferrer"
            className="block"
          >
            <h3
              className={`font-bold leading-snug text-slate-900 transition group-hover:text-indigo-600 dark:text-slate-100 dark:group-hover:text-sky-300 ${
                featured ? "text-lg sm:text-xl" : "text-[15px] line-clamp-3"
              }`}
            >
              {item.title}
            </h3>
          </a>

          {item.snippet && (
            <p
              className={`mt-2 text-slate-600 dark:text-slate-300/90 ${
                featured ? "text-sm line-clamp-3" : "text-xs leading-relaxed line-clamp-2"
              }`}
            >
              {item.snippet}
            </p>
          )}
        </div>

        <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 dark:border-slate-700/60">
          <a
            href={item.link}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:underline dark:text-sky-300"
          >
            <span>Leer noticia</span>
            <ExternalLink className="h-3.5 w-3.5" />
          </a>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handleShare}
              className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-700/60 dark:hover:text-slate-100"
              title="Compartir o copiar enlace"
              aria-label="Compartir"
            >
              {copied ? (
                <Check className="h-4 w-4 text-emerald-500" />
              ) : (
                <Share2 className="h-4 w-4" />
              )}
            </button>

            <button
              type="button"
              onClick={() => onToggleSave(item)}
              className={`rounded-lg p-1.5 transition ${
                isSaved
                  ? "bg-indigo-50 text-indigo-600 dark:bg-sky-500/20 dark:text-sky-300"
                  : "text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-700/60 dark:hover:text-slate-100"
              }`}
              title={isSaved ? "Quitar de guardados" : "Guardar para leer luego"}
              aria-label={isSaved ? "Quitar de guardados" : "Guardar"}
            >
              <Bookmark className={`h-4 w-4 ${isSaved ? "fill-current" : ""}`} />
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}
