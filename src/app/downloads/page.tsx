"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  Download,
  ExternalLink,
  Globe,
  Monitor,
  RefreshCw,
  ShieldCheck,
  Smartphone,
} from "lucide-react";
import type { LatestReleaseInfo } from "@/lib/services/updates";
import { useLanguage } from "@/components/LanguageProvider";
import { TopNav } from "@/components/TopNav";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function formatBytes(bytes: number): string {
  if (!bytes) return "";
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(1)} MB`;
}

export default function DownloadsPage() {
  const { lang } = useLanguage();
  const [release, setRelease] = useState<(LatestReleaseInfo & { repo?: string; runtime?: string }) | null>(null);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [pwaPrompt, setPwaPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [pwaInstalled, setPwaInstalled] = useState(false);

  async function loadRelease(refresh = false) {
    if (refresh) setChecking(true);
    else setLoading(true);
    try {
      const res = await fetch(`/api/version${refresh ? "?refresh=true" : ""}`);
      const data = await res.json();
      if (data.ok) setRelease(data);
    } finally {
      setLoading(false);
      setChecking(false);
    }
  }

  useEffect(() => {
    loadRelease(false);

    const handler = (e: Event) => {
      e.preventDefault();
      setPwaPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  async function handleInstallPwa() {
    if (!pwaPrompt) return;
    await pwaPrompt.prompt();
    const choice = await pwaPrompt.userChoice;
    if (choice.outcome === "accepted") {
      setPwaInstalled(true);
      setPwaPrompt(null);
    }
  }

  const repoUrl = `https://github.com/${release?.repo || "aliazizdbab/halal-crypto-intelligence"}`;

  return (
    <div className="min-h-screen bg-[#060a13] text-slate-100">
      <TopNav />

      <main className="mx-auto max-w-5xl space-y-6 px-4 py-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-emerald-300"
          >
            <ArrowLeft className="h-3.5 w-3.5 rtl:rotate-180" />
            {lang === "ar" ? "العودة إلى لوحة التحكم" : "Back to Dashboard"}
          </Link>

          <button
            onClick={() => loadRelease(true)}
            disabled={checking}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-800 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${checking ? "animate-spin" : ""}`} />
            {lang === "ar" ? "فحص التحديثات من GitHub الآن" : "Check GitHub Releases Now"}
          </button>
        </div>

        {/* Hero */}
        <section className="rounded-2xl border border-emerald-500/25 bg-[#0b1120] p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-0.5 text-[11px] font-semibold text-emerald-300">
                <ShieldCheck className="h-3.5 w-3.5" />
                {lang === "ar" ? "التوزيع والتحديث التلقائي عبر GitHub Releases" : "Auto-Updating Releases via GitHub"}
              </div>
              <h1 className="text-2xl font-extrabold text-white">
                {lang === "ar"
                  ? "تنزيل وتثبيت المنصة (Windows • Android • Web)"
                  : "Download & Install (Windows • Android • Web)"}
              </h1>
              <p className="mt-1.5 text-xs text-slate-400">
                {lang === "ar"
                  ? "نسخ رسمية تُبنى تلقائياً عبر GitHub Actions وتتحقق تلقائياً من التحديثات فور صدور أي إصدار جديد."
                  : "Official multi-platform builds compiled via GitHub Actions with automatic GitHub Releases update detection."}
              </p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/80 px-4 py-3 text-xs">
              <div className="text-slate-400">{lang === "ar" ? "الإصدار الحالي / الأحدث" : "Current / Latest"}</div>
              <div className="mt-1 font-mono-num text-base font-bold text-white">
                v{release?.currentVersion || "1.0.0"}{" "}
                <span className="text-slate-500">/</span>{" "}
                <span className="text-emerald-400">
                  {release?.latestVersion ? `v${release.latestVersion}` : lang === "ar" ? "قيد النشر" : "Pending"}
                </span>
              </div>
              <a
                href={`${repoUrl}/releases`}
                target="_blank"
                rel="noreferrer"
                className="mt-1 inline-flex items-center gap-1 text-[11px] text-sky-400 hover:underline"
              >
                GitHub Releases <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </div>
        </section>

        {/* 3 Platform Cards */}
        <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {/* Windows */}
          <div className="flex flex-col justify-between rounded-2xl border border-slate-800 bg-[#0b1120] p-5">
            <div className="space-y-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-sky-500/30 bg-sky-500/10 text-sky-400">
                <Monitor className="h-6 w-6" />
              </div>
              <h2 className="text-base font-bold text-white">
                {lang === "ar" ? "نسخة Windows المكتبية (.exe)" : "Windows Desktop (.exe)"}
              </h2>
              <p className="text-xs leading-relaxed text-slate-400">
                {lang === "ar"
                  ? "مثبّت مستقل بالكامل (Electron + خادم Next.js مدمج + SQLite) لا يحتاج تثبيت Node.js، ويحدّث نفسه تلقائياً من GitHub Releases عبر electron-updater مع حفظ بياناتك في AppData."
                  : "Self-contained NSIS installer with embedded Next.js server & SQLite (zero prerequisites). Auto-updates silently/prompted via electron-updater from GitHub Releases."}
              </p>
            </div>
            <div className="mt-5 space-y-2">
              {release?.windowsAsset ? (
                <a
                  href={release.windowsAsset.downloadUrl}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-sky-500 px-4 py-2.5 text-xs font-bold text-slate-950 transition hover:bg-sky-400"
                >
                  <Download className="h-4 w-4" />
                  {lang === "ar" ? "تنزيل لنظام Windows" : "Download for Windows"} (
                  {formatBytes(release.windowsAsset.sizeBytes)})
                </a>
              ) : (
                <a
                  href={`${repoUrl}/releases`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-sky-500/40 bg-sky-500/15 px-4 py-2.5 text-xs font-semibold text-sky-200 hover:bg-sky-500/25"
                >
                  <ExternalLink className="h-4 w-4" />
                  {loading
                    ? "..."
                    : lang === "ar"
                      ? "فتح صفحة إصدارات GitHub (.exe)"
                      : "Open GitHub Releases (.exe)"}
                </a>
              )}
              <div className="text-center text-[10px] text-slate-500">
                Windows 10 / 11 (x64) • Auto-Update Enabled
              </div>
            </div>
          </div>

          {/* Android */}
          <div className="flex flex-col justify-between rounded-2xl border border-slate-800 bg-[#0b1120] p-5">
            <div className="space-y-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
                <Smartphone className="h-6 w-6" />
              </div>
              <h2 className="text-base font-bold text-white">
                {lang === "ar" ? "نسخة Android للهواتف (.apk)" : "Android Mobile (.apk)"}
              </h2>
              <p className="text-xs leading-relaxed text-slate-400">
                {lang === "ar"
                  ? "تطبيق أندرويد أصلي بـ Capacitor يدعم الاتصال المباشر بالخادم السحابي أو شبكتك المحلية (Wi-Fi)، مع فحص تلقائي لتحديثات الـ APK الجديدة من GitHub Releases."
                  : "Capacitor Android APK supporting your hosted Web server or local Wi-Fi LAN server, with automatic GitHub Releases update alerts and direct APK installation."}
              </p>
            </div>
            <div className="mt-5 space-y-2">
              {release?.androidAsset ? (
                <a
                  href={release.androidAsset.downloadUrl}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-xs font-bold text-slate-950 transition hover:bg-emerald-400"
                >
                  <Download className="h-4 w-4" />
                  {lang === "ar" ? "تنزيل لنظام Android (.apk)" : "Download Android APK"} (
                  {formatBytes(release.androidAsset.sizeBytes)})
                </a>
              ) : (
                <a
                  href={`${repoUrl}/releases`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/15 px-4 py-2.5 text-xs font-semibold text-emerald-200 hover:bg-emerald-500/25"
                >
                  <ExternalLink className="h-4 w-4" />
                  {loading
                    ? "..."
                    : lang === "ar"
                      ? "فتح صفحة إصدارات GitHub (.apk)"
                      : "Open GitHub Releases (.apk)"}
                </a>
              )}
              <div className="text-center text-[10px] text-slate-500">
                Android 8.0+ (API 26+) • In-App GitHub Updater
              </div>
            </div>
          </div>

          {/* Web / PWA */}
          <div className="flex flex-col justify-between rounded-2xl border border-slate-800 bg-[#0b1120] p-5">
            <div className="space-y-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-indigo-500/30 bg-indigo-500/10 text-indigo-400">
                <Globe className="h-6 w-6" />
              </div>
              <h2 className="text-base font-bold text-white">
                {lang === "ar" ? "نسخة الويب وتطبيق PWA" : "Web & Installable PWA"}
              </h2>
              <p className="text-xs leading-relaxed text-slate-400">
                {lang === "ar"
                  ? "مثبّت فوري عبر المتصفح على أي نظام (iOS / Android / Desktop) وجاهز للنشر السحابي التلقائي من GitHub عبر Docker على Render أو Railway أو أي VPS."
                  : "Install directly from your browser as a Progressive Web App, or auto-deploy from GitHub to Render, Railway, or Docker VPS on every push to main."}
              </p>
            </div>
            <div className="mt-5 space-y-2">
              {pwaInstalled ? (
                <div className="flex items-center justify-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/15 px-4 py-2.5 text-xs font-bold text-emerald-300">
                  <CheckCircle2 className="h-4 w-4" />
                  {lang === "ar" ? "تم تثبيت تطبيق الويب!" : "PWA Installed!"}
                </div>
              ) : pwaPrompt ? (
                <button
                  onClick={handleInstallPwa}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-500 px-4 py-2.5 text-xs font-bold text-white hover:bg-indigo-400"
                >
                  <Download className="h-4 w-4" />
                  {lang === "ar" ? "تثبيت كتطبيق الآن (PWA)" : "Install Web App (PWA)"}
                </button>
              ) : (
                <a
                  href={repoUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-indigo-500/40 bg-indigo-500/15 px-4 py-2.5 text-xs font-semibold text-indigo-200 hover:bg-indigo-500/25"
                >
                  <ExternalLink className="h-4 w-4" />
                  {lang === "ar" ? "المستودع ودليل النشر (GitHub)" : "GitHub Repo & Cloud Deploy"}
                </a>
              )}
              <div className="text-center text-[10px] text-slate-500">
                Docker • Render • Railway • Auto-Deploy on Push
              </div>
            </div>
          </div>
        </section>

        {/* Release Notes & All Files */}
        {release?.allAssets && release.allAssets.length > 0 && (
          <section className="rounded-2xl border border-slate-800 bg-[#0b1120] p-5 text-xs">
            <h3 className="mb-3 font-bold text-white">
              {lang === "ar" ? `ملفات الإصدار v${release.latestVersion}` : `Release v${release.latestVersion} Artifacts`}
            </h3>
            <div className="space-y-1.5">
              {release.allAssets.map((a) => (
                <a
                  key={a.name}
                  href={a.downloadUrl}
                  className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2 hover:border-emerald-500/40"
                >
                  <span className="font-mono-num text-slate-200">{a.name}</span>
                  <span className="font-mono-num text-slate-400">{formatBytes(a.sizeBytes)}</span>
                </a>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
