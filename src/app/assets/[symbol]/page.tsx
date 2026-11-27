"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  Bot,
  Coins,
  Download,
  ExternalLink,
  GitBranch,
  History,
  Layers,
  ShieldCheck,
  Star,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import type { AssetFullDetail } from "@/lib/services/repository";
import type { OrderBookDepthSummary, SupportedTimeframe } from "@/lib/services/binance";
import type { GithubRepoMetrics } from "@/lib/services/market-enrichment";
import type { TechnicalIndicatorSummary } from "@/types/domain";
import {
  FACTOR_LABELS,
  formatCompactNumber,
  formatCompactUsd,
  formatPct,
  formatPriceUsdt,
  RISK_META,
  scoreColorClass,
  SHARIAH_META,
} from "@/lib/i18n";
import { useLanguage } from "@/components/LanguageProvider";
import { TopNav } from "@/components/TopNav";
import { CandlestickChart } from "@/components/CandlestickChart";
import { AiResearchDrawer } from "@/components/AiResearchDrawer";
import { ShariahRegistryModal } from "@/components/ShariahRegistryModal";

const TIMEFRAMES: SupportedTimeframe[] = ["1m", "5m", "15m", "30m", "1h", "4h", "1d", "1w", "1M"];

export default function AssetResearchPage() {
  const params = useParams();
  const rawSymbol = String(params?.symbol || "BTCUSDT").toUpperCase();
  const { lang } = useLanguage();

  const [detail, setDetail] = useState<AssetFullDetail | null>(null);
  const [orderBook, setOrderBook] = useState<OrderBookDepthSummary | null>(null);
  const [github, setGithub] = useState<GithubRepoMetrics | null>(null);
  const [technicals, setTechnicals] = useState<TechnicalIndicatorSummary | null>(null);
  const [timeframe, setTimeframe] = useState<SupportedTimeframe>("4h");
  const [loading, setLoading] = useState(true);
  const [techLoading, setTechLoading] = useState(false);
  const [showAi, setShowAi] = useState(false);
  const [showShariahEdit, setShowShariahEdit] = useState(false);

  const loadAsset = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/assets/${encodeURIComponent(rawSymbol)}`);
      const data = await res.json();
      if (data.ok) {
        setDetail(data.detail);
        setOrderBook(data.orderBook || null);
        setGithub(data.github || null);
      }
    } finally {
      setLoading(false);
    }
  }, [rawSymbol]);

  const loadTechnicals = useCallback(
    async (tf: SupportedTimeframe) => {
      setTechLoading(true);
      try {
        const res = await fetch(
          `/api/assets/${encodeURIComponent(rawSymbol)}/technicals?timeframe=${encodeURIComponent(tf)}&limit=250`
        );
        const data = await res.json();
        if (data.ok) {
          setTechnicals(data.technicals);
        }
      } finally {
        setTechLoading(false);
      }
    },
    [rawSymbol]
  );

  useEffect(() => {
    loadAsset();
  }, [loadAsset]);

  useEffect(() => {
    loadTechnicals(timeframe);
  }, [loadTechnicals, timeframe]);

  async function handleToggleWatchlist() {
    if (!detail) return;
    const res = await fetch("/api/watchlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbol: detail.overview.symbol }),
    });
    const data = await res.json();
    if (data.ok) {
      setDetail((prev) =>
        prev ? { ...prev, overview: { ...prev.overview, inWatchlist: data.inWatchlist } } : prev
      );
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#060a13] text-slate-200">
        <TopNav />
        <div className="mx-auto max-w-6xl p-8 text-center text-sm text-slate-400">
          {lang === "ar" ? "جاري تحميل ملف البحث التفصيلي..." : "Loading institutional research dossier..."}
        </div>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="min-h-screen bg-[#060a13] text-slate-200">
        <TopNav />
        <div className="mx-auto max-w-4xl p-8 text-center">
          <p className="mb-4 text-rose-300">
            {lang === "ar" ? `لم يتم العثور على الأصل ${rawSymbol}` : `Asset ${rawSymbol} not found`}
          </p>
          <Link href="/" className="rounded-lg bg-slate-800 px-4 py-2 text-xs text-white hover:bg-slate-700">
            {lang === "ar" ? "العودة إلى لوحة التحكم" : "Back to Dashboard"}
          </Link>
        </div>
      </div>
    );
  }

  const { overview, shariah, credibility, investmentPotential, tokenomics, scenarios, historicalSnapshots, auditLog } =
    detail;
  const shariahMeta = SHARIAH_META[shariah.classification];
  const tokRiskMeta = RISK_META[tokenomics.tokenomicsRisk];
  const overallRiskMeta = RISK_META[overview.overallRiskLevel];
  const isPos = (overview.priceChangePct24h ?? 0) >= 0;

  return (
    <div className="min-h-screen bg-[#060a13] text-slate-100">
      <TopNav
        onOpenAi={() => setShowAi(true)}
        onOpenShariahModal={() => setShowShariahEdit(true)}
        exportQuery={`symbol=${encodeURIComponent(overview.symbol)}`}
      />

      <main className="mx-auto max-w-[1520px] space-y-5 px-4 py-5">
        {/* Back Breadcrumb + Quick Actions */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-400 transition hover:text-emerald-300"
          >
            <ArrowLeft className="h-3.5 w-3.5 rtl:rotate-180" />
            {lang === "ar" ? "العودة لدليل العملات" : "Back to Directory"}
          </Link>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <button
              onClick={handleToggleWatchlist}
              className={`inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 font-semibold ${
                overview.inWatchlist
                  ? "border-amber-500/50 bg-amber-500/15 text-amber-300"
                  : "border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800"
              }`}
            >
              <Star className={`h-3.5 w-3.5 ${overview.inWatchlist ? "fill-amber-400 text-amber-400" : ""}`} />
              {lang === "ar" ? "المفضلة" : "Watchlist"}
            </button>
            <button
              onClick={() => setShowAi(true)}
              className="inline-flex items-center gap-1 rounded-lg border border-indigo-500/40 bg-indigo-500/15 px-3 py-1.5 font-semibold text-indigo-200 hover:bg-indigo-500/25"
            >
              <Bot className="h-3.5 w-3.5" />
              {lang === "ar" ? `اسأل AI عن ${overview.baseAsset}` : `Ask AI about ${overview.baseAsset}`}
            </button>
            <a
              href={`/api/export?format=pdf&symbol=${encodeURIComponent(overview.symbol)}`}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 font-medium text-slate-200 hover:bg-slate-800"
            >
              <Download className="h-3.5 w-3.5 text-emerald-400" />
              {lang === "ar" ? "تقرير PDF للعملة" : "Export Asset PDF"}
            </a>
            <a
              href={overview.binanceSpotUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-lg border border-amber-500/40 bg-amber-500/15 px-3 py-1.5 font-semibold text-amber-200 hover:bg-amber-500/25"
            >
              Binance Spot ({overview.symbol})
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>

        {/* SECTION A: Project Overview Hero */}
        <section className="rounded-2xl border border-slate-800 bg-[#0b1120] p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-3xl space-y-2">
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="text-2xl font-extrabold text-white">
                  {overview.name}{" "}
                  <span className="font-mono-num text-lg text-slate-400">({overview.baseAsset})</span>
                </h1>
                <span className={`rounded border px-2.5 py-0.5 text-xs font-bold ${shariahMeta.badgeClass}`}>
                  {lang === "ar" ? shariahMeta.labelAr : shariahMeta.labelEn}
                </span>
                <span className="rounded border border-slate-700 bg-slate-900 px-2 py-0.5 text-[11px] text-slate-300">
                  {overview.category}
                </span>
                <span className="rounded border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
                  SPOT {overview.binanceStatus}
                </span>
              </div>
              <p className="text-sm leading-relaxed text-slate-300">
                {lang === "ar" ? overview.descriptionAr : overview.descriptionEn}
              </p>
              <div className="flex flex-wrap items-center gap-3 pt-1 text-xs">
                {overview.officialWebsite && (
                  <a
                    href={overview.officialWebsite}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-sky-400 hover:underline"
                  >
                    {lang === "ar" ? "الموقع الرسمي" : "Official Website"}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
                {overview.githubRepo && (
                  <a
                    href={`https://github.com/${overview.githubRepo}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-slate-300 hover:text-white"
                  >
                    <GitBranch className="h-3.5 w-3.5 text-emerald-400" />
                    {overview.githubRepo}
                    {github?.available && github.stars !== null && (
                      <span className="font-mono-num text-[11px] text-slate-400">
                        (★ {formatCompactNumber(github.stars)} | Forks {formatCompactNumber(github.forks)})
                      </span>
                    )}
                  </a>
                )}
              </div>
            </div>

            {/* Live Price Block */}
            <div className="min-w-[240px] rounded-xl border border-slate-800 bg-slate-950/70 p-4 text-end">
              <div className="text-[11px] text-slate-400">{overview.priceSource}</div>
              <div className="mt-1 font-mono-num text-3xl font-extrabold text-white">
                {formatPriceUsdt(overview.priceUsdt)}
              </div>
              <div
                className={`mt-1 inline-flex items-center gap-1 font-mono-num text-sm font-bold ${
                  isPos ? "text-emerald-400" : "text-rose-400"
                }`}
              >
                {isPos ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                {formatPct(overview.priceChangePct24h)} (24h)
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 border-t border-slate-800 pt-2 text-[11px] font-mono-num text-slate-400">
                <div>24h H: {formatPriceUsdt(overview.high24h)}</div>
                <div>24h L: {formatPriceUsdt(overview.low24h)}</div>
                <div>Bid: {formatPriceUsdt(overview.bidPrice)}</div>
                <div>Spread: {overview.spreadPct !== null ? `${overview.spreadPct}%` : "—"}</div>
              </div>
            </div>
          </div>

          {/* 4 Summary Score Tiles */}
          <div className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-800/80 pt-4 sm:grid-cols-4">
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
              <div className="text-[11px] text-slate-400">
                {lang === "ar" ? "موثوقية المشروع (0-100)" : "Project Credibility"}
              </div>
              <div className={`mt-1 font-mono-num text-2xl font-bold ${scoreColorClass(credibility.score)}`}>
                {credibility.score !== null ? `${credibility.score}/100` : "DATA UNAVAILABLE"}
              </div>
              <div className="text-[10px] text-slate-400">
                {lang === "ar"
                  ? `الثقة: ${credibility.confidence} • تغطية الأدلة ${credibility.availableWeightPct}%`
                  : `Confidence: ${credibility.confidence} • Coverage ${credibility.availableWeightPct}%`}
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
              <div className="text-[11px] text-slate-400">
                {lang === "ar" ? "تقييم فرص النمو (تحليلي)" : "Investment Potential (Analytical)"}
              </div>
              <div className={`mt-1 font-mono-num text-2xl font-bold ${scoreColorClass(investmentPotential.score)}`}>
                {investmentPotential.score !== null ? `${investmentPotential.score}/100` : "DATA UNAVAILABLE"}
              </div>
              <div className="text-[10px] text-slate-400">
                {lang === "ar" ? `مستوى الثقة: ${investmentPotential.confidence}` : `Confidence: ${investmentPotential.confidence}`}
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
              <div className="text-[11px] text-slate-400">{lang === "ar" ? "القيمة السوقية / FDV" : "Market Cap / FDV"}</div>
              <div className="mt-1 font-mono-num text-xl font-bold text-white">
                {formatCompactUsd(overview.marketCap)}
              </div>
              <div className="font-mono-num text-[10px] text-slate-400">
                FDV: {formatCompactUsd(overview.fdv)} {overview.dilutionRatio ? `(${overview.dilutionRatio}x)` : ""}
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
              <div className="text-[11px] text-slate-400">{lang === "ar" ? "المخاطر والسيولة 24س" : "Risk & 24h Liquidity"}</div>
              <div className="mt-1 flex items-center gap-2">
                <span className={`rounded border px-2 py-0.5 text-xs font-bold ${overallRiskMeta.badgeClass}`}>
                  {lang === "ar" ? overallRiskMeta.labelAr : overallRiskMeta.labelEn}
                </span>
                <span className="font-mono-num text-xs text-slate-300">
                  {formatCompactUsd(overview.quoteVolume24h)}
                </span>
              </div>
              <div className="mt-1 text-[10px] text-slate-400">
                {orderBook
                  ? `±2% Depth: ${formatCompactUsd(orderBook.bidDepth2PctUsd + orderBook.askDepth2PctUsd)}`
                  : lang === "ar"
                    ? "عمق السوق: غير متوفر"
                    : "Orderbook depth: N/A"}
              </div>
            </div>
          </div>
        </section>

        {/* SECTION B: Shariah Compliance Report */}
        <section className="rounded-2xl border border-emerald-500/25 bg-[#0b1120] p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
            <h2 className="flex items-center gap-2 text-base font-bold text-white">
              <ShieldCheck className="h-5 w-5 text-emerald-400" />
              {lang === "ar" ? "تقرير الفحص الشرعي والمراجع الموثّقة" : "Shariah Compliance Report & Citations"}
            </h2>
            <button
              onClick={() => setShowShariahEdit(true)}
              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1 text-xs font-medium text-slate-200 hover:bg-slate-800"
            >
              {lang === "ar" ? "تحديث التصنيف الشرعي" : "Update Shariah Record"}
            </button>
          </div>

          <div className="grid grid-cols-1 gap-4 text-xs md:grid-cols-2">
            <div className="space-y-2.5">
              <div>
                <span className="text-slate-400">{lang === "ar" ? "الجهة المرجعية: " : "Issuing Authority: "}</span>
                <span className="font-semibold text-white">{shariah.authorityName}</span>
                {shariah.sourceUrl && (
                  <a
                    href={shariah.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="ms-2 inline-flex items-center gap-1 text-emerald-400 hover:underline"
                  >
                    {lang === "ar" ? "رابط المرجع" : "Source"}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
              <div>
                <span className="text-slate-400">{lang === "ar" ? "تاريخ الفحص: " : "Assessment Date: "}</span>
                <span className="font-mono-num text-slate-200">{shariah.assessmentDate}</span>
                <span className="mx-2 text-slate-600">|</span>
                <span className="text-slate-400">{lang === "ar" ? "حالة التحقق: " : "Verification: "}</span>
                <span className="font-mono-num text-sky-300">{shariah.verificationStatus}</span>
              </div>
              <div>
                <div className="mb-0.5 font-semibold text-slate-300">{lang === "ar" ? "المنهجية المعتمدة" : "Methodology"}</div>
                <p className="text-slate-300">{shariah.methodology}</p>
              </div>
              <div>
                <div className="mb-0.5 font-semibold text-slate-300">
                  {lang === "ar" ? "سبب الحكم وتحليل النشاط الأساسي" : "Core Activity & Ruling Rationale"}
                </div>
                <p className="leading-relaxed text-slate-200">
                  {lang === "ar" ? shariah.coreActivityNotesAr : shariah.coreActivityNotesEn}
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-3">
                <div className="mb-1 font-bold text-amber-300">
                  {lang === "ar" ? "الشروط والقيود الواجبة" : "Conditions & Restrictions"}
                </div>
                <p className="leading-relaxed text-slate-200">
                  {lang === "ar"
                    ? shariah.conditionsAr || "التداول الفوري (Spot) فقط دون رافعة أو اقتراض ربوي."
                    : shariah.conditionsEn || "Spot ownership only; no margin, futures, or leverage."}
                </p>
              </div>
              <div className="rounded-xl border border-sky-500/25 bg-sky-500/5 p-3">
                <div className="mb-1 font-bold text-sky-300">
                  {lang === "ar" ? "الخلافات الفقهية المعروفة (شفافية كاملة)" : "Known Scholarly Disagreements"}
                </div>
                <p className="leading-relaxed text-slate-300">
                  {lang === "ar"
                    ? shariah.scholarlyDisagreementsAr || "البيانات غير متوفرة – تتطلب تحققاً."
                    : shariah.scholarlyDisagreementsEn || "DATA UNAVAILABLE – REQUIRES VERIFICATION"}
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION F & G: Interactive Market Chart & Technical Analysis (Strictly Separated from Shariah) */}
        <section className="rounded-2xl border border-slate-800 bg-[#0b1120] p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-bold text-white">
                {lang === "ar" ? "التحليل الفني والسوقي المتقدم (Binance Spot)" : "Market Structure & Technical Indicators"}
              </h2>
              <p className="text-[11px] text-slate-400">
                {lang === "ar"
                  ? "ملاحظة: الإشارات الفنية منفصلة تماماً عن الحكم الشرعي وليست توصية شراء أو بيع."
                  : "Technical indicators are strictly separated from Shariah compliance and do not constitute trading signals."}
              </p>
            </div>

            {/* 9 Supported Timeframes */}
            <div className="flex flex-wrap gap-1 rounded-lg border border-slate-800 bg-slate-950 p-1">
              {TIMEFRAMES.map((tf) => (
                <button
                  key={tf}
                  onClick={() => setTimeframe(tf)}
                  className={`rounded px-2 py-1 font-mono-num text-[11px] font-semibold transition ${
                    timeframe === tf
                      ? "bg-emerald-500/25 text-emerald-300"
                      : "text-slate-400 hover:bg-slate-800 hover:text-white"
                  }`}
                >
                  {tf}
                </button>
              ))}
            </div>
          </div>

          {techLoading && !technicals ? (
            <div className="flex h-[380px] items-center justify-center rounded-xl border border-slate-800 bg-slate-950 text-xs text-slate-400">
              {lang === "ar" ? "جاري جلب الشموع الحية وحساب المؤشرات..." : "Fetching live OHLCV candles & computing indicators..."}
            </div>
          ) : technicals ? (
            <div className="space-y-4">
              <CandlestickChart technicals={technicals} />

              {/* Technical Summary Grid */}
              <div className="grid grid-cols-2 gap-2.5 text-xs sm:grid-cols-3 lg:grid-cols-6">
                <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-2.5">
                  <div className="text-[10px] text-slate-400">RSI (14)</div>
                  <div className="mt-0.5 font-mono-num text-sm font-bold text-white">
                    {technicals.rsi14 !== null ? technicals.rsi14.toFixed(2) : "—"}
                  </div>
                  <div className="text-[10px] text-sky-300">{technicals.shortTermCondition}</div>
                </div>

                <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-2.5">
                  <div className="text-[10px] text-slate-400">MACD (12,26,9)</div>
                  <div className="mt-0.5 font-mono-num text-sm font-bold text-white">
                    {technicals.macd ? technicals.macd.histogram.toFixed(4) : "—"}
                  </div>
                  <div className="text-[10px] text-slate-400">
                    {technicals.macd ? (technicals.macd.histogram >= 0 ? "Bullish Hist" : "Bearish Hist") : "—"}
                  </div>
                </div>

                <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-2.5">
                  <div className="text-[10px] text-slate-400">ADX (14) / ATR%</div>
                  <div className="mt-0.5 font-mono-num text-sm font-bold text-white">
                    {technicals.adx14 !== null ? technicals.adx14.toFixed(1) : "—"} /{" "}
                    {technicals.atrPct !== null ? `${technicals.atrPct.toFixed(2)}%` : "—"}
                  </div>
                  <div className="text-[10px] text-amber-300">{technicals.volatilityAssessment} VOL</div>
                </div>

                <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-2.5">
                  <div className="text-[10px] text-slate-400">VWAP (50)</div>
                  <div className="mt-0.5 font-mono-num text-sm font-bold text-white">
                    {formatPriceUsdt(technicals.vwap)}
                  </div>
                  <div className="text-[10px] text-slate-400">Liq: {technicals.liquidityAssessment}</div>
                </div>

                <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-2.5">
                  <div className="text-[10px] text-slate-400">{lang === "ar" ? "الاتجاه المتوسط / الطويل" : "Med / Long Trend"}</div>
                  <div className="mt-0.5 text-xs font-bold text-emerald-300">{technicals.mediumTermTrend}</div>
                  <div className="text-[10px] text-slate-300">{technicals.longTermTrend}</div>
                </div>

                <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-2.5">
                  <div className="text-[10px] text-slate-400">{lang === "ar" ? "هيكل السوق" : "Market Structure"}</div>
                  <div className="mt-0.5 text-[11px] font-bold text-white">{technicals.marketStructure}</div>
                  <div className="text-[10px] text-slate-400">
                    BB Width: {technicals.bollingerBands ? `${technicals.bollingerBands.bandwidthPct.toFixed(1)}%` : "—"}
                  </div>
                </div>
              </div>

              {/* Moving Averages + Support/Resistance + Accumulation Zones */}
              <div className="grid grid-cols-1 gap-3 text-xs lg:grid-cols-3">
                <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3">
                  <div className="mb-2 font-bold text-slate-200">
                    {lang === "ar" ? "المتوسطات المتحركة (EMA / SMA)" : "Moving Averages (EMA / SMA)"}
                  </div>
                  <div className="grid grid-cols-2 gap-1.5 font-mono-num text-[11px]">
                    <div>EMA 20: <span className="text-sky-300">{formatPriceUsdt(technicals.ema20)}</span></div>
                    <div>EMA 50: <span className="text-amber-300">{formatPriceUsdt(technicals.ema50)}</span></div>
                    <div>EMA 100: <span className="text-slate-200">{formatPriceUsdt(technicals.ema100)}</span></div>
                    <div>EMA 200: <span className="text-slate-200">{formatPriceUsdt(technicals.ema200)}</span></div>
                    <div>SMA 50: <span className="text-slate-300">{formatPriceUsdt(technicals.sma50)}</span></div>
                    <div>SMA 100: <span className="text-slate-300">{formatPriceUsdt(technicals.sma100)}</span></div>
                    <div>SMA 200: <span className="text-slate-300">{formatPriceUsdt(technicals.sma200)}</span></div>
                    <div>BB Lower: <span className="text-emerald-300">{formatPriceUsdt(technicals.bollingerBands?.lower ?? null)}</span></div>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3">
                  <div className="mb-2 font-bold text-slate-200">
                    {lang === "ar" ? "الدعوم والمقاومات ومناطق التجميع" : "Support, Resistance & Accumulation Zones"}
                  </div>
                  <div className="space-y-1.5 text-[11px]">
                    <div>
                      <span className="text-emerald-400 font-semibold">{lang === "ar" ? "الدعوم: " : "Support: "}</span>
                      <span className="font-mono-num text-slate-200">
                        {technicals.supportLevels.length > 0
                          ? technicals.supportLevels.map((s) => formatPriceUsdt(s)).join(" | ")
                          : "—"}
                      </span>
                    </div>
                    <div>
                      <span className="text-rose-400 font-semibold">{lang === "ar" ? "المقاومات: " : "Resistance: "}</span>
                      <span className="font-mono-num text-slate-200">
                        {technicals.resistanceLevels.length > 0
                          ? technicals.resistanceLevels.map((r) => formatPriceUsdt(r)).join(" | ")
                          : "—"}
                      </span>
                    </div>
                    {technicals.accumulationZones.map((z, idx) => (
                      <div key={idx} className="rounded bg-slate-900/90 p-1.5 text-[10px]">
                        <span className="font-mono-num font-bold text-emerald-300">
                          {formatPriceUsdt(z.low)} – {formatPriceUsdt(z.high)}
                        </span>
                        <div className="text-slate-400">{lang === "ar" ? z.rationaleAr : z.rationaleEn}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Volume Profile Mini Histogram */}
                <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3">
                  <div className="mb-2 font-bold text-slate-200">
                    {lang === "ar" ? "توزيع الحجم السعري (Volume Profile)" : "Volume Profile (Price Nodes)"}
                  </div>
                  <div className="space-y-1">
                    {technicals.volumeProfile
                      .slice()
                      .sort((a, b) => b.volume - a.volume)
                      .slice(0, 6)
                      .map((b, i) => (
                        <div key={i} className="flex items-center gap-2 text-[10px] font-mono-num">
                          <span className="w-28 shrink-0 text-slate-400">
                            {formatPriceUsdt(b.priceLow)}
                          </span>
                          <div className="h-2 flex-1 overflow-hidden rounded bg-slate-900">
                            <div
                              className="h-full bg-indigo-400/75"
                              style={{ width: `${Math.min(100, b.pctOfTotal * 3)}%` }}
                            />
                          </div>
                          <span className="w-10 text-end text-slate-300">{b.pctOfTotal}%</span>
                        </div>
                      ))}
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </section>

        {/* SECTION C & D: Project Credibility (7 Weighted Factors) + Investment Potential Breakdown */}
        <section className="grid grid-cols-1 gap-5 xl:grid-cols-3">
          {/* 7-Factor Credibility Table */}
          <div className="rounded-2xl border border-slate-800 bg-[#0b1120] p-5 xl:col-span-2">
            <div className="mb-3 flex items-center justify-between border-b border-slate-800 pb-3">
              <h2 className="flex items-center gap-2 text-base font-bold text-white">
                <Layers className="h-5 w-5 text-emerald-400" />
                {lang === "ar" ? "تقييم موثوقية المشروع المدعوم بالأدلة (7 محاور موزونة)" : "Evidence-Backed Project Credibility (7 Weighted Factors)"}
              </h2>
              <span className={`font-mono-num text-lg font-extrabold ${scoreColorClass(credibility.score)}`}>
                {credibility.score !== null ? `${credibility.score}/100` : "UNAVAILABLE"}
              </span>
            </div>

            <div className="space-y-2.5">
              {credibility.factors.map((f) => {
                const label = FACTOR_LABELS[f.factorKey];
                return (
                  <div key={f.factorKey} className="rounded-xl border border-slate-800/80 bg-slate-950/60 p-3 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white">{lang === "ar" ? label.ar : label.en}</span>
                        <span className="rounded bg-slate-800 px-1.5 py-0.5 font-mono-num text-[10px] text-slate-300">
                          {label.weightPct}%
                        </span>
                        <span className="rounded bg-slate-900 px-1.5 py-0.5 text-[10px] text-slate-400">
                          {f.confidenceLevel}
                        </span>
                      </div>
                      <span className={`font-mono-num text-sm font-bold ${scoreColorClass(f.score)}`}>
                        {f.isAvailable && f.score !== null ? `${f.score}/100` : "DATA UNAVAILABLE"}
                      </span>
                    </div>
                    <p className="mt-1.5 leading-relaxed text-slate-300">
                      {lang === "ar" ? f.evidenceAr : f.evidenceEn}
                    </p>
                    <div className="mt-1.5 flex items-center justify-between text-[10px] text-slate-500">
                      <span>
                        {lang === "ar" ? "المصدر: " : "Source: "}
                        {f.sourceUrl ? (
                          <a href={f.sourceUrl} target="_blank" rel="noreferrer" className="text-sky-400 hover:underline">
                            {f.sourceName}
                          </a>
                        ) : (
                          f.sourceName
                        )}
                      </span>
                      <span className="font-mono-num">{f.researchDate}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Investment Potential Breakdown */}
          <div className="rounded-2xl border border-slate-800 bg-[#0b1120] p-5">
            <div className="mb-3 flex items-center justify-between border-b border-slate-800 pb-3">
              <h2 className="text-base font-bold text-white">
                {lang === "ar" ? "تفصيل تقييم فرص النمو" : "Investment Potential Breakdown"}
              </h2>
              <span className={`font-mono-num text-lg font-extrabold ${scoreColorClass(investmentPotential.score)}`}>
                {investmentPotential.score !== null ? `${investmentPotential.score}/100` : "N/A"}
              </span>
            </div>

            <div className="space-y-3 text-xs">
              {investmentPotential.components.map((c) => (
                <div key={c.key} className="rounded-xl border border-slate-800/80 bg-slate-950/60 p-3">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-white">{lang === "ar" ? c.labelAr : c.labelEn}</span>
                    <span className={`font-mono-num font-bold ${scoreColorClass(c.score)}`}>
                      {c.score !== null ? `${c.score}/100` : "N/A"}
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                    <div
                      className="h-full bg-sky-400"
                      style={{ width: `${c.score ?? 0}%` }}
                    />
                  </div>
                  <p className="mt-1.5 text-[11px] text-slate-400">
                    {lang === "ar" ? c.rationaleAr : c.rationaleEn}
                  </p>
                </div>
              ))}

              <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-[11px] text-amber-200/90">
                {lang === "ar"
                  ? "هذا التقييم يقيس الجاذبية التحليلية بناءً على البيانات المتاحة ولا يُعد احتمالاً إحصائياً مضموناً للربح."
                  : "Analytical attractiveness score grounded in observable metrics — NOT a guaranteed return or statistical probability."}
              </div>
            </div>
          </div>
        </section>

        {/* SECTION E & H: Tokenomics Analyzer & Risk Assessment */}
        <section className="rounded-2xl border border-slate-800 bg-[#0b1120] p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
            <h2 className="flex items-center gap-2 text-base font-bold text-white">
              <Coins className="h-5 w-5 text-amber-400" />
              {lang === "ar" ? "محلل التوكنوميكس ومخاطر التخفيف" : "Tokenomics Analyzer & Risk Assessment"}
            </h2>
            <span className={`rounded border px-2.5 py-0.5 text-xs font-bold ${tokRiskMeta.badgeClass}`}>
              {lang === "ar" ? `مخاطر التوكنوميكس: ${tokRiskMeta.labelAr}` : `Tokenomics Risk: ${tokRiskMeta.labelEn}`}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-3 lg:grid-cols-6">
            <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
              <div className="text-[10px] text-slate-400">{lang === "ar" ? "المعروض المتداول" : "Circulating Supply"}</div>
              <div className="mt-1 font-mono-num text-sm font-bold text-white">
                {formatCompactNumber(tokenomics.circulatingSupply)}
              </div>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
              <div className="text-[10px] text-slate-400">{lang === "ar" ? "الحد الأقصى للمعروض" : "Max Supply"}</div>
              <div className="mt-1 font-mono-num text-sm font-bold text-white">
                {tokenomics.maxSupply !== null ? formatCompactNumber(tokenomics.maxSupply) : lang === "ar" ? "غير محدد" : "Uncapped"}
              </div>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
              <div className="text-[10px] text-slate-400">{lang === "ar" ? "معدل التضخم السنوي" : "Est. Annual Inflation"}</div>
              <div className="mt-1 font-mono-num text-sm font-bold text-white">
                {tokenomics.inflationRatePct !== null ? `${tokenomics.inflationRatePct}%` : "—"}
              </div>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
              <div className="text-[10px] text-slate-400">{lang === "ar" ? "تخصيص المطلعين" : "Insider Allocation"}</div>
              <div className="mt-1 font-mono-num text-sm font-bold text-white">
                {tokenomics.insiderAllocationPct !== null ? `${tokenomics.insiderAllocationPct}%` : "—"}
              </div>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
              <div className="text-[10px] text-slate-400">FDV / Market Cap</div>
              <div className="mt-1 font-mono-num text-sm font-bold text-white">
                {overview.dilutionRatio !== null ? `${overview.dilutionRatio}x` : "—"}
              </div>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
              <div className="text-[10px] text-slate-400">{lang === "ar" ? "أقرب فك قفل كبير" : "Next Major Unlock"}</div>
              <div className="mt-1 font-mono-num text-sm font-bold text-orange-300">
                {tokenomics.nextMajorUnlockDate || (lang === "ar" ? "لا يوجد" : "None")}
              </div>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 text-xs md:grid-cols-2">
            <div className="space-y-2 rounded-xl border border-slate-800 bg-slate-950/50 p-3">
              <div><strong className="text-slate-200">{lang === "ar" ? "جدول فك القفل: " : "Unlock Schedule: "}</strong><span className="text-slate-300">{lang === "ar" ? tokenomics.unlockScheduleSummaryAr : tokenomics.unlockScheduleSummaryEn}</span></div>
              <div><strong className="text-slate-200">{lang === "ar" ? "منفعة التوكن: " : "Token Utility: "}</strong><span className="text-slate-300">{lang === "ar" ? tokenomics.tokenUtilityAr : tokenomics.tokenUtilityEn}</span></div>
              <div><strong className="text-slate-200">{lang === "ar" ? "آلية الحرق: " : "Burn Mechanism: "}</strong><span className="text-slate-300">{lang === "ar" ? tokenomics.burnMechanismAr : tokenomics.burnMechanismEn}</span></div>
            </div>
            <div className="space-y-2 rounded-xl border border-slate-800 bg-slate-950/50 p-3">
              <div><strong className="text-slate-200">{lang === "ar" ? "آلية الـ Staking: " : "Staking Mechanism: "}</strong><span className="text-slate-300">{lang === "ar" ? tokenomics.stakingMechanismAr : tokenomics.stakingMechanismEn}</span></div>
              <div><strong className="text-slate-200">{lang === "ar" ? "حقوق الحوكمة: " : "Governance Rights: "}</strong><span className="text-slate-300">{lang === "ar" ? tokenomics.governanceRightsAr : tokenomics.governanceRightsEn}</span></div>
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                <span className="font-semibold text-slate-200">{lang === "ar" ? "تنبيهات المخاطر:" : "Risk Flags:"}</span>
                {tokenomics.riskFlags.length > 0 ? (
                  tokenomics.riskFlags.map((flag) => (
                    <span
                      key={flag}
                      className="inline-flex items-center gap-1 rounded border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 font-mono-num text-[10px] text-rose-300"
                    >
                      <AlertTriangle className="h-2.5 w-2.5" />
                      {flag}
                    </span>
                  ))
                ) : (
                  <span className="rounded bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-300">
                    {lang === "ar" ? "لا توجد إشارات خطر حرجة" : "No high-risk tokenomics flags"}
                  </span>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* SECTION I: Investment Scenarios (Bearish / Base / Bullish) */}
        <section className="rounded-2xl border border-slate-800 bg-[#0b1120] p-5">
          <h2 className="mb-3 text-base font-bold text-white">
            {lang === "ar"
              ? "سيناريوهات الاستثمار والتحليل (متشائم / أساسي / متفائل)"
              : "Analytical Investment Scenarios (Bearish / Base / Bullish)"}
          </h2>
          {scenarios.length === 0 ? (
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 text-xs text-slate-400">
              DATA UNAVAILABLE – REQUIRES VERIFICATION
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              {scenarios.map((sc) => {
                const style =
                  sc.scenarioType === "BULLISH"
                    ? "border-emerald-500/30 bg-emerald-500/[0.04]"
                    : sc.scenarioType === "BEARISH"
                      ? "border-rose-500/30 bg-rose-500/[0.04]"
                      : "border-sky-500/30 bg-sky-500/[0.04]";
                const heading =
                  sc.scenarioType === "BULLISH"
                    ? lang === "ar"
                      ? "السيناريو المتفائل (Bullish)"
                      : "Bullish Scenario"
                    : sc.scenarioType === "BEARISH"
                      ? lang === "ar"
                        ? "السيناريو المتشائم (Bearish)"
                        : "Bearish Scenario"
                      : lang === "ar"
                        ? "السيناريو الأساسي (Base)"
                        : "Base Scenario";
                return (
                  <div key={sc.scenarioType} className={`rounded-xl border p-4 text-xs space-y-2 ${style}`}>
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-white">{heading}</span>
                      <span className="rounded bg-slate-900 px-2 py-0.5 font-mono-num text-[10px] text-slate-300">
                        {sc.timeHorizon}
                      </span>
                    </div>
                    <p className="leading-relaxed text-slate-200">
                      {lang === "ar" ? sc.assumptionsAr : sc.assumptionsEn}
                    </p>
                    <div>
                      <span className="font-semibold text-emerald-300">{lang === "ar" ? "المحفزات: " : "Catalysts: "}</span>
                      <span className="text-slate-300">{lang === "ar" ? sc.catalystsAr : sc.catalystsEn}</span>
                    </div>
                    <div>
                      <span className="font-semibold text-rose-300">{lang === "ar" ? "المخاطر: " : "Risks: "}</span>
                      <span className="text-slate-300">{lang === "ar" ? sc.risksAr : sc.risksEn}</span>
                    </div>
                    <div className="border-t border-slate-800/70 pt-2 text-[10px] text-slate-400">
                      {lang === "ar" ? sc.supportingEvidenceAr : sc.supportingEvidenceEn}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* SECTION J & K: Historical Snapshots & Audit Log */}
        <section className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <div className="rounded-2xl border border-slate-800 bg-[#0b1120] p-5 text-xs">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-white">
              <History className="h-4 w-4 text-sky-400" />
              {lang === "ar" ? "اللقطات التاريخية للتقييم والسعر" : "Historical Score & Price Snapshots"}
            </h2>
            {historicalSnapshots.length === 0 ? (
              <p className="text-slate-400">
                {lang === "ar"
                  ? "لا توجد لقطات تاريخية بعد. اضغط «مزامنة Binance» أو «حفظ لقطة تاريخية» لبدء التتبع الزمني."
                  : "No historical snapshots yet. Run Sync or Capture Snapshot to begin longitudinal tracking."}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400">
                      <th className="py-1.5 text-start">{lang === "ar" ? "التاريخ" : "Date"}</th>
                      <th className="py-1.5 text-end">{lang === "ar" ? "السعر" : "Price"}</th>
                      <th className="py-1.5 text-center">{lang === "ar" ? "الشرعي" : "Shariah"}</th>
                      <th className="py-1.5 text-center">{lang === "ar" ? "الموثوقية" : "Cred"}</th>
                      <th className="py-1.5 text-center">{lang === "ar" ? "النمو" : "Growth"}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono-num">
                    {historicalSnapshots.map((h) => (
                      <tr key={h.id}>
                        <td className="py-1.5 text-slate-400">{new Date(h.recordedAt).toLocaleString()}</td>
                        <td className="py-1.5 text-end text-white">{formatPriceUsdt(h.priceUsdt)}</td>
                        <td className="py-1.5 text-center text-emerald-300">{h.shariahClassification}</td>
                        <td className="py-1.5 text-center text-slate-200">{h.credibilityScore ?? "—"}</td>
                        <td className="py-1.5 text-center text-slate-200">{h.investmentPotentialScore ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-slate-800 bg-[#0b1120] p-5 text-xs">
            <h2 className="mb-3 text-sm font-bold text-white">
              {lang === "ar" ? "سجل التدقيق والتغييرات الموثّقة (Audit Trail)" : "Research Audit Trail & Sources"}
            </h2>
            {auditLog.length === 0 ? (
              <p className="text-slate-400">
                {lang === "ar" ? "لم تُسجل تعديلات لاحقة بعد التأسيس الأولي." : "No post-seed edits logged yet."}
              </p>
            ) : (
              <div className="space-y-2">
                {auditLog.map((a) => (
                  <div key={a.id} className="rounded-lg border border-slate-800 bg-slate-950/60 p-2.5 text-[11px]">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-white">
                        {a.entityType} • {a.fieldName}
                      </span>
                      <span className="font-mono-num text-[10px] text-slate-400">
                        {new Date(a.createdAt).toLocaleString()}
                      </span>
                    </div>
                    <div className="mt-1 font-mono-num text-slate-300">
                      {a.previousValue ?? "NONE"} → <span className="text-emerald-300">{a.newValue}</span>
                    </div>
                    {a.reason && <div className="mt-0.5 text-slate-400">{a.reason}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </main>

      <AiResearchDrawer open={showAi} onClose={() => setShowAi(false)} defaultSymbol={overview.symbol} />
      <ShariahRegistryModal
        open={showShariahEdit}
        onClose={() => setShowShariahEdit(false)}
        initialSymbol={overview.symbol}
        onSaved={loadAsset}
      />
    </div>
  );
}
