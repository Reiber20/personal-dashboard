"use client";

import {
  Check,
  Clock,
  ListTodo,
  Pin,
  Plus,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DailyTaskItem, DailyTaskResetMode } from "@/types/news";

export const DAILY_TASKS_STORAGE_KEY = "hola_rober_daily_tasks_v1";

export const STARTER_DAILY_TASKS: DailyTaskItem[] = [];

export interface DailyTasksWidgetProps {
  tasks?: DailyTaskItem[];
  onTasksChange?: (next: DailyTaskItem[]) => void;
}

function parseResetTime(resetTime?: string): { hours: number; minutes: number } {
  const raw = (resetTime || "09:00").trim();
  const match = /^(\d{1,2}):(\d{1,2})$/.exec(raw);
  if (!match) {
    return { hours: 9, minutes: 0 };
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (
    !Number.isInteger(hours) ||
    !Number.isInteger(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return { hours: 9, minutes: 0 };
  }

  return { hours, minutes };
}

function formatResetTime(resetTime?: string): string {
  const { hours, minutes } = parseResetTime(resetTime);
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function resetDailyTask(task: DailyTaskItem): DailyTaskItem {
  return {
    ...task,
    completed: false,
    completedAt: null,
  };
}

export function evaluateDailyTasksReset(
  tasks: DailyTaskItem[],
  now: Date = new Date()
): { nextTasks: DailyTaskItem[]; changed: boolean } {
  if (!Array.isArray(tasks)) {
    return { nextTasks: [], changed: false };
  }

  let changed = false;
  const nowMs = now.getTime();

  const nextTasks = tasks.map((task) => {
    if (!task.completed) {
      return task;
    }

    if (task.resetMode === "persistent") {
      return task;
    }

    if (task.resetMode === "daily") {
      if (!task.completedAt) {
        changed = true;
        return resetDailyTask(task);
      }

      const completedDate = new Date(task.completedAt);
      if (Number.isNaN(completedDate.getTime())) {
        changed = true;
        return resetDailyTask(task);
      }

      const isDifferentLocalDate =
        completedDate.getFullYear() !== now.getFullYear() ||
        completedDate.getMonth() !== now.getMonth() ||
        completedDate.getDate() !== now.getDate();

      if (isDifferentLocalDate && nowMs > completedDate.getTime()) {
        changed = true;
        return resetDailyTask(task);
      }

      return task;
    }

    if (task.resetMode === "scheduled") {
      if (!task.completedAt) {
        changed = true;
        return resetDailyTask(task);
      }

      const completedDate = new Date(task.completedAt);
      if (Number.isNaN(completedDate.getTime())) {
        changed = true;
        return resetDailyTask(task);
      }

      const { hours, minutes } = parseResetTime(task.resetTime);
      const candidate = new Date(
        completedDate.getFullYear(),
        completedDate.getMonth(),
        completedDate.getDate(),
        hours,
        minutes,
        0,
        0
      );

      if (completedDate.getTime() >= candidate.getTime()) {
        candidate.setDate(candidate.getDate() + 1);
      }

      if (nowMs >= candidate.getTime()) {
        changed = true;
        return resetDailyTask(task);
      }

      return task;
    }

    return task;
  });

  return {
    nextTasks: changed ? nextTasks : tasks,
    changed,
  };
}

function getResetBadgeMeta(task: DailyTaskItem) {
  if (task.resetMode === "daily") {
    return {
      label: "Diario · 00:00",
      cls: "border-sky-200 bg-sky-500/12 text-sky-700 dark:border-sky-400/30 dark:text-sky-300",
      icon: <RotateCcw className="h-2.5 w-2.5" />,
    };
  }

  if (task.resetMode === "scheduled") {
    return {
      label: `Hora · ${formatResetTime(task.resetTime)}`,
      cls: "border-amber-200 bg-amber-500/12 text-amber-700 dark:border-amber-400/30 dark:text-amber-300",
      icon: <Clock className="h-2.5 w-2.5" />,
    };
  }

  return {
    label: "Persistente",
    cls: "border-slate-200 bg-slate-500/12 text-slate-600 dark:border-slate-600 dark:text-slate-300",
    icon: <Pin className="h-2.5 w-2.5" />,
  };
}

export function DailyTasksWidget({
  tasks: controlledTasks,
  onTasksChange,
}: DailyTasksWidgetProps = {}) {
  const [internalTasks, setInternalTasks] = useState<DailyTaskItem[]>([]);
  const isControlled = controlledTasks !== undefined;
  const rawTasks = isControlled ? controlledTasks : internalTasks;

  const activeTasks = useMemo(
    () => (Array.isArray(rawTasks) ? rawTasks : []),
    [rawTasks]
  );

  const [showAddForm, setShowAddForm] = useState(false);
  const [title, setTitle] = useState("");
  const [resetMode, setResetMode] = useState<DailyTaskResetMode>("daily");
  const [resetTime, setResetTime] = useState("09:00");

  const latestTasksRef = useRef<DailyTaskItem[]>(activeTasks);
  const onTasksChangeRef = useRef(onTasksChange);
  const isDispatchingStorageRef = useRef(false);

  useEffect(() => {
    latestTasksRef.current = activeTasks;
  }, [activeTasks]);

  useEffect(() => {
    onTasksChangeRef.current = onTasksChange;
  }, [onTasksChange]);

  const persist = useCallback(
    (next: DailyTaskItem[]) => {
      latestTasksRef.current = next;

      if (!isControlled) {
        setInternalTasks(next);
      }

      try {
        window.localStorage.setItem(
          DAILY_TASKS_STORAGE_KEY,
          JSON.stringify(next)
        );
        isDispatchingStorageRef.current = true;
        window.dispatchEvent(new Event("hola-rober-storage-change"));
        if (!onTasksChangeRef.current) {
          window.dispatchEvent(
            new CustomEvent("hr-local-sync", {
              detail: { key: DAILY_TASKS_STORAGE_KEY, value: next },
            })
          );
        }
      } catch {
        // Ignore storage quota or private mode failures
      } finally {
        isDispatchingStorageRef.current = false;
      }

      onTasksChangeRef.current?.(next);
    },
    [isControlled]
  );

  // Hydrate internal state from localStorage in uncontrolled mode
  useEffect(() => {
    if (isControlled) return;

    const loadFromStorage = () => {
      try {
        const raw = window.localStorage.getItem(DAILY_TASKS_STORAGE_KEY);
        if (raw !== null) {
          const parsed = JSON.parse(raw) as DailyTaskItem[];
          if (Array.isArray(parsed)) {
            const { nextTasks, changed } = evaluateDailyTasksReset(
              parsed,
              new Date()
            );
            latestTasksRef.current = nextTasks;
            setInternalTasks(nextTasks);

            if (changed) {
              window.localStorage.setItem(
                DAILY_TASKS_STORAGE_KEY,
                JSON.stringify(nextTasks)
              );
              isDispatchingStorageRef.current = true;
              window.dispatchEvent(new Event("hola-rober-storage-change"));
              window.dispatchEvent(
                new CustomEvent("hr-local-sync", {
                  detail: { key: DAILY_TASKS_STORAGE_KEY, value: nextTasks },
                })
              );
              isDispatchingStorageRef.current = false;
            }
            return;
          }
        }
        latestTasksRef.current = STARTER_DAILY_TASKS;
        setInternalTasks(STARTER_DAILY_TASKS);
      } catch {
        latestTasksRef.current = STARTER_DAILY_TASKS;
        setInternalTasks(STARTER_DAILY_TASKS);
      }
    };

    loadFromStorage();

    const handleExternalUpdate = () => {
      if (isDispatchingStorageRef.current) return;
      loadFromStorage();
    };
    const handleStorage = (e: StorageEvent) => {
      if (e.key === DAILY_TASKS_STORAGE_KEY) {
        loadFromStorage();
      }
    };

    window.addEventListener("hr-cloud-sync-applied", handleExternalUpdate);
    window.addEventListener("hola-rober-storage-change", handleExternalUpdate);
    window.addEventListener("storage", handleStorage);

    return () => {
      window.removeEventListener("hr-cloud-sync-applied", handleExternalUpdate);
      window.removeEventListener(
        "hola-rober-storage-change",
        handleExternalUpdate
      );
      window.removeEventListener("storage", handleStorage);
    };
  }, [isControlled]);

  const runResetCheck = useCallback(() => {
    const current = latestTasksRef.current;
    if (!Array.isArray(current) || current.length === 0) return;

    const { nextTasks, changed } = evaluateDailyTasksReset(
      current,
      new Date()
    );
    if (changed) {
      persist(nextTasks);
    }
  }, [persist]);

  // Evaluate resets on mount, every 60s, on focus, and on visibilitychange
  useEffect(() => {
    runResetCheck();

    const intervalId = window.setInterval(runResetCheck, 60_000);
    const handleFocus = () => runResetCheck();
    const handleVisibilityChange = () => {
      if (document.visibilityState !== "hidden") {
        runResetCheck();
      }
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [runResetCheck]);

  // Re-evaluate if controlled tasks update from parent
  useEffect(() => {
    if (!isControlled) return;
    runResetCheck();
  }, [isControlled, controlledTasks, runResetCheck]);

  const handleAddTask = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanTitle = title.trim();
    if (!cleanTitle) return;

    const newItem: DailyTaskItem = {
      id: `daily-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      title: cleanTitle,
      completed: false,
      completedAt: null,
      resetMode,
      ...(resetMode === "scheduled"
        ? { resetTime: formatResetTime(resetTime) }
        : {}),
      createdAt: new Date().toISOString(),
    };

    persist([newItem, ...activeTasks]);
    setTitle("");
    setResetMode("daily");
    setResetTime("09:00");
    setShowAddForm(false);
  };

  const handleToggleTask = (id: string) => {
    const nowIso = new Date().toISOString();
    persist(
      activeTasks.map((task) => {
        if (task.id !== id) return task;
        const nextCompleted = !task.completed;
        return {
          ...task,
          completed: nextCompleted,
          completedAt: nextCompleted ? nowIso : null,
        };
      })
    );
  };

  const handleDeleteTask = (id: string) => {
    persist(activeTasks.filter((task) => task.id !== id));
  };

  const completedCount = useMemo(
    () => activeTasks.filter((t) => t.completed).length,
    [activeTasks]
  );
  const pendingCount = activeTasks.length - completedCount;

  return (
    <section className="flex flex-col rounded-2xl border border-slate-200/90 bg-white p-4 shadow-xs dark:border-slate-700/70 dark:bg-slate-800/85">
      {/* Header */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-500/12 text-indigo-600 dark:bg-sky-500/15 dark:text-sky-300">
            <ListTodo className="h-4.5 w-4.5" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              Cosas diarias
            </h2>
            <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
              {pendingCount}{" "}
              {pendingCount === 1 ? "pendiente" : "pendientes"} ·{" "}
              {completedCount}{" "}
              {completedCount === 1 ? "completada" : "completadas"}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setShowAddForm((v) => !v)}
          aria-expanded={showAddForm}
          className="inline-flex items-center gap-1 rounded-full bg-indigo-600 px-2.5 py-1 text-[11px] font-semibold text-white transition hover:bg-indigo-500 dark:bg-sky-600 dark:hover:bg-sky-500"
        >
          <Plus className="h-3 w-3" />
          <span>Tarea</span>
        </button>
      </div>

      {/* Inline Add Task Form */}
      {showAddForm && (
        <form
          onSubmit={handleAddTask}
          className="mb-3 space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900/70"
        >
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Nueva tarea diaria..."
            aria-label="Título de la tarea"
            required
            className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 outline-none placeholder:text-slate-400 focus:border-sky-400 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
          />

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={resetMode}
                onChange={(e) =>
                  setResetMode(e.target.value as DailyTaskResetMode)
                }
                aria-label="Regla de reinicio"
                className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-800 outline-none focus:border-sky-400 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              >
                <option value="daily">Reinicio diario (00:00)</option>
                <option value="scheduled">Reinicio a una hora</option>
                <option value="persistent">
                  Persistente (hasta eliminación manual)
                </option>
              </select>

              {resetMode === "scheduled" && (
                <div className="flex items-center gap-1.5">
                  <label
                    htmlFor="daily-task-reset-time"
                    className="text-[11px] font-medium text-slate-600 dark:text-slate-300"
                  >
                    Hora:
                  </label>
                  <input
                    id="daily-task-reset-time"
                    type="time"
                    value={resetTime}
                    onChange={(e) => setResetTime(e.target.value || "09:00")}
                    aria-label="Hora de reinicio"
                    className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-800 outline-none focus:border-sky-400 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                  />
                </div>
              )}
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="rounded-lg px-2 py-1 text-xs text-slate-500 hover:bg-slate-200 dark:text-slate-400 dark:hover:bg-slate-700"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="rounded-lg bg-indigo-600 px-3 py-1 text-xs font-semibold text-white transition hover:bg-indigo-500 dark:bg-sky-600 dark:hover:bg-sky-500"
              >
                Añadir
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Task List */}
      <div className="space-y-2 overflow-y-auto pr-0.5 max-h-[320px]">
        {activeTasks.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 py-6 text-center text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
            No hay tareas diarias todavía. Pulsa <strong>+ Tarea</strong> para
            añadir una.
          </div>
        ) : (
          activeTasks.map((task) => {
            const badge = getResetBadgeMeta(task);
            return (
              <div
                key={task.id}
                className="flex items-start justify-between gap-2.5 rounded-xl border border-slate-200/80 bg-slate-50/70 p-2.5 transition hover:border-slate-300 dark:border-slate-700/60 dark:bg-slate-900/45 dark:hover:border-slate-600"
              >
                <div className="flex min-w-0 flex-1 items-start gap-2.5">
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={task.completed}
                    aria-label={
                      task.completed
                        ? `Marcar "${task.title}" como pendiente`
                        : `Marcar "${task.title}" como completada`
                    }
                    onClick={() => handleToggleTask(task.id)}
                    className={`mt-0.5 flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-md border transition ${
                      task.completed
                        ? "border-emerald-500 bg-emerald-500 text-white dark:border-emerald-500 dark:bg-emerald-500"
                        : "border-slate-300 bg-white text-transparent hover:border-indigo-400 dark:border-slate-600 dark:bg-slate-800 dark:hover:border-sky-400"
                    }`}
                  >
                    <Check className="h-3 w-3 stroke-[2.5]" />
                  </button>

                  <div className="min-w-0 flex-1">
                    <p
                      className={`text-xs font-semibold leading-snug break-words transition ${
                        task.completed
                          ? "text-slate-400 line-through dark:text-slate-500"
                          : "text-slate-900 dark:text-slate-100"
                      }`}
                    >
                      {task.title}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${badge.cls}`}
                      >
                        {badge.icon}
                        <span>{badge.label}</span>
                      </span>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleDeleteTask(task.id)}
                  className="shrink-0 rounded p-1 text-slate-400 transition hover:bg-rose-50 hover:text-rose-500 dark:hover:bg-rose-500/15"
                  title="Eliminar tarea"
                  aria-label={`Eliminar ${task.title}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
