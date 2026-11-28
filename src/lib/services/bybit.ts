import { getDb, runInTransaction } from "@/lib/db/client";
import { ensureSeeded } from "@/lib/db/seed";
import type { BinanceCandle, OrderBookDepthSummary, SupportedTimeframe } from "./binance";

export interface BybitSpotInstrument {
  symbol: string;
  baseCoin: string;
  quoteCoin: string;
  status: string;
  innovation?: string;
  marginTrading?: string;
}

export interface BybitSpotTicker {
  symbol: string;
  bid1Price: string;
  bid1Size: string;
  ask1Price: string;
  ask1Size: string;
  lastPrice: string;
  prevPrice24h: string;
  price24hPcnt: string; // decimal e.g. "0.0245" => +2.45%
  highPrice24h: string;
  lowPrice24h: string;
  turnover24h: string; // USDT quote volume
  volume24h: string; // Base asset volume
}

interface BybitV5Envelope<T> {
  retCode: number;
  retMsg: string;
  result: T;
}

const BYBIT_LEVERAGED_PATTERNS = [
  /2LUSDT$/i,
  /2SUSDT$/i,
  /3LUSDT$/i,
  /3SUSDT$/i,
  /5LUSDT$/i,
  /5SUSDT$/i,
  /UPUSDT$/i,
  /DOWNUSDT$/i,
  /BULLUSDT$/i,
  /BEARUSDT$/i,
];

/**
 * Strictly validates that a Bybit v5 Spot instrument is an active Spot USDT trading pair.
 * Excludes non-trading, non-USDT, and leveraged ETP tokens (2L/2S/3L/3S/etc.).
 */
export function isEligibleBybitSpotUsdt(inst: BybitSpotInstrument): boolean {
  if (!inst || inst.status !== "Trading") return false;
  if (inst.quoteCoin !== "USDT") return false;
  if (!inst.baseCoin || !inst.symbol.endsWith("USDT")) return false;
  if (BYBIT_LEVERAGED_PATTERNS.some((rx) => rx.test(inst.symbol))) return false;
  if (/(2L|2S|3L|3S|5L|5S)$/i.test(inst.baseCoin)) return false;
  return true;
}

function getBybitBaseUrls(): string[] {
  const primary = process.env.BYBIT_API_BASE_URL || "https://api.bybit.com";
  const fallback = process.env.BYBIT_API_FALLBACK_URL || "https://api.bytick.com";
  return primary === fallback ? [primary] : [primary, fallback];
}

export async function fetchBybitPublicJson<T>(
  endpointPath: string,
  timeoutMs = 12000
): Promise<{ data: T; endpointUsed: string; isFallback: boolean }> {
  const bases = getBybitBaseUrls();
  let lastError: unknown = null;

  for (let i = 0; i < bases.length; i++) {
    const base = bases[i].replace(/\/+$/, "");
    const url = `${base}${endpointPath}`;

    for (let attempt = 0; attempt < 2; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetch(url, {
          headers: {
            Accept: "application/json",
            "User-Agent": "HalalCryptoIntelligence/1.1",
          },
          signal: controller.signal,
          cache: "no-store",
        });
        clearTimeout(timer);

        if (res.ok) {
          const json = (await res.json()) as BybitV5Envelope<T>;
          if (json.retCode !== 0) {
            throw new Error(`Bybit API retCode ${json.retCode}: ${json.retMsg}`);
          }
          return { data: json.result, endpointUsed: base, isFallback: i > 0 };
        }
        if (res.status === 429 || res.status >= 500) {
          lastError = new Error(`Bybit HTTP ${res.status} from ${base}`);
          await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
          continue;
        }
        lastError = new Error(`Bybit HTTP ${res.status} from ${base}`);
        break;
      } catch (err) {
        clearTimeout(timer);
        lastError = err;
        await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Failed to reach Bybit Spot Public API");
}

const bybitCache = new Map<string, { expiresAt: number; value: unknown }>();

function getCached<T>(key: string): T | null {
  const entry = bybitCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    bybitCache.delete(key);
    return null;
  }
  return entry.value as T;
}

function setCached(key: string, value: unknown, ttlMs: number): void {
  bybitCache.set(key, { expiresAt: Date.now() + ttlMs, value });
}

export interface BybitSyncResult {
  totalEligibleSpotUsdt: number;
  updatedSnapshots: number;
  newlyDiscovered: number;
  bybitExclusiveCount: number;
  endpointUsed: string;
  isFallback: boolean;
  syncedAt: string;
}

export async function syncBybitSpotMarketData(): Promise<BybitSyncResult> {
  ensureSeeded();
  const db = getDb();
  const now = new Date().toISOString();

  try {
    const [instResp, tickerResp] = await Promise.all([
      fetchBybitPublicJson<{ list: BybitSpotInstrument[] }>(
        "/v5/market/instruments-info?category=spot&limit=1000",
        15000
      ),
      fetchBybitPublicJson<{ list: BybitSpotTicker[] }>("/v5/market/tickers?category=spot", 15000),
    ]);

    const eligibleMap = new Map<string, BybitSpotInstrument>();
    for (const inst of instResp.data.list || []) {
      if (isEligibleBybitSpotUsdt(inst)) {
        eligibleMap.set(inst.symbol, inst);
      }
    }

    const tickerMap = new Map<string, BybitSpotTicker>();
    for (const tk of tickerResp.data.list || []) {
      if (eligibleMap.has(tk.symbol)) {
        tickerMap.set(tk.symbol, tk);
      }
    }

    const existingRows = db
      .prepare("SELECT symbol, binance_status, bybit_status FROM assets WHERE quote_asset = 'USDT'")
      .all() as Array<{ symbol: string; binance_status: string; bybit_status: string }>;
    const existingMap = new Map(existingRows.map((r) => [r.symbol, r]));

    const snapRows = db
      .prepare("SELECT symbol, binance_price_usdt, binance_quote_volume_24h FROM market_snapshots")
      .all() as Array<{
      symbol: string;
      binance_price_usdt: number | null;
      binance_quote_volume_24h: number | null;
    }>;
    const snapMap = new Map(snapRows.map((s) => [s.symbol, s]));

    let newlyDiscovered = 0;
    let updatedSnapshots = 0;
    let bybitExclusiveCount = 0;

    runInTransaction((tx) => {
      const upsertAsset = tx.prepare(`
        INSERT INTO assets (
          symbol, base_asset, quote_asset, name, category,
          binance_status, bybit_status, is_spot_allowed,
          spot_verified_at, is_curated, created_at, updated_at
        ) VALUES (?, ?, 'USDT', ?, 'Bybit Spot Asset', 'NOT_LISTED', 'TRADING', 1, ?, 0, ?, ?)
        ON CONFLICT(symbol) DO UPDATE SET
          bybit_status = 'TRADING',
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

      const upsertPrimaryBybitSnap = tx.prepare(`
        INSERT INTO market_snapshots (
          symbol, base_asset, quote_asset, price_usdt, bybit_price_usdt,
          price_change_24h, price_change_pct_24h,
          volume_24h, quote_volume_24h, bybit_quote_volume_24h,
          high_24h, low_24h, bid_price, ask_price, spread_pct,
          primary_exchange, price_source, fetched_at
        ) VALUES (?, ?, 'USDT', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'BYBIT', ?, ?)
        ON CONFLICT(symbol) DO UPDATE SET
          price_usdt = excluded.price_usdt,
          bybit_price_usdt = excluded.bybit_price_usdt,
          price_change_24h = excluded.price_change_24h,
          price_change_pct_24h = excluded.price_change_pct_24h,
          volume_24h = excluded.volume_24h,
          quote_volume_24h = excluded.quote_volume_24h,
          bybit_quote_volume_24h = excluded.bybit_quote_volume_24h,
          high_24h = excluded.high_24h,
          low_24h = excluded.low_24h,
          bid_price = excluded.bid_price,
          ask_price = excluded.ask_price,
          spread_pct = excluded.spread_pct,
          primary_exchange = 'BYBIT',
          price_source = excluded.price_source,
          fetched_at = excluded.fetched_at
      `);

      const updateSecondaryBybitSnap = tx.prepare(`
        UPDATE market_snapshots
        SET bybit_price_usdt = ?,
            bybit_quote_volume_24h = ?,
            quote_volume_24h = ?,
            fetched_at = ?
        WHERE symbol = ?
      `);

      const priceSourceLabel = instResp.isFallback
        ? "Bybit Spot Public API (api.bytick.com)"
        : "Bybit Spot Public API (api.bybit.com)";

      for (const [symbol, inst] of eligibleMap.entries()) {
        const existing = existingMap.get(symbol);
        if (!existing) {
          newlyDiscovered++;
          bybitExclusiveCount++;
        } else if (existing.binance_status !== "TRADING") {
          bybitExclusiveCount++;
        }

        upsertAsset.run(symbol, inst.baseCoin, inst.baseCoin, now, now, now);
        ensureUnverifiedShariah.run(symbol, inst.baseCoin, now);

        const tk = tickerMap.get(symbol);
        if (tk) {
          const lastPrice = parseFloat(tk.lastPrice);
          const prevPrice = parseFloat(tk.prevPrice24h);
          const pctDecimal = parseFloat(tk.price24hPcnt);
          const priceChangePct = Number.isFinite(pctDecimal) ? pctDecimal * 100 : null;
          const priceChange =
            Number.isFinite(lastPrice) && Number.isFinite(prevPrice) ? lastPrice - prevPrice : null;
          const volume = parseFloat(tk.volume24h);
          const turnoverUsd = parseFloat(tk.turnover24h);
          const highPrice = parseFloat(tk.highPrice24h);
          const lowPrice = parseFloat(tk.lowPrice24h);
          const bidPrice = parseFloat(tk.bid1Price);
          const askPrice = parseFloat(tk.ask1Price);
          const spreadPct =
            bidPrice > 0 && askPrice > 0 ? ((askPrice - bidPrice) / ((askPrice + bidPrice) / 2)) * 100 : null;

          if (Number.isFinite(lastPrice) && lastPrice > 0) {
            const bybitVol = Number.isFinite(turnoverUsd) ? turnoverUsd : 0;
            const prevSnap = snapMap.get(symbol);
            const binVol = prevSnap?.binance_quote_volume_24h ?? 0;
            const binActive = existing?.binance_status === "TRADING" && (prevSnap?.binance_price_usdt ?? 0) > 0;
            const totalVol = binVol + bybitVol;

            // Use Binance as primary if Binance is active and has >= liquidity; otherwise Bybit is primary
            if (binActive && binVol >= bybitVol) {
              updateSecondaryBybitSnap.run(lastPrice, bybitVol, totalVol, now, symbol);
            } else {
              upsertPrimaryBybitSnap.run(
                symbol,
                inst.baseCoin,
                lastPrice,
                lastPrice,
                priceChange !== null && Number.isFinite(priceChange) ? priceChange : null,
                priceChangePct !== null ? Number(priceChangePct.toFixed(4)) : null,
                Number.isFinite(volume) ? volume : null,
                totalVol > 0 ? totalVol : bybitVol,
                bybitVol,
                Number.isFinite(highPrice) ? highPrice : null,
                Number.isFinite(lowPrice) ? lowPrice : null,
                Number.isFinite(bidPrice) && bidPrice > 0 ? bidPrice : null,
                Number.isFinite(askPrice) && askPrice > 0 ? askPrice : null,
                spreadPct !== null && Number.isFinite(spreadPct) ? Number(spreadPct.toFixed(4)) : null,
                priceSourceLabel,
                now
              );
            }
            updatedSnapshots++;
          }
        }
      }

      const markBybitInactive = tx.prepare(`
        UPDATE assets
        SET bybit_status = 'INACTIVE',
            is_spot_allowed = CASE WHEN binance_status = 'TRADING' THEN 1 ELSE 0 END,
            updated_at = ?
        WHERE symbol = ?
      `);
      for (const row of existingRows) {
        if (!eligibleMap.has(row.symbol) && row.bybit_status === "TRADING") {
          markBybitInactive.run(now, row.symbol);
        }
      }

      tx.prepare(
        `INSERT INTO sync_status (service_name, status, endpoint_used, records_processed, error_message, last_synced_at)
         VALUES ('bybit_spot', ?, ?, ?, NULL, ?)
         ON CONFLICT(service_name) DO UPDATE SET
           status = excluded.status,
           endpoint_used = excluded.endpoint_used,
           records_processed = excluded.records_processed,
           error_message = NULL,
           last_synced_at = excluded.last_synced_at`
      ).run(instResp.isFallback ? "FALLBACK" : "CONNECTED", instResp.endpointUsed, updatedSnapshots, now);
    });

    return {
      totalEligibleSpotUsdt: eligibleMap.size,
      updatedSnapshots,
      newlyDiscovered,
      bybitExclusiveCount,
      endpointUsed: instResp.endpointUsed,
      isFallback: instResp.isFallback,
      syncedAt: now,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown Bybit API error";
    db.prepare(
      `INSERT INTO sync_status (service_name, status, endpoint_used, records_processed, error_message, last_synced_at)
       VALUES ('bybit_spot', 'DEGRADED', NULL, 0, ?, ?)
       ON CONFLICT(service_name) DO UPDATE SET
         status = 'DEGRADED',
         error_message = excluded.error_message,
         last_synced_at = excluded.last_synced_at`
    ).run(message, now);
    throw err;
  }
}

const BYBIT_INTERVAL_MAP: Record<SupportedTimeframe, string> = {
  "1m": "1",
  "5m": "5",
  "15m": "15",
  "30m": "30",
  "1h": "60",
  "4h": "240",
  "1d": "D",
  "1w": "W",
  "1M": "M",
};

export async function fetchBybitKlines(
  symbol: string,
  interval: SupportedTimeframe = "4h",
  limit = 250
): Promise<{ candles: BinanceCandle[]; source: string; fetchedAt: string }> {
  const safeSymbol = symbol.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const bybitInterval = BYBIT_INTERVAL_MAP[interval] || "240";
  const safeLimit = Math.min(Math.max(limit, 50), 500);

  const cacheKey = `bybit_klines:${safeSymbol}:${bybitInterval}:${safeLimit}`;
  const cached = getCached<{ candles: BinanceCandle[]; source: string; fetchedAt: string }>(cacheKey);
  if (cached) return cached;

  const resp = await fetchBybitPublicJson<{
    symbol: string;
    category: string;
    list: Array<[string, string, string, string, string, string, string]>;
  }>(
    `/v5/market/kline?category=spot&symbol=${encodeURIComponent(safeSymbol)}&interval=${encodeURIComponent(bybitInterval)}&limit=${safeLimit}`
  );

  // Bybit v5 returns newest candle first; sort ascending by timestamp for chart & indicator accuracy
  const candles: BinanceCandle[] = (resp.data.list || [])
    .map((k) => ({
      time: Math.floor(Number(k[0]) / 1000),
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4]),
      volume: parseFloat(k[5]),
    }))
    .filter((c) => Number.isFinite(c.time) && Number.isFinite(c.close))
    .sort((a, b) => a.time - b.time);

  const result = {
    candles,
    source: resp.isFallback ? "Bybit Spot API (Fallback)" : "Bybit Spot API (v5)",
    fetchedAt: new Date().toISOString(),
  };

  setCached(cacheKey, result, interval === "1m" || interval === "5m" ? 15_000 : 45_000);
  return result;
}

export async function fetchBybitOrderBookDepth(
  symbol: string,
  limit = 200
): Promise<OrderBookDepthSummary> {
  const safeSymbol = symbol.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const safeLimit = Math.min(Math.max(limit, 20), 200);
  const cacheKey = `bybit_depth:${safeSymbol}:${safeLimit}`;
  const cached = getCached<OrderBookDepthSummary>(cacheKey);
  if (cached) return cached;

  const resp = await fetchBybitPublicJson<{
    s: string;
    b: Array<[string, string]>;
    a: Array<[string, string]>;
  }>(`/v5/market/orderbook?category=spot&symbol=${encodeURIComponent(safeSymbol)}&limit=${safeLimit}`);

  const bids = (resp.data.b || [])
    .map(([p, q]) => {
      const price = parseFloat(p);
      const qty = parseFloat(q);
      return { price, qty, notionalUsd: price * qty };
    })
    .filter((x) => Number.isFinite(x.price) && x.price > 0 && Number.isFinite(x.qty) && x.qty > 0);

  const asks = (resp.data.a || [])
    .map(([p, q]) => {
      const price = parseFloat(p);
      const qty = parseFloat(q);
      return { price, qty, notionalUsd: price * qty };
    })
    .filter((x) => Number.isFinite(x.price) && x.price > 0 && Number.isFinite(x.qty) && x.qty > 0);

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
    topBids: bids.slice(0, 100),
    topAsks: asks.slice(0, 100),
    fetchedAt: new Date().toISOString(),
    source: resp.isFallback ? "Bybit Spot API (Fallback)" : "Bybit Spot API (v5)",
  };

  setCached(cacheKey, summary, 15_000);
  return summary;
}
