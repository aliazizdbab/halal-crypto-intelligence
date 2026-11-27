export type ShariahClassification =
  | "HALAL"
  | "HALAL_WITH_CONDITIONS"
  | "SCHOLARLY_DISAGREEMENT"
  | "NON_COMPLIANT"
  | "UNVERIFIED";

export type VerificationStatus = "VERIFIED" | "THIRD_PARTY_ASSESSMENT" | "ANALYST_ESTIMATE" | "AI_OPINION" | "UNVERIFIED";

export type ConfidenceLevel = "HIGH" | "MEDIUM" | "LOW" | "UNAVAILABLE";

export type RiskLevel = "LOW" | "MODERATE" | "HIGH" | "VERY_HIGH" | "UNAVAILABLE";

export type CredibilityFactorKey =
  | "team_credibility"
  | "technology_security"
  | "independent_audits"
  | "real_world_adoption"
  | "transparency_documentation"
  | "development_activity"
  | "strategic_partnerships";

export const CREDIBILITY_WEIGHTS: Record<CredibilityFactorKey, number> = {
  team_credibility: 0.15,
  technology_security: 0.20,
  independent_audits: 0.15,
  real_world_adoption: 0.20,
  transparency_documentation: 0.10,
  development_activity: 0.10,
  strategic_partnerships: 0.10,
};

export interface ProvenanceMeta {
  source: string;
  sourceUrl?: string | null;
  timestamp: string;
  verificationStatus: VerificationStatus;
  confidenceLevel: ConfidenceLevel;
  lastUpdated: string;
}

export interface ShariahAssessmentRecord {
  symbol: string;
  baseAsset: string;
  classification: ShariahClassification;
  authorityName: string;
  sourceUrl: string | null;
  assessmentDate: string;
  methodology: string;
  coreActivityNotesEn: string;
  coreActivityNotesAr: string;
  conditionsEn: string | null;
  conditionsAr: string | null;
  scholarlyDisagreementsEn: string | null;
  scholarlyDisagreementsAr: string | null;
  verificationStatus: VerificationStatus;
  confidenceLevel: ConfidenceLevel;
  lastVerifiedAt: string;
}

export interface CredibilityFactorRecord {
  symbol: string;
  factorKey: CredibilityFactorKey;
  weight: number;
  score: number | null;
  evidenceEn: string;
  evidenceAr: string;
  sourceName: string;
  sourceUrl: string | null;
  researchDate: string;
  confidenceLevel: ConfidenceLevel;
  isAvailable: boolean;
}

export interface TokenomicsProfileRecord {
  symbol: string;
  circulatingSupply: number | null;
  totalSupply: number | null;
  maxSupply: number | null;
  fdv: number | null;
  marketCap: number | null;
  inflationRatePct: number | null;
  insiderAllocationPct: number | null;
  teamAllocationPct: number | null;
  vcAllocationPct: number | null;
  communityAllocationPct: number | null;
  treasuryAllocationPct: number | null;
  unlockScheduleSummaryEn: string;
  unlockScheduleSummaryAr: string;
  nextMajorUnlockDate: string | null;
  nextMajorUnlockPct: number | null;
  tokenUtilityEn: string;
  tokenUtilityAr: string;
  burnMechanismEn: string;
  burnMechanismAr: string;
  stakingMechanismEn: string;
  stakingMechanismAr: string;
  governanceRightsEn: string;
  governanceRightsAr: string;
  riskFlags: string[];
  tokenomicsRisk: RiskLevel;
  sourceName: string;
  sourceUrl: string | null;
  lastUpdated: string;
}

export interface InvestmentScenarioRecord {
  symbol: string;
  scenarioType: "BEARISH" | "BASE" | "BULLISH";
  assumptionsEn: string;
  assumptionsAr: string;
  catalystsEn: string;
  catalystsAr: string;
  risksEn: string;
  risksAr: string;
  timeHorizon: string;
  supportingEvidenceEn: string;
  supportingEvidenceAr: string;
  sourceUrl: string | null;
  lastUpdated: string;
}

export interface MarketSnapshotRecord {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  priceUsdt: number | null;
  priceChange24h: number | null;
  priceChangePct24h: number | null;
  volume24h: number | null;
  quoteVolume24h: number | null;
  high24h: number | null;
  low24h: number | null;
  bidPrice: number | null;
  askPrice: number | null;
  spreadPct: number | null;
  marketCap: number | null;
  fdv: number | null;
  circulatingSupply: number | null;
  totalSupply: number | null;
  maxSupply: number | null;
  marketCapRank: number | null;
  priceSource: string;
  marketCapSource: string | null;
  fetchedAt: string;
}

export interface AssetDirectoryRow {
  rank: number;
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  name: string;
  category: string;
  binanceStatus: string;
  isSpotAllowed: boolean;
  spotVerifiedAt: string;
  officialWebsite: string | null;
  githubRepo: string | null;
  binanceSpotUrl: string;
  // Market
  priceUsdt: number | null;
  priceChange24h: number | null;
  priceChangePct24h: number | null;
  volume24h: number | null;
  quoteVolume24h: number | null;
  high24h: number | null;
  low24h: number | null;
  bidPrice: number | null;
  askPrice: number | null;
  spreadPct: number | null;
  marketCap: number | null;
  fdv: number | null;
  circulatingSupply: number | null;
  maxSupply: number | null;
  marketFetchedAt: string | null;
  priceSource: string;
  marketCapSource: string | null;
  // Shariah
  shariahClassification: ShariahClassification;
  shariahAuthority: string;
  shariahSourceUrl: string | null;
  shariahAssessmentDate: string | null;
  shariahMethodology: string | null;
  shariahConditionsEn: string | null;
  shariahConditionsAr: string | null;
  shariahDisagreementsEn: string | null;
  shariahDisagreementsAr: string | null;
  shariahConfidence: ConfidenceLevel;
  // Scores
  credibilityScore: number | null;
  credibilityConfidence: ConfidenceLevel;
  investmentPotentialScore: number | null;
  investmentConfidence: ConfidenceLevel;
  combinedResearchRating: number | null;
  tokenomicsRisk: RiskLevel;
  overallRiskLevel: RiskLevel;
  dilutionRatio: number | null;
  liquidityScore: number | null;
  volatility24hPct: number | null;
  nextMajorUnlockDate: string | null;
  nextMajorUnlockPct: number | null;
  inWatchlist: boolean;
}

export interface DashboardSummary {
  totalBinanceSpotUsdtPairs: number;
  totalScreenedAssets: number;
  countHalal: number;
  countHalalWithConditions: number;
  countScholarlyDisagreement: number;
  countNonCompliant: number;
  countUnverified: number;
  totalScreenedMarketCap: number;
  averageCredibilityScore: number | null;
  averageInvestmentPotentialScore: number | null;
  newlyAddedAssets: Array<{ symbol: string; name: string; baseAsset: string; createdAt: string; shariahClassification: ShariahClassification }>;
  recentlyChangedShariah: Array<{ symbol: string; previousValue: string | null; newValue: string; changedAt: string; authority: string }>;
  upcomingMajorUnlocks: Array<{ symbol: string; name: string; unlockDate: string; unlockPct: number | null; summaryEn: string; summaryAr: string }>;
  lastBinanceSyncAt: string | null;
  lastMarketCapSyncAt: string | null;
  binanceConnectionStatus: "CONNECTED" | "FALLBACK" | "DEGRADED" | "NOT_SYNCED";
}

export interface TechnicalIndicatorSummary {
  symbol: string;
  timeframe: string;
  fetchedAt: string;
  source: string;
  candleCount: number;
  latestClose: number;
  rsi14: number | null;
  macd: { macd: number; signal: number; histogram: number } | null;
  ema20: number | null;
  ema50: number | null;
  ema100: number | null;
  ema200: number | null;
  sma50: number | null;
  sma100: number | null;
  sma200: number | null;
  bollingerBands: { upper: number; middle: number; lower: number; bandwidthPct: number } | null;
  atr14: number | null;
  atrPct: number | null;
  adx14: number | null;
  vwap: number | null;
  supportLevels: number[];
  resistanceLevels: number[];
  accumulationZones: Array<{ low: number; high: number; rationaleEn: string; rationaleAr: string }>;
  shortTermCondition: "OVERBOUGHT" | "BULLISH" | "NEUTRAL" | "BEARISH" | "OVERSOLD";
  mediumTermTrend: "UPTREND" | "SIDEWAYS" | "DOWNTREND" | "INSUFFICIENT_DATA";
  longTermTrend: "UPTREND" | "SIDEWAYS" | "DOWNTREND" | "INSUFFICIENT_DATA";
  marketStructure: "HIGHER_HIGHS_LOWS" | "LOWER_HIGHS_LOWS" | "CONSOLIDATION" | "INSUFFICIENT_DATA";
  volatilityAssessment: "LOW" | "MODERATE" | "HIGH" | "EXTREME";
  liquidityAssessment: "DEEP" | "HEALTHY" | "MODERATE" | "THIN" | "UNAVAILABLE";
  candles: Array<{
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  }>;
  volumeProfile: Array<{
    priceLow: number;
    priceHigh: number;
    volume: number;
    pctOfTotal: number;
  }>;
}

export interface AlertRecord {
  id: number;
  symbol: string | null;
  alertType:
    | "SHARIAH_CHANGE"
    | "SPOT_LISTING_CHANGE"
    | "PRICE_MOVEMENT"
    | "VOLUME_SPIKE"
    | "TOKEN_UNLOCK"
    | "SECURITY_INCIDENT"
    | "TOKENOMICS_CHANGE"
    | "CUSTOM";
  severity: "INFO" | "WARNING" | "CRITICAL";
  titleEn: string;
  titleAr: string;
  messageEn: string;
  messageAr: string;
  isRead: boolean;
  telegramSent: boolean;
  createdAt: string;
}

export interface AlertRuleRecord {
  id: number;
  symbol: string | null;
  ruleType: "PRICE_CHANGE_PCT" | "PRICE_ABOVE" | "PRICE_BELOW" | "VOLUME_SPIKE_USD" | "SHARIAH_CHANGE" | "SPOT_DELISTING";
  threshold: number | null;
  enabled: boolean;
  notifyTelegram: boolean;
  createdAt: string;
}

export interface HistoricalSnapshotRecord {
  id: number;
  symbol: string;
  priceUsdt: number | null;
  marketCap: number | null;
  shariahClassification: ShariahClassification;
  credibilityScore: number | null;
  investmentPotentialScore: number | null;
  tokenomicsRisk: RiskLevel;
  recordedAt: string;
}

export interface AuditLogRecord {
  id: number;
  symbol: string;
  entityType: "SHARIAH" | "CREDIBILITY" | "TOKENOMICS" | "SCENARIO" | "ASSET";
  fieldName: string;
  previousValue: string | null;
  newValue: string;
  reason: string | null;
  sourceUrl: string | null;
  createdAt: string;
}
