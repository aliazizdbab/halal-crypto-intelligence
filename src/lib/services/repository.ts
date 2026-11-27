import { getDb, runInTransaction } from "@/lib/db/client";
import { ensureSeeded } from "@/lib/db/seed";
import { computeCredibilityScore, computeInvestmentPotential, type InvestmentScoreComponent } from "./scoring";
import {
  CREDIBILITY_WEIGHTS,
  type AlertRecord,
  type AlertRuleRecord,
  type AssetDirectoryRow,
  type AuditLogRecord,
  type ConfidenceLevel,
  type CredibilityFactorKey,
  type CredibilityFactorRecord,
  type DashboardSummary,
  type HistoricalSnapshotRecord,
  type InvestmentScenarioRecord,
  type RiskLevel,
  type ShariahAssessmentRecord,
  type ShariahClassification,
  type TokenomicsProfileRecord,
  type VerificationStatus,
} from "@/types/domain";

export type DirectorySortOption =
  | "price_asc"
  | "price_desc"
  | "credibility_desc"
  | "potential_desc"
  | "market_cap_desc"
  | "volume_desc"
  | "volatility_asc"
  | "liquidity_desc"
  | "dilution_asc"
  | "combined_desc";

export interface DirectoryQueryOptions {
  classifications?: ShariahClassification[] | "ALL";
  search?: string;
  riskLevels?: RiskLevel[];
  minCredibility?: number;
  minPotential?: number;
  minVolume24h?: number;
  watchlistOnly?: boolean;
  sort?: DirectorySortOption;
  page?: number;
  pageSize?: number;
  includeInactive?: boolean;
}

export interface DirectoryQueryResult {
  rows: AssetDirectoryRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  sort: DirectorySortOption;
  generatedAt: string;
}

interface RawAssetJoinRow {
  symbol: string;
  base_asset: string;
  quote_asset: string;
  name: string;
  category: string;
  binance_status: string;
  is_spot_allowed: number;
  spot_verified_at: string;
  official_website: string | null;
  github_repo: string | null;
  description_en: string;
  description_ar: string;
  price_usdt: number | null;
  price_change_24h: number | null;
  price_change_pct_24h: number | null;
  volume_24h: number | null;
  quote_volume_24h: number | null;
  high_24h: number | null;
  low_24h: number | null;
  bid_price: number | null;
  ask_price: number | null;
  spread_pct: number | null;
  market_cap: number | null;
  fdv: number | null;
  circulating_supply: number | null;
  total_supply: number | null;
  max_supply: number | null;
  price_source: string | null;
  market_cap_source: string | null;
  market_fetched_at: string | null;
  shariah_classification: ShariahClassification | null;
  authority_name: string | null;
  shariah_source_url: string | null;
  assessment_date: string | null;
  methodology: string | null;
  conditions_en: string | null;
  conditions_ar: string | null;
  scholarly_disagreements_en: string | null;
  scholarly_disagreements_ar: string | null;
  shariah_confidence: ConfidenceLevel | null;
  inflation_rate_pct: number | null;
  insider_allocation_pct: number | null;
  next_major_unlock_date: string | null;
  next_major_unlock_pct: number | null;
  risk_flags_json: string | null;
  tokenomics_risk: RiskLevel | null;
  in_watchlist: number;
}

function loadAllCredibilityFactorsBySymbol(): Map<string, CredibilityFactorRecord[]> {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT symbol, factor_key, weight, score, evidence_en, evidence_ar,
              source_name, source_url, research_date, confidence_level, is_available
       FROM credibility_factors`
    )
    .all() as Array<{
    symbol: string;
    factor_key: CredibilityFactorKey;
    weight: number;
    score: number | null;
    evidence_en: string;
    evidence_ar: string;
    source_name: string;
    source_url: string | null;
    research_date: string;
    confidence_level: ConfidenceLevel;
    is_available: number;
  }>;

  const map = new Map<string, CredibilityFactorRecord[]>();
  for (const r of rows) {
    const list = map.get(r.symbol) || [];
    list.push({
      symbol: r.symbol,
      factorKey: r.factor_key,
      weight: r.weight,
      score: r.score,
      evidenceEn: r.evidence_en,
      evidenceAr: r.evidence_ar,
      sourceName: r.source_name,
      sourceUrl: r.source_url,
      researchDate: r.research_date,
      confidenceLevel: r.confidence_level,
      isAvailable: r.is_available === 1,
    });
    map.set(r.symbol, list);
  }
  return map;
}

export function buildAllEvaluatedRows(includeInactive = false): AssetDirectoryRow[] {
  ensureSeeded();
  const db = getDb();

  const whereClause = includeInactive
    ? "WHERE a.quote_asset = 'USDT'"
    : "WHERE a.binance_status = 'TRADING' AND a.is_spot_allowed = 1 AND a.quote_asset = 'USDT'";

  const rawRows = db
    .prepare(
      `SELECT
        a.symbol, a.base_asset, a.quote_asset, a.name, a.category,
        a.binance_status, a.is_spot_allowed, a.spot_verified_at,
        a.official_website, a.github_repo, a.description_en, a.description_ar,
        m.price_usdt, m.price_change_24h, m.price_change_pct_24h,
        m.volume_24h, m.quote_volume_24h, m.high_24h, m.low_24h,
        m.bid_price, m.ask_price, m.spread_pct,
        m.market_cap, m.fdv, m.circulating_supply, m.total_supply, m.max_supply,
        m.price_source, m.market_cap_source, m.fetched_at AS market_fetched_at,
        s.classification AS shariah_classification, s.authority_name,
        s.source_url AS shariah_source_url, s.assessment_date, s.methodology,
        s.conditions_en, s.conditions_ar,
        s.scholarly_disagreements_en, s.scholarly_disagreements_ar,
        s.confidence_level AS shariah_confidence,
        t.inflation_rate_pct, t.insider_allocation_pct,
        t.next_major_unlock_date, t.next_major_unlock_pct,
        t.risk_flags_json, t.tokenomics_risk,
        CASE WHEN w.symbol IS NOT NULL THEN 1 ELSE 0 END AS in_watchlist
      FROM assets a
      LEFT JOIN market_snapshots m ON m.symbol = a.symbol
      LEFT JOIN shariah_assessments s ON s.symbol = a.symbol
      LEFT JOIN tokenomics_profiles t ON t.symbol = a.symbol
      LEFT JOIN watchlists w ON w.symbol = a.symbol
      ${whereClause}`
    )
    .all() as unknown as RawAssetJoinRow[];

  const credMap = loadAllCredibilityFactorsBySymbol();

  return rawRows.map((r) => {
    const credFactors = credMap.get(r.symbol) || [];
    const cred = computeCredibilityScore(credFactors);
    let parsedFlags: string[] = [];
    if (r.risk_flags_json) {
      try {
        parsedFlags = JSON.parse(r.risk_flags_json) as string[];
      } catch {
        parsedFlags = [];
      }
    }

    const inv = computeInvestmentPotential({
      category: r.category,
      priceUsdt: r.price_usdt,
      high24h: r.high_24h,
      low24h: r.low_24h,
      quoteVolume24h: r.quote_volume_24h,
      spreadPct: r.spread_pct,
      marketCap: r.market_cap,
      fdv: r.fdv,
      circulatingSupply: r.circulating_supply,
      maxSupply: r.max_supply,
      inflationRatePct: r.inflation_rate_pct,
      insiderAllocationPct: r.insider_allocation_pct,
      nextMajorUnlockPct: r.next_major_unlock_pct,
      existingRiskFlags: parsedFlags,
      baseTokenomicsRisk: r.tokenomics_risk || "UNAVAILABLE",
      credibilityFactors: credFactors,
    });

    const combinedResearchRating =
      cred.score !== null && inv.score !== null
        ? Number((cred.score * 0.52 + inv.score * 0.48).toFixed(1))
        : null;

    return {
      rank: 0,
      symbol: r.symbol,
      baseAsset: r.base_asset,
      quoteAsset: r.quote_asset,
      name: r.name,
      category: r.category,
      binanceStatus: r.binance_status,
      isSpotAllowed: r.is_spot_allowed === 1,
      spotVerifiedAt: r.spot_verified_at,
      officialWebsite: r.official_website,
      githubRepo: r.github_repo,
      binanceSpotUrl: `https://www.binance.com/en/trade/${r.base_asset}_${r.quote_asset}?type=spot`,
      priceUsdt: r.price_usdt,
      priceChange24h: r.price_change_24h,
      priceChangePct24h: r.price_change_pct_24h,
      volume24h: r.volume_24h,
      quoteVolume24h: r.quote_volume_24h,
      high24h: r.high_24h,
      low24h: r.low_24h,
      bidPrice: r.bid_price,
      askPrice: r.ask_price,
      spreadPct: r.spread_pct,
      marketCap: r.market_cap,
      fdv: r.fdv,
      circulatingSupply: r.circulating_supply,
      maxSupply: r.max_supply,
      marketFetchedAt: r.market_fetched_at,
      priceSource: r.price_source || "Binance Spot Public API",
      marketCapSource: r.market_cap_source,
      shariahClassification: r.shariah_classification || "UNVERIFIED",
      shariahAuthority: r.authority_name || "DATA UNAVAILABLE – REQUIRES VERIFICATION",
      shariahSourceUrl: r.shariah_source_url,
      shariahAssessmentDate: r.assessment_date,
      shariahMethodology: r.methodology,
      shariahConditionsEn: r.conditions_en,
      shariahConditionsAr: r.conditions_ar,
      shariahDisagreementsEn: r.scholarly_disagreements_en,
      shariahDisagreementsAr: r.scholarly_disagreements_ar,
      shariahConfidence: r.shariah_confidence || "UNAVAILABLE",
      credibilityScore: cred.score,
      credibilityConfidence: cred.confidence,
      investmentPotentialScore: inv.score,
      investmentConfidence: inv.confidence,
      combinedResearchRating,
      tokenomicsRisk: inv.computedTokenomicsRisk,
      overallRiskLevel: inv.overallRiskLevel,
      dilutionRatio: inv.dilutionRatio,
      liquidityScore: inv.liquidityScore,
      volatility24hPct: inv.volatility24hPct,
      nextMajorUnlockDate: r.next_major_unlock_date,
      nextMajorUnlockPct: r.next_major_unlock_pct,
      inWatchlist: r.in_watchlist === 1,
    };
  });
}

function sortNullableNumber(a: number | null, b: number | null, dir: "asc" | "desc"): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return dir === "asc" ? a - b : b - a;
}

export function getDirectoryAssets(options: DirectoryQueryOptions = {}): DirectoryQueryResult {
  const sort: DirectorySortOption = options.sort || "price_asc";
  const page = Math.max(1, options.page || 1);
  const pageSize = Math.min(500, Math.max(1, options.pageSize || 50));

  let rows = buildAllEvaluatedRows(Boolean(options.includeInactive));

  // Filter by Shariah classification
  if (options.classifications !== "ALL") {
    const allowed = new Set<ShariahClassification>(
      options.classifications && options.classifications.length > 0
        ? options.classifications
        : ["HALAL", "HALAL_WITH_CONDITIONS"]
    );
    rows = rows.filter((r) => allowed.has(r.shariahClassification));
  }

  // Search filter
  if (options.search && options.search.trim().length > 0) {
    const q = options.search.trim().toLowerCase();
    rows = rows.filter(
      (r) =>
        r.symbol.toLowerCase().includes(q) ||
        r.baseAsset.toLowerCase().includes(q) ||
        r.name.toLowerCase().includes(q) ||
        r.category.toLowerCase().includes(q) ||
        r.shariahAuthority.toLowerCase().includes(q)
    );
  }

  if (options.riskLevels && options.riskLevels.length > 0) {
    const rSet = new Set(options.riskLevels);
    rows = rows.filter((r) => rSet.has(r.overallRiskLevel));
  }

  if (options.minCredibility !== undefined && options.minCredibility > 0) {
    rows = rows.filter((r) => r.credibilityScore !== null && r.credibilityScore >= options.minCredibility!);
  }

  if (options.minPotential !== undefined && options.minPotential > 0) {
    rows = rows.filter(
      (r) => r.investmentPotentialScore !== null && r.investmentPotentialScore >= options.minPotential!
    );
  }

  if (options.minVolume24h !== undefined && options.minVolume24h > 0) {
    rows = rows.filter((r) => r.quoteVolume24h !== null && r.quoteVolume24h >= options.minVolume24h!);
  }

  if (options.watchlistOnly) {
    rows = rows.filter((r) => r.inWatchlist);
  }

  // Sorting — Default is MANDATORY Lowest unit price -> Highest unit price
  rows.sort((a, b) => {
    switch (sort) {
      case "price_asc":
        return sortNullableNumber(a.priceUsdt, b.priceUsdt, "asc") || a.symbol.localeCompare(b.symbol);
      case "price_desc":
        return sortNullableNumber(a.priceUsdt, b.priceUsdt, "desc") || a.symbol.localeCompare(b.symbol);
      case "credibility_desc":
        return sortNullableNumber(a.credibilityScore, b.credibilityScore, "desc") || a.symbol.localeCompare(b.symbol);
      case "potential_desc":
        return (
          sortNullableNumber(a.investmentPotentialScore, b.investmentPotentialScore, "desc") ||
          a.symbol.localeCompare(b.symbol)
        );
      case "market_cap_desc":
        return sortNullableNumber(a.marketCap, b.marketCap, "desc") || a.symbol.localeCompare(b.symbol);
      case "volume_desc":
        return sortNullableNumber(a.quoteVolume24h, b.quoteVolume24h, "desc") || a.symbol.localeCompare(b.symbol);
      case "volatility_asc":
        return sortNullableNumber(a.volatility24hPct, b.volatility24hPct, "asc") || a.symbol.localeCompare(b.symbol);
      case "liquidity_desc":
        return sortNullableNumber(a.liquidityScore, b.liquidityScore, "desc") || sortNullableNumber(a.quoteVolume24h, b.quoteVolume24h, "desc");
      case "dilution_asc":
        return sortNullableNumber(a.dilutionRatio, b.dilutionRatio, "asc") || a.symbol.localeCompare(b.symbol);
      case "combined_desc":
        return (
          sortNullableNumber(a.combinedResearchRating, b.combinedResearchRating, "desc") ||
          a.symbol.localeCompare(b.symbol)
        );
      default:
        return sortNullableNumber(a.priceUsdt, b.priceUsdt, "asc");
    }
  });

  // Assign rank after sorting
  const ranked = rows.map((row, idx) => ({ ...row, rank: idx + 1 }));
  const total = ranked.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = (page - 1) * pageSize;
  const paged = ranked.slice(start, start + pageSize);

  return {
    rows: paged,
    total,
    page,
    pageSize,
    totalPages,
    sort,
    generatedAt: new Date().toISOString(),
  };
}

export function getDashboardSummary(): DashboardSummary {
  ensureSeeded();
  const db = getDb();
  const allRows = buildAllEvaluatedRows(false);

  const countHalal = allRows.filter((r) => r.shariahClassification === "HALAL").length;
  const countHalalWithConditions = allRows.filter((r) => r.shariahClassification === "HALAL_WITH_CONDITIONS").length;
  const countScholarlyDisagreement = allRows.filter((r) => r.shariahClassification === "SCHOLARLY_DISAGREEMENT").length;
  const countNonCompliant = allRows.filter((r) => r.shariahClassification === "NON_COMPLIANT").length;
  const countUnverified = allRows.filter((r) => r.shariahClassification === "UNVERIFIED").length;
  const screened = allRows.filter((r) => r.shariahClassification !== "UNVERIFIED");

  const totalScreenedMarketCap = screened.reduce((acc, r) => acc + (r.marketCap || 0), 0);

  const credScores = screened.map((r) => r.credibilityScore).filter((s): s is number => s !== null);
  const invScores = screened.map((r) => r.investmentPotentialScore).filter((s): s is number => s !== null);

  const averageCredibilityScore =
    credScores.length > 0
      ? Number((credScores.reduce((a, b) => a + b, 0) / credScores.length).toFixed(1))
      : null;
  const averageInvestmentPotentialScore =
    invScores.length > 0
      ? Number((invScores.reduce((a, b) => a + b, 0) / invScores.length).toFixed(1))
      : null;

  const newlyAddedRows = db
    .prepare(
      `SELECT a.symbol, a.name, a.base_asset, a.created_at, COALESCE(s.classification, 'UNVERIFIED') AS classification
       FROM assets a
       LEFT JOIN shariah_assessments s ON s.symbol = a.symbol
       WHERE a.binance_status = 'TRADING' AND a.is_spot_allowed = 1
       ORDER BY a.created_at DESC
       LIMIT 6`
    )
    .all() as Array<{
    symbol: string;
    name: string;
    base_asset: string;
    created_at: string;
    classification: ShariahClassification;
  }>;

  const recentShariahChanges = db
    .prepare(
      `SELECT l.symbol, l.previous_value, l.new_value, l.created_at, COALESCE(s.authority_name, 'Admin Review') AS authority
       FROM research_audit_log l
       LEFT JOIN shariah_assessments s ON s.symbol = l.symbol
       WHERE l.entity_type = 'SHARIAH' AND l.field_name = 'classification'
       ORDER BY l.created_at DESC
       LIMIT 6`
    )
    .all() as Array<{
    symbol: string;
    previous_value: string | null;
    new_value: string;
    created_at: string;
    authority: string;
  }>;

  const upcomingUnlockRows = db
    .prepare(
      `SELECT t.symbol, a.name, t.next_major_unlock_date, t.next_major_unlock_pct,
              t.unlock_schedule_summary_en, t.unlock_schedule_summary_ar
       FROM tokenomics_profiles t
       JOIN assets a ON a.symbol = t.symbol
       WHERE t.next_major_unlock_date IS NOT NULL
       ORDER BY t.next_major_unlock_date ASC
       LIMIT 6`
    )
    .all() as Array<{
    symbol: string;
    name: string;
    next_major_unlock_date: string;
    next_major_unlock_pct: number | null;
    unlock_schedule_summary_en: string;
    unlock_schedule_summary_ar: string;
  }>;

  const binanceSync = db
    .prepare("SELECT status, last_synced_at FROM sync_status WHERE service_name = 'binance_spot'")
    .get() as { status: string; last_synced_at: string } | undefined;

  const mcapSync = db
    .prepare("SELECT last_synced_at FROM sync_status WHERE service_name = 'market_cap'")
    .get() as { last_synced_at: string } | undefined;

  const binanceStatus =
    (binanceSync?.status as DashboardSummary["binanceConnectionStatus"]) || "NOT_SYNCED";

  return {
    totalBinanceSpotUsdtPairs: allRows.length,
    totalScreenedAssets: screened.length,
    countHalal,
    countHalalWithConditions,
    countScholarlyDisagreement,
    countNonCompliant,
    countUnverified,
    totalScreenedMarketCap,
    averageCredibilityScore,
    averageInvestmentPotentialScore,
    newlyAddedAssets: newlyAddedRows.map((r) => ({
      symbol: r.symbol,
      name: r.name,
      baseAsset: r.base_asset,
      createdAt: r.created_at,
      shariahClassification: r.classification,
    })),
    recentlyChangedShariah: recentShariahChanges.map((r) => ({
      symbol: r.symbol,
      previousValue: r.previous_value,
      newValue: r.new_value,
      changedAt: r.created_at,
      authority: r.authority,
    })),
    upcomingMajorUnlocks: upcomingUnlockRows.map((r) => ({
      symbol: r.symbol,
      name: r.name,
      unlockDate: r.next_major_unlock_date,
      unlockPct: r.next_major_unlock_pct,
      summaryEn: r.unlock_schedule_summary_en,
      summaryAr: r.unlock_schedule_summary_ar,
    })),
    lastBinanceSyncAt: binanceSync?.last_synced_at ?? null,
    lastMarketCapSyncAt: mcapSync?.last_synced_at ?? null,
    binanceConnectionStatus: binanceStatus,
  };
}

export interface AssetFullDetail {
  overview: AssetDirectoryRow & {
    descriptionEn: string;
    descriptionAr: string;
    totalSupply: number | null;
  };
  shariah: ShariahAssessmentRecord;
  credibility: {
    score: number | null;
    confidence: ConfidenceLevel;
    availableWeightPct: number;
    missingFactors: string[];
    factors: CredibilityFactorRecord[];
  };
  investmentPotential: {
    score: number | null;
    confidence: ConfidenceLevel;
    components: InvestmentScoreComponent[];
    dynamicRiskFlags: string[];
  };
  tokenomics: TokenomicsProfileRecord;
  scenarios: InvestmentScenarioRecord[];
  historicalSnapshots: HistoricalSnapshotRecord[];
  auditLog: AuditLogRecord[];
}

export function getAssetDetail(symbolParam: string): AssetFullDetail | null {
  ensureSeeded();
  const db = getDb();
  const normalized = symbolParam.toUpperCase().endsWith("USDT")
    ? symbolParam.toUpperCase()
    : `${symbolParam.toUpperCase()}USDT`;

  const assetRow = db
    .prepare("SELECT * FROM assets WHERE symbol = ? OR base_asset = ? LIMIT 1")
    .get(normalized, symbolParam.toUpperCase()) as
    | {
        symbol: string;
        base_asset: string;
        quote_asset: string;
        name: string;
        category: string;
        binance_status: string;
        is_spot_allowed: number;
        spot_verified_at: string;
        official_website: string | null;
        github_repo: string | null;
        description_en: string;
        description_ar: string;
      }
    | undefined;

  if (!assetRow) return null;
  const sym = assetRow.symbol;

  const market = db.prepare("SELECT * FROM market_snapshots WHERE symbol = ?").get(sym) as
    | {
        price_usdt: number | null;
        price_change_24h: number | null;
        price_change_pct_24h: number | null;
        volume_24h: number | null;
        quote_volume_24h: number | null;
        high_24h: number | null;
        low_24h: number | null;
        bid_price: number | null;
        ask_price: number | null;
        spread_pct: number | null;
        market_cap: number | null;
        fdv: number | null;
        circulating_supply: number | null;
        total_supply: number | null;
        max_supply: number | null;
        price_source: string;
        market_cap_source: string | null;
        fetched_at: string;
      }
    | undefined;

  const shariahRow = db.prepare("SELECT * FROM shariah_assessments WHERE symbol = ?").get(sym) as
    | {
        symbol: string;
        base_asset: string;
        classification: ShariahClassification;
        authority_name: string;
        source_url: string | null;
        assessment_date: string | null;
        methodology: string;
        core_activity_notes_en: string;
        core_activity_notes_ar: string;
        conditions_en: string | null;
        conditions_ar: string | null;
        scholarly_disagreements_en: string | null;
        scholarly_disagreements_ar: string | null;
        verification_status: VerificationStatus;
        confidence_level: ConfidenceLevel;
        last_verified_at: string;
      }
    | undefined;

  const shariah: ShariahAssessmentRecord = shariahRow
    ? {
        symbol: shariahRow.symbol,
        baseAsset: shariahRow.base_asset,
        classification: shariahRow.classification,
        authorityName: shariahRow.authority_name,
        sourceUrl: shariahRow.source_url,
        assessmentDate: shariahRow.assessment_date || "DATA UNAVAILABLE",
        methodology: shariahRow.methodology,
        coreActivityNotesEn: shariahRow.core_activity_notes_en,
        coreActivityNotesAr: shariahRow.core_activity_notes_ar,
        conditionsEn: shariahRow.conditions_en,
        conditionsAr: shariahRow.conditions_ar,
        scholarlyDisagreementsEn: shariahRow.scholarly_disagreements_en,
        scholarlyDisagreementsAr: shariahRow.scholarly_disagreements_ar,
        verificationStatus: shariahRow.verification_status,
        confidenceLevel: shariahRow.confidence_level,
        lastVerifiedAt: shariahRow.last_verified_at,
      }
    : {
        symbol: sym,
        baseAsset: assetRow.base_asset,
        classification: "UNVERIFIED",
        authorityName: "DATA UNAVAILABLE – REQUIRES VERIFICATION",
        sourceUrl: null,
        assessmentDate: "DATA UNAVAILABLE",
        methodology: "Not yet screened",
        coreActivityNotesEn: "DATA UNAVAILABLE – REQUIRES VERIFICATION",
        coreActivityNotesAr: "البيانات غير متوفرة – تتطلب تحققاً",
        conditionsEn: null,
        conditionsAr: null,
        scholarlyDisagreementsEn: null,
        scholarlyDisagreementsAr: null,
        verificationStatus: "UNVERIFIED",
        confidenceLevel: "UNAVAILABLE",
        lastVerifiedAt: assetRow.spot_verified_at,
      };

  const factorRows = db
    .prepare("SELECT * FROM credibility_factors WHERE symbol = ?")
    .all(sym) as Array<{
    symbol: string;
    factor_key: CredibilityFactorKey;
    weight: number;
    score: number | null;
    evidence_en: string;
    evidence_ar: string;
    source_name: string;
    source_url: string | null;
    research_date: string;
    confidence_level: ConfidenceLevel;
    is_available: number;
  }>;

  // Ensure all 7 weighted factors are represented cleanly (missing ones explicitly marked DATA UNAVAILABLE)
  const factorByKey = new Map(factorRows.map((f) => [f.factor_key, f]));
  const factors: CredibilityFactorRecord[] = (Object.keys(CREDIBILITY_WEIGHTS) as CredibilityFactorKey[]).map(
    (key) => {
      const f = factorByKey.get(key);
      if (f) {
        return {
          symbol: sym,
          factorKey: key,
          weight: CREDIBILITY_WEIGHTS[key],
          score: f.score,
          evidenceEn: f.evidence_en,
          evidenceAr: f.evidence_ar,
          sourceName: f.source_name,
          sourceUrl: f.source_url,
          researchDate: f.research_date,
          confidenceLevel: f.confidence_level,
          isAvailable: f.is_available === 1,
        };
      }
      return {
        symbol: sym,
        factorKey: key,
        weight: CREDIBILITY_WEIGHTS[key],
        score: null,
        evidenceEn: "DATA UNAVAILABLE – REQUIRES VERIFICATION",
        evidenceAr: "البيانات غير متوفرة – تتطلب تحققاً",
        sourceName: "DATA UNAVAILABLE – REQUIRES VERIFICATION",
        sourceUrl: null,
        researchDate: "N/A",
        confidenceLevel: "UNAVAILABLE",
        isAvailable: false,
      };
    }
  );

  const credCalc = computeCredibilityScore(factors);

  const tokRow = db.prepare("SELECT * FROM tokenomics_profiles WHERE symbol = ?").get(sym) as
    | {
        inflation_rate_pct: number | null;
        insider_allocation_pct: number | null;
        team_allocation_pct: number | null;
        vc_allocation_pct: number | null;
        community_allocation_pct: number | null;
        treasury_allocation_pct: number | null;
        unlock_schedule_summary_en: string;
        unlock_schedule_summary_ar: string;
        next_major_unlock_date: string | null;
        next_major_unlock_pct: number | null;
        token_utility_en: string;
        token_utility_ar: string;
        burn_mechanism_en: string;
        burn_mechanism_ar: string;
        staking_mechanism_en: string;
        staking_mechanism_ar: string;
        governance_rights_en: string;
        governance_rights_ar: string;
        risk_flags_json: string;
        tokenomics_risk: RiskLevel;
        source_name: string;
        source_url: string | null;
        last_updated: string;
      }
    | undefined;

  let baseFlags: string[] = [];
  if (tokRow?.risk_flags_json) {
    try {
      baseFlags = JSON.parse(tokRow.risk_flags_json) as string[];
    } catch {
      baseFlags = [];
    }
  }

  const invCalc = computeInvestmentPotential({
    category: assetRow.category,
    priceUsdt: market?.price_usdt ?? null,
    high24h: market?.high_24h ?? null,
    low24h: market?.low_24h ?? null,
    quoteVolume24h: market?.quote_volume_24h ?? null,
    spreadPct: market?.spread_pct ?? null,
    marketCap: market?.market_cap ?? null,
    fdv: market?.fdv ?? null,
    circulatingSupply: market?.circulating_supply ?? null,
    maxSupply: market?.max_supply ?? null,
    inflationRatePct: tokRow?.inflation_rate_pct ?? null,
    insiderAllocationPct: tokRow?.insider_allocation_pct ?? null,
    nextMajorUnlockPct: tokRow?.next_major_unlock_pct ?? null,
    existingRiskFlags: baseFlags,
    baseTokenomicsRisk: tokRow?.tokenomics_risk ?? "UNAVAILABLE",
    credibilityFactors: factors,
  });

  const tokenomics: TokenomicsProfileRecord = {
    symbol: sym,
    circulatingSupply: market?.circulating_supply ?? null,
    totalSupply: market?.total_supply ?? null,
    maxSupply: market?.max_supply ?? null,
    fdv: market?.fdv ?? null,
    marketCap: market?.market_cap ?? null,
    inflationRatePct: tokRow?.inflation_rate_pct ?? null,
    insiderAllocationPct: tokRow?.insider_allocation_pct ?? null,
    teamAllocationPct: tokRow?.team_allocation_pct ?? null,
    vcAllocationPct: tokRow?.vc_allocation_pct ?? null,
    communityAllocationPct: tokRow?.community_allocation_pct ?? null,
    treasuryAllocationPct: tokRow?.treasury_allocation_pct ?? null,
    unlockScheduleSummaryEn: tokRow?.unlock_schedule_summary_en || "DATA UNAVAILABLE – REQUIRES VERIFICATION",
    unlockScheduleSummaryAr: tokRow?.unlock_schedule_summary_ar || "البيانات غير متوفرة – تتطلب تحققاً",
    nextMajorUnlockDate: tokRow?.next_major_unlock_date ?? null,
    nextMajorUnlockPct: tokRow?.next_major_unlock_pct ?? null,
    tokenUtilityEn: tokRow?.token_utility_en || "DATA UNAVAILABLE – REQUIRES VERIFICATION",
    tokenUtilityAr: tokRow?.token_utility_ar || "البيانات غير متوفرة – تتطلب تحققاً",
    burnMechanismEn: tokRow?.burn_mechanism_en || "DATA UNAVAILABLE – REQUIRES VERIFICATION",
    burnMechanismAr: tokRow?.burn_mechanism_ar || "البيانات غير متوفرة – تتطلب تحققاً",
    stakingMechanismEn: tokRow?.staking_mechanism_en || "DATA UNAVAILABLE – REQUIRES VERIFICATION",
    stakingMechanismAr: tokRow?.staking_mechanism_ar || "البيانات غير متوفرة – تتطلب تحققاً",
    governanceRightsEn: tokRow?.governance_rights_en || "DATA UNAVAILABLE – REQUIRES VERIFICATION",
    governanceRightsAr: tokRow?.governance_rights_ar || "البيانات غير متوفرة – تتطلب تحققاً",
    riskFlags: invCalc.dynamicRiskFlags,
    tokenomicsRisk: invCalc.computedTokenomicsRisk,
    sourceName: tokRow?.source_name || "DATA UNAVAILABLE – REQUIRES VERIFICATION",
    sourceUrl: tokRow?.source_url ?? null,
    lastUpdated: tokRow?.last_updated || assetRow.spot_verified_at,
  };

  const scenarioRows = db
    .prepare("SELECT * FROM investment_scenarios WHERE symbol = ?")
    .all(sym) as Array<{
    symbol: string;
    scenario_type: "BEARISH" | "BASE" | "BULLISH";
    assumptions_en: string;
    assumptions_ar: string;
    catalysts_en: string;
    catalysts_ar: string;
    risks_en: string;
    risks_ar: string;
    time_horizon: string;
    supporting_evidence_en: string;
    supporting_evidence_ar: string;
    source_url: string | null;
    last_updated: string;
  }>;

  const scenarios: InvestmentScenarioRecord[] = scenarioRows.map((s) => ({
    symbol: s.symbol,
    scenarioType: s.scenario_type,
    assumptionsEn: s.assumptions_en,
    assumptionsAr: s.assumptions_ar,
    catalystsEn: s.catalysts_en,
    catalystsAr: s.catalysts_ar,
    risksEn: s.risks_en,
    risksAr: s.risks_ar,
    timeHorizon: s.time_horizon,
    supportingEvidenceEn: s.supporting_evidence_en,
    supportingEvidenceAr: s.supporting_evidence_ar,
    sourceUrl: s.source_url,
    lastUpdated: s.last_updated,
  }));

  const histRows = db
    .prepare("SELECT * FROM historical_snapshots WHERE symbol = ? ORDER BY recorded_at DESC LIMIT 30")
    .all(sym) as Array<{
    id: number;
    symbol: string;
    price_usdt: number | null;
    market_cap: number | null;
    shariah_classification: ShariahClassification;
    credibility_score: number | null;
    investment_potential_score: number | null;
    tokenomics_risk: RiskLevel;
    recorded_at: string;
  }>;

  const auditRows = db
    .prepare("SELECT * FROM research_audit_log WHERE symbol = ? ORDER BY created_at DESC LIMIT 30")
    .all(sym) as Array<{
    id: number;
    symbol: string;
    entity_type: AuditLogRecord["entityType"];
    field_name: string;
    previous_value: string | null;
    new_value: string;
    reason: string | null;
    source_url: string | null;
    created_at: string;
  }>;

  const watchRow = db.prepare("SELECT symbol FROM watchlists WHERE symbol = ?").get(sym);

  const combinedResearchRating =
    credCalc.score !== null && invCalc.score !== null
      ? Number((credCalc.score * 0.52 + invCalc.score * 0.48).toFixed(1))
      : null;

  return {
    overview: {
      rank: 0,
      symbol: sym,
      baseAsset: assetRow.base_asset,
      quoteAsset: assetRow.quote_asset,
      name: assetRow.name,
      category: assetRow.category,
      binanceStatus: assetRow.binance_status,
      isSpotAllowed: assetRow.is_spot_allowed === 1,
      spotVerifiedAt: assetRow.spot_verified_at,
      officialWebsite: assetRow.official_website,
      githubRepo: assetRow.github_repo,
      binanceSpotUrl: `https://www.binance.com/en/trade/${assetRow.base_asset}_${assetRow.quote_asset}?type=spot`,
      descriptionEn: assetRow.description_en || "DATA UNAVAILABLE – REQUIRES VERIFICATION",
      descriptionAr: assetRow.description_ar || "البيانات غير متوفرة – تتطلب تحققاً",
      priceUsdt: market?.price_usdt ?? null,
      priceChange24h: market?.price_change_24h ?? null,
      priceChangePct24h: market?.price_change_pct_24h ?? null,
      volume24h: market?.volume_24h ?? null,
      quoteVolume24h: market?.quote_volume_24h ?? null,
      high24h: market?.high_24h ?? null,
      low24h: market?.low_24h ?? null,
      bidPrice: market?.bid_price ?? null,
      askPrice: market?.ask_price ?? null,
      spreadPct: market?.spread_pct ?? null,
      marketCap: market?.market_cap ?? null,
      fdv: market?.fdv ?? null,
      circulatingSupply: market?.circulating_supply ?? null,
      totalSupply: market?.total_supply ?? null,
      maxSupply: market?.max_supply ?? null,
      marketFetchedAt: market?.fetched_at ?? null,
      priceSource: market?.price_source || "Binance Spot Public API",
      marketCapSource: market?.market_cap_source ?? null,
      shariahClassification: shariah.classification,
      shariahAuthority: shariah.authorityName,
      shariahSourceUrl: shariah.sourceUrl,
      shariahAssessmentDate: shariah.assessmentDate,
      shariahMethodology: shariah.methodology,
      shariahConditionsEn: shariah.conditionsEn,
      shariahConditionsAr: shariah.conditionsAr,
      shariahDisagreementsEn: shariah.scholarlyDisagreementsEn,
      shariahDisagreementsAr: shariah.scholarlyDisagreementsAr,
      shariahConfidence: shariah.confidenceLevel,
      credibilityScore: credCalc.score,
      credibilityConfidence: credCalc.confidence,
      investmentPotentialScore: invCalc.score,
      investmentConfidence: invCalc.confidence,
      combinedResearchRating,
      tokenomicsRisk: invCalc.computedTokenomicsRisk,
      overallRiskLevel: invCalc.overallRiskLevel,
      dilutionRatio: invCalc.dilutionRatio,
      liquidityScore: invCalc.liquidityScore,
      volatility24hPct: invCalc.volatility24hPct,
      nextMajorUnlockDate: tokenomics.nextMajorUnlockDate,
      nextMajorUnlockPct: tokenomics.nextMajorUnlockPct,
      inWatchlist: Boolean(watchRow),
    },
    shariah,
    credibility: {
      score: credCalc.score,
      confidence: credCalc.confidence,
      availableWeightPct: credCalc.availableWeightPct,
      missingFactors: credCalc.missingFactors,
      factors,
    },
    investmentPotential: {
      score: invCalc.score,
      confidence: invCalc.confidence,
      components: invCalc.components,
      dynamicRiskFlags: invCalc.dynamicRiskFlags,
    },
    tokenomics,
    scenarios,
    historicalSnapshots: histRows.map((h) => ({
      id: h.id,
      symbol: h.symbol,
      priceUsdt: h.price_usdt,
      marketCap: h.market_cap,
      shariahClassification: h.shariah_classification,
      credibilityScore: h.credibility_score,
      investmentPotentialScore: h.investment_potential_score,
      tokenomicsRisk: h.tokenomics_risk,
      recordedAt: h.recorded_at,
    })),
    auditLog: auditRows.map((a) => ({
      id: a.id,
      symbol: a.symbol,
      entityType: a.entity_type,
      fieldName: a.field_name,
      previousValue: a.previous_value,
      newValue: a.new_value,
      reason: a.reason,
      sourceUrl: a.source_url,
      createdAt: a.created_at,
    })),
  };
}

export interface UpsertShariahInput {
  symbol: string;
  classification: ShariahClassification;
  authorityName: string;
  sourceUrl?: string | null;
  assessmentDate?: string;
  methodology: string;
  coreActivityNotesEn: string;
  coreActivityNotesAr: string;
  conditionsEn?: string | null;
  conditionsAr?: string | null;
  scholarlyDisagreementsEn?: string | null;
  scholarlyDisagreementsAr?: string | null;
  verificationStatus?: VerificationStatus;
  confidenceLevel?: ConfidenceLevel;
  reason?: string;
}

export function upsertShariahAssessment(input: UpsertShariahInput): {
  changedClassification: boolean;
  previousClassification: ShariahClassification | null;
} {
  ensureSeeded();
  const db = getDb();
  const symbol = input.symbol.toUpperCase().endsWith("USDT")
    ? input.symbol.toUpperCase()
    : `${input.symbol.toUpperCase()}USDT`;
  const baseAsset = symbol.replace(/USDT$/, "");
  const now = new Date().toISOString();

  const prev = db
    .prepare("SELECT classification FROM shariah_assessments WHERE symbol = ?")
    .get(symbol) as { classification: ShariahClassification } | undefined;

  const previousClassification = prev?.classification ?? null;
  const changedClassification = previousClassification !== input.classification;

  runInTransaction((tx) => {
    // Ensure asset exists before inserting assessment
    const assetExists = tx.prepare("SELECT symbol FROM assets WHERE symbol = ?").get(symbol);
    if (!assetExists) {
      tx.prepare(
        `INSERT INTO assets (symbol, base_asset, quote_asset, name, category, binance_status, is_spot_allowed, spot_verified_at, is_curated, created_at, updated_at)
         VALUES (?, ?, 'USDT', ?, 'Custom Screened Asset', 'TRADING', 1, ?, 1, ?, ?)`
      ).run(symbol, baseAsset, baseAsset, now, now, now);
    }

    tx.prepare(
      `INSERT INTO shariah_assessments (
        symbol, base_asset, classification, authority_name, source_url, assessment_date,
        methodology, core_activity_notes_en, core_activity_notes_ar,
        conditions_en, conditions_ar, scholarly_disagreements_en, scholarly_disagreements_ar,
        verification_status, confidence_level, last_verified_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(symbol) DO UPDATE SET
        classification = excluded.classification,
        authority_name = excluded.authority_name,
        source_url = excluded.source_url,
        assessment_date = excluded.assessment_date,
        methodology = excluded.methodology,
        core_activity_notes_en = excluded.core_activity_notes_en,
        core_activity_notes_ar = excluded.core_activity_notes_ar,
        conditions_en = excluded.conditions_en,
        conditions_ar = excluded.conditions_ar,
        scholarly_disagreements_en = excluded.scholarly_disagreements_en,
        scholarly_disagreements_ar = excluded.scholarly_disagreements_ar,
        verification_status = excluded.verification_status,
        confidence_level = excluded.confidence_level,
        last_verified_at = excluded.last_verified_at`
    ).run(
      symbol,
      baseAsset,
      input.classification,
      input.authorityName,
      input.sourceUrl ?? null,
      input.assessmentDate || now.slice(0, 10),
      input.methodology,
      input.coreActivityNotesEn,
      input.coreActivityNotesAr,
      input.conditionsEn ?? null,
      input.conditionsAr ?? null,
      input.scholarlyDisagreementsEn ?? null,
      input.scholarlyDisagreementsAr ?? null,
      input.verificationStatus || "THIRD_PARTY_ASSESSMENT",
      input.confidenceLevel || "MEDIUM",
      now
    );

    tx.prepare(
      `INSERT INTO research_audit_log (symbol, entity_type, field_name, previous_value, new_value, reason, source_url, created_at)
       VALUES (?, 'SHARIAH', 'classification', ?, ?, ?, ?, ?)`
    ).run(
      symbol,
      previousClassification,
      input.classification,
      input.reason || `Updated by Shariah screening record (${input.authorityName})`,
      input.sourceUrl ?? null,
      now
    );

    if (changedClassification) {
      tx.prepare(
        `INSERT INTO alerts (symbol, alert_type, severity, title_en, title_ar, message_en, message_ar, is_read, telegram_sent, created_at)
         VALUES (?, 'SHARIAH_CHANGE', 'WARNING', ?, ?, ?, ?, 0, 0, ?)`
      ).run(
        symbol,
        `Shariah Status Changed: ${baseAsset}`,
        `تغيّر التصنيف الشرعي: ${baseAsset}`,
        `${symbol} changed from ${previousClassification ?? "NONE"} to ${input.classification} per ${input.authorityName}.`,
        `تم تحديث تصنيف ${symbol} من ${previousClassification ?? "غير مصنف"} إلى ${input.classification} وفقاً لمرجع: ${input.authorityName}.`,
        now
      );
    }
  });

  return { changedClassification, previousClassification };
}

export function upsertCredibilityFactor(input: {
  symbol: string;
  factorKey: CredibilityFactorKey;
  score: number | null;
  evidenceEn: string;
  evidenceAr: string;
  sourceName: string;
  sourceUrl?: string | null;
  confidenceLevel: ConfidenceLevel;
  isAvailable: boolean;
}): void {
  ensureSeeded();
  const db = getDb();
  const symbol = input.symbol.toUpperCase().endsWith("USDT")
    ? input.symbol.toUpperCase()
    : `${input.symbol.toUpperCase()}USDT`;
  const now = new Date().toISOString();

  const prev = db
    .prepare("SELECT score FROM credibility_factors WHERE symbol = ? AND factor_key = ?")
    .get(symbol, input.factorKey) as { score: number | null } | undefined;

  runInTransaction((tx) => {
    tx.prepare(
      `INSERT INTO credibility_factors (
        symbol, factor_key, weight, score, evidence_en, evidence_ar,
        source_name, source_url, research_date, confidence_level, is_available
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(symbol, factor_key) DO UPDATE SET
        score = excluded.score,
        evidence_en = excluded.evidence_en,
        evidence_ar = excluded.evidence_ar,
        source_name = excluded.source_name,
        source_url = excluded.source_url,
        research_date = excluded.research_date,
        confidence_level = excluded.confidence_level,
        is_available = excluded.is_available`
    ).run(
      symbol,
      input.factorKey,
      CREDIBILITY_WEIGHTS[input.factorKey],
      input.isAvailable ? input.score : null,
      input.evidenceEn,
      input.evidenceAr,
      input.sourceName,
      input.sourceUrl ?? null,
      now.slice(0, 10),
      input.isAvailable ? input.confidenceLevel : "UNAVAILABLE",
      input.isAvailable ? 1 : 0
    );

    tx.prepare(
      `INSERT INTO research_audit_log (symbol, entity_type, field_name, previous_value, new_value, reason, source_url, created_at)
       VALUES (?, 'CREDIBILITY', ?, ?, ?, ?, ?, ?)`
    ).run(
      symbol,
      input.factorKey,
      prev?.score !== null && prev?.score !== undefined ? String(prev.score) : null,
      input.isAvailable && input.score !== null ? String(input.score) : "DATA UNAVAILABLE",
      `Updated factor evidence (${input.sourceName})`,
      input.sourceUrl ?? null,
      now
    );
  });
}

export function toggleWatchlist(symbolParam: string, notes = ""): { inWatchlist: boolean; symbol: string } {
  ensureSeeded();
  const db = getDb();
  const symbol = symbolParam.toUpperCase().endsWith("USDT")
    ? symbolParam.toUpperCase()
    : `${symbolParam.toUpperCase()}USDT`;

  const existing = db.prepare("SELECT symbol FROM watchlists WHERE symbol = ?").get(symbol);
  if (existing) {
    db.prepare("DELETE FROM watchlists WHERE symbol = ?").run(symbol);
    return { inWatchlist: false, symbol };
  }
  db.prepare("INSERT INTO watchlists (symbol, notes, created_at) VALUES (?, ?, ?)").run(
    symbol,
    notes,
    new Date().toISOString()
  );
  return { inWatchlist: true, symbol };
}

export function captureHistoricalSnapshots(): { captured: number; recordedAt: string } {
  ensureSeeded();
  const rows = buildAllEvaluatedRows(false).filter((r) => r.shariahClassification !== "UNVERIFIED");
  const recordedAt = new Date().toISOString();

  runInTransaction((tx) => {
    const stmt = tx.prepare(`
      INSERT INTO historical_snapshots (
        symbol, price_usdt, market_cap, shariah_classification,
        credibility_score, investment_potential_score, tokenomics_risk, recorded_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const r of rows) {
      stmt.run(
        r.symbol,
        r.priceUsdt,
        r.marketCap,
        r.shariahClassification,
        r.credibilityScore,
        r.investmentPotentialScore,
        r.tokenomicsRisk,
        recordedAt
      );
    }
  });

  return { captured: rows.length, recordedAt };
}

export function getAlerts(limit = 50): AlertRecord[] {
  ensureSeeded();
  const db = getDb();
  const rows = db
    .prepare("SELECT * FROM alerts ORDER BY created_at DESC LIMIT ?")
    .all(limit) as Array<{
    id: number;
    symbol: string | null;
    alert_type: AlertRecord["alertType"];
    severity: AlertRecord["severity"];
    title_en: string;
    title_ar: string;
    message_en: string;
    message_ar: string;
    is_read: number;
    telegram_sent: number;
    created_at: string;
  }>;

  return rows.map((r) => ({
    id: r.id,
    symbol: r.symbol,
    alertType: r.alert_type,
    severity: r.severity,
    titleEn: r.title_en,
    titleAr: r.title_ar,
    messageEn: r.message_en,
    messageAr: r.message_ar,
    isRead: r.is_read === 1,
    telegramSent: r.telegram_sent === 1,
    createdAt: r.created_at,
  }));
}

export function getAlertRules(): AlertRuleRecord[] {
  ensureSeeded();
  const db = getDb();
  const rows = db.prepare("SELECT * FROM alert_rules ORDER BY id DESC").all() as Array<{
    id: number;
    symbol: string | null;
    rule_type: AlertRuleRecord["ruleType"];
    threshold: number | null;
    enabled: number;
    notify_telegram: number;
    created_at: string;
  }>;

  return rows.map((r) => ({
    id: r.id,
    symbol: r.symbol,
    ruleType: r.rule_type,
    threshold: r.threshold,
    enabled: r.enabled === 1,
    notifyTelegram: r.notify_telegram === 1,
    createdAt: r.created_at,
  }));
}
