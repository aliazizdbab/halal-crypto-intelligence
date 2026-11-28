"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  Activity,
  Bell,
  Bot,
  Download,
  Globe,
  PlugZap,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useLanguage } from "./LanguageProvider";
import { AiAgentSettingsModal } from "./AiAgentSettingsModal";

interface TopNavProps {
  connectionStatus?: "CONNECTED" | "FALLBACK" | "DEGRADED" | "NOT_SYNCED";
  bybitStatus?: "CONNECTED" | "FALLBACK" | "DEGRADED" | "NOT_SYNCED";
  lastSyncedAt?: string | null;
  wsLiveCount?: number;
  unreadAlerts?: number;
  isSyncing?: boolean;
  onSync?: () => void;
  onOpenAi?: () => void;
  onOpenAiSettings?: () => void;
  onOpenAlerts?: () => void;
  onOpenShariahModal?: () => void;
  exportQuery?: string;
}

export function TopNav({
  connectionStatus = "NOT_SYNCED",
  bybitStatus = "NOT_SYNCED",
  lastSyncedAt,
  wsLiveCount = 0,
  unreadAlerts = 0,
  isSyncing = false,
  onSync,
  onOpenAi,
  onOpenAiSettings,
  onOpenAlerts,
  onOpenShariahModal,
  exportQuery = "",
}: TopNavProps) {
  const { lang, toggleLang } = useLanguage();
  const [localAiSettingsOpen, setLocalAiSettingsOpen] = useState(false);

  const anyConnected = connectionStatus === "CONNECTED" || bybitStatus === "CONNECTED";
  const statusColor = anyConnected
    ? "bg-emerald-400"
    : connectionStatus === "FALLBACK" || bybitStatus === "FALLBACK"
      ? "bg-amber-400"
      : connectionStatus === "DEGRADED"
        ? "bg-rose-400"
        : "bg-slate-500";

  const statusLabel =
    lang === "ar"
      ? anyConnected
        ? `Spot متصل (${[
            connectionStatus === "CONNECTED" ? "Binance" : null,
            bybitStatus === "CONNECTED" ? "Bybit" : null,
          ]
            .filter(Boolean)
            .join(" + ")})`
        : "بانتظار مزامنة Binance + Bybit"
      : anyConnected
        ? `Spot Live (${[
            connectionStatus === "CONNECTED" ? "Binance" : null,
            bybitStatus === "CONNECTED" ? "Bybit" : null,
          ]
            .filter(Boolean)
            .join(" + ")})`
        : "Ready to Sync";

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-slate-800/80 bg-[#070c17]/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1640px] flex-wrap items-center justify-between gap-3 px-4 py-2.5">
          {/* Brand */}
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-emerald-500/40 bg-emerald-500/10 text-emerald-400">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold tracking-tight text-white md:text-base">
                    {lang === "ar" ? "منصة الاستخبارات الشرعية للكريبتو" : "Halal Crypto Intelligence"}
                  </span>
                  <span className="rounded border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-300">
                    {lang === "ar" ? "Binance + Bybit Spot" : "SPOT ONLY"}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400">
                  {lang === "ar"
                    ? "فحص شرعي موثّق • تحليل سيولة أوامر الشراء والبيع • ربط وكيل AI مباشر"
                    : "Auditable Shariah Screening • Order-Book Liquidity Walls • Universal AI Agent"}
                </p>
              </div>
            </Link>
          </div>

          {/* Status & Actions */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Live status pill */}
            <div className="hidden items-center gap-2 rounded-lg border border-slate-800 bg-slate-900/80 px-2.5 py-1.5 text-xs text-slate-300 xl:flex">
              <span className={`h-2 w-2 rounded-full ${statusColor} animate-pulse`} />
              <span>{statusLabel}</span>
              {wsLiveCount > 0 && (
                <span className="flex items-center gap-1 border-s border-slate-700 ps-2 font-mono-num text-[11px] text-emerald-400">
                  <Activity className="h-3 w-3" />
                  WS ({wsLiveCount})
                </span>
              )}
              {lastSyncedAt && (
                <span className="border-s border-slate-700 ps-2 font-mono-num text-[11px] text-slate-400">
                  {new Date(lastSyncedAt).toLocaleTimeString(lang === "ar" ? "ar-EG" : "en-US", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              )}
            </div>

            {onSync && (
              <button
                onClick={onSync}
                disabled={isSyncing}
                className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-3 py-1.5 text-xs font-semibold text-emerald-200 transition hover:bg-emerald-500/25 disabled:opacity-50"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? "animate-spin" : ""}`} />
                {lang === "ar"
                  ? isSyncing
                    ? "جاري المزامنة..."
                    : "مزامنة Binance + Bybit"
                  : isSyncing
                    ? "Syncing..."
                    : "Sync Exchanges"}
              </button>
            )}

            <button
              onClick={() => (onOpenAiSettings ? onOpenAiSettings() : setLocalAiSettingsOpen(true))}
              className="inline-flex items-center gap-1.5 rounded-lg border border-purple-500/45 bg-purple-500/15 px-2.5 py-1.5 text-xs font-semibold text-purple-200 transition hover:bg-purple-500/25"
              title={lang === "ar" ? "ربط وإعداد وكيل الذكاء الاصطناعي" : "Connect AI Agent (Gemini, OpenAI, Ollama...)"}
            >
              <PlugZap className="h-3.5 w-3.5 text-purple-300" />
              {lang === "ar" ? "ربط وكيل AI" : "AI Setup"}
            </button>

            {onOpenAi && (
              <button
                onClick={onOpenAi}
                className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-500/40 bg-indigo-500/15 px-3 py-1.5 text-xs font-semibold text-indigo-200 transition hover:bg-indigo-500/25"
              >
                <Bot className="h-3.5 w-3.5" />
                {lang === "ar" ? "المساعد البحثي AI" : "AI Researcher"}
              </button>
            )}

            {onOpenShariahModal && (
              <button
                onClick={onOpenShariahModal}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/80 px-2.5 py-1.5 text-xs font-medium text-slate-200 transition hover:border-slate-600 hover:bg-slate-800"
              >
                <Sparkles className="h-3.5 w-3.5 text-amber-400" />
                {lang === "ar" ? "السجل الشرعي" : "Shariah Registry"}
              </button>
            )}

            {/* Export Dropdown / Quick Links */}
            <div className="inline-flex items-center overflow-hidden rounded-lg border border-slate-700 bg-slate-900 text-xs">
              <a
                href={`/api/export?format=excel${exportQuery ? `&${exportQuery}` : ""}`}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 font-medium text-slate-200 transition hover:bg-slate-800"
                title="Export Multi-Sheet Excel Report"
              >
                <Download className="h-3.5 w-3.5 text-emerald-400" />
                Excel
              </a>
              <a
                href={`/api/export?format=csv${exportQuery ? `&${exportQuery}` : ""}`}
                className="border-s border-slate-800 px-2 py-1.5 font-medium text-slate-300 transition hover:bg-slate-800"
                title="Export UTF-8 CSV"
              >
                CSV
              </a>
              <a
                href={`/api/export?format=pdf${exportQuery ? `&${exportQuery}` : ""}`}
                className="border-s border-slate-800 px-2 py-1.5 font-medium text-slate-300 transition hover:bg-slate-800"
                title="Export Institutional PDF Report"
              >
                PDF
              </a>
            </div>

            {onOpenAlerts && (
              <button
                onClick={onOpenAlerts}
                className="relative inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-slate-200 transition hover:bg-slate-800"
                title={lang === "ar" ? "مركز التنبيهات" : "Alerts Center"}
              >
                <Bell className="h-3.5 w-3.5 text-amber-400" />
                {unreadAlerts > 0 && (
                  <span className="rounded-full bg-rose-500 px-1.5 py-0.2 text-[10px] font-bold text-white">
                    {unreadAlerts}
                  </span>
                )}
              </button>
            )}

            <Link
              href="/downloads"
              className="inline-flex items-center gap-1 rounded-lg border border-sky-500/35 bg-sky-500/10 px-2.5 py-1.5 text-xs font-semibold text-sky-200 transition hover:bg-sky-500/20"
              title={lang === "ar" ? "تنزيل لـ Windows وAndroid والويب" : "Download Windows, Android & PWA"}
            >
              <Download className="h-3.5 w-3.5" />
              {lang === "ar" ? "التطبيقات" : "Apps"}
            </Link>

            <button
              onClick={toggleLang}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs font-semibold text-slate-200 transition hover:bg-slate-800"
            >
              <Globe className="h-3.5 w-3.5 text-sky-400" />
              {lang === "ar" ? "EN" : "عربي"}
            </button>
          </div>
        </div>
      </header>

      <AiAgentSettingsModal
        open={localAiSettingsOpen}
        onClose={() => setLocalAiSettingsOpen(false)}
      />
    </>
  );
}
