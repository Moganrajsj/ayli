import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { serializeProductCard } from "@/lib/catalog";
import { getSearchSuggestions, getTrendingSearch } from "@/lib/search";

function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max);
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const rawQuery = searchParams.get("q") ?? "";
  const query = rawQuery.trim().slice(0, 80);
  const cacheHeaders = {
    "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
  };
  const limit = clamp(Number(searchParams.get("limit")) || 5, 1, 12);
  const categoryLimit = clamp(Number(searchParams.get("categoryLimit")) || 4, 1, 8);

  if (!query) {
    const trending = await getTrendingSearch();
    return NextResponse.json(
      {
        query: "",
        products: trending.products.map(serializeProductCard),
        categories: trending.categories,
        collections: trending.collections,
      },
      { headers: cacheHeaders },
    );
  }

  const suggestions = await getSearchSuggestions(query, limit, categoryLimit);
  return NextResponse.json(
    {
      query,
      products: suggestions.products.map(serializeProductCard),
      categories: suggestions.categories,
      collections: suggestions.collections,
    },
    { headers: cacheHeaders },
  );
}