"use client";

import React from "react";
import Link from "next/link";
import { Scale, X } from "lucide-react";
import type { AssetDirectoryRow } from "@/types/domain";
import {
  formatCompactUsd,
  formatPct,
  formatPriceUsdt,
  RISK_META,
  scoreColorClass,
  SHARIAH_META,
} from "@/lib/i18n";
import { useLanguage } from "./LanguageProvider";

interface CompareModalProps {
  assets: AssetDirectoryRow[];
  onClose: () => void;
}

export function CompareModal({ assets, onClose }: CompareModalProps) {
  const { lang } = useLanguage();
  if (assets.length === 0) return null;

  const metrics: Array<{
    labelAr: string;
    labelEn: string;
    render: (a: AssetDirectoryRow) => React.ReactNode;
  }> = [
    {
      labelAr: "السعر الحالي (USDT)",
      labelEn: "Live Price (USDT)",
      render: (a) => <span className="font-mono-num font-bold text-white">{formatPriceUsdt(a.priceUsdt)}</span>,
    },
    {
      labelAr: "التغير 24 ساعة",
      labelEn: "24h Change",
      render: (a) => (
        <span
          className={`font-mono-num font-semibold ${
            (a.priceChangePct24h ?? 0) >= 0 ? "text-emerald-400" : "text-rose-400"
          }`}
        >
          {formatPct(a.priceChangePct24h)}
        </span>
      ),
    },
    {
      labelAr: "القيمة السوقية (Market Cap)",
      labelEn: "Market Capitalization",
      render: (a) => <span className="font-mono-num text-slate-200">{formatCompactUsd(a.marketCap)}</span>,
    },
    {
      labelAr: "التقييم المخفف بالكامل (FDV)",
      labelEn: "Fully Diluted Valuation (FDV)",
      render: (a) => <span className="font-mono-num text-slate-300">{formatCompactUsd(a.fdv)}</span>,
    },
    {
      labelAr: "نسبة التخفيف (FDV / MCap)",
      labelEn: "Dilution Ratio (FDV/MCap)",
      render: (a) => (
        <span className="font-mono-num text-slate-200">
          {a.dilutionRatio !== null ? `${a.dilutionRatio}x` : "—"}
        </span>
      ),
    },
    {
      labelAr: "حجم التداول 24 ساعة",
      labelEn: "24h Spot Volume",
      render: (a) => <span className="font-mono-num text-slate-200">{formatCompactUsd(a.quoteVolume24h)}</span>,
    },
    {
      labelAr: "التصنيف الشرعي",
      labelEn: "Shariah Classification",
      render: (a) => {
        const meta = SHARIAH_META[a.shariahClassification];
        return (
          <span className={`inline-block rounded border px-2 py-0.5 text-[11px] font-semibold ${meta.badgeClass}`}>
            {lang === "ar" ? meta.labelAr : meta.labelEn}
          </span>
        );
      },
    },
    {
      labelAr: "الجهة المرجعية",
      labelEn: "Shariah Authority",
      render: (a) => <span className="text-[11px] text-slate-300">{a.shariahAuthority}</span>,
    },
    {
      labelAr: "موثوقية المشروع (0–100)",
      labelEn: "Credibility Score",
      render: (a) => (
        <span className={`font-mono-num text-sm font-bold ${scoreColorClass(a.credibilityScore)}`}>
          {a.credibilityScore !== null ? `${a.credibilityScore}/100` : "DATA UNAVAILABLE"}
        </span>
      ),
    },
    {
      labelAr: "فرص النمو الاستثماري (0–100)",
      labelEn: "Investment Potential",
      render: (a) => (
        <span className={`font-mono-num text-sm font-bold ${scoreColorClass(a.investmentPotentialScore)}`}>
          {a.investmentPotentialScore !== null ? `${a.investmentPotentialScore}/100` : "DATA UNAVAILABLE"}
        </span>
      ),
    },
    {
      labelAr: "مخاطر التوكنوميكس",
      labelEn: "Tokenomics Risk",
      render: (a) => {
        const rm = RISK_META[a.tokenomicsRisk];
        return (
          <span className={`inline-block rounded border px-2 py-0.5 text-[11px] ${rm.badgeClass}`}>
            {lang === "ar" ? rm.labelAr : rm.labelEn}
          </span>
        );
      },
    },
    {
      labelAr: "مستوى المخاطر العام",
      labelEn: "Overall Risk Level",
      render: (a) => {
        const rm = RISK_META[a.overallRiskLevel];
        return (
          <span className={`inline-block rounded border px-2 py-0.5 text-[11px] ${rm.badgeClass}`}>
            {lang === "ar" ? rm.labelAr : rm.labelEn}
          </span>
        );
      },
    },
    {
      labelAr: "التذبذب اليومي 24س",
      labelEn: "24h Volatility Range",
      render: (a) => (
        <span className="font-mono-num text-slate-300">
          {a.volatility24hPct !== null ? `${a.volatility24hPct}%` : "—"}
        </span>
      ),
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-xs">
      <div className="max-h-[90vh] w-full max-w-5xl overflow-auto rounded-2xl border border-slate-800 bg-[#0b1120] p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <Scale className="h-5 w-5 text-sky-400" />
            <h2 className="text-base font-bold text-white">
              {lang === "ar" ? "مقارنة العملات جنباً إلى جنب" : "Side-by-Side Asset Comparison"}
            </h2>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-900/80">
                <th className="p-3 text-start font-semibold text-slate-400">
                  {lang === "ar" ? "المعيار" : "Metric"}
                </th>
                {assets.map((a) => (
                  <th key={a.symbol} className="p-3 text-start">
                    <Link href={`/assets/${a.symbol}`} className="font-bold text-white hover:text-emerald-400">
                      {a.name} ({a.baseAsset})
                    </Link>
                    <div className="text-[10px] font-normal text-slate-400">{a.category}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {metrics.map((m, idx) => (
                <tr key={idx} className="hover:bg-slate-900/40">
                  <td className="p-3 font-medium text-slate-300">{lang === "ar" ? m.labelAr : m.labelEn}</td>
                  {assets.map((a) => (
                    <td key={a.symbol} className="p-3 align-top">
                      {m.render(a)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
