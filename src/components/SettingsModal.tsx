"use client";

import { Plus, Trash2, X } from "lucide-react";
import { useState } from "react";
import { CATEGORIES, DEFAULT_SOURCES } from "@/config/sources";
import { CategoryId, NewsSource } from "@/types/news";

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
  disabledSourceIds: string[];
  onToggleSource: (sourceId: string) => void;
  customSources: NewsSource[];
  onAddCustomSource: (source: NewsSource) => void;
  onRemoveCustomSource: (sourceId: string) => void;
}

export function SettingsModal({
  open,
  onClose,
  disabledSourceIds,
  onToggleSource,
  customSources,
  onAddCustomSource,
  onRemoveCustomSource,
}: SettingsModalProps) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [category, setCategory] =
    useState<Exclude<CategoryId, "hoy">>("ia");
  const [error, setError] = useState("");

  if (!open) return null;

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const trimmedName = name.trim();
    const trimmedUrl = url.trim();
    if (!trimmedName || !trimmedUrl.startsWith("http")) {
      setError("Introduce un nombre y una URL RSS válida (https://...).");
      return;
    }

    onAddCustomSource({
      id: `custom-${Date.now()}`,
      name: trimmedName,
      url: trimmedUrl,
      category,
      language: "es",
      isCustom: true,
    });
    setName("");
    setUrl("");
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 backdrop-blur-xs sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[88vh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border border-slate-200 bg-white shadow-2xl sm:rounded-2xl dark:border-slate-700/80 dark:bg-slate-800"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-700/70">
          <div>
            <h2 className="text-base font-bold">Tus fuentes e intereses</h2>
            <p className="text-xs text-slate-500 dark:text-slate-300">
              Activa, desactiva o añade tus propios feeds RSS.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"
            aria-label="Cerrar ajustes"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto p-5">
          {/* Add custom RSS */}
          <form
            onSubmit={handleAdd}
            className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 dark:border-slate-700/70 dark:bg-slate-900/70"
          >
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
              Añadir fuente RSS personalizada
            </h3>
            <div className="mt-2.5 grid gap-2 sm:grid-cols-2">
              <input
                type="text"
                placeholder="Nombre (ej. Genbeta)"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 dark:border-slate-600 dark:bg-slate-800 dark:focus:border-sky-400"
              />
              <select
                value={category}
                onChange={(e) =>
                  setCategory(e.target.value as Exclude<CategoryId, "hoy">)
                }
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 dark:border-slate-600 dark:bg-slate-800 dark:focus:border-sky-400"
              >
                {CATEGORIES.filter((c) => c.id !== "hoy" && c.id !== "youtube").map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.shortLabel}
                  </option>
                ))}
              </select>
            </div>
            <div className="mt-2 flex gap-2">
              <input
                type="url"
                placeholder="https://ejemplo.com/rss.xml"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 dark:border-slate-600 dark:bg-slate-800 dark:focus:border-sky-400"
              />
              <button
                type="submit"
                className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-indigo-500 dark:bg-sky-600 dark:hover:bg-sky-500"
              >
                <Plus className="h-4 w-4" />
                <span>Añadir</span>
              </button>
            </div>
            {error && <p className="mt-2 text-xs text-rose-500">{error}</p>}
          </form>

          {/* Custom sources list */}
          {customSources.length > 0 && (
            <div>
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Tus fuentes añadidas
              </h3>
              <div className="space-y-1.5">
                {customSources.map((src) => (
                  <div
                    key={src.id}
                    className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2 dark:border-slate-700/70 dark:bg-slate-900/40"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{src.name}</p>
                      <p className="truncate text-xs text-slate-400">{src.url}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onRemoveCustomSource(src.id)}
                      className="rounded-lg p-1.5 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                      aria-label="Eliminar fuente"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Built-in sources grouped by category */}
          <div className="space-y-4">
            {CATEGORIES.filter((c) => c.id !== "hoy" && c.id !== "youtube").map((cat) => {
              const catSources = DEFAULT_SOURCES.filter(
                (s) => s.category === cat.id
              );
              return (
                <div key={cat.id}>
                  <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    {cat.label}
                  </h3>
                  <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                    {catSources.map((src) => {
                      const enabled = !disabledSourceIds.includes(src.id);
                      return (
                        <label
                          key={src.id}
                          className="flex cursor-pointer items-center justify-between rounded-xl border border-slate-200 px-3 py-2 text-sm transition hover:bg-slate-50 dark:border-slate-700/70 dark:bg-slate-900/35 dark:hover:bg-slate-700/50"
                        >
                          <span className="font-medium">
                            {src.name}{" "}
                            <span className="text-[11px] uppercase text-slate-400">
                              ({src.language})
                            </span>
                          </span>
                          <input
                            type="checkbox"
                            checked={enabled}
                            onChange={() => onToggleSource(src.id)}
                            className="h-4 w-4 accent-indigo-600 dark:accent-sky-400"
                          />
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
