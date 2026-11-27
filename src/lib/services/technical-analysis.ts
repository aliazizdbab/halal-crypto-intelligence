import type { BinanceCandle } from "./binance";
import type { TechnicalIndicatorSummary } from "@/types/domain";

export function calculateSMA(values: number[], period: number): number | null {
  if (values.length < period || period <= 0) return null;
  let sum = 0;
  for (let i = values.length - period; i < values.length; i++) {
    sum += values[i];
  }
  return sum / period;
}

export function calculateEMASeries(values: number[], period: number): number[] {
  if (values.length < period || period <= 0) return [];
  const k = 2 / (period + 1);
  let ema = 0;
  for (let i = 0; i < period; i++) {
    ema += values[i];
  }
  ema /= period;
  const series: number[] = [ema];
  for (let i = period; i < values.length; i++) {
    ema = values[i] * k + ema * (1 - k);
    series.push(ema);
  }
  return series;
}

export function calculateEMA(values: number[], period: number): number | null {
  const series = calculateEMASeries(values, period);
  return series.length > 0 ? series[series.length - 1] : null;
}

export function calculateRSI(closes: number[], period = 14): number | null {
  if (closes.length <= period) return null;
  let gainSum = 0;
  let lossSum = 0;

  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gainSum += diff;
    else lossSum -= diff;
  }

  let avgGain = gainSum / period;
  let avgLoss = lossSum / period;

  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

export function calculateMACD(
  closes: number[],
  fast = 12,
  slow = 26,
  signalPeriod = 9
): { macd: number; signal: number; histogram: number } | null {
  if (closes.length < slow + signalPeriod) return null;
  const fastSeries = calculateEMASeries(closes, fast);
  const slowSeries = calculateEMASeries(closes, slow);

  // Align tails: fastSeries starts at index (fast-1), slowSeries starts at (slow-1)
  const offset = slow - fast;
  const macdLine: number[] = [];
  for (let i = 0; i < slowSeries.length; i++) {
    macdLine.push(fastSeries[i + offset] - slowSeries[i]);
  }
  const signalSeries = calculateEMASeries(macdLine, signalPeriod);
  if (signalSeries.length === 0) return null;

  const macd = macdLine[macdLine.length - 1];
  const signal = signalSeries[signalSeries.length - 1];
  return { macd, signal, histogram: macd - signal };
}

export function calculateBollingerBands(
  closes: number[],
  period = 20,
  stdDevMult = 2
): { upper: number; middle: number; lower: number; bandwidthPct: number } | null {
  if (closes.length < period) return null;
  const slice = closes.slice(closes.length - period);
  const middle = slice.reduce((a, b) => a + b, 0) / period;
  const variance = slice.reduce((acc, v) => acc + (v - middle) ** 2, 0) / period;
  const stdDev = Math.sqrt(variance);
  const upper = middle + stdDevMult * stdDev;
  const lower = middle - stdDevMult * stdDev;
  const bandwidthPct = middle > 0 ? ((upper - lower) / middle) * 100 : 0;
  return { upper, middle, lower, bandwidthPct };
}

export function calculateATR(candles: BinanceCandle[], period = 14): number | null {
  if (candles.length <= period) return null;
  const trs: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const prevClose = candles[i - 1].close;
    const tr = Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - prevClose),
      Math.abs(candles[i].low - prevClose)
    );
    trs.push(tr);
  }
  let atr = trs.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < trs.length; i++) {
    atr = (atr * (period - 1) + trs[i]) / period;
  }
  return atr;
}

export function calculateADX(candles: BinanceCandle[], period = 14): number | null {
  if (candles.length < period * 2 + 1) return null;
  const plusDM: number[] = [];
  const minusDM: number[] = [];
  const trList: number[] = [];

  for (let i = 1; i < candles.length; i++) {
    const upMove = candles[i].high - candles[i - 1].high;
    const downMove = candles[i - 1].low - candles[i].low;
    plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);
    trList.push(
      Math.max(
        candles[i].high - candles[i].low,
        Math.abs(candles[i].high - candles[i - 1].close),
        Math.abs(candles[i].low - candles[i - 1].close)
      )
    );
  }

  let smoothTR = trList.slice(0, period).reduce((a, b) => a + b, 0);
  let smoothPlus = plusDM.slice(0, period).reduce((a, b) => a + b, 0);
  let smoothMinus = minusDM.slice(0, period).reduce((a, b) => a + b, 0);

  const dxValues: number[] = [];
  for (let i = period; i < trList.length; i++) {
    if (i > period) {
      smoothTR = smoothTR - smoothTR / period + trList[i];
      smoothPlus = smoothPlus - smoothPlus / period + plusDM[i];
      smoothMinus = smoothMinus - smoothMinus / period + minusDM[i];
    }
    const plusDI = smoothTR > 0 ? (100 * smoothPlus) / smoothTR : 0;
    const minusDI = smoothTR > 0 ? (100 * smoothMinus) / smoothTR : 0;
    const diSum = plusDI + minusDI;
    const dx = diSum > 0 ? (100 * Math.abs(plusDI - minusDI)) / diSum : 0;
    dxValues.push(dx);
  }

  if (dxValues.length < period) return null;
  let adx = dxValues.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < dxValues.length; i++) {
    adx = (adx * (period - 1) + dxValues[i]) / period;
  }
  return adx;
}

export function calculateVWAP(candles: BinanceCandle[], lookback = 50): number | null {
  const slice = candles.slice(-lookback);
  if (slice.length === 0) return null;
  let pvSum = 0;
  let volSum = 0;
  for (const c of slice) {
    const typical = (c.high + c.low + c.close) / 3;
    pvSum += typical * c.volume;
    volSum += c.volume;
  }
  return volSum > 0 ? pvSum / volSum : null;
}

function clusterLevels(levels: number[], tolerancePct = 0.015): number[] {
  if (levels.length === 0) return [];
  const sorted = [...levels].sort((a, b) => a - b);
  const clusters: number[][] = [[sorted[0]]];
  for (let i = 1; i < sorted.length; i++) {
    const lastCluster = clusters[clusters.length - 1];
    const ref = lastCluster[lastCluster.length - 1];
    if ((sorted[i] - ref) / ref <= tolerancePct) {
      lastCluster.push(sorted[i]);
    } else {
      clusters.push([sorted[i]]);
    }
  }
  return clusters
    .sort((a, b) => b.length - a.length)
    .slice(0, 4)
    .map((c) => c.reduce((x, y) => x + y, 0) / c.length)
    .sort((a, b) => a - b);
}

export function detectSupportResistance(
  candles: BinanceCandle[],
  latestClose: number
): { supportLevels: number[]; resistanceLevels: number[] } {
  const swingLows: number[] = [];
  const swingHighs: number[] = [];

  for (let i = 3; i < candles.length - 3; i++) {
    const c = candles[i];
    const isLow =
      c.low <= candles[i - 1].low &&
      c.low <= candles[i - 2].low &&
      c.low <= candles[i - 3].low &&
      c.low <= candles[i + 1].low &&
      c.low <= candles[i + 2].low &&
      c.low <= candles[i + 3].low;
    const isHigh =
      c.high >= candles[i - 1].high &&
      c.high >= candles[i - 2].high &&
      c.high >= candles[i - 3].high &&
      c.high >= candles[i + 1].high &&
      c.high >= candles[i + 2].high &&
      c.high >= candles[i + 3].high;

    if (isLow && c.low < latestClose) swingLows.push(c.low);
    if (isHigh && c.high > latestClose) swingHighs.push(c.high);
  }

  return {
    supportLevels: clusterLevels(swingLows).slice(-3),
    resistanceLevels: clusterLevels(swingHighs).slice(0, 3),
  };
}

export function computeVolumeProfile(
  candles: BinanceCandle[],
  bins = 16
): Array<{ priceLow: number; priceHigh: number; volume: number; pctOfTotal: number }> {
  if (candles.length === 0) return [];
  let minP = Infinity;
  let maxP = -Infinity;
  for (const c of candles) {
    if (c.low < minP) minP = c.low;
    if (c.high > maxP) maxP = c.high;
  }
  if (!Number.isFinite(minP) || !Number.isFinite(maxP) || maxP <= minP) return [];

  const step = (maxP - minP) / bins;
  const buckets = Array.from({ length: bins }, (_, idx) => ({
    priceLow: minP + idx * step,
    priceHigh: minP + (idx + 1) * step,
    volume: 0,
    pctOfTotal: 0,
  }));

  let totalVol = 0;
  for (const c of candles) {
    const typical = (c.high + c.low + c.close) / 3;
    const idx = Math.min(bins - 1, Math.max(0, Math.floor((typical - minP) / step)));
    buckets[idx].volume += c.volume;
    totalVol += c.volume;
  }

  if (totalVol > 0) {
    for (const b of buckets) {
      b.pctOfTotal = Number(((b.volume / totalVol) * 100).toFixed(2));
    }
  }
  return buckets;
}

export function analyzeTechnicals(params: {
  symbol: string;
  timeframe: string;
  candles: BinanceCandle[];
  quoteVolume24h?: number | null;
  source: string;
  fetchedAt: string;
}): TechnicalIndicatorSummary {
  const { symbol, timeframe, candles, quoteVolume24h, source, fetchedAt } = params;
  const closes = candles.map((c) => c.close);
  const latestClose = closes[closes.length - 1] ?? 0;

  const rsi14 = calculateRSI(closes, 14);
  const macd = calculateMACD(closes, 12, 26, 9);
  const ema20 = calculateEMA(closes, 20);
  const ema50 = calculateEMA(closes, 50);
  const ema100 = calculateEMA(closes, 100);
  const ema200 = calculateEMA(closes, 200);
  const sma50 = calculateSMA(closes, 50);
  const sma100 = calculateSMA(closes, 100);
  const sma200 = calculateSMA(closes, 200);
  const bollingerBands = calculateBollingerBands(closes, 20, 2);
  const atr14 = calculateATR(candles, 14);
  const atrPct = atr14 !== null && latestClose > 0 ? (atr14 / latestClose) * 100 : null;
  const adx14 = calculateADX(candles, 14);
  const vwap = calculateVWAP(candles, 50);
  const { supportLevels, resistanceLevels } = detectSupportResistance(candles, latestClose);
  const volumeProfile = computeVolumeProfile(candles, 16);

  // Short-term condition
  let shortTermCondition: TechnicalIndicatorSummary["shortTermCondition"] = "NEUTRAL";
  if (rsi14 !== null) {
    if (rsi14 >= 70) shortTermCondition = "OVERBOUGHT";
    else if (rsi14 <= 30) shortTermCondition = "OVERSOLD";
    else if (rsi14 >= 55 && ema20 !== null && latestClose > ema20) shortTermCondition = "BULLISH";
    else if (rsi14 <= 45 && ema20 !== null && latestClose < ema20) shortTermCondition = "BEARISH";
  }

  // Medium-term trend (EMA20 vs EMA50)
  let mediumTermTrend: TechnicalIndicatorSummary["mediumTermTrend"] = "INSUFFICIENT_DATA";
  if (ema20 !== null && ema50 !== null) {
    const spread = ((ema20 - ema50) / ema50) * 100;
    if (spread > 1.2 && latestClose > ema50) mediumTermTrend = "UPTREND";
    else if (spread < -1.2 && latestClose < ema50) mediumTermTrend = "DOWNTREND";
    else mediumTermTrend = "SIDEWAYS";
  }

  // Long-term trend (EMA50 vs EMA200 or SMA200)
  let longTermTrend: TechnicalIndicatorSummary["longTermTrend"] = "INSUFFICIENT_DATA";
  const longRef = ema200 ?? sma200;
  if (ema50 !== null && longRef !== null) {
    const spread = ((ema50 - longRef) / longRef) * 100;
    if (spread > 1.5 && latestClose > longRef) longTermTrend = "UPTREND";
    else if (spread < -1.5 && latestClose < longRef) longTermTrend = "DOWNTREND";
    else longTermTrend = "SIDEWAYS";
  }

  // Market structure from recent pivot highs/lows
  let marketStructure: TechnicalIndicatorSummary["marketStructure"] = "INSUFFICIENT_DATA";
  if (candles.length >= 40) {
    const firstHalf = candles.slice(-40, -20);
    const secondHalf = candles.slice(-20);
    const h1 = Math.max(...firstHalf.map((c) => c.high));
    const l1 = Math.min(...firstHalf.map((c) => c.low));
    const h2 = Math.max(...secondHalf.map((c) => c.high));
    const l2 = Math.min(...secondHalf.map((c) => c.low));
    if (h2 > h1 * 1.01 && l2 > l1 * 1.01) marketStructure = "HIGHER_HIGHS_LOWS";
    else if (h2 < h1 * 0.99 && l2 < l1 * 0.99) marketStructure = "LOWER_HIGHS_LOWS";
    else marketStructure = "CONSOLIDATION";
  }

  // Volatility assessment from ATR%
  let volatilityAssessment: TechnicalIndicatorSummary["volatilityAssessment"] = "MODERATE";
  if (atrPct !== null) {
    if (atrPct < 1.5) volatilityAssessment = "LOW";
    else if (atrPct < 4.0) volatilityAssessment = "MODERATE";
    else if (atrPct < 8.0) volatilityAssessment = "HIGH";
    else volatilityAssessment = "EXTREME";
  }

  // Liquidity assessment from 24h Quote Volume
  let liquidityAssessment: TechnicalIndicatorSummary["liquidityAssessment"] = "UNAVAILABLE";
  if (quoteVolume24h !== null && quoteVolume24h !== undefined) {
    if (quoteVolume24h >= 100_000_000) liquidityAssessment = "DEEP";
    else if (quoteVolume24h >= 20_000_000) liquidityAssessment = "HEALTHY";
    else if (quoteVolume24h >= 3_000_000) liquidityAssessment = "MODERATE";
    else liquidityAssessment = "THIN";
  }

  // Accumulation zones based on nearest support & lower Bollinger Band
  const accumulationZones: TechnicalIndicatorSummary["accumulationZones"] = [];
  const topSupport = supportLevels[supportLevels.length - 1];
  if (topSupport && topSupport < latestClose) {
    accumulationZones.push({
      low: topSupport * 0.985,
      high: topSupport * 1.015,
      rationaleEn: "Historical pivot support cluster with recurring buyer defense.",
      rationaleAr: "منطقة دعم محورية تاريخية تكرر فيها دفاع المشترين.",
    });
  }
  if (bollingerBands && bollingerBands.lower < latestClose) {
    accumulationZones.push({
      low: bollingerBands.lower * 0.99,
      high: bollingerBands.lower * 1.015,
      rationaleEn: "Lower Bollinger Band (2σ) mean-reversion reference zone (technical only, not investment advice).",
      rationaleAr: "نطاق بولينجر السفلي (انحرافان معياريان) كمرجع فني للتجميع (تحليل فني فقط وليس نصيحة استثمارية).",
    });
  }

  return {
    symbol,
    timeframe,
    fetchedAt,
    source,
    candleCount: candles.length,
    latestClose,
    rsi14,
    macd,
    ema20,
    ema50,
    ema100,
    ema200,
    sma50,
    sma100,
    sma200,
    bollingerBands,
    atr14,
    atrPct,
    adx14,
    vwap,
    supportLevels,
    resistanceLevels,
    accumulationZones,
    shortTermCondition,
    mediumTermTrend,
    longTermTrend,
    marketStructure,
    volatilityAssessment,
    liquidityAssessment,
    candles,
    volumeProfile,
  };
}
