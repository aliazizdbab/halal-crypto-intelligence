import { NextResponse } from "next/server";
import { fetchAssetOrderBookLiquidity } from "@/lib/services/liquidity";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ symbol: string }> }
) {
  try {
    const { symbol } = await context.params;
    const { searchParams } = new URL(request.url);
    const venueRaw = (searchParams.get("venue") || "COMBINED").toUpperCase();
    const venueMode =
      venueRaw === "BINANCE" || venueRaw === "BYBIT" ? venueRaw : "COMBINED";

    const liquidity = await fetchAssetOrderBookLiquidity(symbol, venueMode);
    return NextResponse.json({ ok: true, liquidity });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed to analyze order book liquidity" },
      { status: 502 }
    );
  }
}
