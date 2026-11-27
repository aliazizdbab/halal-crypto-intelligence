"use client";

import React, { useEffect, useRef } from "react";
import { createChart, ColorType, CrosshairMode, type UTCTimestamp } from "lightweight-charts";
import type { TechnicalIndicatorSummary } from "@/types/domain";

interface CandlestickChartProps {
  technicals: TechnicalIndicatorSummary;
}

function computeOverlayEma(
  candles: TechnicalIndicatorSummary["candles"],
  period: number
): Array<{ time: UTCTimestamp; value: number }> {
  if (candles.length < period) return [];
  const k = 2 / (period + 1);
  let ema = candles.slice(0, period).reduce((acc, c) => acc + c.close, 0) / period;
  const out: Array<{ time: UTCTimestamp; value: number }> = [
    { time: candles[period - 1].time as UTCTimestamp, value: ema },
  ];
  for (let i = period; i < candles.length; i++) {
    ema = candles[i].close * k + ema * (1 - k);
    out.push({ time: candles[i].time as UTCTimestamp, value: ema });
  }
  return out;
}

export function CandlestickChart({ technicals }: CandlestickChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || technicals.candles.length === 0) return;

    const chart = createChart(el, {
      layout: {
        background: { type: ColorType.Solid, color: "#0b1120" },
        textColor: "#94a3b8",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: "rgba(148, 163, 184, 0.08)" },
        horzLines: { color: "rgba(148, 163, 184, 0.08)" },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: {
        borderColor: "rgba(148, 163, 184, 0.2)",
      },
      timeScale: {
        borderColor: "rgba(148, 163, 184, 0.2)",
        timeVisible: true,
        secondsVisible: false,
      },
      width: el.clientWidth,
      height: 380,
    });

    const candleSeries = chart.addCandlestickSeries({
      upColor: "#10b981",
      downColor: "#f43f5e",
      borderUpColor: "#10b981",
      borderDownColor: "#f43f5e",
      wickUpColor: "#10b981",
      wickDownColor: "#f43f5e",
    });

    candleSeries.setData(
      technicals.candles.map((c) => ({
        time: c.time as UTCTimestamp,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }))
    );

    // Volume histogram
    const volumeSeries = chart.addHistogramSeries({
      priceFormat: { type: "volume" },
      priceScaleId: "",
    });
    volumeSeries.priceScale().applyOptions({
      scaleMargins: { top: 0.82, bottom: 0 },
    });
    volumeSeries.setData(
      technicals.candles.map((c) => ({
        time: c.time as UTCTimestamp,
        value: c.volume,
        color: c.close >= c.open ? "rgba(16, 185, 129, 0.28)" : "rgba(244, 63, 94, 0.28)",
      }))
    );

    // EMA 20 overlay
    const ema20Data = computeOverlayEma(technicals.candles, 20);
    if (ema20Data.length > 0) {
      const ema20Series = chart.addLineSeries({
        color: "#38bdf8",
        lineWidth: 1,
        priceLineVisible: false,
      });
      ema20Series.setData(ema20Data);
    }

    // EMA 50 overlay
    const ema50Data = computeOverlayEma(technicals.candles, 50);
    if (ema50Data.length > 0) {
      const ema50Series = chart.addLineSeries({
        color: "#f59e0b",
        lineWidth: 1,
        priceLineVisible: false,
      });
      ema50Series.setData(ema50Data);
    }

    // Support & Resistance horizontal reference lines
    for (const sup of technicals.supportLevels.slice(-2)) {
      candleSeries.createPriceLine({
        price: sup,
        color: "rgba(16, 185, 129, 0.65)",
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title: "SUP",
      });
    }
    for (const res of technicals.resistanceLevels.slice(0, 2)) {
      candleSeries.createPriceLine({
        price: res,
        color: "rgba(244, 63, 94, 0.65)",
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title: "RES",
      });
    }

    chart.timeScale().fitContent();

    const handleResize = () => {
      if (containerRef.current) {
        chart.applyOptions({ width: containerRef.current.clientWidth });
      }
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      chart.remove();
    };
  }, [technicals]);

  return (
    <div className="relative w-full overflow-hidden rounded-xl border border-slate-800 bg-[#0b1120]">
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-800/80 px-3 py-2 text-[11px] text-slate-400">
        <span className="font-semibold text-slate-200">{technicals.symbol} • {technicals.timeframe}</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-sky-400" /> EMA 20</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-400" /> EMA 50</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-400" /> Support</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-rose-400" /> Resistance</span>
        <span className="ms-auto font-mono-num text-[10px] text-slate-500">
          {technicals.source} • {new Date(technicals.fetchedAt).toLocaleTimeString()}
        </span>
      </div>
      <div ref={containerRef} className="h-[380px] w-full" dir="ltr" />
    </div>
  );
}
