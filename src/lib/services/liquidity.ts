import { fetchBinancePublicJson } from "./binance";
import { fetchBybitOrderBookDepth } from "./bybit";
import type {
  DepthCurvePoint,
  ExchangeVenue,
  LiquidityWall,
  OrderBookLiquidityAnalysis,
} from "@/types/domain";

export interface RawVenueOrderBook {
  venue: ExchangeVenue;
  bids: Array<{ price: number; qty: number }>;
  asks: Array<{ price: number; qty: number }>;
}

function fmtUsdShort(n: number): string {
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

function fmtPriceClean(p: number): string {
  if (p >= 1000) return `$${p.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  if (p >= 1) return `$${p.toFixed(4)}`;
  if (p >= 0.01) return `$${p.toFixed(5)}`;
  return `$${p.toFixed(8)}`;
}

/**
 * Pure deterministic Order Book Buy & Sell Liquidity Analysis engine.
 * Computes cumulative depth curves, Bid/Ask imbalance gauges (±1%, ±2%, ±5%),
 * and clusters resting buy/sell liquidity walls across Binance Spot and/or Bybit Spot.
 */
export function computeOrderBookLiquidityAnalysis(params: {
  symbol: string;
  venueMode: "COMBINED" | "BINANCE" | "BYBIT";
  books: RawVenueOrderBook[];
  fetchedAt?: string;
}): OrderBookLiquidityAnalysis {
  const { symbol, venueMode, books } = params;
  const fetchedAt = params.fetchedAt || new Date().toISOString();

  const validBooks = books.filter((b) => b.bids.length > 0 && b.asks.length > 0);
  const venuesIncluded = validBooks.map((b) => b.venue);

  const venueBreakdown: OrderBookLiquidityAnalysis["venueBreakdown"] = {};
  const venueMids: number[] = [];

  for (const b of validBooks) {
    const sortedB = [...b.bids].sort((x, y) => y.price - x.price);
    const sortedA = [...b.asks].sort((x, y) => x.price - y.price);
    const vBestBid = sortedB[0]?.price ?? null;
    const vBestAsk = sortedA[0]?.price ?? null;
    const vMid = vBestBid && vBestAsk ? (vBestBid + vBestAsk) / 2 : null;
    const vSpread = vBestBid && vBestAsk && vMid ? ((vBestAsk - vBestBid) / vMid) * 100 : null;
    if (vMid) venueMids.push(vMid);

    const bid2 = vMid
      ? sortedB.filter((l) => l.price >= vMid * 0.98).reduce((s, l) => s + l.price * l.qty, 0)
      : 0;
    const ask2 = vMid
      ? sortedA.filter((l) => l.price <= vMid * 1.02).reduce((s, l) => s + l.price * l.qty, 0)
      : 0;

    const entry = {
      midPrice: vMid,
      bidDepth2PctUsd: Number(bid2.toFixed(2)),
      askDepth2PctUsd: Number(ask2.toFixed(2)),
      spreadPct: vSpread !== null ? Number(vSpread.toFixed(4)) : null,
    };
    if (b.venue === "BINANCE") venueBreakdown.binance = entry;
    if (b.venue === "BYBIT") venueBreakdown.bybit = entry;
  }

  if (validBooks.length === 0 || venueMids.length === 0) {
    return {
      symbol,
      venueMode,
      venuesIncluded: [],
      fetchedAt,
      midPrice: null,
      bestBid: null,
      bestAsk: null,
      spreadPct: null,
      bidDepth1PctUsd: 0,
      askDepth1PctUsd: 0,
      bidDepth2PctUsd: 0,
      askDepth2PctUsd: 0,
      bidDepth5PctUsd: 0,
      askDepth5PctUsd: 0,
      totalTrackedBidUsd: 0,
      totalTrackedAskUsd: 0,
      imbalanceRatio2Pct: 0,
      buyPressurePct2Pct: 50,
      imbalanceRatio5Pct: 0,
      buyPressurePct5Pct: 50,
      pressureBias: "BALANCED",
      summaryAr: "بيانات دفتر الأوامر غير متوفرة حالياً لهذا الزوج.",
      summaryEn: "Order book liquidity depth is currently unavailable for this Spot pair.",
      buyWalls: [],
      sellWalls: [],
      depthCurve: [],
      venueBreakdown,
    };
  }

  const midPrice = venueMids.reduce((a, b) => a + b, 0) / venueMids.length;

  // Flatten and filter out extreme spoof/dust outliers (>12% away from midPrice)
  const allBids = validBooks
    .flatMap((b) =>
      b.bids.map((lvl) => ({
        price: lvl.price,
        qty: lvl.qty,
        notionalUsd: lvl.price * lvl.qty,
        venue: b.venue,
      }))
    )
    .filter((l) => l.price > 0 && l.qty > 0 && l.price <= midPrice * 1.002 && l.price >= midPrice * 0.88)
    .sort((a, b) => b.price - a.price);

  const allAsks = validBooks
    .flatMap((b) =>
      b.asks.map((lvl) => ({
        price: lvl.price,
        qty: lvl.qty,
        notionalUsd: lvl.price * lvl.qty,
        venue: b.venue,
      }))
    )
    .filter((l) => l.price > 0 && l.qty > 0 && l.price >= midPrice * 0.998 && l.price <= midPrice * 1.12)
    .sort((a, b) => a.price - b.price);

  const bestBid = allBids[0]?.price ?? null;
  const bestAsk = allAsks[0]?.price ?? null;
  const rawSpread =
    bestBid && bestAsk && bestAsk >= bestBid ? ((bestAsk - bestBid) / midPrice) * 100 : 0;

  const sumBand = (
    levels: typeof allBids,
    predicate: (price: number) => boolean
  ): number => levels.filter((l) => predicate(l.price)).reduce((s, l) => s + l.notionalUsd, 0);

  const bidDepth1PctUsd = sumBand(allBids, (p) => p >= midPrice * 0.99);
  const askDepth1PctUsd = sumBand(allAsks, (p) => p <= midPrice * 1.01);
  const bidDepth2PctUsd = sumBand(allBids, (p) => p >= midPrice * 0.98);
  const askDepth2PctUsd = sumBand(allAsks, (p) => p <= midPrice * 1.02);
  const bidDepth5PctUsd = sumBand(allBids, (p) => p >= midPrice * 0.95);
  const askDepth5PctUsd = sumBand(allAsks, (p) => p <= midPrice * 1.05);

  const totalTrackedBidUsd = allBids.reduce((s, l) => s + l.notionalUsd, 0);
  const totalTrackedAskUsd = allAsks.reduce((s, l) => s + l.notionalUsd, 0);

  const calcImbalance = (bidUsd: number, askUsd: number) => {
    const tot = bidUsd + askUsd;
    if (tot <= 0) return { ratio: 0, buyPct: 50 };
    return {
      ratio: Number((((bidUsd - askUsd) / tot) * 100).toFixed(2)),
      buyPct: Number(((bidUsd / tot) * 100).toFixed(1)),
    };
  };

  const imb2 = calcImbalance(
    bidDepth2PctUsd > 0 ? bidDepth2PctUsd : totalTrackedBidUsd,
    askDepth2PctUsd > 0 ? askDepth2PctUsd : totalTrackedAskUsd
  );
  const imb5 = calcImbalance(
    bidDepth5PctUsd > 0 ? bidDepth5PctUsd : totalTrackedBidUsd,
    askDepth5PctUsd > 0 ? askDepth5PctUsd : totalTrackedAskUsd
  );

  let pressureBias: OrderBookLiquidityAnalysis["pressureBias"] = "BALANCED";
  if (imb2.ratio >= 25) pressureBias = "STRONG_BUY";
  else if (imb2.ratio >= 8) pressureBias = "BUY_BIAS";
  else if (imb2.ratio <= -25) pressureBias = "STRONG_SELL";
  else if (imb2.ratio <= -8) pressureBias = "SELL_BIAS";

  // Cluster walls into 0.25% price bands so adjacent ticks form realistic institutional walls
  const bandStep = midPrice * 0.0025;
  function detectWalls(
    levels: typeof allBids,
    side: "BUY" | "SELL",
    totalSideUsd: number
  ): LiquidityWall[] {
    if (levels.length === 0 || totalSideUsd <= 0 || bandStep <= 0) return [];
    const buckets = new Map<
      number,
      {
        weightedPriceSum: number;
        notionalUsd: number;
        baseQty: number;
        low: number;
        high: number;
        venues: Set<ExchangeVenue>;
      }
    >();

    for (const lvl of levels) {
      const idx = Math.floor(lvl.price / bandStep);
      const bLow = idx * bandStep;
      const bHigh = (idx + 1) * bandStep;
      const cur = buckets.get(idx) || {
        weightedPriceSum: 0,
        notionalUsd: 0,
        baseQty: 0,
        low: bLow,
        high: bHigh,
        venues: new Set<ExchangeVenue>(),
      };
      cur.weightedPriceSum += lvl.price * lvl.notionalUsd;
      cur.notionalUsd += lvl.notionalUsd;
      cur.baseQty += lvl.qty;
      cur.venues.add(lvl.venue);
      buckets.set(idx, cur);
    }

    const bucketArr = Array.from(buckets.values());
    const avgBucketUsd = totalSideUsd / Math.max(1, bucketArr.length);

    return bucketArr
      .sort((a, b) => b.notionalUsd - a.notionalUsd)
      .slice(0, 6)
      .map((b) => {
        const repPrice = b.notionalUsd > 0 ? b.weightedPriceSum / b.notionalUsd : (b.low + b.high) / 2;
        const pctFromMid = ((repPrice - midPrice) / midPrice) * 100;
        const sharePct = (b.notionalUsd / totalSideUsd) * 100;
        let strength: LiquidityWall["strength"] = "MODERATE";
        if (sharePct >= 18 || b.notionalUsd >= avgBucketUsd * 2.8) strength = "MAJOR";
        else if (sharePct >= 10 || b.notionalUsd >= avgBucketUsd * 1.75) strength = "STRONG";

        return {
          side,
          price: Number(repPrice.toPrecision(7)),
          priceBandLow: Number(b.low.toPrecision(7)),
          priceBandHigh: Number(b.high.toPrecision(7)),
          baseQty: Number(b.baseQty.toFixed(4)),
          notionalUsd: Number(b.notionalUsd.toFixed(2)),
          pctFromMid: Number(pctFromMid.toFixed(2)),
          shareOfBookPct: Number(sharePct.toFixed(1)),
          strength,
          venues: Array.from(b.venues),
        };
      });
  }

  const buyWalls = detectWalls(allBids, "BUY", totalTrackedBidUsd);
  const sellWalls = detectWalls(allAsks, "SELL", totalTrackedAskUsd);

  // Build cumulative Depth Curve (25 bid steps + midpoint + 25 ask steps)
  const minBidPrice = allBids.length > 0 ? Math.max(midPrice * 0.95, allBids[allBids.length - 1].price) : midPrice * 0.98;
  const maxAskPrice = allAsks.length > 0 ? Math.min(midPrice * 1.05, allAsks[allAsks.length - 1].price) : midPrice * 1.02;

  const depthCurve: DepthCurvePoint[] = [];
  const STEPS = 24;

  // Left side (bids from lowest price up to midPrice)
  const bidSpan = Math.max(midPrice - minBidPrice, midPrice * 0.005);
  for (let i = STEPS; i >= 1; i--) {
    const p = midPrice - (bidSpan * i) / STEPS;
    const cumBid = allBids.filter((b) => b.price >= p).reduce((s, b) => s + b.notionalUsd, 0);
    depthCurve.push({
      price: Number(p.toPrecision(7)),
      pctFromMid: Number((((p - midPrice) / midPrice) * 100).toFixed(2)),
      cumulativeBidUsd: Number(cumBid.toFixed(2)),
      cumulativeAskUsd: 0,
    });
  }

  // Midpoint
  depthCurve.push({
    price: Number(midPrice.toPrecision(7)),
    pctFromMid: 0,
    cumulativeBidUsd: 0,
    cumulativeAskUsd: 0,
  });

  // Right side (asks from midPrice up to highest price)
  const askSpan = Math.max(maxAskPrice - midPrice, midPrice * 0.005);
  for (let i = 1; i <= STEPS; i++) {
    const p = midPrice + (askSpan * i) / STEPS;
    const cumAsk = allAsks.filter((a) => a.price <= p).reduce((s, a) => s + a.notionalUsd, 0);
    depthCurve.push({
      price: Number(p.toPrecision(7)),
      pctFromMid: Number((((p - midPrice) / midPrice) * 100).toFixed(2)),
      cumulativeBidUsd: 0,
      cumulativeAskUsd: Number(cumAsk.toFixed(2)),
    });
  }

  const topBuy = buyWalls[0];
  const topSell = sellWalls[0];
  const biasTextAr =
    pressureBias === "STRONG_BUY"
      ? "تفوق شرائي قوي في دفتر الأوامر الفوري"
      : pressureBias === "BUY_BIAS"
        ? "ميل شرائي معتدل في السيولة القريبة"
        : pressureBias === "STRONG_SELL"
          ? "ضغط عرض بيعي مرتفع فوق السعر الحالي"
          : pressureBias === "SELL_BIAS"
            ? "ميل بيعي معتدل في السيولة القريبة"
            : "توازن نسبي بين سيولة الطلبات والعروض";

  const biasTextEn =
    pressureBias === "STRONG_BUY"
      ? "Strong Spot bid-side absorption dominance"
      : pressureBias === "BUY_BIAS"
        ? "Moderate buyer liquidity bias near mid-price"
        : pressureBias === "STRONG_SELL"
          ? "Heavy resting ask-side supply overhead"
          : pressureBias === "SELL_BIAS"
            ? "Moderate seller supply bias near mid-price"
            : "Relatively balanced Spot bid/ask order book";

  const summaryAr = `${biasTextAr} (نسبة سيولة الشراء ضمن ±2%: ${imb2.buyPct}%). ${
    topBuy
      ? `أقوى جدار شراء متمركز قرب ${fmtPriceClean(topBuy.price)} (${topBuy.pctFromMid}%) بحجم ${fmtUsdShort(topBuy.notionalUsd)}. `
      : ""
  }${
    topSell
      ? `أقوى جدار بيع متمركز قرب ${fmtPriceClean(topSell.price)} (+${topSell.pctFromMid}%) بحجم ${fmtUsdShort(topSell.notionalUsd)}.`
      : ""
  }`;

  const summaryEn = `${biasTextEn} (±2% Bid Share: ${imb2.buyPct}%). ${
    topBuy
      ? `Largest Buy Wall sits near ${fmtPriceClean(topBuy.price)} (${topBuy.pctFromMid}%) with ${fmtUsdShort(topBuy.notionalUsd)}. `
      : ""
  }${
    topSell
      ? `Largest Sell Wall sits near ${fmtPriceClean(topSell.price)} (+${topSell.pctFromMid}%) with ${fmtUsdShort(topSell.notionalUsd)}.`
      : ""
  }`;

  return {
    symbol,
    venueMode,
    venuesIncluded,
    fetchedAt,
    midPrice: Number(midPrice.toPrecision(8)),
    bestBid,
    bestAsk,
    spreadPct: Number(rawSpread.toFixed(4)),
    bidDepth1PctUsd: Number(bidDepth1PctUsd.toFixed(2)),
    askDepth1PctUsd: Number(askDepth1PctUsd.toFixed(2)),
    bidDepth2PctUsd: Number(bidDepth2PctUsd.toFixed(2)),
    askDepth2PctUsd: Number(askDepth2PctUsd.toFixed(2)),
    bidDepth5PctUsd: Number(bidDepth5PctUsd.toFixed(2)),
    askDepth5PctUsd: Number(askDepth5PctUsd.toFixed(2)),
    totalTrackedBidUsd: Number(totalTrackedBidUsd.toFixed(2)),
    totalTrackedAskUsd: Number(totalTrackedAskUsd.toFixed(2)),
    imbalanceRatio2Pct: imb2.ratio,
    buyPressurePct2Pct: imb2.buyPct,
    imbalanceRatio5Pct: imb5.ratio,
    buyPressurePct5Pct: imb5.buyPct,
    pressureBias,
    summaryAr,
    summaryEn,
    buyWalls,
    sellWalls,
    depthCurve,
    venueBreakdown,
  };
}

async function fetchRawBinanceDepth(symbol: string, limit = 500): Promise<RawVenueOrderBook | null> {
  try {
    const resp = await fetchBinancePublicJson<{
      bids: Array<[string, string]>;
      asks: Array<[string, string]>;
    }>(`/api/v3/depth?symbol=${encodeURIComponent(symbol)}&limit=${limit}`, 9000);

    const bids = (resp.data.bids || [])
      .map(([p, q]) => ({ price: parseFloat(p), qty: parseFloat(q) }))
      .filter((x) => Number.isFinite(x.price) && x.price > 0 && Number.isFinite(x.qty) && x.qty > 0);
    const asks = (resp.data.asks || [])
      .map(([p, q]) => ({ price: parseFloat(p), qty: parseFloat(q) }))
      .filter((x) => Number.isFinite(x.price) && x.price > 0 && Number.isFinite(x.qty) && x.qty > 0);

    if (bids.length === 0 || asks.length === 0) return null;
    return { venue: "BINANCE", bids, asks };
  } catch {
    return null;
  }
}

async function fetchRawBybitDepth(symbol: string, limit = 200): Promise<RawVenueOrderBook | null> {
  try {
    const depth = await fetchBybitOrderBookDepth(symbol, limit);
    if (depth.topBids.length === 0 || depth.topAsks.length === 0) return null;
    return {
      venue: "BYBIT",
      bids: depth.topBids.map((b) => ({ price: b.price, qty: b.qty })),
      asks: depth.topAsks.map((a) => ({ price: a.price, qty: a.qty })),
    };
  } catch {
    return null;
  }
}

export async function fetchAssetOrderBookLiquidity(
  symbolParam: string,
  venueMode: "COMBINED" | "BINANCE" | "BYBIT" = "COMBINED"
): Promise<OrderBookLiquidityAnalysis> {
  const safeSymbol = symbolParam.toUpperCase().endsWith("USDT")
    ? symbolParam.toUpperCase().replace(/[^A-Z0-9]/g, "")
    : `${symbolParam.toUpperCase().replace(/[^A-Z0-9]/g, "")}USDT`;

  const books: RawVenueOrderBook[] = [];

  if (venueMode === "BINANCE") {
    const b = await fetchRawBinanceDepth(safeSymbol, 500);
    if (b) books.push(b);
  } else if (venueMode === "BYBIT") {
    const y = await fetchRawBybitDepth(safeSymbol, 200);
    if (y) books.push(y);
  } else {
    const [b, y] = await Promise.all([
      fetchRawBinanceDepth(safeSymbol, 500),
      fetchRawBybitDepth(safeSymbol, 200),
    ]);
    if (b) books.push(b);
    if (y) books.push(y);
  }

  return computeOrderBookLiquidityAnalysis({
    symbol: safeSymbol,
    venueMode,
    books,
  });
}
