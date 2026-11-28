import { NextResponse } from "next/server";
import { getDirectoryAssets, type DirectorySortOption } from "@/lib/services/repository";
import type { ExchangeFilter, RiskLevel, ShariahClassification } from "@/types/domain";

export const dynamic = "force-dynamic";

const VALID_CLASSIFICATIONS = new Set<ShariahClassification>([
  "HALAL",
  "HALAL_WITH_CONDITIONS",
  "SCHOLARLY_DISAGREEMENT",
  "NON_COMPLIANT",
  "UNVERIFIED",
]);

const VALID_RISKS = new Set<RiskLevel>(["LOW", "MODERATE", "HIGH", "VERY_HIGH", "UNAVAILABLE"]);

const VALID_EXCHANGES = new Set<ExchangeFilter>([
  "ALL",
  "BINANCE",
  "BYBIT",
  "BYBIT_EXCLUSIVE",
  "BINANCE_EXCLUSIVE",
]);

const VALID_SORTS = new Set<DirectorySortOption>([
  "price_asc",
  "price_desc",
  "credibility_desc",
  "potential_desc",
  "market_cap_desc",
  "volume_desc",
  "volatility_asc",
  "liquidity_desc",
  "dilution_asc",
  "combined_desc",
]);

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const classParam = searchParams.get("classifications");
    let classifications: ShariahClassification[] | "ALL" | undefined;

    if (classParam === "ALL") {
      classifications = "ALL";
    } else if (classParam) {
      const parsed = classParam
        .split(",")
        .map((c) => c.trim().toUpperCase() as ShariahClassification)
        .filter((c) => VALID_CLASSIFICATIONS.has(c));
      if (parsed.length > 0) classifications = parsed;
    }

    const riskParam = searchParams.get("riskLevels");
    const riskLevels = riskParam
      ? riskParam
          .split(",")
          .map((r) => r.trim().toUpperCase() as RiskLevel)
          .filter((r) => VALID_RISKS.has(r))
      : undefined;

    const exchangeRaw = (searchParams.get("exchange") || "ALL").toUpperCase() as ExchangeFilter;
    const exchange: ExchangeFilter = VALID_EXCHANGES.has(exchangeRaw) ? exchangeRaw : "ALL";

    const sortRaw = (searchParams.get("sort") || "price_asc") as DirectorySortOption;
    const sort: DirectorySortOption = VALID_SORTS.has(sortRaw) ? sortRaw : "price_asc";

    const page = Number(searchParams.get("page") || "1") || 1;
    const pageSize = Number(searchParams.get("pageSize") || "50") || 50;
    const minCredibility = searchParams.get("minCredibility")
      ? Number(searchParams.get("minCredibility"))
      : undefined;
    const minPotential = searchParams.get("minPotential")
      ? Number(searchParams.get("minPotential"))
      : undefined;
    const minVolume24h = searchParams.get("minVolume24h")
      ? Number(searchParams.get("minVolume24h"))
      : undefined;
    const watchlistOnly = searchParams.get("watchlistOnly") === "true";
    const search = searchParams.get("search") || undefined;

    const result = getDirectoryAssets({
      classifications,
      exchange,
      riskLevels,
      sort,
      page,
      pageSize,
      minCredibility: Number.isFinite(minCredibility) ? minCredibility : undefined,
      minPotential: Number.isFinite(minPotential) ? minPotential : undefined,
      minVolume24h: Number.isFinite(minVolume24h) ? minVolume24h : undefined,
      watchlistOnly,
      search,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed to query directory" },
      { status: 500 }
    );
  }
}
