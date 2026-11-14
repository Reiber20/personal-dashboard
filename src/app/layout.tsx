import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Hola Rober — Noticias, Clima y Tendencias",
  description:
    "Tu dashboard personal de noticias, clima y trending topics diarios.",
  applicationName: "Hola Rober",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Hola Rober",
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8fafc" },
    { media: "(prefers-color-scheme: dark)", color: "#0f172a" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body className="bg-slate-50 text-slate-900 antialiased dark:bg-[#0f172a] dark:text-slate-100">
        {children}
      </body>
    </html>
  );
}
