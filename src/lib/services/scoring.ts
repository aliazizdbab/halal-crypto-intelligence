import {
  CREDIBILITY_WEIGHTS,
  type ConfidenceLevel,
  type CredibilityFactorRecord,
  type RiskLevel,
} from "@/types/domain";

export interface CredibilityComputation {
  score: number | null;
  confidence: ConfidenceLevel;
  availableWeightPct: number;
  missingFactors: string[];
}

export interface InvestmentScoreComponent {
  key: string;
  labelEn: string;
  labelAr: string;
  weight: number;
  score: number | null;
  rationaleEn: string;
  rationaleAr: string;
}

export interface InvestmentPotentialComputation {
  score: number | null;
  confidence: ConfidenceLevel;
  liquidityScore: number | null;
  dilutionRatio: number | null;
  volatility24hPct: number | null;
  computedTokenomicsRisk: RiskLevel;
  overallRiskLevel: RiskLevel;
  dynamicRiskFlags: string[];
  components: InvestmentScoreComponent[];
}

/**
 * Computes the weighted Project Credibility Score (0-100) strictly from available evidence factors.
 * Missing factors never receive fabricated points; they lower overall confidence.
 */
export function computeCredibilityScore(factors: CredibilityFactorRecord[]): CredibilityComputation {
  if (!factors || factors.length === 0) {
    return {
      score: null,
      confidence: "UNAVAILABLE",
      availableWeightPct: 0,
      missingFactors: Object.keys(CREDIBILITY_WEIGHTS),
    };
  }

  let weightedSum = 0;
  let availableWeight = 0;
  let highConfWeight = 0;
  const missingFactors: string[] = [];

  for (const factor of factors) {
    const w = CREDIBILITY_WEIGHTS[factor.factorKey] ?? factor.weight;
    if (factor.isAvailable && factor.score !== null && Number.isFinite(factor.score)) {
      const clamped = Math.max(0, Math.min(100, factor.score));
      weightedSum += clamped * w;
      availableWeight += w;
      if (factor.confidenceLevel === "HIGH") {
        highConfWeight += w;
      }
    } else {
      missingFactors.push(factor.factorKey);
    }
  }

  if (availableWeight <= 0) {
    return {
      score: null,
      confidence: "UNAVAILABLE",
      availableWeightPct: 0,
      missingFactors,
    };
  }

  // Normalize across available weights, then apply slight evidence-completeness transparency penalty if <70% covered
  const rawNormalized = weightedSum / availableWeight;
  const coverageRatio = Math.min(1, availableWeight);
  const adjustedScore =
    coverageRatio >= 0.7 ? rawNormalized : rawNormalized * (0.85 + 0.15 * (coverageRatio / 0.7));

  let confidence: ConfidenceLevel = "LOW";
  if (coverageRatio >= 0.85 && highConfWeight >= 0.55) {
    confidence = "HIGH";
  } else if (coverageRatio >= 0.6) {
    confidence = "MEDIUM";
  }

  return {
    score: Number(adjustedScore.toFixed(1)),
    confidence,
    availableWeightPct: Math.round(coverageRatio * 100),
    missingFactors,
  };
}

/**
 * Computes transparent, evidence-backed Investment Potential & Growth Score (0-100)
 * strictly separate from Shariah classification. Never presents scores as guaranteed returns.
 */
export function computeInvestmentPotential(params: {
  category: string;
  priceUsdt: number | null;
  high24h: number | null;
  low24h: number | null;
  quoteVolume24h: number | null;
  spreadPct: number | null;
  marketCap: number | null;
  fdv: number | null;
  circulatingSupply: number | null;
  maxSupply: number | null;
  inflationRatePct: number | null;
  insiderAllocationPct: number | null;
  nextMajorUnlockPct: number | null;
  existingRiskFlags: string[];
  baseTokenomicsRisk: RiskLevel;
  credibilityFactors: CredibilityFactorRecord[];
}): InvestmentPotentialComputation {
  const dynamicRiskFlags = new Set<string>(params.existingRiskFlags || []);

  // 1. Volatility (24h intraday range)
  let volatility24hPct: number | null = null;
  if (params.high24h && params.low24h && params.low24h > 0) {
    volatility24hPct = Number((((params.high24h - params.low24h) / params.low24h) * 100).toFixed(2));
  }

  // 2. Dilution Ratio (FDV / Market Cap)
  let dilutionRatio: number | null = null;
  if (params.fdv && params.marketCap && params.marketCap > 0) {
    dilutionRatio = Number((params.fdv / params.marketCap).toFixed(2));
    if (dilutionRatio >= 2.5) dynamicRiskFlags.add("HIGH_FDV_TO_MCAP");
    else if (dilutionRatio >= 1.6) dynamicRiskFlags.add("MODERATE_FUTURE_DILUTION");
  } else if (params.maxSupply && params.circulatingSupply && params.circulatingSupply > 0) {
    dilutionRatio = Number((params.maxSupply / params.circulatingSupply).toFixed(2));
    if (dilutionRatio >= 2.5) dynamicRiskFlags.add("HIGH_FDV_TO_MCAP");
  }

  if (params.inflationRatePct !== null && params.inflationRatePct >= 8) {
    dynamicRiskFlags.add("HIGH_INFLATION_RATE");
  }
  if (params.insiderAllocationPct !== null && params.insiderAllocationPct >= 40) {
    dynamicRiskFlags.add("HIGH_INSIDER_ALLOCATION");
  }

  // 3. Liquidity & Market Execution Score (0-100)
  let liquidityScore: number | null = null;
  if (params.quoteVolume24h !== null && params.quoteVolume24h >= 0) {
    const vol = params.quoteVolume24h;
    let baseVolScore = 25;
    if (vol >= 500_000_000) baseVolScore = 98;
    else if (vol >= 150_000_000) baseVolScore = 92;
    else if (vol >= 50_000_000) baseVolScore = 84;
    else if (vol >= 15_000_000) baseVolScore = 74;
    else if (vol >= 5_000_000) baseVolScore = 62;
    else if (vol >= 1_000_000) baseVolScore = 46;
    else {
      baseVolScore = 28;
      dynamicRiskFlags.add("THIN_SPOT_LIQUIDITY");
    }

    if (params.spreadPct !== null) {
      if (params.spreadPct > 0.5) baseVolScore = Math.max(15, baseVolScore - 18);
      else if (params.spreadPct > 0.15) baseVolScore = Math.max(20, baseVolScore - 8);
    }
    liquidityScore = Math.round(baseVolScore);
  }

  // 4. Tokenomics Sustainability Score (0-100)
  let tokenomicsScore: number | null = null;
  if (
    dilutionRatio !== null ||
    params.inflationRatePct !== null ||
    params.insiderAllocationPct !== null ||
    params.baseTokenomicsRisk !== "UNAVAILABLE"
  ) {
    let tScore = 82;
    if (dilutionRatio !== null) {
      if (dilutionRatio <= 1.15) tScore += 12;
      else if (dilutionRatio <= 1.5) tScore += 4;
      else if (dilutionRatio <= 2.2) tScore -= 14;
      else if (dilutionRatio <= 3.5) tScore -= 26;
      else tScore -= 36;
    }
    if (params.inflationRatePct !== null) {
      if (params.inflationRatePct <= 0) tScore += 8;
      else if (params.inflationRatePct <= 3) tScore += 3;
      else if (params.inflationRatePct <= 6) tScore -= 5;
      else if (params.inflationRatePct <= 10) tScore -= 14;
      else tScore -= 22;
    }
    if (params.insiderAllocationPct !== null) {
      if (params.insiderAllocationPct === 0) tScore += 6;
      else if (params.insiderAllocationPct >= 40) tScore -= 12;
      else if (params.insiderAllocationPct >= 30) tScore -= 6;
    }
    if (params.nextMajorUnlockPct !== null && params.nextMajorUnlockPct >= 0.5) {
      tScore -= 8;
    }
    if (dynamicRiskFlags.has("WEAK_FUNDAMENTAL_UTILITY") || dynamicRiskFlags.has("WEAK_TOKEN_UTILITY_GAS_IN_ETH")) {
      tScore -= 14;
    }
    tokenomicsScore = Math.max(10, Math.min(98, Math.round(tScore)));
  }

  // Computed tokenomics risk
  let computedTokenomicsRisk: RiskLevel = params.baseTokenomicsRisk;
  if (tokenomicsScore !== null) {
    if (dynamicRiskFlags.has("EXTREME_UNIT_BIAS_ILLUSION") || tokenomicsScore < 35) {
      computedTokenomicsRisk = "VERY_HIGH";
    } else if (tokenomicsScore < 55) {
      computedTokenomicsRisk = "HIGH";
    } else if (tokenomicsScore < 75) {
      computedTokenomicsRisk = "MODERATE";
    } else {
      computedTokenomicsRisk = "LOW";
    }
  }

  // 5. Adoption, Ecosystem & Competitive Positioning Score from verified credibility factors
  const adoptionFactor = params.credibilityFactors.find((f) => f.factorKey === "real_world_adoption");
  const devFactor = params.credibilityFactors.find((f) => f.factorKey === "development_activity");
  const techFactor = params.credibilityFactors.find((f) => f.factorKey === "technology_security");
  const partnerFactor = params.credibilityFactors.find((f) => f.factorKey === "strategic_partnerships");

  const validFundScores = [adoptionFactor, devFactor, techFactor, partnerFactor]
    .filter((f): f is CredibilityFactorRecord => Boolean(f && f.isAvailable && f.score !== null))
    .map((f) => f.score as number);

  const adoptionPositioningScore =
    validFundScores.length >= 2
      ? Math.round(validFundScores.reduce((a, b) => a + b, 0) / validFundScores.length)
      : null;

  // 6. Valuation / Market Cap Growth Headroom Score
  let valuationHeadroomScore: number | null = null;
  if (params.marketCap !== null && params.marketCap > 0) {
    // Balances institutional stability with growth headroom (not unit price!)
    if (params.marketCap >= 150_000_000_000) valuationHeadroomScore = 76; // Mega-cap: lower upside multiple, higher durability
    else if (params.marketCap >= 20_000_000_000) valuationHeadroomScore = 82;
    else if (params.marketCap >= 3_000_000_000) valuationHeadroomScore = 85;
    else if (params.marketCap >= 500_000_000) valuationHeadroomScore = 79;
    else if (params.marketCap >= 100_000_000) valuationHeadroomScore = 68;
    else valuationHeadroomScore = 54; // Higher small-cap execution risk
  }

  // 7. Stability / Volatility Resilience Score
  let volatilityResilienceScore: number | null = null;
  if (volatility24hPct !== null) {
    if (volatility24hPct <= 3) volatilityResilienceScore = 88;
    else if (volatility24hPct <= 6) volatilityResilienceScore = 78;
    else if (volatility24hPct <= 11) volatilityResilienceScore = 64;
    else if (volatility24hPct <= 18) volatilityResilienceScore = 48;
    else volatilityResilienceScore = 34;
  }

  const isStablecoin =
    params.category.toLowerCase().includes("stablecoin") ||
    dynamicRiskFlags.has("STABLECOIN_NO_PRICE_UPSIDE");

  const components: InvestmentScoreComponent[] = [
    {
      key: "adoption_positioning",
      labelEn: "Adoption, Tech & Ecosystem Demand",
      labelAr: "التبني والتقنية والطلب على الشبكة",
      weight: 0.35,
      score: adoptionPositioningScore,
      rationaleEn:
        adoptionPositioningScore !== null
          ? "Derived from verified adoption, technology, developer activity, and partnership evidence."
          : "DATA UNAVAILABLE – REQUIRES VERIFICATION",
      rationaleAr:
        adoptionPositioningScore !== null
          ? "مشتق من أدلة التبني والتقنية ونشاط المطورين والشراكات الموثّقة."
          : "البيانات غير متوفرة – تتطلب تحققاً",
    },
    {
      key: "tokenomics_sustainability",
      labelEn: "Tokenomics & Dilution Health",
      labelAr: "استدامة التوكنوميكس ومخاطر التخفيف",
      weight: 0.25,
      score: tokenomicsScore,
      rationaleEn:
        tokenomicsScore !== null
          ? `Evaluated from FDV/MCap (${dilutionRatio ?? "N/A"}x), inflation (${params.inflationRatePct ?? "N/A"}%), and unlock structure.`
          : "DATA UNAVAILABLE – REQUIRES VERIFICATION",
      rationaleAr:
        tokenomicsScore !== null
          ? `مقيّم من نسبة FDV/القيمة السوقية (${dilutionRatio ?? "غير متوفر"}x) والتضخم (${params.inflationRatePct ?? "غير متوفر"}%) وجدول فك القفل.`
          : "البيانات غير متوفرة – تتطلب تحققاً",
    },
    {
      key: "liquidity_depth",
      labelEn: "Binance Spot Liquidity & Execution",
      labelAr: "سيولة Binance Spot وكفاءة التنفيذ",
      weight: 0.20,
      score: liquidityScore,
      rationaleEn:
        liquidityScore !== null
          ? `Based on live 24h USDT quote volume ($${Math.round(params.quoteVolume24h ?? 0).toLocaleString()}) and bid-ask spread.`
          : "DATA UNAVAILABLE – REQUIRES VERIFICATION",
      rationaleAr:
        liquidityScore !== null
          ? `مبني على حجم التداول اليومي الحي بـ USDT وفارق السعر (Spread).`
          : "البيانات غير متوفرة – تتطلب تحققاً",
    },
    {
      key: "valuation_scale",
      labelEn: "Market Cap Scale & Growth Headroom",
      labelAr: "حجم القيمة السوقية ومساحة النمو",
      weight: 0.12,
      score: isStablecoin ? 10 : valuationHeadroomScore,
      rationaleEn: isStablecoin
        ? "Fiat-pegged stablecoin — designed for $1.00 peg stability with zero price appreciation upside."
        : valuationHeadroomScore !== null
          ? "Evaluates Market Cap valuation realism rather than nominal token unit price."
          : "DATA UNAVAILABLE – REQUIRES VERIFICATION",
      rationaleAr: isStablecoin
        ? "عملة مستقرة مرتبطة بالدولار (1.00$) دون هدف نمو سعري."
        : valuationHeadroomScore !== null
          ? "يقيّم واقعية القيمة السوقية (Market Cap) بدلاً من خدعة سعر الوحدة."
          : "البيانات غير متوفرة – تتطلب تحققاً",
    },
    {
      key: "volatility_resilience",
      labelEn: "Short-Term Volatility Resilience",
      labelAr: "توازن التقلب السعري",
      weight: 0.08,
      score: volatilityResilienceScore,
      rationaleEn:
        volatilityResilienceScore !== null
          ? `24h intraday high-low range: ${volatility24hPct}%.`
          : "DATA UNAVAILABLE – REQUIRES VERIFICATION",
      rationaleAr:
        volatilityResilienceScore !== null
          ? `نطاق التذبذب خلال 24 ساعة: ${volatility24hPct}%.`
          : "البيانات غير متوفرة – تتطلب تحققاً",
    },
  ];

  let score: number | null = null;
  let confidence: ConfidenceLevel = "UNAVAILABLE";

  // Require at least adoption or tokenomics alongside liquidity so unverified coins don't get fake growth scores
  const hasFundamentalEvidence = adoptionPositioningScore !== null || tokenomicsScore !== null;
  if (hasFundamentalEvidence) {
    let wSum = 0;
    let wTotal = 0;
    for (const c of components) {
      if (c.score !== null) {
        wSum += c.score * c.weight;
        wTotal += c.weight;
      }
    }
    if (wTotal > 0) {
      const normalized = wSum / wTotal;
      score = isStablecoin ? Math.min(25, Number(normalized.toFixed(1))) : Number(normalized.toFixed(1));
      if (wTotal >= 0.9) confidence = "HIGH";
      else if (wTotal >= 0.6) confidence = "MEDIUM";
      else confidence = "LOW";
    }
  }

  // Overall Risk Level calculation
  let overallRiskLevel: RiskLevel = "UNAVAILABLE";
  if (score !== null || liquidityScore !== null) {
    let riskPoints = 0;
    if (computedTokenomicsRisk === "VERY_HIGH") riskPoints += 3;
    else if (computedTokenomicsRisk === "HIGH") riskPoints += 2;
    else if (computedTokenomicsRisk === "MODERATE") riskPoints += 1;

    if (liquidityScore !== null && liquidityScore < 50) riskPoints += 2;
    else if (liquidityScore !== null && liquidityScore < 70) riskPoints += 1;

    if (volatility24hPct !== null && volatility24hPct > 12) riskPoints += 2;
    else if (volatility24hPct !== null && volatility24hPct > 6) riskPoints += 1;

    if (adoptionPositioningScore !== null && adoptionPositioningScore < 60) riskPoints += 2;
    else if (adoptionPositioningScore !== null && adoptionPositioningScore < 75) riskPoints += 1;

    if (dynamicRiskFlags.has("ANONYMOUS_LEADERSHIP") || dynamicRiskFlags.has("SHARIAH_NON_COMPLIANT")) {
      riskPoints += 3;
    }

    if (riskPoints >= 6) overallRiskLevel = "VERY_HIGH";
    else if (riskPoints >= 4) overallRiskLevel = "HIGH";
    else if (riskPoints >= 2) overallRiskLevel = "MODERATE";
    else overallRiskLevel = "LOW";
  }

  return {
    score,
    confidence,
    liquidityScore,
    dilutionRatio,
    volatility24hPct,
    computedTokenomicsRisk,
    overallRiskLevel,
    dynamicRiskFlags: Array.from(dynamicRiskFlags),
    components,
  };
}
