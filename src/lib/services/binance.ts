import { getDb, runInTransaction } from "@/lib/db/client";
import { ensureSeeded } from "@/lib/db/seed";

export interface BinanceExchangeSymbol {
  symbol: string;
  status: string;
  baseAsset: string;
  quoteAsset: string;
  isSpotTradingAllowed?: boolean;
  permissions?: string[];
  permissionSets?: string[][];
}

export interface BinanceTicker24hr {
  symbol: string;
  priceChange: string;
  priceChangePercent: string;
  lastPrice: string;
  bidPrice: string;
  askPrice: string;
  highPrice: string;
  lowPrice: string;
  volume: string;
  quoteVolume: string;
}

export interface BinanceCandle {
  time: number; // Unix seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface OrderBookDepthSummary {
  symbol: string;
  bestBid: number | null;
  bestAsk: number | null;
  spreadPct: number | null;
  bidDepth2PctUsd: number;
  askDepth2PctUsd: number;
  topBids: Array<{ price: number; qty: number; notionalUsd: number }>;
  topAsks: Array<{ price: number; qty: number; notionalUsd: number }>;
  fetchedAt: string;
  source: string;
}

export const SUPPORTED_TIMEFRAMES = ["1m", "5m", "15m", "30m", "1h", "4h", "1d", "1w", "1M"] as const;
export type SupportedTimeframe = (typeof SUPPORTED_TIMEFRAMES)[number];

const LEVERAGED_TOKEN_SUFFIXES = ["UPUSDT", "DOWNUSDT", "BULLUSDT", "BEARUSDT"];

/**
 * Strictly validates that a Binance exchangeInfo symbol is an active Spot USDT trading pair.
 * Excludes suspended, delisted, break, non-spot, and leveraged tokens.
 */
export function isEligibleBinanceSpotUsdt(sym: BinanceExchangeSymbol): boolean {
  if (!sym || sym.status !== "TRADING") return false;
  if (sym.quoteAsset !== "USDT") return false;
  if (LEVERAGED_TOKEN_SUFFIXES.some((s) => sym.symbol.endsWith(s))) return false;

  const explicitSpotAllowed = sym.isSpotTradingAllowed === true;
  const hasSpotPermission =
    Array.isArray(sym.permissions) && sym.permissions.includes("SPOT");
  const hasSpotPermissionSet =
    Array.isArray(sym.permissionSets) &&
    sym.permissionSets.some((set) => Array.isArray(set) && set.includes("SPOT"));

  // Binance exchangeInfo sets isSpotTradingAllowed=true AND includes SPOT in permissions or permissionSets
  if (sym.isSpotTradingAllowed === false) return false;
  return explicitSpotAllowed || hasSpotPermission || hasSpotPermissionSet;
}

function getBaseUrls(): string[] {
  const primary = process.env.BINANCE_API_BASE_URL || "https://api.binance.com";
  const fallback = process.env.BINANCE_API_FALLBACK_URL || "https://data-api.binance.vision";
  return primary === fallback ? [primary] : [primary, fallback];
}

export async function fetchBinancePublicJson<T>(
  endpointPath: string,
  timeoutMs = 12000
): Promise<{ data: T; endpointUsed: string; isFallback: boolean }> {
  const bases = getBaseUrls();
  let lastError: unknown = null;

  for (let i = 0; i < bases.length; i++) {
    const base = bases[i].replace(/\/+$/, "");
    const url = `${base}${endpointPath}`;

    for (let attempt = 0; attempt < 2; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const headers: Record<string, string> = {
          Accept: "application/json",
          "User-Agent": "HalalCryptoIntelligence/1.0",
        };
        // Optional read-only API key header (never used for signed/trading calls)
        if (process.env.BINANCE_READONLY_API_KEY && i === 0) {
          headers["X-MBX-APIKEY"] = process.env.BINANCE_READONLY_API_KEY;
        }
        const res = await fetch(url, {
          headers,
          signal: controller.signal,
          cache: "no-store",
        });
        clearTimeout(timer);

        if (res.ok) {
          const json = (await res.json()) as T;
          return { data: json, endpointUsed: base, isFallback: i > 0 };
        }
        // Retry transient 429/5xx
        if (res.status === 429 || res.status >= 500) {
          lastError = new Error(`Binance HTTP ${res.status} from ${base}`);
          await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
          continue;
        }
        lastError = new Error(`Binance HTTP ${res.status} from ${base}`);
        break;
      } catch (err) {
        clearTimeout(timer);
        lastError = err;
        await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Failed to reach Binance Spot Public API");
}

// Simple in-memory cache for klines/depth to protect Binance rate limits
const memoryCache = new Map<string, { expiresAt: number; value: unknown }>();

function getCached<T>(key: string): T | null {
  const entry = memoryCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    memoryCache.delete(key);
    return null;
  }
  return entry.value as T;
}

function setCached(key: string, value: unknown, ttlMs: number): void {
  memoryCache.set(key, { expiresAt: Date.now() + ttlMs, value });
}

export interface BinanceSyncResult {
  totalEligibleSpotUsdt: number;
  updatedSnapshots: number;
  newlyDiscovered: number;
  delistedOrSuspended: string[];
  endpointUsed: string;
  isFallback: boolean;
  syncedAt: string;
}

export async function syncBinanceSpotMarketData(): Promise<BinanceSyncResult> {
  ensureSeeded();
  const db = getDb();
  const now = new Date().toISOString();

  try {
    const [exchangeResp, tickerResp] = await Promise.all([
      fetchBinancePublicJson<{ symbols: BinanceExchangeSymbol[] }>("/api/v3/exchangeInfo", 15000),
      fetchBinancePublicJson<BinanceTicker24hr[]>("/api/v3/ticker/24hr", 15000),
    ]);

    const eligibleMap = new Map<string, BinanceExchangeSymbol>();
    for (const s of exchangeResp.data.symbols || []) {
      if (isEligibleBinanceSpotUsdt(s)) {
        eligibleMap.set(s.symbol, s);
      }
    }

    const tickerMap = new Map<string, BinanceTicker24hr>();
    for (const t of tickerResp.data || []) {
      if (eligibleMap.has(t.symbol)) {
        tickerMap.set(t.symbol, t);
      }
    }

    let newlyDiscovered = 0;
    let updatedSnapshots = 0;
    const delistedOrSuspended: string[] = [];

    const existingRows = db
      .prepare("SELECT symbol, binance_status, bybit_status, is_curated FROM assets WHERE quote_asset = 'USDT'")
      .all() as Array<{ symbol: string; binance_status: string; bybit_status: string; is_curated: number }>;
    const existingSet = new Set(existingRows.map((r) => r.symbol));

    const existingSnapMap = new Map<
      string,
      { bybit_price_usdt: number | null; bybit_quote_volume_24h: number | null }
    >();
    const snapRows = db
      .prepare("SELECT symbol, bybit_price_usdt, bybit_quote_volume_24h FROM market_snapshots")
      .all() as Array<{
      symbol: string;
      bybit_price_usdt: number | null;
      bybit_quote_volume_24h: number | null;
    }>;
    for (const sr of snapRows) {
      existingSnapMap.set(sr.symbol, sr);
    }

    runInTransaction((tx) => {
      const insertAsset = tx.prepare(`
        INSERT INTO assets (
          symbol, base_asset, quote_asset, name, category, binance_status, bybit_status, is_spot_allowed,
          spot_verified_at, is_curated, created_at, updated_at
        ) VALUES (?, ?, 'USDT', ?, 'Spot Crypto Asset', 'TRADING', 'NOT_LISTED', 1, ?, 0, ?, ?)
        ON CONFLICT(symbol) DO UPDATE SET
          binance_status = 'TRADING',
          is_spot_allowed = 1,
          spot_verified_at = excluded.spot_verified_at,
          updated_at = excluded.updated_at
      `);

      const ensureUnverifiedShariah = tx.prepare(`
        INSERT INTO shariah_assessments (
          symbol, base_asset, classification, authority_name, source_url, assessment_date,
          methodology, core_activity_notes_en, core_activity_notes_ar,
          verification_status, confidence_level, last_verified_at
        ) VALUES (
          ?, ?, 'UNVERIFIED', 'DATA UNAVAILABLE – REQUIRES VERIFICATION', NULL, NULL,
          'Not yet screened by a documented Shariah authority',
          'DATA UNAVAILABLE – REQUIRES VERIFICATION',
          'البيانات غير متوفرة – تتطلب تحققاً',
          'UNVERIFIED', 'UNAVAILABLE', ?
        )
        ON CONFLICT(symbol) DO NOTHING
      `);

      const upsertMarket = tx.prepare(`
        INSERT INTO market_snapshots (
          symbol, base_asset, quote_asset, price_usdt, binance_price_usdt,
          price_change_24h, price_change_pct_24h,
          volume_24h, quote_volume_24h, binance_quote_volume_24h,
          high_24h, low_24h, bid_price, ask_price, spread_pct,
          primary_exchange, price_source, fetched_at
        ) VALUES (?, ?, 'USDT', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(symbol) DO UPDATE SET
          price_usdt = excluded.price_usdt,
          binance_price_usdt = excluded.binance_price_usdt,
          price_change_24h = excluded.price_change_24h,
          price_change_pct_24h = excluded.price_change_pct_24h,
          volume_24h = excluded.volume_24h,
          quote_volume_24h = excluded.quote_volume_24h,
          binance_quote_volume_24h = excluded.binance_quote_volume_24h,
          high_24h = excluded.high_24h,
          low_24h = excluded.low_24h,
          bid_price = excluded.bid_price,
          ask_price = excluded.ask_price,
          spread_pct = excluded.spread_pct,
          primary_exchange = excluded.primary_exchange,
          price_source = excluded.price_source,
          fetched_at = excluded.fetched_at
      `);

      const updateBinanceOnlyPrices = tx.prepare(`
        UPDATE market_snapshots
        SET binance_price_usdt = ?,
            binance_quote_volume_24h = ?,
            quote_volume_24h = ?,
            fetched_at = ?
        WHERE symbol = ?
      `);

      const priceSourceLabel = exchangeResp.isFallback
        ? "Binance Spot Public API (data-api.binance.vision)"
        : "Binance Spot Public API (api.binance.com)";

      for (const [symbol, symInfo] of eligibleMap.entries()) {
        if (!existingSet.has(symbol)) {
          newlyDiscovered++;
        }
        insertAsset.run(symbol, symInfo.baseAsset, symInfo.baseAsset, now, now, now);
        ensureUnverifiedShariah.run(symbol, symInfo.baseAsset, now);

        const tk = tickerMap.get(symbol);
        if (tk) {
          const lastPrice = parseFloat(tk.lastPrice);
          const priceChange = parseFloat(tk.priceChange);
          const priceChangePct = parseFloat(tk.priceChangePercent);
          const volume = parseFloat(tk.volume);
          const quoteVolume = parseFloat(tk.quoteVolume);
          const highPrice = parseFloat(tk.highPrice);
          const lowPrice = parseFloat(tk.lowPrice);
          const bidPrice = parseFloat(tk.bidPrice);
          const askPrice = parseFloat(tk.askPrice);
          const spreadPct =
            bidPrice > 0 && askPrice > 0 ? ((askPrice - bidPrice) / ((askPrice + bidPrice) / 2)) * 100 : null;

          if (Number.isFinite(lastPrice) && lastPrice > 0) {
            const binVol = Number.isFinite(quoteVolume) ? quoteVolume : 0;
            const prevSnap = existingSnapMap.get(symbol);
            const bybitVol = prevSnap?.bybit_quote_volume_24h ?? 0;
            const totalQuoteVol = binVol + bybitVol;

            // If Bybit already has higher 24h liquidity and a valid price, keep Bybit as primary display price while updating Binance figures
            if (prevSnap?.bybit_price_usdt && bybitVol > binVol) {
              updateBinanceOnlyPrices.run(lastPrice, binVol, totalQuoteVol, now, symbol);
            } else {
              upsertMarket.run(
                symbol,
                symInfo.baseAsset,
                lastPrice,
                lastPrice,
                Number.isFinite(priceChange) ? priceChange : null,
                Number.isFinite(priceChangePct) ? priceChangePct : null,
                Number.isFinite(volume) ? volume : null,
                totalQuoteVol > 0 ? totalQuoteVol : binVol,
                binVol,
                Number.isFinite(highPrice) ? highPrice : null,
                Number.isFinite(lowPrice) ? lowPrice : null,
                Number.isFinite(bidPrice) && bidPrice > 0 ? bidPrice : null,
                Number.isFinite(askPrice) && askPrice > 0 ? askPrice : null,
                spreadPct !== null && Number.isFinite(spreadPct) ? Number(spreadPct.toFixed(4)) : null,
                "BINANCE",
                priceSourceLabel,
                now
              );
            }
            updatedSnapshots++;
          }
        }
      }

      // Mark any previously Binance TRADING symbol not in eligibleMap as INACTIVE/NOT_LISTED on Binance,
      // while keeping is_spot_allowed = 1 if still active on Bybit Spot.
      const markInactive = tx.prepare(
        `UPDATE assets
         SET binance_status = 'INACTIVE',
             is_spot_allowed = CASE WHEN bybit_status = 'TRADING' THEN 1 ELSE 0 END,
             updated_at = ?
         WHERE symbol = ?`
      );
      for (const row of existingRows) {
        if (!eligibleMap.has(row.symbol) && row.binance_status === "TRADING") {
          markInactive.run(now, row.symbol);
          if (row.bybit_status !== "TRADING") {
            delistedOrSuspended.push(row.symbol);
          }
        }
      }

      tx.prepare(
        `INSERT INTO sync_status (service_name, status, endpoint_used, records_processed, error_message, last_synced_at)
         VALUES ('binance_spot', ?, ?, ?, NULL, ?)
         ON CONFLICT(service_name) DO UPDATE SET
           status = excluded.status,
           endpoint_used = excluded.endpoint_used,
           records_processed = excluded.records_processed,
           error_message = NULL,
           last_synced_at = excluded.last_synced_at`
      ).run(
        exchangeResp.isFallback ? "FALLBACK" : "CONNECTED",
        exchangeResp.endpointUsed,
        updatedSnapshots,
        now
      );
    });

    return {
      totalEligibleSpotUsdt: eligibleMap.size,
      updatedSnapshots,
      newlyDiscovered,
      delistedOrSuspended,
      endpointUsed: exchangeResp.endpointUsed,
      isFallback: exchangeResp.isFallback,
      syncedAt: now,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown Binance API error";
    db.prepare(
      `INSERT INTO sync_status (service_name, status, endpoint_used, records_processed, error_message, last_synced_at)
       VALUES ('binance_spot', 'DEGRADED', NULL, 0, ?, ?)
       ON CONFLICT(service_name) DO UPDATE SET
         status = 'DEGRADED',
         error_message = excluded.error_message,
         last_synced_at = excluded.last_synced_at`
    ).run(message, now);
    throw err;
  }
}

export async function fetchBinanceKlines(
  symbol: string,
  interval: SupportedTimeframe = "4h",
  limit = 250
): Promise<{ candles: BinanceCandle[]; source: string; fetchedAt: string }> {
  const safeSymbol = symbol.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const safeInterval = SUPPORTED_TIMEFRAMES.includes(interval) ? interval : "4h";
  const safeLimit = Math.min(Math.max(limit, 50), 500);

  const cacheKey = `klines:${safeSymbol}:${safeInterval}:${safeLimit}`;
  const cached = getCached<{ candles: BinanceCandle[]; source: string; fetchedAt: string }>(cacheKey);
  if (cached) return cached;

  const resp = await fetchBinancePublicJson<Array<[number, string, string, string, string, string]>>(
    `/api/v3/klines?symbol=${encodeURIComponent(safeSymbol)}&interval=${encodeURIComponent(safeInterval)}&limit=${safeLimit}`
  );

  const candles: BinanceCandle[] = (resp.data || []).map((k) => ({
    time: Math.floor(k[0] / 1000),
    open: parseFloat(k[1]),
    high: parseFloat(k[2]),
    low: parseFloat(k[3]),
    close: parseFloat(k[4]),
    volume: parseFloat(k[5]),
  }));

  const result = {
    candles,
    source: resp.isFallback ? "Binance Spot API (Fallback)" : "Binance Spot API",
    fetchedAt: new Date().toISOString(),
  };

  const ttlMs = safeInterval === "1m" || safeInterval === "5m" ? 15_000 : 45_000;
  setCached(cacheKey, result, ttlMs);
  return result;
}

export async function fetchBinanceOrderBookDepth(
  symbol: string,
  limit = 50
): Promise<OrderBookDepthSummary> {
  const safeSymbol = symbol.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const cacheKey = `depth:${safeSymbol}:${limit}`;
  const cached = getCached<OrderBookDepthSummary>(cacheKey);
  if (cached) return cached;

  const resp = await fetchBinancePublicJson<{
    bids: Array<[string, string]>;
    asks: Array<[string, string]>;
  }>(`/api/v3/depth?symbol=${encodeURIComponent(safeSymbol)}&limit=${limit}`);

  const bids = (resp.data.bids || []).map(([p, q]) => {
    const price = parseFloat(p);
    const qty = parseFloat(q);
    return { price, qty, notionalUsd: price * qty };
  });
  const asks = (resp.data.asks || []).map(([p, q]) => {
    const price = parseFloat(p);
    const qty = parseFloat(q);
    return { price, qty, notionalUsd: price * qty };
  });

  const bestBid = bids[0]?.price ?? null;
  const bestAsk = asks[0]?.price ?? null;
  const mid = bestBid && bestAsk ? (bestBid + bestAsk) / 2 : null;
  const spreadPct = bestBid && bestAsk && mid ? ((bestAsk - bestBid) / mid) * 100 : null;

  const bidDepth2PctUsd = mid
    ? bids.filter((b) => b.price >= mid * 0.98).reduce((acc, b) => acc + b.notionalUsd, 0)
    : 0;
  const askDepth2PctUsd = mid
    ? asks.filter((a) => a.price <= mid * 1.02).reduce((acc, a) => acc + a.notionalUsd, 0)
    : 0;

  const summary: OrderBookDepthSummary = {
    symbol: safeSymbol,
    bestBid,
    bestAsk,
    spreadPct: spreadPct !== null ? Number(spreadPct.toFixed(4)) : null,
    bidDepth2PctUsd: Number(bidDepth2PctUsd.toFixed(2)),
    askDepth2PctUsd: Number(askDepth2PctUsd.toFixed(2)),
    topBids: bids.slice(0, 10),
    topAsks: asks.slice(0, 10),
    fetchedAt: new Date().toISOString(),
    source: resp.isFallback ? "Binance Spot API (Fallback)" : "Binance Spot API",
  };

  setCached(cacheKey, summary, 20_000);
  return summary;
}
