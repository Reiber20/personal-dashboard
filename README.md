# Pulso Diario — Dashboard Personal de Noticias y Tendencias (PWA)

Dashboard personal *mobile-first* e instalable como aplicación (PWA) en Android, iOS y escritorio.

## Qué incluye
- **Trending Topics del día (España)** mediante Google Trends RSS con noticias relacionadas.
- **Noticias relevantes y por ámbitos** (`Hoy`, `Tech & IA`, `Actualidad`, `Ciencia`, `Deportes`, `Cultura`).
- **Fuentes personalizables**: activa/desactiva medios o añade tus propios feeds RSS desde la app.
- **Guardados (Leer más tarde)** y **Modo oscuro/claro** guardados localmente en tu dispositivo.
- **PWA instalable**: `manifest.webmanifest`, iconos PNG y Service Worker (`public/sw.js`).

## Ejecutar en local
```powershell
npm.cmd install
npm.cmd run dev
```
Abre `http://localhost:3000`.

## Desplegar gratis y descargar en tu móvil
1. Sube esta carpeta a un repositorio en **GitHub**.
2. Impórtalo en **Vercel** (plan gratuito Hobby) y pulsa **Deploy**.
3. Abre la URL HTTPS en tu móvil:
   - **Android (Chrome):** Menú `⋮` -> **Instalar aplicación**.
   - **iPhone / iPad (Safari):** Botón **Compartir** -> **Añadir a pantalla de inicio**.
