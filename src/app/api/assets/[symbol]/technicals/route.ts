import { NextResponse } from "next/server";
import { fetchBinanceKlines, SUPPORTED_TIMEFRAMES, type SupportedTimeframe } from "@/lib/services/binance";
import { fetchBybitKlines } from "@/lib/services/bybit";
import { analyzeTechnicals } from "@/lib/services/technical-analysis";
import { getAssetDetail } from "@/lib/services/repository";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ symbol: string }> }
) {
  try {
    const { symbol } = await context.params;
    const { searchParams } = new URL(request.url);
    const tfParam = (searchParams.get("timeframe") || "4h") as SupportedTimeframe;
    const timeframe: SupportedTimeframe = SUPPORTED_TIMEFRAMES.includes(tfParam) ? tfParam : "4h";
    const venueParam = (searchParams.get("venue") || "AUTO").toUpperCase();
    const limit = Math.min(500, Math.max(100, Number(searchParams.get("limit") || "250") || 250));

    const safeSymbol = symbol.toUpperCase().endsWith("USDT")
      ? symbol.toUpperCase()
      : `${symbol.toUpperCase()}USDT`;

    const detail = getAssetDetail(safeSymbol);
    const preferBybit =
      venueParam === "BYBIT" ||
      (venueParam === "AUTO" &&
        detail?.overview.binanceStatus !== "TRADING" &&
        detail?.overview.bybitStatus === "TRADING");

    let klines: { candles: Awaited<ReturnType<typeof fetchBinanceKlines>>["candles"]; source: string; fetchedAt: string };

    if (preferBybit) {
      try {
        klines = await fetchBybitKlines(safeSymbol, timeframe, limit);
      } catch {
        klines = await fetchBinanceKlines(safeSymbol, timeframe, limit);
      }
    } else {
      try {
        klines = await fetchBinanceKlines(safeSymbol, timeframe, limit);
      } catch {
        klines = await fetchBybitKlines(safeSymbol, timeframe, limit);
      }
    }

    const analysis = analyzeTechnicals({
      symbol: safeSymbol,
      timeframe,
      candles: klines.candles,
      quoteVolume24h: detail?.overview.quoteVolume24h ?? null,
      source: klines.source,
      fetchedAt: klines.fetchedAt,
    });

    return NextResponse.json({ ok: true, technicals: analysis });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed to compute technical indicators" },
      { status: 502 }
    );
  }
}
