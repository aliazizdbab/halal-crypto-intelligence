import type { CredibilityFactorKey, RiskLevel, ShariahClassification } from "@/types/domain";

export type Lang = "ar" | "en";

export const SHARIAH_META: Record<
  ShariahClassification,
  { labelAr: string; labelEn: string; shortAr: string; shortEn: string; badgeClass: string }
> = {
  HALAL: {
    labelAr: "مباح وفق جهة فحص",
    labelEn: "Halal (Screened)",
    shortAr: "مباح",
    shortEn: "Halal",
    badgeClass: "bg-emerald-500/15 text-emerald-300 border-emerald-500/35",
  },
  HALAL_WITH_CONDITIONS: {
    labelAr: "مباح بشروط",
    labelEn: "Halal w/ Conditions",
    shortAr: "بشروط",
    shortEn: "Conditional",
    badgeClass: "bg-amber-500/15 text-amber-300 border-amber-500/35",
  },
  SCHOLARLY_DISAGREEMENT: {
    labelAr: "مختلف فيه شرعياً",
    labelEn: "Scholarly Disagreement",
    shortAr: "مختلف فيه",
    shortEn: "Disputed",
    badgeClass: "bg-sky-500/15 text-sky-300 border-sky-500/35",
  },
  NON_COMPLIANT: {
    labelAr: "غير متوافق شرعياً",
    labelEn: "Non-Compliant",
    shortAr: "غير مباح",
    shortEn: "Excluded",
    badgeClass: "bg-rose-500/15 text-rose-300 border-rose-500/35",
  },
  UNVERIFIED: {
    labelAr: "غير متحقق منه",
    labelEn: "Unverified",
    shortAr: "غير مفحوص",
    shortEn: "Unverified",
    badgeClass: "bg-slate-500/15 text-slate-300 border-slate-500/35",
  },
};

export const RISK_META: Record<RiskLevel, { labelAr: string; labelEn: string; badgeClass: string }> = {
  LOW: {
    labelAr: "منخفض",
    labelEn: "Low",
    badgeClass: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  },
  MODERATE: {
    labelAr: "متوسط",
    labelEn: "Moderate",
    badgeClass: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  },
  HIGH: {
    labelAr: "مرتفع",
    labelEn: "High",
    badgeClass: "bg-orange-500/15 text-orange-300 border-orange-500/30",
  },
  VERY_HIGH: {
    labelAr: "مرتفع جداً",
    labelEn: "Very High",
    badgeClass: "bg-rose-500/15 text-rose-300 border-rose-500/30",
  },
  UNAVAILABLE: {
    labelAr: "غير متوفر",
    labelEn: "Unavailable",
    badgeClass: "bg-slate-500/15 text-slate-400 border-slate-600/30",
  },
};

export const FACTOR_LABELS: Record<CredibilityFactorKey, { ar: string; en: string; weightPct: number }> = {
  team_credibility: { ar: "مصداقية الفريق والخبرة", en: "Team Credibility & Experience", weightPct: 15 },
  technology_security: { ar: "التقنية والأمان", en: "Technology & Security", weightPct: 20 },
  independent_audits: { ar: "التدقيق الأمني المستقل", en: "Independent Security Audits", weightPct: 15 },
  real_world_adoption: { ar: "التبني والمنفعة الواقعية", en: "Real-World Adoption & Utility", weightPct: 20 },
  transparency_documentation: { ar: "الشفافية والتوثيق", en: "Transparency & Documentation", weightPct: 10 },
  development_activity: { ar: "نشاط التطوير البرمجي", en: "Development Activity", weightPct: 10 },
  strategic_partnerships: { ar: "الشراكات الاستراتيجية والمنظومة", en: "Strategic Partnerships & Ecosystem", weightPct: 10 },
};

export function formatPriceUsdt(price: number | null): string {
  if (price === null || !Number.isFinite(price)) return "—";
  if (price >= 1000) return `$${price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (price >= 1) return `$${price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
  if (price >= 0.01) return `$${price.toFixed(4)}`;
  if (price >= 0.0001) return `$${price.toFixed(6)}`;
  return `$${price.toFixed(8)}`;
}

export function formatCompactUsd(val: number | null): string {
  if (val === null || !Number.isFinite(val)) return "—";
  if (val >= 1e12) return `$${(val / 1e12).toFixed(2)}T`;
  if (val >= 1e9) return `$${(val / 1e9).toFixed(2)}B`;
  if (val >= 1e6) return `$${(val / 1e6).toFixed(2)}M`;
  if (val >= 1e3) return `$${(val / 1e3).toFixed(1)}K`;
  return `$${val.toFixed(2)}`;
}

export function formatCompactNumber(val: number | null): string {
  if (val === null || !Number.isFinite(val)) return "—";
  if (val >= 1e12) return `${(val / 1e12).toFixed(2)}T`;
  if (val >= 1e9) return `${(val / 1e9).toFixed(2)}B`;
  if (val >= 1e6) return `${(val / 1e6).toFixed(2)}M`;
  if (val >= 1e3) return `${(val / 1e3).toFixed(1)}K`;
  return val.toLocaleString("en-US");
}

export function formatPct(val: number | null): string {
  if (val === null || !Number.isFinite(val)) return "—";
  const sign = val > 0 ? "+" : "";
  return `${sign}${val.toFixed(2)}%`;
}

export function scoreColorClass(score: number | null): string {
  if (score === null) return "text-slate-400";
  if (score >= 82) return "text-emerald-400";
  if (score >= 68) return "text-teal-300";
  if (score >= 52) return "text-amber-300";
  return "text-rose-400";
}
