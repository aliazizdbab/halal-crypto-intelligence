"use client";

import React, { useState } from "react";
import { ShieldCheck, Upload, X } from "lucide-react";
import type { ShariahClassification } from "@/types/domain";
import { useLanguage } from "./LanguageProvider";

interface ShariahRegistryModalProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  initialSymbol?: string;
}

export function ShariahRegistryModal({
  open,
  onClose,
  onSaved,
  initialSymbol = "",
}: ShariahRegistryModalProps) {
  const { lang } = useLanguage();
  const [tab, setTab] = useState<"single" | "bulk">("single");
  const [symbol, setSymbol] = useState(initialSymbol);
  const [classification, setClassification] = useState<ShariahClassification>("HALAL");
  const [authorityName, setAuthorityName] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [assessmentDate, setAssessmentDate] = useState(new Date().toISOString().slice(0, 10));
  const [methodology, setMethodology] = useState("AAOIFI-aligned utility screening, Spot ownership only");
  const [coreActivityNotesEn, setCoreActivityNotesEn] = useState("");
  const [coreActivityNotesAr, setCoreActivityNotesAr] = useState("");
  const [conditionsEn, setConditionsEn] = useState("");
  const [conditionsAr, setConditionsAr] = useState("");
  const [disagreementsEn, setDisagreementsEn] = useState("");
  const [disagreementsAr, setDisagreementsAr] = useState("");
  const [reason, setReason] = useState("");
  const [bulkJson, setBulkJson] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  React.useEffect(() => {
    if (initialSymbol) setSymbol(initialSymbol);
  }, [initialSymbol]);

  if (!open) return null;

  async function handleSaveSingle(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/shariah", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol,
          classification,
          authorityName,
          sourceUrl: sourceUrl.trim() || null,
          assessmentDate,
          methodology,
          coreActivityNotesEn: coreActivityNotesEn || coreActivityNotesAr,
          coreActivityNotesAr: coreActivityNotesAr || coreActivityNotesEn,
          conditionsEn: conditionsEn.trim() || null,
          conditionsAr: conditionsAr.trim() || null,
          scholarlyDisagreementsEn: disagreementsEn.trim() || null,
          scholarlyDisagreementsAr: disagreementsAr.trim() || null,
          reason: reason.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error || "Validation error");
      } else {
        onSaved();
        onClose();
      }
    } catch {
      setError("Network error while saving Shariah record");
    } finally {
      setSaving(false);
    }
  }

  async function handleBulkImport(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const parsed = JSON.parse(bulkJson);
      const items = Array.isArray(parsed) ? parsed : parsed.items;
      const res = await fetch("/api/shariah", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error || "Invalid JSON schema");
      } else {
        onSaved();
        onClose();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid JSON");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-800 bg-[#0b1120] p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-emerald-400" />
            <h2 className="text-base font-bold text-white">
              {lang === "ar" ? "إدارة سجل الفحص الشرعي الموثّق" : "Auditable Shariah Registry Manager"}
            </h2>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mb-4 flex gap-2 text-xs">
          <button
            onClick={() => setTab("single")}
            className={`rounded-lg px-3 py-1.5 font-semibold ${
              tab === "single" ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40" : "bg-slate-900 text-slate-400"
            }`}
          >
            {lang === "ar" ? "توثيق / تحديث عملة" : "Add / Update Asset"}
          </button>
          <button
            onClick={() => setTab("bulk")}
            className={`inline-flex items-center gap-1 rounded-lg px-3 py-1.5 font-semibold ${
              tab === "bulk" ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40" : "bg-slate-900 text-slate-400"
            }`}
          >
            <Upload className="h-3.5 w-3.5" />
            {lang === "ar" ? "استيراد جماعي (JSON)" : "Bulk JSON Import"}
          </button>
        </div>

        {error && (
          <div className="mb-3 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
            {error}
          </div>
        )}

        {tab === "single" ? (
          <form onSubmit={handleSaveSingle} className="space-y-3 text-xs">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-slate-300">
                  {lang === "ar" ? "رمز العملة (مثل BTC أو SOLUSDT) *" : "Asset Symbol (e.g. BTC or SOLUSDT) *"}
                </label>
                <input
                  required
                  value={symbol}
                  onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                  placeholder="SOLUSDT"
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
                />
              </div>
              <div>
                <label className="mb-1 block text-slate-300">
                  {lang === "ar" ? "التصنيف الشرعي *" : "Shariah Classification *"}
                </label>
                <select
                  value={classification}
                  onChange={(e) => setClassification(e.target.value as ShariahClassification)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
                >
                  <option value="HALAL">HALAL — {lang === "ar" ? "مباح وفق جهة فحص" : "Halal (Screened)"}</option>
                  <option value="HALAL_WITH_CONDITIONS">HALAL_WITH_CONDITIONS — {lang === "ar" ? "مباح بشروط" : "Halal w/ Conditions"}</option>
                  <option value="SCHOLARLY_DISAGREEMENT">SCHOLARLY_DISAGREEMENT — {lang === "ar" ? "مختلف فيه" : "Scholarly Disagreement"}</option>
                  <option value="NON_COMPLIANT">NON_COMPLIANT — {lang === "ar" ? "غير متوافق" : "Non-Compliant"}</option>
                  <option value="UNVERIFIED">UNVERIFIED — {lang === "ar" ? "غير متحقق منه" : "Unverified"}</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-slate-300">
                  {lang === "ar" ? "الجهة الشرعية / منصة الفحص المرجعية *" : "Issuing Authority / Screening Body *"}
                </label>
                <input
                  required
                  value={authorityName}
                  onChange={(e) => setAuthorityName(e.target.value)}
                  placeholder="Sharlife / CryptoHalal / Shariyah Review Bureau"
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
                />
              </div>
              <div>
                <label className="mb-1 block text-slate-300">
                  {lang === "ar" ? "رابط المصدر الموثّق (URL)" : "Verifiable Source URL"}
                </label>
                <input
                  type="url"
                  value={sourceUrl}
                  onChange={(e) => setSourceUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-slate-300">{lang === "ar" ? "تاريخ التقييم" : "Assessment Date"}</label>
                <input
                  type="date"
                  value={assessmentDate}
                  onChange={(e) => setAssessmentDate(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
                />
              </div>
              <div>
                <label className="mb-1 block text-slate-300">{lang === "ar" ? "المنهجية المعتمدة *" : "Methodology *"}</label>
                <input
                  required
                  value={methodology}
                  onChange={(e) => setMethodology(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-slate-300">
                {lang === "ar" ? "سبب الحكم الشرعي وتحليل نشاط المشروع (عربي) *" : "Core Activity & Ruling Rationale (Arabic)"}
              </label>
              <textarea
                rows={2}
                required
                value={coreActivityNotesAr}
                onChange={(e) => setCoreActivityNotesAr(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
              />
            </div>

            <div>
              <label className="mb-1 block text-slate-300">
                {lang === "ar" ? "سبب الحكم (إنجليزي)" : "Core Activity & Ruling Rationale (English) *"}
              </label>
              <textarea
                rows={2}
                value={coreActivityNotesEn}
                onChange={(e) => setCoreActivityNotesEn(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-slate-300">{lang === "ar" ? "الشروط والقيود (عربي)" : "Conditions (Arabic)"}</label>
                <input
                  value={conditionsAr}
                  onChange={(e) => setConditionsAr(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
                />
              </div>
              <div>
                <label className="mb-1 block text-slate-300">{lang === "ar" ? "الشروط والقيود (إنجليزي)" : "Conditions (English)"}</label>
                <input
                  value={conditionsEn}
                  onChange={(e) => setConditionsEn(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-slate-300">{lang === "ar" ? "الخلافات الفقهية (عربي)" : "Scholarly Disagreements (AR)"}</label>
                <input
                  value={disagreementsAr}
                  onChange={(e) => setDisagreementsAr(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
                />
              </div>
              <div>
                <label className="mb-1 block text-slate-300">{lang === "ar" ? "سبب التعديل لسجل التدقيق" : "Audit Log Change Reason"}</label>
                <input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Quarterly review update"
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-slate-700 px-4 py-2 text-slate-300 hover:bg-slate-800"
              >
                {lang === "ar" ? "إلغاء" : "Cancel"}
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-emerald-600 px-4 py-2 font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
              >
                {saving
                  ? lang === "ar"
                    ? "جاري الحفظ..."
                    : "Saving..."
                  : lang === "ar"
                    ? "حفظ وتسجيل في سجل التدقيق"
                    : "Save & Record Audit Trail"}
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleBulkImport} className="space-y-3 text-xs">
            <p className="text-slate-400">
              {lang === "ar"
                ? "الصق مصفوفة JSON تحتوي على سجلات الفحص الشرعي (يتم التحقق منها وتوثيق كل تغيير تلقائياً في سجل التدقيق)."
                : "Paste a JSON array of Shariah screening records. All changes are validated and written to the audit trail."}
            </p>
            <textarea
              rows={10}
              required
              dir="ltr"
              value={bulkJson}
              onChange={(e) => setBulkJson(e.target.value)}
              placeholder={`[\n  {\n    "symbol": "TIAUSDT",\n    "classification": "HALAL",\n    "authorityName": "Sharlife",\n    "sourceUrl": "https://sharlife.my",\n    "methodology": "Layer-1 Data Availability utility",\n    "coreActivityNotesEn": "Modular data availability network",\n    "coreActivityNotesAr": "شبكة بنية تحتية لتوافر البيانات"\n  }\n]`}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 p-3 font-mono text-[11px] text-emerald-200"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-slate-700 px-4 py-2 text-slate-300 hover:bg-slate-800"
              >
                {lang === "ar" ? "إلغاء" : "Cancel"}
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-emerald-600 px-4 py-2 font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
              >
                {saving ? "..." : lang === "ar" ? "استيراد وتوثيق" : "Import Records"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
