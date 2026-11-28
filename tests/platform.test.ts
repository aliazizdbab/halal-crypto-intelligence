import { beforeEach, describe, expect, it } from "vitest";
import { isEligibleBinanceSpotUsdt, type BinanceCandle } from "@/lib/services/binance";
import {
  analyzeTechnicals,
  calculateADX,
  calculateATR,
  calculateBollingerBands,
  calculateEMA,
  calculateMACD,
  calculateRSI,
  calculateSMA,
  calculateVWAP,
} from "@/lib/services/technical-analysis";
import { computeCredibilityScore, computeInvestmentPotential } from "@/lib/services/scoring";
import { getDb, resetDbConnectionForTests } from "@/lib/db/client";
import { ensureSeeded } from "@/lib/db/seed";
import {
  captureHistoricalSnapshots,
  getAssetDetail,
  getDirectoryAssets,
  toggleWatchlist,
  upsertShariahAssessment,
} from "@/lib/services/repository";
import { runAiResearchQuery } from "@/lib/services/ai-assistant";
import { generateCsvReport, generateExcelReport, generatePdfReport } from "@/lib/services/export";
import { compareSemver } from "@/lib/services/updates";
import { isEligibleBybitSpotUsdt } from "@/lib/services/bybit";
import { computeOrderBookLiquidityAnalysis } from "@/lib/services/liquidity";
import { analyzeAndSaveAssetWithAi, getAiAgentSettings, saveAiAgentSettings } from "@/lib/services/ai-assistant";
import { VERIFIED_SEED_ASSETS } from "@/lib/data/verified-seed";
import type { CredibilityFactorRecord } from "@/types/domain";

describe("Binance Spot Eligibility Verification", () => {
  it("accepts active TRADING Spot USDT pairs", () => {
    expect(
      isEligibleBinanceSpotUsdt({
        symbol: "BTCUSDT",
        status: "TRADING",
        baseAsset: "BTC",
        quoteAsset: "USDT",
        isSpotTradingAllowed: true,
        permissions: ["SPOT"],
      })
    ).toBe(true);
  });

  it("rejects suspended, non-spot, non-USDT, and leveraged tokens", () => {
    expect(
      isEligibleBinanceSpotUsdt({
        symbol: "OLDUSDT",
        status: "BREAK",
        baseAsset: "OLD",
        quoteAsset: "USDT",
        isSpotTradingAllowed: true,
      })
    ).toBe(false);

    expect(
      isEligibleBinanceSpotUsdt({
        symbol: "FUTUSDT",
        status: "TRADING",
        baseAsset: "FUT",
        quoteAsset: "USDT",
        isSpotTradingAllowed: false,
      })
    ).toBe(false);

    expect(
      isEligibleBinanceSpotUsdt({
        symbol: "ETHBTC",
        status: "TRADING",
        baseAsset: "ETH",
        quoteAsset: "BTC",
        isSpotTradingAllowed: true,
      })
    ).toBe(false);

    expect(
      isEligibleBinanceSpotUsdt({
        symbol: "BTCUPUSDT",
        status: "TRADING",
        baseAsset: "BTCUP",
        quoteAsset: "USDT",
        isSpotTradingAllowed: true,
      })
    ).toBe(false);
  });
});

describe("Technical Analysis Engine", () => {
  const uptrendCandles: BinanceCandle[] = Array.from({ length: 240 }, (_, i) => {
    const base = 100 + i * 0.6 + Math.sin(i / 4) * 1.5;
    return {
      time: 1700000000 + i * 3600,
      open: base - 0.3,
      high: base + 1.2,
      low: base - 1.1,
      close: base + 0.4,
      volume: 1000 + (i % 10) * 200,
    };
  });

  it("computes core technical indicators accurately on an uptrend", () => {
    const closes = uptrendCandles.map((c) => c.close);
    const rsi = calculateRSI(closes, 14);
    const macd = calculateMACD(closes);
    const ema20 = calculateEMA(closes, 20);
    const sma50 = calculateSMA(closes, 50);
    const bb = calculateBollingerBands(closes, 20, 2);
    const atr = calculateATR(uptrendCandles, 14);
    const adx = calculateADX(uptrendCandles, 14);
    const vwap = calculateVWAP(uptrendCandles, 50);

    expect(rsi).not.toBeNull();
    expect(rsi!).toBeGreaterThan(55);
    expect(rsi!).toBeLessThanOrEqual(100);
    expect(macd).not.toBeNull();
    expect(macd!.macd).toBeGreaterThan(0);
    expect(ema20!).toBeGreaterThan(sma50!);
    expect(bb!.upper).toBeGreaterThan(bb!.middle);
    expect(bb!.middle).toBeGreaterThan(bb!.lower);
    expect(atr!).toBeGreaterThan(0);
    expect(adx!).toBeGreaterThan(20);
    expect(vwap!).toBeGreaterThan(0);

    const summary = analyzeTechnicals({
      symbol: "BTCUSDT",
      timeframe: "1h",
      candles: uptrendCandles,
      quoteVolume24h: 250_000_000,
      source: "Test",
      fetchedAt: new Date().toISOString(),
    });
    expect(summary.mediumTermTrend).toBe("UPTREND");
    expect(summary.longTermTrend).toBe("UPTREND");
    expect(summary.liquidityAssessment).toBe("DEEP");
    expect(summary.volumeProfile.length).toBe(16);
  });
});

describe("Evidence-Based Scoring Engine (Zero Fabrication)", () => {
  it("returns null score & UNAVAILABLE when no evidence factors exist", () => {
    const res = computeCredibilityScore([]);
    expect(res.score).toBeNull();
    expect(res.confidence).toBe("UNAVAILABLE");
    expect(res.availableWeightPct).toBe(0);
  });

  it("computes exact weighted credibility score and flags high dilution", () => {
    const factors: CredibilityFactorRecord[] = [
      { symbol: "TESTUSDT", factorKey: "team_credibility", weight: 0.15, score: 80, evidenceEn: "ok", evidenceAr: "ok", sourceName: "Doc", sourceUrl: null, researchDate: "2026-01-01", confidenceLevel: "HIGH", isAvailable: true },
      { symbol: "TESTUSDT", factorKey: "technology_security", weight: 0.20, score: 90, evidenceEn: "ok", evidenceAr: "ok", sourceName: "Doc", sourceUrl: null, researchDate: "2026-01-01", confidenceLevel: "HIGH", isAvailable: true },
      { symbol: "TESTUSDT", factorKey: "independent_audits", weight: 0.15, score: 85, evidenceEn: "ok", evidenceAr: "ok", sourceName: "Doc", sourceUrl: null, researchDate: "2026-01-01", confidenceLevel: "HIGH", isAvailable: true },
      { symbol: "TESTUSDT", factorKey: "real_world_adoption", weight: 0.20, score: 75, evidenceEn: "ok", evidenceAr: "ok", sourceName: "Doc", sourceUrl: null, researchDate: "2026-01-01", confidenceLevel: "HIGH", isAvailable: true },
      { symbol: "TESTUSDT", factorKey: "transparency_documentation", weight: 0.10, score: 80, evidenceEn: "ok", evidenceAr: "ok", sourceName: "Doc", sourceUrl: null, researchDate: "2026-01-01", confidenceLevel: "HIGH", isAvailable: true },
      { symbol: "TESTUSDT", factorKey: "development_activity", weight: 0.10, score: 80, evidenceEn: "ok", evidenceAr: "ok", sourceName: "Doc", sourceUrl: null, researchDate: "2026-01-01", confidenceLevel: "HIGH", isAvailable: true },
      { symbol: "TESTUSDT", factorKey: "strategic_partnerships", weight: 0.10, score: 80, evidenceEn: "ok", evidenceAr: "ok", sourceName: "Doc", sourceUrl: null, researchDate: "2026-01-01", confidenceLevel: "HIGH", isAvailable: true },
    ];
    const cred = computeCredibilityScore(factors);
    expect(cred.score).toBe(81.8);
    expect(cred.confidence).toBe("HIGH");

    const inv = computeInvestmentPotential({
      category: "Layer-1",
      priceUsdt: 1.5,
      high24h: 1.6,
      low24h: 1.4,
      quoteVolume24h: 50_000_000,
      spreadPct: 0.05,
      marketCap: 1_000_000_000,
      fdv: 4_000_000_000,
      circulatingSupply: 250_000_000,
      maxSupply: 1_000_000_000,
      inflationRatePct: 12,
      insiderAllocationPct: 45,
      nextMajorUnlockPct: 1.5,
      existingRiskFlags: [],
      baseTokenomicsRisk: "MODERATE",
      credibilityFactors: factors,
    });
    expect(inv.dilutionRatio).toBe(4);
    expect(inv.dynamicRiskFlags).toContain("HIGH_FDV_TO_MCAP");
    expect(inv.dynamicRiskFlags).toContain("HIGH_INFLATION_RATE");
    expect(inv.dynamicRiskFlags).toContain("HIGH_INSIDER_ALLOCATION");
    expect(inv.computedTokenomicsRisk === "HIGH" || inv.computedTokenomicsRisk === "VERY_HIGH").toBe(true);
  });
});

describe("SQLite Registry, Sorting, Audit Trail, AI & Reports", () => {
  beforeEach(() => {
    process.env.DATABASE_PATH = ":memory:";
    resetDbConnectionForTests();
    ensureSeeded(true);

    // Insert deterministic test market prices
    const db = getDb();
    const now = new Date().toISOString();
    const insertPrice = db.prepare(`
      INSERT OR REPLACE INTO market_snapshots (
        symbol, base_asset, quote_asset, price_usdt, price_change_pct_24h,
        quote_volume_24h, high_24h, low_24h, market_cap, fdv, price_source, fetched_at
      ) VALUES (?, ?, 'USDT', ?, 2.5, 100000000, ?, ?, ?, ?, 'Binance Test', ?)
    `);
    insertPrice.run("BTCUSDT", "BTC", 95000, 96000, 94000, 1_800_000_000_000, 1_990_000_000_000, now);
    insertPrice.run("XLMUSDT", "XLM", 0.32, 0.34, 0.31, 9_500_000_000, 16_000_000_000, now);
    insertPrice.run("HBARUSDT", "HBAR", 0.21, 0.22, 0.20, 8_000_000_000, 10_500_000_000, now);
  });

  it("sorts Halal assets by Lowest Unit Price -> Highest by default and excludes Non-Compliant", () => {
    const dir = getDirectoryAssets({ sort: "price_asc", pageSize: 50 });
    expect(dir.rows.length).toBeGreaterThan(20);
    // Excluded assets like AAVE must not appear in default Halal view
    expect(dir.rows.some((r) => r.symbol === "AAVEUSDT")).toBe(false);
    // Priced assets must be strictly ascending
    const priced = dir.rows.filter((r) => r.priceUsdt !== null);
    expect(priced[0].symbol).toBe("HBARUSDT");
    expect(priced[1].symbol).toBe("XLMUSDT");
    expect(priced[2].symbol).toBe("BTCUSDT");
  });

  it("logs audit trail and alert when Shariah classification changes", () => {
    const res = upsertShariahAssessment({
      symbol: "SEIUSDT",
      classification: "HALAL",
      authorityName: "Independent Review Board",
      sourceUrl: "https://sharlife.my",
      methodology: "Updated screening review",
      coreActivityNotesEn: "Reviewed as permissible L1 utility",
      coreActivityNotesAr: "تمت مراجعتها كمباح",
      reason: "Unit test upgrade",
    });
    expect(res.changedClassification).toBe(true);
    expect(res.previousClassification).toBe("HALAL_WITH_CONDITIONS");

    const detail = getAssetDetail("SEIUSDT");
    expect(detail?.shariah.classification).toBe("HALAL");
    expect(detail?.auditLog.length).toBeGreaterThan(0);

    const watch = toggleWatchlist("BTCUSDT");
    expect(watch.inWatchlist).toBe(true);

    const snap = captureHistoricalSnapshots();
    expect(snap.captured).toBeGreaterThan(20);
  });

  it("answers grounded AI research questions and generates valid Excel, CSV & PDF reports", async () => {
    const ai = await runAiResearchQuery({
      question: "لماذا XLM مصنفة مباحة؟ وما هي الجهة المرجعية؟",
      symbol: "XLMUSDT",
      lang: "ar",
    });
    expect(ai.symbolAnalyzed).toBe("XLMUSDT");
    expect(ai.answer).toContain("Shariyah Review Bureau");
    expect(ai.citations.length).toBeGreaterThan(0);

    const csv = generateCsvReport({ sort: "price_asc" });
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain("XLMUSDT");

    const xlsx = await generateExcelReport({ sort: "price_asc" });
    expect(xlsx.byteLength).toBeGreaterThan(5000);

    const pdf = generatePdfReport({ sort: "price_asc" });
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
  });

  it("compares semantic versions accurately for GitHub Release auto-updates", () => {
    expect(compareSemver("1.0.1", "1.0.0")).toBe(1);
    expect(compareSemver("v1.2.0", "1.1.9")).toBe(1);
    expect(compareSemver("1.0.0", "v1.0.0")).toBe(0);
    expect(compareSemver("1.0.0", "1.1.0")).toBe(-1);
  });

  it("validates Bybit Spot USDT pairs and rejects leveraged ETP tokens", () => {
    expect(
      isEligibleBybitSpotUsdt({
        symbol: "KASUSDT",
        baseCoin: "KAS",
        quoteCoin: "USDT",
        status: "Trading",
      })
    ).toBe(true);

    expect(
      isEligibleBybitSpotUsdt({
        symbol: "BTC3LUSDT",
        baseCoin: "BTC3L",
        quoteCoin: "USDT",
        status: "Trading",
      })
    ).toBe(false);

    expect(
      isEligibleBybitSpotUsdt({
        symbol: "ETH2SUSDT",
        baseCoin: "ETH2S",
        quoteCoin: "USDT",
        status: "Trading",
      })
    ).toBe(false);

    expect(
      isEligibleBybitSpotUsdt({
        symbol: "SOLUSDC",
        baseCoin: "SOL",
        quoteCoin: "USDC",
        status: "Trading",
      })
    ).toBe(false);
  });

  it("clusters Order Book Buy & Sell Liquidity Walls and computes combined imbalance", () => {
    const analysis = computeOrderBookLiquidityAnalysis({
      symbol: "BTCUSDT",
      venueMode: "COMBINED",
      books: [
        {
          venue: "BINANCE",
          bids: [
            { price: 99950, qty: 2.0 },
            { price: 99500, qty: 18.0 }, // Major Buy Wall ($1.79M)
            { price: 99000, qty: 3.0 },
          ],
          asks: [
            { price: 100050, qty: 1.5 },
            { price: 100800, qty: 8.0 }, // Sell Wall ($806K)
            { price: 101200, qty: 2.0 },
          ],
        },
        {
          venue: "BYBIT",
          bids: [
            { price: 99940, qty: 1.5 },
            { price: 99510, qty: 10.0 }, // Reinforces 99.5k Buy Wall ($995K)
          ],
          asks: [
            { price: 100060, qty: 1.0 },
            { price: 100810, qty: 4.0 },
          ],
        },
      ],
    });

    expect(analysis.venuesIncluded).toEqual(["BINANCE", "BYBIT"]);
    expect(analysis.buyPressurePct2Pct).toBeGreaterThan(60);
    expect(analysis.pressureBias === "STRONG_BUY" || analysis.pressureBias === "BUY_BIAS").toBe(true);
    expect(analysis.buyWalls.length).toBeGreaterThan(0);
    expect(analysis.sellWalls.length).toBeGreaterThan(0);
    expect(analysis.buyWalls[0].notionalUsd).toBeGreaterThan(2_500_000);
    expect(analysis.buyWalls[0].venues).toContain("BINANCE");
    expect(analysis.buyWalls[0].venues).toContain("BYBIT");
    expect(analysis.depthCurve.length).toBeGreaterThan(30);
  });

  it("loads 90+ curated Binance & Bybit Spot assets and filters Bybit exclusives", () => {
    expect(VERIFIED_SEED_ASSETS.length).toBeGreaterThanOrEqual(90);

    const bybitOnly = getDirectoryAssets({
      classifications: "ALL",
      exchange: "BYBIT_EXCLUSIVE",
      pageSize: 50,
    });
    expect(bybitOnly.rows.some((r) => r.symbol === "KASUSDT")).toBe(true);
    expect(bybitOnly.rows.some((r) => r.symbol === "MNTUSDT")).toBe(true);
    expect(bybitOnly.rows.some((r) => r.symbol === "BTCUSDT")).toBe(false);

    // Ensure Riba/Meme exclusions are enforced in default Halal view
    const halalDir = getDirectoryAssets({ pageSize: 200 });
    expect(halalDir.rows.some((r) => r.symbol === "ONDOUSDT")).toBe(false);
    expect(halalDir.rows.some((r) => r.symbol === "PEPEUSDT")).toBe(false);
    expect(halalDir.rows.some((r) => r.symbol === "KASUSDT")).toBe(true);
  });

  it("persists AI Agent settings and analyzes unverified coins with AI_OPINION badge", async () => {
    // Insert a brand-new unverified coin discovered on Bybit Spot
    const db = getDb();
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO assets (symbol, base_asset, quote_asset, name, category, binance_status, bybit_status, is_spot_allowed, spot_verified_at, is_curated, created_at, updated_at)
       VALUES ('NEWL2USDT', 'NEWL2', 'USDT', 'NewRollup', 'Layer 2 Infrastructure', 'NOT_LISTED', 'TRADING', 1, ?, 0, ?, ?)`
    ).run(now, now, now);
    db.prepare(
      `INSERT INTO market_snapshots (symbol, base_asset, quote_asset, price_usdt, quote_volume_24h, market_cap, fdv, primary_exchange, price_source, fetched_at)
       VALUES ('NEWL2USDT', 'NEWL2', 'USDT', 0.45, 25000000, 300000000, 450000000, 'BYBIT', 'Bybit Test', ?)`
    ).run(now);

    saveAiAgentSettings({
      provider: "builtin_heuristic",
      apiKey: "sk-test-secret-9876",
      model: "hci-evidence-v1.1",
    });
    const masked = getAiAgentSettings(false);
    expect(masked.provider).toBe("builtin_heuristic");
    expect(masked.apiKey).toBe("••••••••9876");

    const aiRes = await analyzeAndSaveAssetWithAi({
      symbol: "NEWL2USDT",
      lang: "ar",
    });
    expect(aiRes.ok).toBe(true);
    expect(aiRes.detail?.shariah.verificationStatus).toBe("AI_OPINION");
    expect(aiRes.detail?.overview.shariahVerificationStatus).toBe("AI_OPINION");
    expect(aiRes.detail?.credibility.score).not.toBeNull();
    expect(aiRes.detail?.scenarios.length).toBe(3);
  });
});
