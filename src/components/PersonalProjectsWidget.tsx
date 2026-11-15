"use client";

import {
  Check,
  FolderKanban,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  PersonalProject,
  ProjectPriority,
  ProjectStatus,
} from "@/types/news";

const PROJECTS_STORAGE_KEY = "hola_rober_projects_v1";

const STATUS_META: Record<
  ProjectStatus,
  { label: string; badge: string; bar: string }
> = {
  en_curso: {
    label: "En curso",
    badge:
      "bg-sky-500/15 text-sky-700 border-sky-200 dark:border-sky-400/30 dark:text-sky-300",
    bar: "bg-sky-500",
  },
  por_hacer: {
    label: "Pendiente",
    badge:
      "bg-amber-500/15 text-amber-700 border-amber-200 dark:border-amber-400/30 dark:text-amber-300",
    bar: "bg-amber-500",
  },
  pausado: {
    label: "Pausado",
    badge:
      "bg-slate-500/15 text-slate-600 border-slate-200 dark:border-slate-600 dark:text-slate-300",
    bar: "bg-slate-400",
  },
  completado: {
    label: "Completado",
    badge:
      "bg-emerald-500/15 text-emerald-700 border-emerald-200 dark:border-emerald-400/30 dark:text-emerald-300",
    bar: "bg-emerald-500",
  },
};

const PRIORITY_STYLES: Record<ProjectPriority, { label: string; cls: string }> = {
  alta: {
    label: "Alta",
    cls: "bg-rose-500/12 text-rose-600 dark:text-rose-300",
  },
  media: {
    label: "Media",
    cls: "bg-amber-500/12 text-amber-600 dark:text-amber-300",
  },
  baja: {
    label: "Baja",
    cls: "bg-slate-500/12 text-slate-500 dark:text-slate-400",
  },
};

const STARTER_PROJECTS: PersonalProject[] = [
  {
    id: "proj-starter-1",
    title: "Dashboard personal Hola Rober",
    description: "Widgets de tiempo, Google Calendar, YouTube y noticias diarias",
    status: "en_curso",
    priority: "alta",
    progress: 80,
    updatedAt: new Date().toISOString(),
  },
  {
    id: "proj-starter-2",
    title: "Notas de IA y Física Cuántica",
    description: "Recopilar papers y artículos destacados de la semana",
    status: "por_hacer",
    priority: "media",
    progress: 25,
    updatedAt: new Date().toISOString(),
  },
  {
    id: "proj-starter-3",
    title: "Automatización de lecturas y vídeos",
    description: "Sincronizar fuentes RSS y suscripciones favoritas",
    status: "completado",
    priority: "baja",
    progress: 100,
    updatedAt: new Date().toISOString(),
  },
];

export function PersonalProjectsWidget() {
  const [projects, setProjects] = useState<PersonalProject[]>([]);
  const [filter, setFilter] = useState<"all" | ProjectStatus>("all");
  const [showAddForm, setShowAddForm] = useState(false);

  // Add project form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<ProjectPriority>("media");
  const [status, setStatus] = useState<ProjectStatus>("en_curso");

  // Edit project inline state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDesc, setEditDesc] = useState("");

  useEffect(() => {
    const loadFromStorage = () => {
      try {
        const raw = localStorage.getItem(PROJECTS_STORAGE_KEY);
        if (raw !== null) {
          const parsed = JSON.parse(raw) as PersonalProject[];
          if (Array.isArray(parsed)) {
            setProjects(parsed);
            return;
          }
        }
        setProjects(STARTER_PROJECTS);
      } catch {
        setProjects(STARTER_PROJECTS);
      }
    };

    loadFromStorage();

    const handleCloudApplied = () => {
      loadFromStorage();
    };
    const handleStorage = (e: StorageEvent) => {
      if (e.key === PROJECTS_STORAGE_KEY) {
        loadFromStorage();
      }
    };

    window.addEventListener("hr-cloud-sync-applied", handleCloudApplied);
    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener("hr-cloud-sync-applied", handleCloudApplied);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  const persist = (next: PersonalProject[]) => {
    setProjects(next);
    try {
      localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(next));
      window.dispatchEvent(
        new CustomEvent("hr-local-sync", {
          detail: { key: PROJECTS_STORAGE_KEY, value: next },
        })
      );
    } catch {}
  };

  const handleAddProject = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanTitle = title.trim();
    if (!cleanTitle) return;

    const item: PersonalProject = {
      id: `proj-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      title: cleanTitle,
      description: description.trim() || undefined,
      status,
      priority,
      progress: status === "completado" ? 100 : status === "en_curso" ? 30 : 0,
      updatedAt: new Date().toISOString(),
    };

    persist([item, ...projects]);
    setTitle("");
    setDescription("");
    setPriority("media");
    setStatus("en_curso");
    setShowAddForm(false);
  };

  const handleStatusChange = (id: string, nextStatus: ProjectStatus) => {
    persist(
      projects.map((p) => {
        if (p.id !== id) return p;
        return {
          ...p,
          status: nextStatus,
          progress: nextStatus === "completado" ? 100 : p.progress === 100 ? 50 : p.progress,
          updatedAt: new Date().toISOString(),
        };
      })
    );
  };

  const handleProgressChange = (id: string, nextProgress: number) => {
    const clamped = Math.max(0, Math.min(100, nextProgress));
    persist(
      projects.map((p) => {
        if (p.id !== id) return p;
        const nextStatus: ProjectStatus =
          clamped === 100
            ? "completado"
            : p.status === "completado"
              ? "en_curso"
              : p.status;
        return {
          ...p,
          progress: clamped,
          status: nextStatus,
          updatedAt: new Date().toISOString(),
        };
      })
    );
  };

  const handleSaveEdit = (id: string) => {
    const clean = editTitle.trim();
    if (!clean) return;
    persist(
      projects.map((p) =>
        p.id === id
          ? {
              ...p,
              title: clean,
              description: editDesc.trim() || undefined,
              updatedAt: new Date().toISOString(),
            }
          : p
      )
    );
    setEditingId(null);
  };

  const handleDelete = (id: string) => {
    persist(projects.filter((p) => p.id !== id));
  };

  const visibleProjects = useMemo(() => {
    if (filter === "all") return projects;
    return projects.filter((p) => p.status === filter);
  }, [projects, filter]);

  const activeCount = useMemo(
    () => projects.filter((p) => p.status !== "completado").length,
    [projects]
  );

  return (
    <section className="flex h-full flex-col rounded-2xl border border-slate-200/90 bg-white p-4 shadow-xs dark:border-slate-700/70 dark:bg-slate-800/85">
      {/* Header */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/12 text-emerald-600 dark:text-emerald-300">
            <FolderKanban className="h-4.5 w-4.5" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              Proyectos Personales
            </h2>
            <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
              {activeCount} activos · {projects.length} total
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setShowAddForm((v) => !v)}
          className="inline-flex items-center gap-1 rounded-full bg-indigo-600 px-2.5 py-1 text-[11px] font-semibold text-white transition hover:bg-indigo-500 dark:bg-sky-600 dark:hover:bg-sky-500"
        >
          <Plus className="h-3 w-3" />
          <span>Proyecto</span>
        </button>
      </div>

      {/* Filter Pills */}
      <div className="mb-3 flex flex-wrap gap-1.5">
        {(
          [
            { id: "all", label: "Todos" },
            { id: "en_curso", label: "En curso" },
            { id: "por_hacer", label: "Pendientes" },
            { id: "pausado", label: "Pausados" },
            { id: "completado", label: "Completados" },
          ] as const
        ).map((pill) => (
          <button
            key={pill.id}
            type="button"
            onClick={() => setFilter(pill.id)}
            className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold transition ${
              filter === pill.id
                ? "bg-indigo-600 text-white dark:bg-sky-600"
                : "border border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300 dark:border-slate-700/70 dark:bg-slate-900/50 dark:text-slate-300"
            }`}
          >
            {pill.label}
          </button>
        ))}
      </div>

      {/* Inline Add Project Form */}
      {showAddForm && (
        <form
          onSubmit={handleAddProject}
          className="mb-3 space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900/70"
        >
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Nombre del proyecto..."
            required
            className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs outline-none focus:border-sky-400 dark:border-slate-600 dark:bg-slate-800"
          />
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Objetivo o notas breves (opcional)"
            className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs outline-none focus:border-sky-400 dark:border-slate-600 dark:bg-slate-800"
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as ProjectStatus)}
                className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium outline-none dark:border-slate-600 dark:bg-slate-800"
              >
                <option value="en_curso">En curso</option>
                <option value="por_hacer">Pendiente</option>
                <option value="pausado">Pausado</option>
                <option value="completado">Completado</option>
              </select>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as ProjectPriority)}
                className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium outline-none dark:border-slate-600 dark:bg-slate-800"
              >
                <option value="alta">Prioridad Alta</option>
                <option value="media">Prioridad Media</option>
                <option value="baja">Prioridad Baja</option>
              </select>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="rounded-lg px-2 py-1 text-xs text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="rounded-lg bg-indigo-600 px-3 py-1 text-xs font-semibold text-white hover:bg-indigo-500 dark:bg-sky-600"
              >
                Añadir
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Project List */}
      <div className="flex-1 space-y-2.5 overflow-y-auto pr-0.5 max-h-[360px]">
        {visibleProjects.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 py-8 text-center text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
            No hay proyectos en esta vista. Pulsa <strong>+ Proyecto</strong> para añadir uno.
          </div>
        ) : (
          visibleProjects.map((project) => {
            const meta = STATUS_META[project.status];
            const prio = PRIORITY_STYLES[project.priority];
            const isEditing = editingId === project.id;

            return (
              <div
                key={project.id}
                className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-3 transition hover:border-slate-300 dark:border-slate-700/60 dark:bg-slate-900/45 dark:hover:border-slate-600"
              >
                {isEditing ? (
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold outline-none dark:border-slate-600 dark:bg-slate-800"
                    />
                    <input
                      type="text"
                      value={editDesc}
                      onChange={(e) => setEditDesc(e.target.value)}
                      placeholder="Descripción..."
                      className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs outline-none dark:border-slate-600 dark:bg-slate-800"
                    />
                    <div className="flex justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="rounded-lg p-1 text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
                        aria-label="Cancelar edición"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSaveEdit(project.id)}
                        className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-emerald-500"
                      >
                        <Check className="h-3 w-3" />
                        Guardar
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <h3
                            className={`text-xs font-bold leading-snug ${
                              project.status === "completado"
                                ? "text-slate-400 line-through dark:text-slate-500"
                                : "text-slate-900 dark:text-slate-100"
                            }`}
                          >
                            {project.title}
                          </h3>
                          <span
                            className={`rounded-full px-1.5 py-0.2 text-[10px] font-semibold ${prio.cls}`}
                          >
                            {prio.label}
                          </span>
                        </div>
                        {project.description && (
                          <p className="mt-0.5 line-clamp-2 text-[11px] text-slate-500 dark:text-slate-400">
                            {project.description}
                          </p>
                        )}
                      </div>

                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingId(project.id);
                            setEditTitle(project.title);
                            setEditDesc(project.description || "");
                          }}
                          className="rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700 dark:hover:bg-slate-700 dark:hover:text-slate-200"
                          title="Editar proyecto"
                          aria-label={`Editar ${project.title}`}
                        >
                          <Pencil className="h-3 w-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(project.id)}
                          className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-500 dark:hover:bg-rose-500/15"
                          title="Eliminar proyecto"
                          aria-label={`Eliminar ${project.title}`}
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </div>

                    <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
                      <select
                        value={project.status}
                        onChange={(e) =>
                          handleStatusChange(
                            project.id,
                            e.target.value as ProjectStatus
                          )
                        }
                        className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold outline-none transition ${meta.badge} dark:bg-slate-800`}
                        aria-label={`Estado de ${project.title}`}
                      >
                        <option value="en_curso">En curso</option>
                        <option value="por_hacer">Pendiente</option>
                        <option value="pausado">Pausado</option>
                        <option value="completado">Completado</option>
                      </select>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() =>
                            handleProgressChange(project.id, project.progress - 10)
                          }
                          className="rounded border border-slate-200 bg-white px-1.5 text-[10px] font-bold text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                          title="Restar 10%"
                        >
                          -10%
                        </button>
                        <span className="w-8 text-right text-[11px] font-bold tabular-nums text-slate-700 dark:text-slate-200">
                          {project.progress}%
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            handleProgressChange(project.id, project.progress + 10)
                          }
                          className="rounded border border-slate-200 bg-white px-1.5 text-[10px] font-bold text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                          title="Sumar 10%"
                        >
                          +10%
                        </button>
                      </div>
                    </div>

                    <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${meta.bar}`}
                        style={{ width: `${project.progress}%` }}
                      />
                    </div>
                  </>
                )}
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
