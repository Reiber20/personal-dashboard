import { NextRequest, NextResponse } from "next/server";
import { DEFAULT_SOURCES } from "@/config/sources";
import { deduplicateAndSortNews, fetchFeedItems } from "@/lib/rss";
import { CategoryId, NewsSource } from "@/types/news";

export const dynamic = "force-dynamic"; // 15 minutes server cache

async function handleNewsRequest(
  category: CategoryId,
  disabledIds: Set<string>,
  customSources: NewsSource[]
) {
  const allSources = [...DEFAULT_SOURCES, ...customSources].filter(
    (s) => !disabledIds.has(s.id)
  );

  const sourcesToFetch =
    category === "hoy"
      ? allSources.filter((s) => s.isTopSource || s.isCustom)
      : allSources.filter((s) => s.category === category);

  const results = await Promise.all(
    sourcesToFetch.map((source) =>
      fetchFeedItems(source, category === "hoy" ? 8 : 14)
    )
  );

  const deduped = deduplicateAndSortNews(results.flat());
  const filtered =
    category === "hoy"
      ? deduped
      : deduped.filter((item) => item.category === category);

  const items = filtered.slice(0, category === "hoy" ? 36 : 48);

  return NextResponse.json(
    {
      category,
      count: items.length,
      updatedAt: new Date().toISOString(),
      items,
    },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    }
  );
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const category = (searchParams.get("category") || "hoy") as CategoryId;
  const disabledParam = searchParams.get("disabled") || "";
  const disabledIds = new Set(
    disabledParam
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  );

  return handleNewsRequest(category, disabledIds, []);
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      category?: CategoryId;
      disabledIds?: string[];
      customSources?: NewsSource[];
    };
    const category = body.category || "hoy";
    const disabledIds = new Set(body.disabledIds || []);
    const customSources = (body.customSources || []).filter(
      (s) => s.url?.startsWith("http") && s.name && s.category
    );

    return handleNewsRequest(category, disabledIds, customSources);
  } catch {
    return NextResponse.json(
      { error: "Invalid request payload" },
      { status: 400 }
    );
  }
}
