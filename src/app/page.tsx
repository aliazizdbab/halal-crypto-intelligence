"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Columns3,
  ExternalLink,
  Filter,
  Info,
  Scale,
  Search,
  ShieldCheck,
  Star,
  TrendingDown,
  TrendingUp,
  Unlock,
} from "lucide-react";
import type { AssetDirectoryRow, DashboardSummary, RiskLevel, ShariahClassification } from "@/types/domain";
import type { DirectorySortOption } from "@/lib/services/repository";
import {
  formatCompactUsd,
  formatPct,
  formatPriceUsdt,
  RISK_META,
  scoreColorClass,
  SHARIAH_META,
} from "@/lib/i18n";
import { useLanguage } from "@/components/LanguageProvider";
import { TopNav } from "@/components/TopNav";
import { AiResearchDrawer } from "@/components/AiResearchDrawer";
import { AlertsDrawer } from "@/components/AlertsDrawer";
import { ShariahRegistryModal } from "@/components/ShariahRegistryModal";
import { CompareModal } from "@/components/CompareModal";

type FilterPreset =
  | "HALAL_DEFAULT"
  | "HALAL_ONLY"
  | "CONDITIONAL"
  | "DISPUTED"
  | "NON_COMPLIANT"
  | "UNVERIFIED"
  | "ALL";

interface LiveTickerPatch {
  price: number;
  changePct: number;
  quoteVol: number;
  dir: "up" | "down" | "flat";
}

export default function DashboardPage() {
  const { lang } = useLanguage();

  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [rows, setRows] = useState<AssetDirectoryRow[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  // Filters & Sorting (Default: Halal + Conditional Halal, Sorted Lowest -> Highest Unit Price)
  const [preset, setPreset] = useState<FilterPreset>("HALAL_DEFAULT");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sort, setSort] = useState<DirectorySortOption>("price_asc");
  const [riskFilter, setRiskFilter] = useState<RiskLevel | "ALL">("ALL");
  const [minCredibility, setMinCredibility] = useState<string>("");
  const [minPotential, setMinPotential] = useState<string>("");
  const [watchlistOnly, setWatchlistOnly] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = 35;

  // Interactive features
  const [compareSymbols, setCompareSymbols] = useState<string[]>([]);
  const [showCompareModal, setShowCompareModal] = useState(false);
  const [showAiDrawer, setShowAiDrawer] = useState(false);
  const [aiDefaultSymbol, setAiDefaultSymbol] = useState<string | undefined>(undefined);
  const [showAlertsDrawer, setShowAlertsDrawer] = useState(false);
  const [showShariahModal, setShowShariahModal] = useState(false);
  const [unreadAlerts, setUnreadAlerts] = useState(0);

  // Customizable table columns
  const [showColumnMenu, setShowColumnMenu] = useState(false);
  const [visibleCols, setVisibleCols] = useState({
    change24h: true,
    marketCap: true,
    volume24h: true,
    shariah: true,
    authority: true,
    credibility: true,
    potential: true,
    tokenomicsRisk: true,
    overallRisk: true,
    binancePair: true,
  });

  // Live Binance WebSocket patches
  const [livePatches, setLivePatches] = useState<Record<string, LiveTickerPatch>>({});
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 250);
    return () => clearTimeout(t);
  }, [search]);

  const classificationsParam = useMemo(() => {
    switch (preset) {
      case "HALAL_DEFAULT":
        return "HALAL,HALAL_WITH_CONDITIONS";
      case "HALAL_ONLY":
        return "HALAL";
      case "CONDITIONAL":
        return "HALAL_WITH_CONDITIONS";
      case "DISPUTED":
        return "SCHOLARLY_DISAGREEMENT";
      case "NON_COMPLIANT":
        return "NON_COMPLIANT";
      case "UNVERIFIED":
        return "UNVERIFIED";
      case "ALL":
        return "ALL";
    }
  }, [preset]);

  const loadDashboardSummary = useCallback(async () => {
    try {
      const [sumRes, alertRes] = await Promise.all([fetch("/api/dashboard"), fetch("/api/alerts")]);
      const sumData = await sumRes.json();
      if (sumData.ok) setSummary(sumData.summary);
      const alertData = await alertRes.json();
      if (alertData.ok) {
        const unread = (alertData.alerts || []).filter((a: { isRead: boolean }) => !a.isRead).length;
        setUnreadAlerts(unread);
      }
    } catch {
      // ignore
    }
  }, []);

  const loadDirectory = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({
        classifications: classificationsParam,
        sort,
        page: String(page),
        pageSize: String(pageSize),
      });
      if (debouncedSearch) qs.set("search", debouncedSearch);
      if (riskFilter !== "ALL") qs.set("riskLevels", riskFilter);
      if (minCredibility) qs.set("minCredibility", minCredibility);
      if (minPotential) qs.set("minPotential", minPotential);
      if (watchlistOnly) qs.set("watchlistOnly", "true");

      const res = await fetch(`/api/assets?${qs.toString()}`);
      const data = await res.json();
      if (data.ok) {
        setRows(data.rows || []);
        setTotal(data.total || 0);
        setTotalPages(data.totalPages || 1);
      }
    } finally {
      setLoading(false);
    }
  }, [classificationsParam, sort, page, debouncedSearch, riskFilter, minCredibility, minPotential, watchlistOnly]);

  useEffect(() => {
    loadDashboardSummary().then(() => loadDirectory());
  }, [loadDashboardSummary, loadDirectory]);

  // Live Binance Spot WebSocket stream for visible page symbols
  useEffect(() => {
    if (rows.length === 0) return;
    const streams = rows
      .slice(0, 40)
      .map((r) => `${r.symbol.toLowerCase()}@ticker`)
      .join("/");

    if (!streams) return;

    let ws: WebSocket | null = null;
    try {
      ws = new WebSocket(`wss://stream.binance.com:9443/stream?streams=${streams}`);
      wsRef.current = ws;

      ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data) as {
            data?: { s?: string; c?: string; P?: string; q?: string };
          };
          const d = payload.data;
          if (!d?.s || !d.c) return;
          const sym = d.s;
          const price = parseFloat(d.c);
          const changePct = parseFloat(d.P || "0");
          const quoteVol = parseFloat(d.q || "0");
          if (!Number.isFinite(price)) return;

          setLivePatches((prev) => {
            const oldPrice = prev[sym]?.price;
            const dir = oldPrice === undefined ? "flat" : price > oldPrice ? "up" : price < oldPrice ? "down" : "flat";
            return {
              ...prev,
              [sym]: { price, changePct, quoteVol, dir },
            };
          });
        } catch {
          // ignore malformed frames
        }
      };
    } catch {
      // WebSocket blocked/unavailable — REST fallback still works
    }

    return () => {
      if (ws) {
        ws.close();
      }
    };
  }, [rows]);

  async function handleSyncBinance() {
    setIsSyncing(true);
    setSyncMessage(null);
    try {
      const res = await fetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ takeSnapshot: true }),
      });
      const data = await res.json();
      if (data.ok) {
        setSyncMessage(
          lang === "ar"
            ? `تم التحقق من ${data.binance.totalEligibleSpotUsdt} زوج Binance Spot نشط، وتحديث ${data.marketCap?.updatedAssets ?? 0} قيمة سوقية.`
            : `Verified ${data.binance.totalEligibleSpotUsdt} active Binance Spot USDT pairs & enriched ${data.marketCap?.updatedAssets ?? 0} market caps.`
        );
        await loadDashboardSummary();
        await loadDirectory();
      } else {
        setSyncMessage(data.error || "Sync failed");
      }
    } catch {
      setSyncMessage(lang === "ar" ? "فشلت المزامنة مع Binance API" : "Failed to reach Binance Spot API");
    } finally {
      setIsSyncing(false);
    }
  }

  async function handleToggleWatchlist(symbol: string) {
    const res = await fetch("/api/watchlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbol }),
    });
    const data = await res.json();
    if (data.ok) {
      setRows((prev) => prev.map((r) => (r.symbol === symbol ? { ...r, inWatchlist: data.inWatchlist } : r)));
    }
  }

  function toggleCompare(symbol: string) {
    setCompareSymbols((prev) => {
      if (prev.includes(symbol)) return prev.filter((s) => s !== symbol);
      if (prev.length >= 4) return prev;
      return [...prev, symbol];
    });
  }

  // Merge live WS prices into rows
  const displayRows = useMemo(() => {
    return rows.map((r) => {
      const patch = livePatches[r.symbol];
      if (!patch) return r;
      return {
        ...r,
        priceUsdt: patch.price,
        priceChangePct24h: patch.changePct,
        quoteVolume24h: patch.quoteVol > 0 ? patch.quoteVol : r.quoteVolume24h,
      };
    });
  }, [rows, livePatches]);

  const comparedAssets = useMemo(
    () => displayRows.filter((r) => compareSymbols.includes(r.symbol)),
    [displayRows, compareSymbols]
  );

  const exportQuery = `classifications=${encodeURIComponent(classificationsParam)}&sort=${encodeURIComponent(sort)}`;

  const presetTabs: Array<{ key: FilterPreset; labelAr: string; labelEn: string; count?: number }> = [
    {
      key: "HALAL_DEFAULT",
      labelAr: "مباح + بشروط (الافتراضي)",
      labelEn: "Halal + Conditional",
      count: summary ? summary.countHalal + summary.countHalalWithConditions : undefined,
    },
    { key: "HALAL_ONLY", labelAr: "مباح فقط", labelEn: "Halal Only", count: summary?.countHalal },
    { key: "CONDITIONAL", labelAr: "مباح بشروط", labelEn: "Conditional", count: summary?.countHalalWithConditions },
    { key: "DISPUTED", labelAr: "مختلف فيه", labelEn: "Disputed", count: summary?.countScholarlyDisagreement },
    { key: "NON_COMPLIANT", labelAr: "مستبعد / غير مباح", labelEn: "Excluded", count: summary?.countNonCompliant },
    { key: "UNVERIFIED", labelAr: "غير مفحوص (Binance)", labelEn: "Unverified", count: summary?.countUnverified },
    { key: "ALL", labelAr: "كل Binance Spot USDT", labelEn: "All Spot USDT", count: summary?.totalBinanceSpotUsdtPairs },
  ];

  return (
    <div className="min-h-screen bg-[#060a13] text-slate-100">
      <TopNav
        connectionStatus={summary?.binanceConnectionStatus}
        lastSyncedAt={summary?.lastBinanceSyncAt}
        wsLiveCount={Object.keys(livePatches).length}
        unreadAlerts={unreadAlerts}
        isSyncing={isSyncing}
        onSync={handleSyncBinance}
        onOpenAi={() => {
          setAiDefaultSymbol(undefined);
          setShowAiDrawer(true);
        }}
        onOpenAlerts={() => setShowAlertsDrawer(true)}
        onOpenShariahModal={() => setShowShariahModal(true)}
        exportQuery={exportQuery}
      />

      <main className="mx-auto max-w-[1640px] space-y-4 px-4 py-4">
        {syncMessage && (
          <div className="flex items-center justify-between rounded-xl border border-emerald-500/35 bg-emerald-500/10 px-4 py-2 text-xs text-emerald-200">
            <span>{syncMessage}</span>
            <button onClick={() => setSyncMessage(null)} className="text-emerald-300 hover:text-white">
              ×
            </button>
          </div>
        )}

        {/* Executive KPI Grid */}
        <section className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
          <div className="rounded-xl border border-slate-800/90 bg-[#0b1120] p-3">
            <div className="text-[11px] text-slate-400">
              {lang === "ar" ? "إجمالي العملات المفحوصة" : "Screened Assets"}
            </div>
            <div className="mt-1 flex items-baseline justify-between">
              <span className="font-mono-num text-xl font-bold text-white">
                {summary?.totalScreenedAssets ?? "—"}
              </span>
              <span className="font-mono-num text-[11px] text-slate-400">
                / {summary?.totalBinanceSpotUsdtPairs ?? "—"} Spot
              </span>
            </div>
          </div>

          <div className="rounded-xl border border-emerald-500/25 bg-[#0b1120] p-3">
            <div className="text-[11px] text-emerald-300/90">
              {lang === "ar" ? "مباح وفق جهة فحص" : "Halal (Screened)"}
            </div>
            <div className="mt-1 flex items-baseline justify-between">
              <span className="font-mono-num text-xl font-bold text-emerald-400">
                {summary?.countHalal ?? "—"}
              </span>
              <span className="text-[11px] text-amber-300 font-mono-num">
                +{summary?.countHalalWithConditions ?? 0} {lang === "ar" ? "بشروط" : "Cond."}
              </span>
            </div>
          </div>

          <div className="rounded-xl border border-slate-800/90 bg-[#0b1120] p-3">
            <div className="text-[11px] text-slate-400">
              {lang === "ar" ? "مختلف فيه / مستبعد" : "Disputed / Excluded"}
            </div>
            <div className="mt-1 flex items-baseline gap-2 font-mono-num">
              <span className="text-xl font-bold text-sky-400">
                {summary?.countScholarlyDisagreement ?? "—"}
              </span>
              <span className="text-slate-600">/</span>
              <span className="text-xl font-bold text-rose-400">
                {summary?.countNonCompliant ?? "—"}
              </span>
            </div>
          </div>

          <div className="rounded-xl border border-slate-800/90 bg-[#0b1120] p-3">
            <div className="text-[11px] text-slate-400">
              {lang === "ar" ? "القيمة السوقية المفحوصة" : "Screened Market Cap"}
            </div>
            <div className="mt-1 font-mono-num text-xl font-bold text-white">
              {summary ? formatCompactUsd(summary.totalScreenedMarketCap) : "—"}
            </div>
          </div>

          <div className="rounded-xl border border-slate-800/90 bg-[#0b1120] p-3">
            <div className="text-[11px] text-slate-400">
              {lang === "ar" ? "متوسط موثوقية المشاريع" : "Avg. Project Credibility"}
            </div>
            <div className={`mt-1 font-mono-num text-xl font-bold ${scoreColorClass(summary?.averageCredibilityScore ?? null)}`}>
              {summary?.averageCredibilityScore !== null && summary?.averageCredibilityScore !== undefined
                ? `${summary.averageCredibilityScore}/100`
                : "—"}
            </div>
          </div>

          <div className="rounded-xl border border-slate-800/90 bg-[#0b1120] p-3">
            <div className="text-[11px] text-slate-400">
              {lang === "ar" ? "متوسط فرص النمو" : "Avg. Investment Potential"}
            </div>
            <div className={`mt-1 font-mono-num text-xl font-bold ${scoreColorClass(summary?.averageInvestmentPotentialScore ?? null)}`}>
              {summary?.averageInvestmentPotentialScore !== null && summary?.averageInvestmentPotentialScore !== undefined
                ? `${summary.averageInvestmentPotentialScore}/100`
                : "—"}
            </div>
          </div>
        </section>

        {/* Analytical Intelligence Banner + Upcoming Unlocks + Shariah Guardrail */}
        <section className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          {/* Valuation Realism Note (Unit Price != Cheap Valuation) */}
          <div className="rounded-xl border border-amber-500/25 bg-amber-500/[0.06] p-3 text-xs">
            <div className="mb-1 flex items-center gap-1.5 font-bold text-amber-300">
              <Info className="h-4 w-4 shrink-0" />
              {lang === "ar"
                ? "مبدأ التقييم: انخفاض سعر الوحدة لا يعني أن العملة رخيصة!"
                : "Valuation Discipline: Low Unit Price ≠ Cheap Valuation"}
            </div>
            <p className="leading-relaxed text-slate-300">
              {lang === "ar"
                ? "الترتيب الافتراضي أدناه يعرض العملات من أقل سعر للوحدة إلى الأعلى كما هو مطلوب، لكن المقارنة الاستثمارية الحقيقية تعتمد على القيمة السوقية (Market Cap) والتقييم المخفف بالكامل (FDV) ومعدل التضخم وفك القفل."
                : "Default sorting is Lowest → Highest unit price as specified, but true valuation comparison requires Market Cap, FDV, inflation rate, and unlock schedules."}
            </p>
          </div>

          {/* Upcoming Major Token Unlocks */}
          <div className="rounded-xl border border-slate-800 bg-[#0b1120] p-3 text-xs">
            <div className="mb-1.5 flex items-center justify-between font-bold text-slate-200">
              <span className="flex items-center gap-1.5">
                <Unlock className="h-3.5 w-3.5 text-orange-400" />
                {lang === "ar" ? "فكوك القفل الرئيسية القادمة" : "Upcoming Major Token Unlocks"}
              </span>
              <span className="text-[10px] font-normal text-slate-400">
                {lang === "ar" ? "مخاطر تخفيف" : "Dilution Watch"}
              </span>
            </div>
            <div className="space-y-1">
              {(summary?.upcomingMajorUnlocks || []).slice(0, 3).map((u) => (
                <Link
                  key={u.symbol}
                  href={`/assets/${u.symbol}`}
                  className="flex items-center justify-between rounded bg-slate-900/70 px-2 py-1 hover:bg-slate-800"
                >
                  <span className="font-semibold text-white">
                    {u.name} ({u.symbol.replace("USDT", "")})
                  </span>
                  <span className="font-mono-num text-[11px] text-orange-300">
                    {u.unlockDate} • {u.unlockPct ?? "?"}%
                  </span>
                </Link>
              ))}
              {(!summary || summary.upcomingMajorUnlocks.length === 0) && (
                <p className="text-slate-500">{lang === "ar" ? "لا توجد فكوك قفل قريبة مسجلة" : "No upcoming cliff unlocks logged."}</p>
              )}
            </div>
          </div>

          {/* Shariah Methodology Disclaimer */}
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.04] p-3 text-xs">
            <div className="mb-1 flex items-center gap-1.5 font-bold text-emerald-300">
              <ShieldCheck className="h-4 w-4 shrink-0" />
              {lang === "ar"
                ? "الشفافية الشرعية وفصل التحليل"
                : "Shariah Transparency & Risk Separation"}
            </div>
            <p className="leading-relaxed text-slate-300">
              {lang === "ar"
                ? "لا ندّعي الإجماع الفقهي لأي عملة رقمية؛ كل تصنيف مرتبط بجهة فحص محددة ومصدر موثّق. التداول الفوري (Spot) فقط، ولا تُعد درجات الموثوقية أو النمو ضماناً للربح."
                : "No cryptocurrency is claimed unanimously Halal; every classification cites a named screening body. Spot-only analytics — scores are analytical ratings, never guaranteed profit claims."}
            </p>
          </div>
        </section>

        {/* Main Directory Panel */}
        <section className="rounded-2xl border border-slate-800/90 bg-[#0b1120] shadow-xl">
          {/* Shariah Classification Tabs */}
          <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-800 px-3 py-2.5">
            {presetTabs.map((t) => {
              const active = preset === t.key;
              return (
                <button
                  key={t.key}
                  onClick={() => {
                    setPreset(t.key);
                    setPage(1);
                  }}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
                    active
                      ? "border border-emerald-500/50 bg-emerald-500/15 text-emerald-200"
                      : "border border-transparent bg-slate-900/80 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                  }`}
                >
                  <span>{lang === "ar" ? t.labelAr : t.labelEn}</span>
                  {t.count !== undefined && (
                    <span className="rounded bg-slate-950/80 px-1.5 py-0.2 font-mono-num text-[10px] text-slate-300">
                      {t.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Search, Advanced Filters, Sorting & Column Controls */}
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-800/80 bg-slate-950/40 px-3 py-2.5 text-xs">
            {/* Search */}
            <div className="relative min-w-[200px] flex-1">
              <Search className="pointer-events-none absolute start-2.5 top-2 h-3.5 w-3.5 text-slate-500" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={
                  lang === "ar"
                    ? "ابحث بالاسم أو الرمز أو الجهة الشرعية..."
                    : "Search name, symbol, category, or authority..."
                }
                className="w-full rounded-lg border border-slate-800 bg-slate-950 py-1.5 pe-3 ps-8 text-xs text-white placeholder-slate-500 focus:border-emerald-500/60 focus:outline-none"
              />
            </div>

            {/* Sort Selector */}
            <div className="flex items-center gap-1.5">
              <ArrowUpDown className="h-3.5 w-3.5 text-emerald-400" />
              <select
                value={sort}
                onChange={(e) => {
                  setSort(e.target.value as DirectorySortOption);
                  setPage(1);
                }}
                className="rounded-lg border border-slate-800 bg-slate-950 px-2.5 py-1.5 text-xs text-slate-200 focus:border-emerald-500 focus:outline-none"
              >
                <option value="price_asc">
                  {lang === "ar" ? "السعر: من الأقل إلى الأعلى (افتراضي)" : "Unit Price: Lowest → Highest (Default)"}
                </option>
                <option value="price_desc">{lang === "ar" ? "السعر: من الأعلى إلى الأقل" : "Unit Price: Highest → Lowest"}</option>
                <option value="combined_desc">{lang === "ar" ? "أفضل تقييم بحثي مدمج" : "Best Combined Research Rating"}</option>
                <option value="credibility_desc">{lang === "ar" ? "الأعلى موثوقية للمشروع" : "Highest Project Credibility"}</option>
                <option value="potential_desc">{lang === "ar" ? "الأعلى فرص نمو" : "Highest Investment Potential"}</option>
                <option value="market_cap_desc">{lang === "ar" ? "الأكبر قيمة سوقية" : "Highest Market Cap"}</option>
                <option value="volume_desc">{lang === "ar" ? "الأعلى حجم تداول 24س" : "Highest 24h Volume"}</option>
                <option value="liquidity_desc">{lang === "ar" ? "أفضل سيولة Spot" : "Best Spot Liquidity"}</option>
                <option value="dilution_asc">{lang === "ar" ? "أقل مخاطر تخفيف (FDV/MCap)" : "Lowest Token Dilution Risk"}</option>
                <option value="volatility_asc">{lang === "ar" ? "أقل تذبذب سعري" : "Lowest Volatility"}</option>
              </select>
            </div>

            {/* Risk Filter */}
            <div className="flex items-center gap-1">
              <Filter className="h-3.5 w-3.5 text-slate-400" />
              <select
                value={riskFilter}
                onChange={(e) => {
                  setRiskFilter(e.target.value as RiskLevel | "ALL");
                  setPage(1);
                }}
                className="rounded-lg border border-slate-800 bg-slate-950 px-2 py-1.5 text-xs text-slate-200"
              >
                <option value="ALL">{lang === "ar" ? "كل المخاطر" : "All Risks"}</option>
                <option value="LOW">{lang === "ar" ? "مخاطر منخفضة" : "Low Risk"}</option>
                <option value="MODERATE">{lang === "ar" ? "مخاطر متوسطة" : "Moderate Risk"}</option>
                <option value="HIGH">{lang === "ar" ? "مخاطر مرتفعة" : "High Risk"}</option>
                <option value="VERY_HIGH">{lang === "ar" ? "مرتفعة جداً" : "Very High"}</option>
              </select>
            </div>

            {/* Score Thresholds */}
            <input
              type="number"
              min={0}
              max={100}
              value={minCredibility}
              onChange={(e) => {
                setMinCredibility(e.target.value);
                setPage(1);
              }}
              placeholder={lang === "ar" ? "موثوقية ≥" : "Cred ≥"}
              className="w-24 rounded-lg border border-slate-800 bg-slate-950 px-2 py-1.5 text-xs text-white placeholder-slate-500"
            />
            <input
              type="number"
              min={0}
              max={100}
              value={minPotential}
              onChange={(e) => {
                setMinPotential(e.target.value);
                setPage(1);
              }}
              placeholder={lang === "ar" ? "نمو ≥" : "Growth ≥"}
              className="w-24 rounded-lg border border-slate-800 bg-slate-950 px-2 py-1.5 text-xs text-white placeholder-slate-500"
            />

            {/* Watchlist Only */}
            <button
              onClick={() => {
                setWatchlistOnly((v) => !v);
                setPage(1);
              }}
              className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 font-semibold ${
                watchlistOnly
                  ? "border-amber-500/50 bg-amber-500/15 text-amber-300"
                  : "border-slate-800 bg-slate-950 text-slate-400 hover:text-white"
              }`}
            >
              <Star className={`h-3.5 w-3.5 ${watchlistOnly ? "fill-amber-400 text-amber-400" : ""}`} />
              {lang === "ar" ? "المفضلة" : "Watchlist"}
            </button>

            {/* Compare Button */}
            {compareSymbols.length >= 2 && (
              <button
                onClick={() => setShowCompareModal(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-sky-500/50 bg-sky-500/20 px-3 py-1.5 font-semibold text-sky-200 hover:bg-sky-500/30"
              >
                <Scale className="h-3.5 w-3.5" />
                {lang === "ar" ? `مقارنة (${compareSymbols.length})` : `Compare (${compareSymbols.length})`}
              </button>
            )}

            {/* Column Customizer */}
            <div className="relative">
              <button
                onClick={() => setShowColumnMenu((v) => !v)}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-800 bg-slate-950 px-2.5 py-1.5 text-slate-300 hover:bg-slate-900"
              >
                <Columns3 className="h-3.5 w-3.5" />
                {lang === "ar" ? "الأعمدة" : "Columns"}
              </button>
              {showColumnMenu && (
                <div className="absolute end-0 top-9 z-30 w-52 rounded-xl border border-slate-700 bg-[#0d1526] p-2.5 shadow-2xl">
                  {(Object.keys(visibleCols) as Array<keyof typeof visibleCols>).map((colKey) => (
                    <label key={colKey} className="flex cursor-pointer items-center gap-2 py-1 text-xs text-slate-200">
                      <input
                        type="checkbox"
                        checked={visibleCols[colKey]}
                        onChange={() => setVisibleCols((prev) => ({ ...prev, [colKey]: !prev[colKey] }))}
                      />
                      <span>{colKey}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* High-Density Institutional Data Table */}
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-900/80 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  <th className="w-8 px-2.5 py-2.5 text-center">#</th>
                  <th className="px-2.5 py-2.5 text-start">{lang === "ar" ? "العملة والرمز" : "Asset"}</th>
                  <th className="px-2.5 py-2.5 text-end">{lang === "ar" ? "السعر (USDT)" : "Price USDT"}</th>
                  {visibleCols.change24h && (
                    <th className="px-2.5 py-2.5 text-end">{lang === "ar" ? "24 ساعة" : "24h %"}</th>
                  )}
                  {visibleCols.marketCap && (
                    <th className="px-2.5 py-2.5 text-end">{lang === "ar" ? "القيمة السوقية" : "Market Cap"}</th>
                  )}
                  {visibleCols.volume24h && (
                    <th className="px-2.5 py-2.5 text-end">{lang === "ar" ? "حجم التداول 24س" : "24h Volume"}</th>
                  )}
                  {visibleCols.shariah && (
                    <th className="px-2.5 py-2.5 text-start">{lang === "ar" ? "التصنيف الشرعي" : "Shariah Status"}</th>
                  )}
                  {visibleCols.authority && (
                    <th className="px-2.5 py-2.5 text-start">{lang === "ar" ? "الجهة المرجعية" : "Authority"}</th>
                  )}
                  {visibleCols.credibility && (
                    <th className="px-2.5 py-2.5 text-center">{lang === "ar" ? "الموثوقية" : "Credibility"}</th>
                  )}
                  {visibleCols.potential && (
                    <th className="px-2.5 py-2.5 text-center">{lang === "ar" ? "فرص النمو" : "Growth"}</th>
                  )}
                  {visibleCols.tokenomicsRisk && (
                    <th className="px-2.5 py-2.5 text-center">{lang === "ar" ? "التوكنوميكس" : "Tokenomics"}</th>
                  )}
                  {visibleCols.overallRisk && (
                    <th className="px-2.5 py-2.5 text-center">{lang === "ar" ? "المخاطر" : "Risk"}</th>
                  )}
                  {visibleCols.binancePair && (
                    <th className="px-2.5 py-2.5 text-center">{lang === "ar" ? "Binance Spot" : "Spot Pair"}</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {loading ? (
                  <tr>
                    <td colSpan={13} className="py-12 text-center text-slate-400">
                      {lang === "ar" ? "جاري تحميل بيانات Binance Spot والسجل الشرعي..." : "Loading verified Binance Spot & Shariah records..."}
                    </td>
                  </tr>
                ) : displayRows.length === 0 ? (
                  <tr>
                    <td colSpan={13} className="py-12 text-center text-slate-400">
                      {lang === "ar"
                        ? "لا توجد عملات مطابقة للفلاتر الحالية."
                        : "No cryptocurrencies match your current filter criteria."}
                    </td>
                  </tr>
                ) : (
                  displayRows.map((row) => {
                    const shariahMeta = SHARIAH_META[row.shariahClassification];
                    const tokRiskMeta = RISK_META[row.tokenomicsRisk];
                    const overallRiskMeta = RISK_META[row.overallRiskLevel];
                    const patch = livePatches[row.symbol];
                    const isPositive = (row.priceChangePct24h ?? 0) >= 0;

                    return (
                      <tr
                        key={row.symbol}
                        className="group transition hover:bg-slate-900/75"
                      >
                        <td className="px-2.5 py-2.5 text-center font-mono-num text-slate-500">
                          <div className="flex items-center justify-center gap-1.5">
                            <input
                              type="checkbox"
                              checked={compareSymbols.includes(row.symbol)}
                              onChange={() => toggleCompare(row.symbol)}
                              title={lang === "ar" ? "تحديد للمقارنة" : "Select to compare"}
                              className="h-3.5 w-3.5 cursor-pointer rounded border-slate-700 bg-slate-950"
                            />
                            <span>{row.rank}</span>
                          </div>
                        </td>

                        <td className="px-2.5 py-2.5">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleToggleWatchlist(row.symbol)}
                              className="text-slate-600 transition hover:text-amber-400"
                              title={lang === "ar" ? "إضافة للمفضلة" : "Toggle watchlist"}
                            >
                              <Star
                                className={`h-3.5 w-3.5 ${row.inWatchlist ? "fill-amber-400 text-amber-400" : ""}`}
                              />
                            </button>
                            <Link href={`/assets/${row.symbol}`} className="block">
                              <div className="flex items-center gap-1.5">
                                <span className="font-bold text-white group-hover:text-emerald-300">
                                  {row.baseAsset}
                                </span>
                                <span className="max-w-[130px] truncate text-[11px] text-slate-400">
                                  {row.name}
                                </span>
                              </div>
                              <div className="max-w-[175px] truncate text-[10px] text-slate-500">
                                {row.category}
                              </div>
                            </Link>
                          </div>
                        </td>

                        <td
                          className={`px-2.5 py-2.5 text-end font-mono-num font-bold ${
                            patch?.dir === "up"
                              ? "text-emerald-300"
                              : patch?.dir === "down"
                                ? "text-rose-300"
                                : "text-white"
                          }`}
                        >
                          {formatPriceUsdt(row.priceUsdt)}
                        </td>

                        {visibleCols.change24h && (
                          <td className="px-2.5 py-2.5 text-end font-mono-num">
                            {row.priceChangePct24h !== null ? (
                              <span
                                className={`inline-flex items-center gap-0.5 font-semibold ${
                                  isPositive ? "text-emerald-400" : "text-rose-400"
                                }`}
                              >
                                {isPositive ? (
                                  <TrendingUp className="h-3 w-3" />
                                ) : (
                                  <TrendingDown className="h-3 w-3" />
                                )}
                                {formatPct(row.priceChangePct24h)}
                              </span>
                            ) : (
                              <span className="text-slate-500">—</span>
                            )}
                          </td>
                        )}

                        {visibleCols.marketCap && (
                          <td className="px-2.5 py-2.5 text-end font-mono-num text-slate-200">
                            <div>{formatCompactUsd(row.marketCap)}</div>
                            {row.dilutionRatio !== null && row.dilutionRatio >= 1.6 && (
                              <div className="text-[10px] text-orange-400">FDV {row.dilutionRatio}x</div>
                            )}
                          </td>
                        )}

                        {visibleCols.volume24h && (
                          <td className="px-2.5 py-2.5 text-end font-mono-num text-slate-300">
                            {formatCompactUsd(row.quoteVolume24h)}
                          </td>
                        )}

                        {visibleCols.shariah && (
                          <td className="px-2.5 py-2.5">
                            <span
                              className={`inline-block rounded border px-2 py-0.5 text-[11px] font-semibold ${shariahMeta.badgeClass}`}
                            >
                              {lang === "ar" ? shariahMeta.shortAr : shariahMeta.shortEn}
                            </span>
                          </td>
                        )}

                        {visibleCols.authority && (
                          <td className="max-w-[180px] truncate px-2.5 py-2.5 text-[11px] text-slate-300" title={row.shariahAuthority}>
                            {row.shariahSourceUrl ? (
                              <a
                                href={row.shariahSourceUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 hover:text-emerald-300"
                              >
                                <span className="truncate">{row.shariahAuthority}</span>
                                <ExternalLink className="h-2.5 w-2.5 shrink-0 text-slate-500" />
                              </a>
                            ) : (
                              <span className="text-slate-500">{row.shariahAuthority}</span>
                            )}
                          </td>
                        )}

                        {visibleCols.credibility && (
                          <td className="px-2.5 py-2.5 text-center font-mono-num">
                            {row.credibilityScore !== null ? (
                              <div className="inline-flex flex-col items-center">
                                <span className={`font-bold ${scoreColorClass(row.credibilityScore)}`}>
                                  {row.credibilityScore}
                                </span>
                                <div className="mt-0.5 h-1 w-12 overflow-hidden rounded-full bg-slate-800">
                                  <div
                                    className="h-full bg-emerald-400"
                                    style={{ width: `${Math.min(100, row.credibilityScore)}%` }}
                                  />
                                </div>
                              </div>
                            ) : (
                              <span className="text-[10px] text-slate-500">N/A</span>
                            )}
                          </td>
                        )}

                        {visibleCols.potential && (
                          <td className="px-2.5 py-2.5 text-center font-mono-num">
                            {row.investmentPotentialScore !== null ? (
                              <div className="inline-flex flex-col items-center">
                                <span className={`font-bold ${scoreColorClass(row.investmentPotentialScore)}`}>
                                  {row.investmentPotentialScore}
                                </span>
                                <div className="mt-0.5 h-1 w-12 overflow-hidden rounded-full bg-slate-800">
                                  <div
                                    className="h-full bg-sky-400"
                                    style={{ width: `${Math.min(100, row.investmentPotentialScore)}%` }}
                                  />
                                </div>
                              </div>
                            ) : (
                              <span className="text-[10px] text-slate-500">N/A</span>
                            )}
                          </td>
                        )}

                        {visibleCols.tokenomicsRisk && (
                          <td className="px-2.5 py-2.5 text-center">
                            <span className={`inline-block rounded border px-1.5 py-0.5 text-[10px] font-medium ${tokRiskMeta.badgeClass}`}>
                              {lang === "ar" ? tokRiskMeta.labelAr : tokRiskMeta.labelEn}
                            </span>
                          </td>
                        )}

                        {visibleCols.overallRisk && (
                          <td className="px-2.5 py-2.5 text-center">
                            <span className={`inline-block rounded border px-1.5 py-0.5 text-[10px] font-medium ${overallRiskMeta.badgeClass}`}>
                              {lang === "ar" ? overallRiskMeta.labelAr : overallRiskMeta.labelEn}
                            </span>
                          </td>
                        )}

                        {visibleCols.binancePair && (
                          <td className="px-2.5 py-2.5 text-center">
                            <div className="inline-flex items-center gap-1.5">
                              <Link
                                href={`/assets/${row.symbol}`}
                                className="rounded border border-slate-700 bg-slate-800/80 px-2 py-0.5 text-[11px] font-semibold text-slate-200 hover:border-emerald-500/50 hover:text-emerald-300"
                              >
                                {lang === "ar" ? "التحليل" : "Research"}
                              </Link>
                              <a
                                href={row.binanceSpotUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-0.5 rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 font-mono-num text-[10px] text-amber-300 hover:bg-amber-500/20"
                                title="Open Binance Spot"
                              >
                                {row.baseAsset}/USDT
                                <ExternalLink className="h-2.5 w-2.5" />
                              </a>
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Footer */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-800 px-4 py-2.5 text-xs text-slate-400">
            <div>
              {lang === "ar"
                ? `عرض ${displayRows.length} من أصل ${total} زوج Binance Spot USDT مؤهل`
                : `Showing ${displayRows.length} of ${total} verified Binance Spot USDT pairs`}
            </div>
            <div className="flex items-center gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="inline-flex items-center gap-1 rounded border border-slate-800 bg-slate-900 px-2.5 py-1 text-slate-300 hover:bg-slate-800 disabled:opacity-40"
              >
                <ChevronRight className="h-3.5 w-3.5 rtl:rotate-0 ltr:rotate-180" />
                {lang === "ar" ? "السابق" : "Prev"}
              </button>
              <span className="font-mono-num text-slate-300">
                {page} / {totalPages}
              </span>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="inline-flex items-center gap-1 rounded border border-slate-800 bg-slate-900 px-2.5 py-1 text-slate-300 hover:bg-slate-800 disabled:opacity-40"
              >
                {lang === "ar" ? "التالي" : "Next"}
                <ChevronLeft className="h-3.5 w-3.5 rtl:rotate-0 ltr:rotate-180" />
              </button>
            </div>
          </div>
        </section>

        {/* Bottom Legal & Shariah Disclaimer */}
        <footer className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800/70 bg-[#080d18] px-4 py-3 text-[11px] text-slate-400">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
            <span>
              {lang === "ar"
                ? "هذه المنصة أداة بحثية تحليلية للتداول الفوري (Spot) فقط، ولا تنفذ أي صفقات أو سحوبات، ولا تقدم فتوى شرعية إجماعية ولا نصيحة مالية أو ضماناً للعائد."
                : "Analytical Spot-only research platform. Never executes trades or accesses funds. Classifications reflect cited third-party authorities and do not constitute an institutional fatwa or financial advice."}
            </span>
          </div>
          <span className="font-mono-num text-slate-500">Binance Public Spot API • SQLite Local</span>
        </footer>
      </main>

      {/* Modals & Drawers */}
      <AiResearchDrawer
        open={showAiDrawer}
        onClose={() => setShowAiDrawer(false)}
        defaultSymbol={aiDefaultSymbol}
      />
      <AlertsDrawer
        open={showAlertsDrawer}
        onClose={() => setShowAlertsDrawer(false)}
        onAlertsChanged={loadDashboardSummary}
      />
      <ShariahRegistryModal
        open={showShariahModal}
        onClose={() => setShowShariahModal(false)}
        onSaved={() => {
          loadDashboardSummary();
          loadDirectory();
        }}
      />
      {showCompareModal && (
        <CompareModal assets={comparedAssets} onClose={() => setShowCompareModal(false)} />
      )}
    </div>
  );
}
