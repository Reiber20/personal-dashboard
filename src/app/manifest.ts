import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Hola Rober — Noticias y Clima",
    short_name: "Hola Rober",
    description:
      "Tu dashboard personal de noticias relevantes, trending topics e intereses del día.",
    start_url: "/",
    display: "standalone",
    background_color: "#0f172a",
    theme_color: "#38bdf8",
    orientation: "portrait-primary",
    lang: "es",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
