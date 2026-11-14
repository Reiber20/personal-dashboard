"use client";

import {
  CheckCircle2,
  ExternalLink,
  LogIn,
  LogOut,
  Play,
  Plus,
  RefreshCw,
  Settings,
  Trash2,
  Upload,
  X,
  Youtube,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { YouTubeChannel, YouTubeUserProfile, YouTubeVideo } from "@/types/news";

const YT_CHANNELS_STORAGE_KEY = "hola_rober_yt_channels_v1";

interface YouTubeSectionProps {
  searchQuery: string;
  compact?: boolean;
  onOpenFullTab?: () => void;
}

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

function formatViews(raw?: string): string {
  if (!raw) return "";
  const num = Number(raw);
  if (!Number.isFinite(num) || num <= 0) return "";
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M vistas`;
  if (num >= 1_000) return `${Math.round(num / 1_000)}K vistas`;
  return `${num} vistas`;
}

function parseTakeoutCsv(csvText: string): YouTubeChannel[] {
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const parsed: YouTubeChannel[] = [];
  for (const line of lines) {
    // Google Takeout subscriptions.csv format: Channel Id,Channel Url,Channel Title
    const match = line.match(/(UC[a-zA-Z0-9_-]{20,})/);
    if (!match?.[1]) continue;
    const channelId = match[1];
    const parts = line.split(",");
    const rawTitle = parts[parts.length - 1]?.replace(/^"|"$/g, "").trim();
    parsed.push({
      channelId,
      title: rawTitle && !rawTitle.startsWith("http") ? rawTitle : channelId,
    });
  }
  return parsed;
}

export function YouTubeSection({
  searchQuery,
  compact = false,
  onOpenFullTab,
}: YouTubeSectionProps) {
  const [channels, setChannels] = useState<YouTubeChannel[]>([]);
  const [videos, setVideos] = useState<YouTubeVideo[]>([]);
  const [authenticated, setAuthenticated] = useState(false);
  const [hasOAuthConfig, setHasOAuthConfig] = useState(false);
  const [user, setUser] = useState<YouTubeUserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const [selectedChannelId, setSelectedChannelId] = useState<string>("all");
  const [activeVideo, setActiveVideo] = useState<YouTubeVideo | null>(null);

  // Add channel inline UI
  const [showAddChannel, setShowAddChannel] = useState(false);
  const [channelInput, setChannelInput] = useState("");
  const [addingChannel, setAddingChannel] = useState(false);
  const [channelError, setChannelError] = useState("");

  // Google OAuth setup UI
  const [showOAuthSetup, setShowOAuthSetup] = useState(false);
  const [clientIdInput, setClientIdInput] = useState("");
  const [clientSecretInput, setClientSecretInput] = useState("");
  const [oauthMessage, setOauthMessage] = useState("");
  const [savingOAuth, setSavingOAuth] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(YT_CHANNELS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as YouTubeChannel[];
        if (Array.isArray(parsed)) setChannels(parsed);
      }
      const params = new URLSearchParams(window.location.search);
      const err = params.get("yt_error");
      if (err === "missing_oauth_config") {
        setShowOAuthSetup(true);
      } else if (err) {
        setOauthMessage(`Error al conectar con Google: ${err}`);
      }
    } catch {}
    setHydrated(true);
  }, []);

  const persistChannels = useCallback((next: YouTubeChannel[]) => {
    setChannels(next);
    try {
      localStorage.setItem(YT_CHANNELS_STORAGE_KEY, JSON.stringify(next));
    } catch {}
  }, []);

  const loadFeed = useCallback(
    async (channelList: YouTubeChannel[], forceSync = false) => {
      if (forceSync) setSyncing(true);
      else setLoading(true);
      try {
        const res = await fetch("/api/youtube", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          body: JSON.stringify({
            action: "status_or_feed",
            channels: channelList,
            forceSync,
          }),
        });
        if (res.ok) {
          const data = (await res.json()) as {
            authenticated: boolean;
            hasOAuthConfig: boolean;
            user: YouTubeUserProfile | null;
            channels: YouTubeChannel[];
            videos: YouTubeVideo[];
          };
          setAuthenticated(Boolean(data.authenticated));
          setHasOAuthConfig(Boolean(data.hasOAuthConfig));
          setUser(data.user || null);
          if (Array.isArray(data.channels)) {
            persistChannels(data.channels);
          }
          setVideos(Array.isArray(data.videos) ? data.videos : []);
        }
      } catch {
        // Ignore transient network errors
      } finally {
        setLoading(false);
        setSyncing(false);
      }
    },
    [persistChannels]
  );

  useEffect(() => {
    if (!hydrated) return;
    const params = new URLSearchParams(window.location.search);
    const shouldForceSync = params.get("yt_sync") === "1";
    loadFeed(channels, shouldForceSync);
    // Clean up only YouTube query params once consumed
    if (params.has("yt_sync") || params.has("yt_error")) {
      const cleanUrl = new URL(window.location.href);
      cleanUrl.searchParams.delete("yt_sync");
      cleanUrl.searchParams.delete("yt_error");
      window.history.replaceState({}, "", cleanUrl.pathname + cleanUrl.search);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  const handleGoogleConnect = () => {
    if (!hasOAuthConfig) {
      setShowOAuthSetup(true);
      return;
    }
    window.location.href = "/api/youtube/auth";
  };

  const handleSaveOAuthConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setOauthMessage("");
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
        setHasOAuthConfig(true);
        setShowOAuthSetup(false);
        window.location.href = "/api/youtube/auth";
      } else {
        const data = (await res.json()) as { error?: string };
        setOauthMessage(data.error || "No se pudo guardar la configuración.");
      }
    } catch {
      setOauthMessage("Error guardando credenciales OAuth.");
    } finally {
      setSavingOAuth(false);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch("/api/youtube", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "logout" }),
      });
    } catch {}
    setAuthenticated(false);
    setUser(null);
  };

  const handleAddChannel = async (e: React.FormEvent) => {
    e.preventDefault();
    setChannelError("");
    const query = channelInput.trim();
    if (!query) return;
    setAddingChannel(true);
    try {
      const res = await fetch("/api/youtube", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "resolve_channel", query }),
      });
      const data = (await res.json()) as {
        channel?: YouTubeChannel;
        error?: string;
      };
      if (!res.ok || !data.channel) {
        setChannelError(
          data.error || "No se encontró el canal. Prueba con @usuario o URL."
        );
        return;
      }
      const next = channels.some((c) => c.channelId === data.channel!.channelId)
        ? channels
        : [data.channel, ...channels];
      persistChannels(next);
      setChannelInput("");
      setShowAddChannel(false);
      await loadFeed(next, false);
    } catch {
      setChannelError("Error al añadir el canal.");
    } finally {
      setAddingChannel(false);
    }
  };

  const handleRemoveChannel = async (channelId: string) => {
    const next = channels.filter((c) => c.channelId !== channelId);
    persistChannels(next);
    if (selectedChannelId === channelId) setSelectedChannelId("all");
    await loadFeed(next, false);
  };

  const handleCsvImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const imported = parseTakeoutCsv(text);
      if (imported.length === 0) {
        setChannelError(
          "No se encontraron canales válidos en ese CSV de Google Takeout."
        );
        return;
      }
      const map = new Map<string, YouTubeChannel>();
      for (const ch of channels) map.set(ch.channelId, ch);
      for (const ch of imported) {
        if (!map.has(ch.channelId)) map.set(ch.channelId, ch);
      }
      const merged = Array.from(map.values());
      persistChannels(merged);
      await loadFeed(merged, false);
    } catch {
      setChannelError("No se pudo leer el archivo CSV.");
    } finally {
      e.target.value = "";
    }
  };

  const filteredVideos = useMemo(() => {
    const byChannel =
      selectedChannelId === "all"
        ? videos
        : videos.filter((v) => v.channelId === selectedChannelId);
    const q = searchQuery.trim().toLowerCase();
    if (!q) return byChannel;
    return byChannel.filter(
      (v) =>
        v.title.toLowerCase().includes(q) ||
        v.channelTitle.toLowerCase().includes(q)
    );
  }, [videos, selectedChannelId, searchQuery]);

  const visibleVideos = compact ? filteredVideos.slice(0, 6) : filteredVideos;

  const callbackOrigin =
    typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";

  return (
    <div className="space-y-4">
      {/* Session & Subscriptions Toolbar */}
      <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-xs dark:border-slate-700/70 dark:bg-slate-800/85">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-500/12 text-red-500">
              <Youtube className="h-5 w-5" />
            </div>
            <div>
              {authenticated && user ? (
                <>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-slate-900 dark:text-slate-100">
                      {user.name}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-300">
                      <CheckCircle2 className="h-3 w-3" />
                      Sesión permanente
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {channels.length} canales en tus suscripciones
                  </p>
                </>
              ) : (
                <>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    Suscripciones de YouTube
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {channels.length > 0
                      ? `${channels.length} canales guardados · Conecta Google para sincronizar todos`
                      : "Conecta tu cuenta de Google (sesión permanente) o añade canales"}
                  </p>
                </>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {authenticated ? (
              <>
                <button
                  type="button"
                  onClick={() => loadFeed(channels, true)}
                  disabled={syncing}
                  className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-900/70 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  <RefreshCw
                    className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`}
                  />
                  <span>Sincronizar</span>
                </button>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="inline-flex items-center gap-1.5 rounded-full border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-600 transition hover:bg-rose-100 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300 dark:hover:bg-rose-500/20"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  <span>Cerrar sesión</span>
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={handleGoogleConnect}
                  className="inline-flex items-center gap-1.5 rounded-full bg-red-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs transition hover:bg-red-500 active:scale-95"
                >
                  <LogIn className="h-3.5 w-3.5" />
                  <span>Conectar cuenta Google</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowOAuthSetup((v) => !v)}
                  className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-300 dark:hover:bg-slate-700"
                  title="Configurar credenciales OAuth de Google"
                >
                  <Settings className="h-3.5 w-3.5" />
                </button>
              </>
            )}

            <button
              type="button"
              onClick={() => setShowAddChannel((v) => !v)}
              className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Canal</span>
            </button>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-200 dark:hover:bg-slate-700"
              title="Importar suscripciones.csv de Google Takeout"
            >
              <Upload className="h-3.5 w-3.5" />
              <span>CSV</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              onChange={handleCsvImport}
              className="hidden"
            />
          </div>
        </div>

        {oauthMessage && (
          <p className="mt-2.5 text-xs font-medium text-rose-500">
            {oauthMessage}
          </p>
        )}

        {/* Google OAuth Credentials Setup Panel */}
        {showOAuthSetup && (
          <form
            onSubmit={handleSaveOAuthConfig}
            className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3.5 dark:border-slate-700 dark:bg-slate-900/70"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200">
                  Configurar conexión permanente con Google YouTube
                </h4>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Crea credenciales OAuth en{" "}
                  <a
                    href="https://console.cloud.google.com/apis/credentials"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-semibold text-indigo-600 underline dark:text-sky-300"
                  >
                    Google Cloud Console
                  </a>{" "}
                  (habilita <strong>YouTube Data API v3</strong>) y añade esta URL de redirección:
                </p>
                <code className="mt-1 block rounded bg-slate-200/80 px-2 py-1 text-[11px] text-slate-800 dark:bg-slate-800 dark:text-sky-200">
                  {callbackOrigin}/api/youtube/callback
                </code>
              </div>
              <button
                type="button"
                onClick={() => setShowOAuthSetup(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <input
                type="text"
                placeholder="GOOGLE_CLIENT_ID"
                value={clientIdInput}
                onChange={(e) => setClientIdInput(e.target.value)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs outline-none focus:border-sky-400 dark:border-slate-600 dark:bg-slate-800"
              />
              <input
                type="password"
                placeholder="GOOGLE_CLIENT_SECRET"
                value={clientSecretInput}
                onChange={(e) => setClientSecretInput(e.target.value)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs outline-none focus:border-sky-400 dark:border-slate-600 dark:bg-slate-800"
              />
            </div>
            <div className="mt-2.5 flex items-center justify-between gap-2">
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                También puedes definirlas en <code>.env.local</code> o Vercel.
              </span>
              <button
                type="submit"
                disabled={savingOAuth}
                className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-500 disabled:opacity-60"
              >
                {savingOAuth ? "Guardando..." : "Guardar y conectar"}
              </button>
            </div>
          </form>
        )}

        {/* Add single channel by @handle / URL */}
        {showAddChannel && (
          <form
            onSubmit={handleAddChannel}
            className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900/70"
          >
            <input
              type="text"
              value={channelInput}
              onChange={(e) => setChannelInput(e.target.value)}
              placeholder="@Veritasium, https://youtube.com/@DotCSV o ID UC..."
              className="min-w-[220px] flex-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs outline-none focus:border-sky-400 dark:border-slate-600 dark:bg-slate-800"
            />
            <button
              type="submit"
              disabled={addingChannel}
              className="rounded-lg bg-indigo-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-60 dark:bg-sky-600 dark:hover:bg-sky-500"
            >
              {addingChannel ? "Buscando..." : "Añadir canal"}
            </button>
            {channelError && (
              <p className="w-full text-xs text-rose-500">{channelError}</p>
            )}
          </form>
        )}
      </div>

      {/* Subscribed Channels Filter Strip */}
      {channels.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
          <button
            type="button"
            onClick={() => setSelectedChannelId("all")}
            className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold transition ${
              selectedChannelId === "all"
                ? "bg-red-600 text-white"
                : "border border-slate-200 bg-white text-slate-600 hover:border-slate-300 dark:border-slate-700/70 dark:bg-slate-800/85 dark:text-slate-300"
            }`}
          >
            Todos ({videos.length})
          </button>

          {channels.map((ch, idx) => {
            const active = selectedChannelId === ch.channelId;
            return (
              <div
                key={`${ch.channelId}-${idx}`}
                className={`inline-flex shrink-0 items-center gap-1 rounded-full border pl-2.5 pr-1.5 py-1 text-xs font-medium transition ${
                  active
                    ? "border-red-500 bg-red-50 text-red-700 dark:border-red-400/60 dark:bg-red-500/20 dark:text-red-200"
                    : "border-slate-200 bg-white text-slate-700 dark:border-slate-700/70 dark:bg-slate-800/85 dark:text-slate-300"
                }`}
              >
                <button
                  type="button"
                  onClick={() => setSelectedChannelId(ch.channelId)}
                  className="max-w-[140px] truncate"
                >
                  {ch.title}
                </button>
                <button
                  type="button"
                  onClick={() => handleRemoveChannel(ch.channelId)}
                  className="rounded-full p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700 dark:hover:bg-slate-700 dark:hover:text-slate-200"
                  title="Quitar canal"
                  aria-label={`Quitar ${ch.title}`}
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Video Grid */}
      {loading ? (
        <div
          className={`grid grid-cols-1 gap-4 sm:grid-cols-2 ${
            compact ? "" : "lg:grid-cols-3"
          }`}
        >
          {Array.from({ length: compact ? 4 : 6 }).map((_, idx) => (
            <div
              key={`yt-skel-${idx}`}
              className="h-64 animate-pulse rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-700/70 dark:bg-slate-800/85"
            >
              <div className="aspect-video rounded-xl bg-slate-200 dark:bg-slate-700/60" />
              <div className="mt-3 h-4 w-4/5 rounded bg-slate-200 dark:bg-slate-700/60" />
              <div className="mt-2 h-3 w-1/2 rounded bg-slate-200 dark:bg-slate-700/60" />
            </div>
          ))}
        </div>
      ) : filteredVideos.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center dark:border-slate-700/70 dark:bg-slate-800/75">
          <Youtube className="mx-auto mb-2 h-8 w-8 text-red-500/80" />
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            {channels.length === 0
              ? "Aún no hay canales conectados en YouTube"
              : "No hay vídeos que coincidan con el filtro"}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Pulsa <strong>Conectar cuenta Google</strong> para sincronizar tus suscripciones automáticamente (la sesión quedará iniciada siempre), añade un canal con <strong>+ Canal</strong> o importa el CSV de Google Takeout.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <div
            className={`grid grid-cols-1 ${
              compact ? "gap-3 sm:grid-cols-2" : "gap-4 sm:grid-cols-2 lg:grid-cols-3"
            }`}
          >
            {visibleVideos.map((video, idx) => (
            <article
              key={`${video.id}-${idx}`}
              className="group flex flex-col justify-between overflow-hidden rounded-2xl border border-slate-200/90 bg-white transition hover:border-slate-300 hover:shadow-md dark:border-slate-700/70 dark:bg-slate-800/85 dark:hover:border-slate-600"
            >
              <div>
                <button
                  type="button"
                  onClick={() => setActiveVideo(video)}
                  className="relative block aspect-video w-full overflow-hidden bg-slate-900 text-left"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={video.thumbnail}
                    alt={video.title}
                    loading="lazy"
                    className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
                  />
                  <span className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-90 transition group-hover:bg-black/35">
                    <span className="flex h-11 w-11 items-center justify-center rounded-full bg-red-600 text-white shadow-lg transition group-hover:scale-110">
                      <Play className="ml-0.5 h-5 w-5 fill-current" />
                    </span>
                  </span>
                </button>

                <div className="p-3.5">
                  <div className="mb-1.5 flex items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                    <span className="truncate font-semibold text-red-600 dark:text-red-400">
                      {video.channelTitle}
                    </span>
                    <span className="shrink-0">
                      {formatRelativeTime(video.publishedAt)}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => setActiveVideo(video)}
                    className="text-left"
                  >
                    <h3 className="line-clamp-2 text-[15px] font-bold leading-snug text-slate-900 transition group-hover:text-indigo-600 dark:text-slate-100 dark:group-hover:text-sky-300">
                      {video.title}
                    </h3>
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between border-t border-slate-100 px-3.5 py-2.5 text-xs dark:border-slate-700/60">
                <span className="text-[11px] text-slate-400">
                  {formatViews(video.views)}
                </span>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setActiveVideo(video)}
                    className="font-semibold text-indigo-600 hover:underline dark:text-sky-300"
                  >
                    Ver aquí
                  </button>
                  <a
                    href={video.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-medium text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
                  >
                    <span>YouTube</span>
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </div>
            </article>
            ))}
          </div>

          {compact && onOpenFullTab && filteredVideos.length > 0 && (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={onOpenFullTab}
                className="text-xs font-semibold text-indigo-600 hover:underline dark:text-sky-300"
              >
                Ver todos ({filteredVideos.length}) →
              </button>
            </div>
          )}
        </div>
      )}

      {/* Embedded Video Player Modal */}
      {activeVideo && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-xs"
          onClick={() => setActiveVideo(null)}
        >
          <div
            className="w-full max-w-3xl overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 border-b border-slate-800 px-4 py-3 text-white">
              <div className="min-w-0">
                <p className="truncate text-sm font-bold">{activeVideo.title}</p>
                <p className="text-xs text-slate-400">
                  {activeVideo.channelTitle}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveVideo(null)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"
                aria-label="Cerrar vídeo"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="aspect-video w-full bg-black">
              <iframe
                src={`https://www.youtube-nocookie.com/embed/${activeVideo.videoId}?autoplay=1`}
                title={activeVideo.title}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="h-full w-full border-0"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
