"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDownRight, ArrowUpRight, BarChart3, Layers, RefreshCw } from "lucide-react";
import type { ExchangeVenue, OrderBookLiquidityAnalysis } from "@/types/domain";
import { formatCompactUsd, formatPriceUsdt } from "@/lib/i18n";
import { useLanguage } from "./LanguageProvider";

interface OrderBookLiquidityPanelProps {
  symbol: string;
  initialLiquidity?: OrderBookLiquidityAnalysis | null;
  exchanges?: ExchangeVenue[];
}

export function OrderBookLiquidityPanel({
  symbol,
  initialLiquidity,
  exchanges = ["BINANCE"],
}: OrderBookLiquidityPanelProps) {
  const { lang } = useLanguage();
  const [venueMode, setVenueMode] = useState<"COMBINED" | "BINANCE" | "BYBIT">("COMBINED");
  const [liquidity, setLiquidity] = useState<OrderBookLiquidityAnalysis | null>(initialLiquidity || null);
  const [loading, setLoading] = useState(!initialLiquidity);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const loadLiquidity = useCallback(
    async (mode: "COMBINED" | "BINANCE" | "BYBIT") => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/assets/${encodeURIComponent(symbol)}/liquidity?venue=${encodeURIComponent(mode)}`
        );
        const data = await res.json();
        if (data.ok && data.liquidity) {
          setLiquidity(data.liquidity);
        }
      } catch {
        // keep existing snapshot
      } finally {
        setLoading(false);
      }
    },
    [symbol]
  );

  useEffect(() => {
    if (initialLiquidity && venueMode === "COMBINED") {
      setLiquidity(initialLiquidity);
      setLoading(false);
    } else {
      loadLiquidity(venueMode);
    }
  }, [symbol, venueMode, initialLiquidity, loadLiquidity]);

  // SVG Depth Chart geometry
  const svgGeometry = useMemo(() => {
    const pts = liquidity?.depthCurve || [];
    if (pts.length < 3) return null;
    const W = 760;
    const H = 210;
    const padX = 24;
    const padY = 18;

    const maxUsd = Math.max(
      1,
      ...pts.map((p) => Math.max(p.cumulativeBidUsd, p.cumulativeAskUsd))
    );

    const xOf = (idx: number) => padX + (idx / (pts.length - 1)) * (W - padX * 2);
    const yOf = (usd: number) => H - padY - (usd / maxUsd) * (H - padY * 2);

    const midIdx = pts.findIndex((p) => p.pctFromMid === 0);
    const splitIdx = midIdx >= 0 ? midIdx : Math.floor(pts.length / 2);

    const bidPts = pts.slice(0, splitIdx + 1);
    const askPts = pts.slice(splitIdx);

    const bidLine = bidPts
      .map((p, i) => `${i === 0 ? "M" : "L"} ${xOf(i).toFixed(1)} ${yOf(p.cumulativeBidUsd).toFixed(1)}`)
      .join(" ");
    const bidArea = `${bidLine} L ${xOf(splitIdx).toFixed(1)} ${(H - padY).toFixed(1)} L ${xOf(0).toFixed(1)} ${(H - padY).toFixed(1)} Z`;

    const askLine = askPts
      .map((p, i) => {
        const gIdx = splitIdx + i;
        return `${i === 0 ? "M" : "L"} ${xOf(gIdx).toFixed(1)} ${yOf(p.cumulativeAskUsd).toFixed(1)}`;
      })
      .join(" ");
    const askArea = `${askLine} L ${xOf(pts.length - 1).toFixed(1)} ${(H - padY).toFixed(1)} L ${xOf(splitIdx).toFixed(1)} ${(H - padY).toFixed(1)} Z`;

    return { W, H, padX, padY, maxUsd, pts, splitIdx, xOf, yOf, bidLine, bidArea, askLine, askArea };
  }, [liquidity]);

  const maxBuyWallUsd = Math.max(1, ...(liquidity?.buyWalls || []).map((w) => w.notionalUsd));
  const maxSellWallUsd = Math.max(1, ...(liquidity?.sellWalls || []).map((w) => w.notionalUsd));

  const buyPct2 = liquidity?.buyPressurePct2Pct ?? 50;
  const sellPct2 = Number((100 - buyPct2).toFixed(1));

  const biasBadge = useMemo(() => {
    const b = liquidity?.pressureBias || "BALANCED";
    if (b === "STRONG_BUY")
      return {
        cls: "border-emerald-500/40 bg-emerald-500/15 text-emerald-300",
        ar: "تفوق شرائي قوي (جدران طلب داعمة)",
        en: "Strong Buy-Side Dominance",
      };
    if (b === "BUY_BIAS")
      return {
        cls: "border-teal-500/40 bg-teal-500/15 text-teal-300",
        ar: "ميل شرائي في دفتر الأوامر",
        en: "Moderate Buy Liquidity Bias",
      };
    if (b === "STRONG_SELL")
      return {
        cls: "border-rose-500/40 bg-rose-500/15 text-rose-300",
        ar: "ضغط بيعي كثيف (جدران عرض علوية)",
        en: "Heavy Ask-Side Supply Wall",
      };
    if (b === "SELL_BIAS")
      return {
        cls: "border-amber-500/40 bg-amber-500/15 text-amber-300",
        ar: "ميل بيعي معتدل",
        en: "Moderate Sell Supply Bias",
      };
    return {
      cls: "border-slate-700 bg-slate-800/80 text-slate-300",
      ar: "توازن بين أوامر الشراء والبيع",
      en: "Balanced Bid / Ask Depth",
    };
  }, [liquidity?.pressureBias]);

  const hoveredPoint =
    hoverIdx !== null && svgGeometry?.pts[hoverIdx] ? svgGeometry.pts[hoverIdx] : null;

  return (
    <section className="rounded-2xl border border-slate-800 bg-[#0b1120] p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-bold text-white">
            <BarChart3 className="h-5 w-5 text-sky-400" />
            {lang === "ar"
              ? "تحليل مراكز أوامر السيولة البيعية والشرائية (Order Book Liquidity)"
              : "Spot Order Book Buy & Sell Liquidity Centers"}
          </h2>
          <p className="text-[11px] text-slate-400">
            {lang === "ar"
              ? "رصد حي لجدران الشراء (الدعم السيولي) وجدران البيع (المقاومة السيولية) وميزان عمق السوق الفوري بدون رافعة"
              : "Live resting Spot buy/sell liquidity walls, cumulative depth curve, and order-book imbalance"}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <div className="flex rounded-lg border border-slate-800 bg-slate-950 p-1">
            {(
              [
                { key: "COMBINED", ar: "مدمج (Binance + Bybit)", en: "Combined" },
                { key: "BINANCE", ar: "Binance فقط", en: "Binance" },
                { key: "BYBIT", ar: "Bybit فقط", en: "Bybit" },
              ] as const
            ).map((opt) => {
              const disabled =
                (opt.key === "BINANCE" && !exchanges.includes("BINANCE")) ||
                (opt.key === "BYBIT" && !exchanges.includes("BYBIT"));
              return (
                <button
                  key={opt.key}
                  disabled={disabled}
                  onClick={() => setVenueMode(opt.key)}
                  className={`rounded px-2.5 py-1 text-[11px] font-semibold transition ${
                    venueMode === opt.key
                      ? "bg-sky-500/25 text-sky-200"
                      : "text-slate-400 hover:bg-slate-800 hover:text-white disabled:opacity-30"
                  }`}
                >
                  {lang === "ar" ? opt.ar : opt.en}
                </button>
              );
            })}
          </div>

          <button
            onClick={() => loadLiquidity(venueMode)}
            disabled={loading}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-slate-200 hover:bg-slate-800 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            {lang === "ar" ? "تحديث السيولة" : "Refresh"}
          </button>
        </div>
      </div>

      {!liquidity || liquidity.midPrice === null ? (
        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-6 text-center text-xs text-slate-400">
          {loading
            ? lang === "ar"
              ? "جاري سحب دفتر الأوامر الفوري وتحليل تكتلات السيولة..."
              : "Fetching live Spot order books & clustering liquidity walls..."
            : lang === "ar"
              ? "تعذر جلب دفتر الأوامر الحي حالياً لهذا الزوج."
              : "Live Spot order book unavailable right now."}
        </div>
      ) : (
        <div className="space-y-4">
          {/* Summary Verdict + Imbalance Gauge */}
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3.5 text-xs lg:col-span-2">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <span className={`rounded border px-2.5 py-0.5 text-[11px] font-bold ${biasBadge.cls}`}>
                  {lang === "ar" ? biasBadge.ar : biasBadge.en}
                </span>
                <div className="flex items-center gap-1.5 font-mono-num text-[11px] text-slate-400">
                  <span>{lang === "ar" ? "المنصات المشمولة:" : "Venues:"}</span>
                  {liquidity.venuesIncluded.map((v) => (
                    <span
                      key={v}
                      className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                        v === "BINANCE"
                          ? "bg-amber-500/15 text-amber-300"
                          : "bg-orange-500/15 text-orange-300"
                      }`}
                    >
                      {v}
                    </span>
                  ))}
                </div>
              </div>
              <p className="leading-relaxed text-slate-200">
                {lang === "ar" ? liquidity.summaryAr : liquidity.summaryEn}
              </p>

              {/* Bid vs Ask Pressure Gauge (±2%) */}
              <div className="mt-3">
                <div className="mb-1 flex items-center justify-between font-mono-num text-[11px]">
                  <span className="font-bold text-emerald-400">
                    {lang === "ar" ? `سيولة الشراء (±2%): ${buyPct2}%` : `Bids (±2%): ${buyPct2}%`} (
                    {formatCompactUsd(liquidity.bidDepth2PctUsd)})
                  </span>
                  <span className="font-bold text-rose-400">
                    {lang === "ar" ? `سيولة البيع (±2%): ${sellPct2}%` : `Asks (±2%): ${sellPct2}%`} (
                    {formatCompactUsd(liquidity.askDepth2PctUsd)})
                  </span>
                </div>
                <div className="flex h-3 w-full overflow-hidden rounded-full border border-slate-800 bg-slate-900">
                  <div
                    className="h-full bg-gradient-to-r from-emerald-600 to-emerald-400 transition-all"
                    style={{ width: `${buyPct2}%` }}
                  />
                  <div
                    className="h-full bg-gradient-to-r from-rose-400 to-rose-600 transition-all"
                    style={{ width: `${sellPct2}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Depth Bands & Venue Comparison */}
            <div className="space-y-2 rounded-xl border border-slate-800 bg-slate-950/60 p-3.5 text-xs font-mono-num">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-slate-400">{lang === "ar" ? "عمق ±1% (قريب جداً)" : "±1% Tight Depth"}</span>
                <span>
                  <span className="text-emerald-300">{formatCompactUsd(liquidity.bidDepth1PctUsd)}</span>
                  {" / "}
                  <span className="text-rose-300">{formatCompactUsd(liquidity.askDepth1PctUsd)}</span>
                </span>
              </div>
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-slate-400">{lang === "ar" ? "عمق ±5% (إجمالي النطاق)" : "±5% Broad Depth"}</span>
                <span>
                  <span className="text-emerald-300">{formatCompactUsd(liquidity.bidDepth5PctUsd)}</span>
                  {" / "}
                  <span className="text-rose-300">{formatCompactUsd(liquidity.askDepth5PctUsd)}</span>
                </span>
              </div>
              {liquidity.venueBreakdown.binance && (
                <div className="flex items-center justify-between border-t border-slate-800/80 pt-1.5 text-[11px]">
                  <span className="text-amber-300">Binance (±2%)</span>
                  <span className="text-slate-200">
                    {formatCompactUsd(
                      liquidity.venueBreakdown.binance.bidDepth2PctUsd +
                        liquidity.venueBreakdown.binance.askDepth2PctUsd
                    )}
                  </span>
                </div>
              )}
              {liquidity.venueBreakdown.bybit && (
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-orange-300">Bybit (±2%)</span>
                  <span className="text-slate-200">
                    {formatCompactUsd(
                      liquidity.venueBreakdown.bybit.bidDepth2PctUsd +
                        liquidity.venueBreakdown.bybit.askDepth2PctUsd
                    )}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Interactive Cumulative Depth Chart */}
          {svgGeometry && (
            <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-3">
              <div className="mb-1.5 flex flex-wrap items-center justify-between text-[11px] text-slate-400">
                <span className="flex items-center gap-1.5 font-semibold text-slate-200">
                  <Layers className="h-3.5 w-3.5 text-sky-400" />
                  {lang === "ar"
                    ? "منحنى عمق السيولة التراكمي (مرر المؤشر لمعاينة حجم السيولة عند كل سعر)"
                    : "Interactive Cumulative Order Book Depth Curve"}
                </span>
                {hoveredPoint ? (
                  <span className="font-mono-num text-xs text-white">
                    {formatPriceUsdt(hoveredPoint.price)} ({hoveredPoint.pctFromMid > 0 ? "+" : ""}
                    {hoveredPoint.pctFromMid}%) •{" "}
                    <span className={hoveredPoint.cumulativeBidUsd > 0 ? "text-emerald-300" : "text-rose-300"}>
                      {formatCompactUsd(
                        Math.max(hoveredPoint.cumulativeBidUsd, hoveredPoint.cumulativeAskUsd)
                      )}
                    </span>
                  </span>
                ) : (
                  <span className="font-mono-num">
                    Mid: {formatPriceUsdt(liquidity.midPrice)} | Spread: {liquidity.spreadPct}%
                  </span>
                )}
              </div>

              <svg
                viewBox={`0 0 ${svgGeometry.W} ${svgGeometry.H}`}
                className="h-[195px] w-full select-none overflow-visible"
                onMouseLeave={() => setHoverIdx(null)}
              >
                <defs>
                  <linearGradient id="bidDepthGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity="0.45" />
                    <stop offset="100%" stopColor="#10b981" stopOpacity="0.03" />
                  </linearGradient>
                  <linearGradient id="askDepthGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f43f5e" stopOpacity="0.45" />
                    <stop offset="100%" stopColor="#f43f5e" stopOpacity="0.03" />
                  </linearGradient>
                </defs>

                {/* Baseline & Midline */}
                <line
                  x1={svgGeometry.padX}
                  y1={svgGeometry.H - svgGeometry.padY}
                  x2={svgGeometry.W - svgGeometry.padX}
                  y2={svgGeometry.H - svgGeometry.padY}
                  stroke="#1e293b"
                  strokeWidth="1"
                />
                <line
                  x1={svgGeometry.xOf(svgGeometry.splitIdx)}
                  y1={svgGeometry.padY}
                  x2={svgGeometry.xOf(svgGeometry.splitIdx)}
                  y2={svgGeometry.H - svgGeometry.padY}
                  stroke="#64748b"
                  strokeDasharray="4 4"
                  strokeWidth="1"
                />

                {/* Bid & Ask Cumulative Areas */}
                <path d={svgGeometry.bidArea} fill="url(#bidDepthGrad)" />
                <path d={svgGeometry.bidLine} fill="none" stroke="#10b981" strokeWidth="2" />

                <path d={svgGeometry.askArea} fill="url(#askDepthGrad)" />
                <path d={svgGeometry.askLine} fill="none" stroke="#f43f5e" strokeWidth="2" />

                {/* Hover Crosshair */}
                {hoverIdx !== null && svgGeometry.pts[hoverIdx] && (
                  <g>
                    <line
                      x1={svgGeometry.xOf(hoverIdx)}
                      y1={svgGeometry.padY}
                      x2={svgGeometry.xOf(hoverIdx)}
                      y2={svgGeometry.H - svgGeometry.padY}
                      stroke="#e2e8f0"
                      strokeWidth="1"
                      strokeDasharray="2 2"
                    />
                    <circle
                      cx={svgGeometry.xOf(hoverIdx)}
                      cy={svgGeometry.yOf(
                        Math.max(
                          svgGeometry.pts[hoverIdx].cumulativeBidUsd,
                          svgGeometry.pts[hoverIdx].cumulativeAskUsd
                        )
                      )}
                      r="4"
                      fill={svgGeometry.pts[hoverIdx].cumulativeBidUsd > 0 ? "#10b981" : "#f43f5e"}
                    />
                  </g>
                )}

                {/* Invisible Hover Columns */}
                {svgGeometry.pts.map((_, idx) => {
                  const colW = (svgGeometry.W - svgGeometry.padX * 2) / svgGeometry.pts.length;
                  return (
                    <rect
                      key={idx}
                      x={svgGeometry.xOf(idx) - colW / 2}
                      y={0}
                      width={colW}
                      height={svgGeometry.H}
                      fill="transparent"
                      onMouseEnter={() => setHoverIdx(idx)}
                    />
                  );
                })}
              </svg>
            </div>
          )}

          {/* Strongest Buy Walls & Sell Walls Tables */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* Buy Walls */}
            <div className="rounded-xl border border-emerald-500/25 bg-slate-950/60 p-3.5">
              <div className="mb-2.5 flex items-center justify-between">
                <h3 className="flex items-center gap-1.5 text-xs font-bold text-emerald-300">
                  <ArrowUpRight className="h-4 w-4" />
                  {lang === "ar"
                    ? "أقوى مراكز أوامر الشراء (جدران الدعم السيولي)"
                    : "Strongest Resting Buy Walls (Support)"}
                </h3>
                <span className="font-mono-num text-[10px] text-slate-400">
                  {lang === "ar" ? "حجم السيولة (USDT)" : "Notional USDT"}
                </span>
              </div>

              <div className="space-y-1.5">
                {liquidity.buyWalls.map((w, i) => (
                  <div
                    key={i}
                    className="relative overflow-hidden rounded-lg border border-slate-800/80 bg-slate-900/70 px-2.5 py-2 text-[11px]"
                  >
                    <div
                      className="pointer-events-none absolute inset-y-0 start-0 bg-emerald-500/10"
                      style={{ width: `${Math.min(100, (w.notionalUsd / maxBuyWallUsd) * 100)}%` }}
                    />
                    <div className="relative flex items-center justify-between gap-2 font-mono-num">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-emerald-300">{formatPriceUsdt(w.price)}</span>
                        <span className="text-[10px] text-slate-400">({w.pctFromMid}%)</span>
                        <span
                          className={`rounded px-1.5 py-0.2 text-[9px] font-bold ${
                            w.strength === "MAJOR"
                              ? "bg-emerald-500/25 text-emerald-200"
                              : w.strength === "STRONG"
                                ? "bg-teal-500/20 text-teal-300"
                                : "bg-slate-800 text-slate-400"
                          }`}
                        >
                          {w.strength}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white">{formatCompactUsd(w.notionalUsd)}</span>
                        <span className="text-[10px] text-slate-400">({w.shareOfBookPct}%)</span>
                        <span className="text-[9px] text-amber-300">{w.venues.map((v) => v[0]).join("+")}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Sell Walls */}
            <div className="rounded-xl border border-rose-500/25 bg-slate-950/60 p-3.5">
              <div className="mb-2.5 flex items-center justify-between">
                <h3 className="flex items-center gap-1.5 text-xs font-bold text-rose-300">
                  <ArrowDownRight className="h-4 w-4" />
                  {lang === "ar"
                    ? "أقوى مراكز أوامر البيع (جدران المقاومة السيولية)"
                    : "Strongest Resting Sell Walls (Resistance)"}
                </h3>
                <span className="font-mono-num text-[10px] text-slate-400">
                  {lang === "ar" ? "حجم السيولة (USDT)" : "Notional USDT"}
                </span>
              </div>

              <div className="space-y-1.5">
                {liquidity.sellWalls.map((w, i) => (
                  <div
                    key={i}
                    className="relative overflow-hidden rounded-lg border border-slate-800/80 bg-slate-900/70 px-2.5 py-2 text-[11px]"
                  >
                    <div
                      className="pointer-events-none absolute inset-y-0 start-0 bg-rose-500/10"
                      style={{ width: `${Math.min(100, (w.notionalUsd / maxSellWallUsd) * 100)}%` }}
                    />
                    <div className="relative flex items-center justify-between gap-2 font-mono-num">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-rose-300">{formatPriceUsdt(w.price)}</span>
                        <span className="text-[10px] text-slate-400">(+{w.pctFromMid}%)</span>
                        <span
                          className={`rounded px-1.5 py-0.2 text-[9px] font-bold ${
                            w.strength === "MAJOR"
                              ? "bg-rose-500/25 text-rose-200"
                              : w.strength === "STRONG"
                                ? "bg-orange-500/20 text-orange-300"
                                : "bg-slate-800 text-slate-400"
                          }`}
                        >
                          {w.strength}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white">{formatCompactUsd(w.notionalUsd)}</span>
                        <span className="text-[10px] text-slate-400">({w.shareOfBookPct}%)</span>
                        <span className="text-[9px] text-amber-300">{w.venues.map((v) => v[0]).join("+")}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
