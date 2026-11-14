import { NextResponse } from "next/server";
import { GOOGLE_TRENDS_ES_URL } from "@/config/sources";
import { fetchGoogleTrends, fetchXTrendsSpain } from "@/lib/rss";
import { TrendTopic } from "@/types/news";

export const dynamic = "force-dynamic";

export async function GET() {
  const [googleTrends, xTrends] = await Promise.all([
    fetchGoogleTrends(GOOGLE_TRENDS_ES_URL, 12),
    fetchXTrendsSpain(12),
  ]);

  const trends: TrendTopic[] = [];
  const maxLen = Math.max(xTrends.length, googleTrends.length);
  for (let i = 0; i < maxLen; i++) {
    if (i < xTrends.length) trends.push(xTrends[i]);
    if (i < googleTrends.length) trends.push(googleTrends[i]);
  }

  return NextResponse.json({
    region: "ES",
    count: trends.length,
    updatedAt: new Date().toISOString(),
    trends,
    googleTrends,
    xTrends,
  });
}
