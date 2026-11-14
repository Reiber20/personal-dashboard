"use client";

import { Download, Share, X } from "lucide-react";
import { useEffect, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function InstallAppButton() {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [showIosGuide, setShowIosGuide] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }

    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
    setIsInstalled(standalone);

    const ua = window.navigator.userAgent.toLowerCase();
    const iosDevice = /iphone|ipad|ipod/.test(ua);
    setIsIos(iosDevice);

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const onInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (isInstalled) return null;

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === "accepted") {
        setDeferredPrompt(null);
      }
      return;
    }
    setShowIosGuide(true);
  };

  return (
    <>
      <button
        type="button"
        onClick={handleInstallClick}
        className="inline-flex items-center gap-1.5 rounded-full bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-indigo-500 active:scale-95"
        title="Descargar e instalar como aplicación"
      >
        <Download className="h-3.5 w-3.5" />
        <span>Instalar</span>
      </button>

      {showIosGuide && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 backdrop-blur-xs sm:items-center"
          onClick={() => setShowIosGuide(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-700/80 dark:bg-slate-800"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-bold">Instalar Hola Rober</h3>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-300">
                  Añádela a tu pantalla de inicio para usarla como app nativa.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowIosGuide(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"
                aria-label="Cerrar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {isIos ? (
              <ol className="mt-4 space-y-3 text-sm text-slate-700 dark:text-slate-200">
                <li className="flex items-center gap-2.5">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700 dark:bg-sky-900/60 dark:text-sky-300">
                    1
                  </span>
                  <span>
                    Pulsa el botón <Share className="inline h-4 w-4 text-sky-400" />{" "}
                    <strong>Compartir</strong> en la barra de Safari.
                  </span>
                </li>
                <li className="flex items-center gap-2.5">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700 dark:bg-sky-900/60 dark:text-sky-300">
                    2
                  </span>
                  <span>
                    Selecciona <strong>&ldquo;Añadir a pantalla de inicio&rdquo;</strong> y confirma.
                  </span>
                </li>
              </ol>
            ) : (
              <div className="mt-4 space-y-2 text-sm text-slate-700 dark:text-slate-200">
                <p>
                  En <strong>Chrome / Edge</strong> (móvil o PC): abre el menú del navegador
                  (<strong>⋮</strong>) y elige <strong>&ldquo;Instalar aplicación&rdquo;</strong> o{" "}
                  <strong>&ldquo;Añadir a pantalla de inicio&rdquo;</strong>.
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Nota: la instalación directa requiere abrir la web en HTTPS (por ejemplo, tras desplegarla en Vercel) o en <code>localhost</code>.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
