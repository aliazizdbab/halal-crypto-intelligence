import { NextResponse } from "next/server";
import { getAssetDetail } from "@/lib/services/repository";
import { fetchBinanceOrderBookDepth } from "@/lib/services/binance";
import { getGithubRepoMetrics } from "@/lib/services/market-enrichment";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ symbol: string }> }
) {
  try {
    const { symbol } = await context.params;
    const detail = getAssetDetail(symbol);
    if (!detail) {
      return NextResponse.json({ ok: false, error: "Asset not found" }, { status: 404 });
    }

    const [orderBook, github] = await Promise.all([
      fetchBinanceOrderBookDepth(detail.overview.symbol, 50).catch(() => null),
      getGithubRepoMetrics(detail.overview.githubRepo).catch(() => null),
    ]);

    return NextResponse.json({
      ok: true,
      detail,
      orderBook,
      github,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed to load asset detail" },
      { status: 500 }
    );
  }
}
