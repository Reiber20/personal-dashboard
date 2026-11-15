import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import {
  fetchUserProfile,
  getOAuthCredentials,
  normalizeSession,
  parseCookieJson,
  refreshAccessToken,
  StoredOAuthConfig,
  StoredYouTubeSession,
  YT_OAUTH_CFG_COOKIE,
  YT_SESSION_COOKIE,
} from "@/lib/youtube";

export const dynamic = "force-dynamic";

function getSupabaseConfig() {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!url || !serviceKey) return null;
  return { url: url.replace(/\/$/, ""), serviceKey };
}

async function getAuthenticatedEmail(): Promise<string | null> {
  const cookieStore = await cookies();
  const raw = parseCookieJson<StoredYouTubeSession>(
    cookieStore.get(YT_SESSION_COOKIE)?.value
  );
  const session = normalizeSession(raw);
  const cookieEmail =
    session?.user?.email ||
    session?.email ||
    raw?.user?.email ||
    raw?.email;
  if (cookieEmail) {
    return cookieEmail.trim().toLowerCase();
  }

  if (!session) return null;

  let token = session.access_token;
  if ((!token || Date.now() >= session.expiry_date - 60_000) && session.refresh_token) {
    const cfgCookie = parseCookieJson<StoredOAuthConfig>(
      cookieStore.get(YT_OAUTH_CFG_COOKIE)?.value
    );
    const creds = getOAuthCredentials(cfgCookie);
    if (creds) {
      const refreshed = await refreshAccessToken(
        session.refresh_token,
        creds.clientId,
        creds.clientSecret
      );
      if (refreshed?.accessToken) {
        token = refreshed.accessToken;
      }
    }
  }

  if (!token) return null;
  const profile = await fetchUserProfile(token);
  return profile?.email ? profile.email.trim().toLowerCase() : null;
}

export async function GET() {
  const cfg = getSupabaseConfig();
  const email = await getAuthenticatedEmail();

  if (!cfg || !email) {
    return NextResponse.json({ synced: false, data: null });
  }

  try {
    const res = await fetch(
      `${cfg.url}/rest/v1/user_sync?email=eq.${encodeURIComponent(email)}&select=data,updated_at`,
      {
        headers: {
          apikey: cfg.serviceKey,
          Authorization: `Bearer ${cfg.serviceKey}`,
        },
        cache: "no-store",
      }
    );

    if (!res.ok) {
      return NextResponse.json({ synced: false, data: null }, { status: 500 });
    }

    const rows = (await res.json()) as Array<{
      data?: Record<string, unknown>;
      updated_at?: string;
    }>;

    return NextResponse.json({
      synced: true,
      email,
      data: rows[0]?.data || null,
      updatedAt: rows[0]?.updated_at || null,
    });
  } catch {
    return NextResponse.json({ synced: false, data: null }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const cfg = getSupabaseConfig();
  const email = await getAuthenticatedEmail();

  if (!cfg || !email) {
    return NextResponse.json(
      { ok: false, error: "No autenticado o Supabase no configurado." },
      { status: 401 }
    );
  }

  try {
    const body = (await req.json()) as { data?: Record<string, unknown> };
    if (!body.data || typeof body.data !== "object") {
      return NextResponse.json(
        { ok: false, error: "Payload inválido." },
        { status: 400 }
      );
    }

    const res = await fetch(`${cfg.url}/rest/v1/user_sync`, {
      method: "POST",
      headers: {
        apikey: cfg.serviceKey,
        Authorization: `Bearer ${cfg.serviceKey}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify({
        email,
        data: body.data,
        updated_at: new Date().toISOString(),
      }),
    });

    if (!res.ok) {
      return NextResponse.json({ ok: false }, { status: res.status });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
