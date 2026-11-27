"use client";

import React, { useEffect, useState } from "react";
import { Bell, Camera, CheckCheck, Plus, Send, Trash2, X } from "lucide-react";
import type { AlertRecord, AlertRuleRecord } from "@/types/domain";
import { useLanguage } from "./LanguageProvider";

interface AlertsDrawerProps {
  open: boolean;
  onClose: () => void;
  onAlertsChanged?: () => void;
}

export function AlertsDrawer({ open, onClose, onAlertsChanged }: AlertsDrawerProps) {
  const { lang } = useLanguage();
  const [alerts, setAlerts] = useState<AlertRecord[]>([]);
  const [rules, setRules] = useState<AlertRuleRecord[]>([]);
  const [telegramConfigured, setTelegramConfigured] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const [newSymbol, setNewSymbol] = useState("");
  const [newRuleType, setNewRuleType] = useState<AlertRuleRecord["ruleType"]>("PRICE_CHANGE_PCT");
  const [newThreshold, setNewThreshold] = useState("8");
  const [notifyTelegram, setNotifyTelegram] = useState(false);

  async function loadAlerts() {
    const res = await fetch("/api/alerts");
    const data = await res.json();
    if (data.ok) {
      setAlerts(data.alerts || []);
      setRules(data.rules || []);
      setTelegramConfigured(Boolean(data.telegramConfigured));
    }
  }

  useEffect(() => {
    if (open) {
      loadAlerts();
    }
  }, [open]);

  if (!open) return null;

  async function handleCreateRule(e: React.FormEvent) {
    e.preventDefault();
    const needsThreshold = !["SHARIAH_CHANGE", "SPOT_DELISTING"].includes(newRuleType);
    const res = await fetch("/api/alerts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "create_rule",
        symbol: newSymbol.trim() || null,
        ruleType: newRuleType,
        threshold: needsThreshold ? Number(newThreshold) : null,
        notifyTelegram,
      }),
    });
    if (res.ok) {
      setNewSymbol("");
      setStatusMsg(lang === "ar" ? "تمت إضافة قاعدة التنبيه بنجاح." : "Alert rule created.");
      await loadAlerts();
      onAlertsChanged?.();
    }
  }

  async function handleDeleteRule(id: number) {
    await fetch(`/api/alerts?id=${id}`, { method: "DELETE" });
    await loadAlerts();
  }

  async function handleMarkRead() {
    await fetch("/api/alerts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "mark_all_read" }),
    });
    await loadAlerts();
    onAlertsChanged?.();
  }

  async function handleCaptureSnapshot() {
    const res = await fetch("/api/alerts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "capture_snapshot" }),
    });
    const data = await res.json();
    if (data.ok) {
      setStatusMsg(
        lang === "ar"
          ? `تم حفظ لقطة تاريخية لـ ${data.snapshot.captured} عملة.`
          : `Captured historical snapshot for ${data.snapshot.captured} screened assets.`
      );
    }
  }

  async function handleTestTelegram() {
    const res = await fetch("/api/alerts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "test_telegram" }),
    });
    const data = await res.json();
    setStatusMsg(data.ok ? "Telegram OK!" : `Telegram: ${data.reason}`);
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-xs">
      <div className="flex h-full w-full max-w-xl flex-col border-s border-slate-800 bg-[#090f1d] shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-amber-400" />
            <h2 className="text-sm font-bold text-white">
              {lang === "ar" ? "مركز التنبيهات والمراقبة واللقطات التاريخية" : "Alerts, Monitoring & Snapshots"}
            </h2>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-b border-slate-800 bg-slate-900/50 px-4 py-2 text-xs">
          <button
            onClick={handleMarkRead}
            className="inline-flex items-center gap-1 rounded border border-slate-700 bg-slate-800 px-2.5 py-1 text-slate-200 hover:bg-slate-700"
          >
            <CheckCheck className="h-3.5 w-3.5 text-emerald-400" />
            {lang === "ar" ? "تحديد الكل كمقروء" : "Mark All Read"}
          </button>
          <button
            onClick={handleCaptureSnapshot}
            className="inline-flex items-center gap-1 rounded border border-sky-500/30 bg-sky-500/15 px-2.5 py-1 text-sky-200 hover:bg-sky-500/25"
          >
            <Camera className="h-3.5 w-3.5" />
            {lang === "ar" ? "حفظ لقطة تاريخية الآن" : "Capture Snapshot"}
          </button>
          <button
            onClick={handleTestTelegram}
            className="inline-flex items-center gap-1 rounded border border-slate-700 bg-slate-800 px-2.5 py-1 text-slate-300 hover:bg-slate-700"
          >
            <Send className="h-3 w-3 text-sky-400" />
            {telegramConfigured
              ? lang === "ar"
                ? "اختبار Telegram (مُفعّل)"
                : "Test Telegram (Active)"
              : lang === "ar"
                ? "Telegram (غير مضبوط في .env)"
                : "Telegram (Unconfigured)"}
          </button>
        </div>

        {statusMsg && (
          <div className="border-b border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-xs text-emerald-200">
            {statusMsg}
          </div>
        )}

        <div className="flex-1 space-y-5 overflow-y-auto p-4">
          {/* Create Alert Rule */}
          <form onSubmit={handleCreateRule} className="space-y-2.5 rounded-xl border border-slate-800 bg-slate-900/70 p-3">
            <h3 className="text-xs font-bold text-slate-200">
              {lang === "ar" ? "إضافة قاعدة مراقبة جديدة" : "Create Monitoring Rule"}
            </h3>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <input
                value={newSymbol}
                onChange={(e) => setNewSymbol(e.target.value.toUpperCase())}
                placeholder={lang === "ar" ? "الرمز (أو فارغ للكل)" : "Symbol (blank=ALL)"}
                className="rounded border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-white"
              />
              <select
                value={newRuleType}
                onChange={(e) => setNewRuleType(e.target.value as AlertRuleRecord["ruleType"])}
                className="rounded border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-white"
              >
                <option value="PRICE_CHANGE_PCT">{lang === "ar" ? "تغير سعر 24س (%)" : "24h Price Move %"}</option>
                <option value="PRICE_ABOVE">{lang === "ar" ? "السعر أعلى من ($)" : "Price Above ($)"}</option>
                <option value="PRICE_BELOW">{lang === "ar" ? "السعر أقل من ($)" : "Price Below ($)"}</option>
                <option value="VOLUME_SPIKE_USD">{lang === "ar" ? "قفزة حجم تداول ($)" : "Volume Above ($)"}</option>
                <option value="SHARIAH_CHANGE">{lang === "ar" ? "تغير التصنيف الشرعي" : "Shariah Status Change"}</option>
                <option value="SPOT_DELISTING">{lang === "ar" ? "إيقاف/شطب Spot" : "Binance Spot Delisting"}</option>
              </select>
              <input
                type="number"
                step="any"
                value={newThreshold}
                onChange={(e) => setNewThreshold(e.target.value)}
                disabled={["SHARIAH_CHANGE", "SPOT_DELISTING"].includes(newRuleType)}
                placeholder={lang === "ar" ? "القيمة الحدية" : "Threshold"}
                className="rounded border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-white disabled:opacity-40"
              />
            </div>
            <div className="flex items-center justify-between pt-1">
              <label className="flex items-center gap-1.5 text-xs text-slate-300">
                <input
                  type="checkbox"
                  checked={notifyTelegram}
                  onChange={(e) => setNotifyTelegram(e.target.checked)}
                  className="rounded border-slate-700 bg-slate-950"
                />
                {lang === "ar" ? "إرسال أيضاً إلى Telegram" : "Also notify via Telegram"}
              </label>
              <button
                type="submit"
                className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500"
              >
                <Plus className="h-3.5 w-3.5" />
                {lang === "ar" ? "حفظ القاعدة" : "Add Rule"}
              </button>
            </div>
          </form>

          {/* Active Rules */}
          <div className="space-y-1.5">
            <h3 className="text-xs font-bold text-slate-300">
              {lang === "ar" ? `القواعد المفعّلة (${rules.length})` : `Active Rules (${rules.length})`}
            </h3>
            <div className="space-y-1.5">
              {rules.map((r) => (
                <div
                  key={r.id}
                  className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900/50 px-3 py-2 text-xs"
                >
                  <div>
                    <span className="font-semibold text-white">{r.symbol || (lang === "ar" ? "جميع العملات المفحوصة" : "All Screened Assets")}</span>
                    <span className="mx-2 text-slate-500">•</span>
                    <span className="font-mono-num text-emerald-300">{r.ruleType}</span>
                    {r.threshold !== null && (
                      <span className="ms-1.5 font-mono-num text-slate-300">({r.threshold})</span>
                    )}
                  </div>
                  <button
                    onClick={() => handleDeleteRule(r.id)}
                    className="rounded p-1 text-slate-400 hover:bg-rose-500/15 hover:text-rose-400"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Alerts Feed */}
          <div className="space-y-2">
            <h3 className="text-xs font-bold text-slate-300">
              {lang === "ar" ? `سجل التنبيهات (${alerts.length})` : `Alert Feed (${alerts.length})`}
            </h3>
            {alerts.map((a) => (
              <div
                key={a.id}
                className={`rounded-xl border p-3 text-xs ${
                  a.severity === "CRITICAL"
                    ? "border-rose-500/40 bg-rose-500/10"
                    : a.severity === "WARNING"
                      ? "border-amber-500/35 bg-amber-500/10"
                      : "border-slate-800 bg-slate-900/60"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-white">{lang === "ar" ? a.titleAr : a.titleEn}</span>
                  <span className="font-mono-num text-[10px] text-slate-400">
                    {new Date(a.createdAt).toLocaleString(lang === "ar" ? "ar-EG" : "en-US")}
                  </span>
                </div>
                <p className="mt-1 text-slate-300">{lang === "ar" ? a.messageAr : a.messageEn}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
