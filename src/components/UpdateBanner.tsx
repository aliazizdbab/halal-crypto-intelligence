"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowDownToLine, RefreshCw, Sparkles, X } from "lucide-react";
import { useLanguage } from "./LanguageProvider";

interface DesktopBridge {
  isElectron: boolean;
  platform: string;
  checkForUpdates: () => Promise<void>;
  installUpdate: () => Promise<void>;
  onUpdateStatus: (cb: (payload: { status: string; version?: string; percent?: number; message?: string }) => void) => () => void;
}

declare global {
  interface Window {
    hciDesktop?: DesktopBridge;
  }
}

export function UpdateBanner() {
  const { lang } = useLanguage();
  const [dismissed, setDismissed] = useState(false);
  const [releaseUpdate, setReleaseUpdate] = useState<{
    currentVersion: string;
    latestVersion: string;
    htmlUrl: string;
    androidUrl: string | null;
    windowsUrl: string | null;
  } | null>(null);
  const [electronState, setElectronState] = useState<{
    status: string;
    version?: string;
    percent?: number;
  } | null>(null);

  useEffect(() => {
    // Register PWA Service Worker
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => null);
    }

    // Listen to native Electron auto-updater events if running inside Windows Desktop app
    let unsub: (() => void) | undefined;
    if (typeof window !== "undefined" && window.hciDesktop?.onUpdateStatus) {
      unsub = window.hciDesktop.onUpdateStatus((payload) => {
        setElectronState(payload);
        if (payload.status === "available" || payload.status === "downloaded") {
          setDismissed(false);
        }
      });
    }

    // Check GitHub Releases via /api/version
    fetch("/api/version")
      .then((r) => r.json())
      .then((data) => {
        if (data?.ok && data.updateAvailable && data.latestVersion) {
          setReleaseUpdate({
            currentVersion: data.currentVersion,
            latestVersion: data.latestVersion,
            htmlUrl: data.htmlUrl,
            androidUrl: data.androidAsset?.downloadUrl ?? null,
            windowsUrl: data.windowsAsset?.downloadUrl ?? null,
          });
        }
      })
      .catch(() => null);

    return () => {
      if (unsub) unsub();
    };
  }, []);

  if (dismissed) return null;

  // Priority 1: Native Electron downloaded / downloading banner
  if (electronState && ["available", "downloading", "downloaded"].includes(electronState.status)) {
    return (
      <div className="border-b border-emerald-500/40 bg-emerald-950/80 px-4 py-2 text-xs text-emerald-100">
        <div className="mx-auto flex max-w-[1640px] flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-emerald-400" />
            {electronState.status === "downloaded" ? (
              <span>
                {lang === "ar"
                  ? `تم تنزيل التحديث الجديد v${electronState.version ?? ""} تلقائياً وجاهز للتثبيت!`
                  : `Update v${electronState.version ?? ""} downloaded and ready to install!`}
              </span>
            ) : electronState.status === "downloading" ? (
              <span>
                {lang === "ar"
                  ? `جاري تنزيل التحديث التلقائي من GitHub... (${Math.round(electronState.percent ?? 0)}%)`
                  : `Downloading update from GitHub... (${Math.round(electronState.percent ?? 0)}%)`}
              </span>
            ) : (
              <span>
                {lang === "ar"
                  ? `يتوفر إصدار جديد v${electronState.version ?? ""} من GitHub Releases.`
                  : `New release v${electronState.version ?? ""} is available on GitHub.`}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {electronState.status === "downloaded" && (
              <button
                onClick={() => window.hciDesktop?.installUpdate()}
                className="inline-flex items-center gap-1 rounded-lg bg-emerald-500 px-3 py-1 font-bold text-slate-950 hover:bg-emerald-400"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                {lang === "ar" ? "إعادة التشغيل والتحديث الآن" : "Restart & Install Now"}
              </button>
            )}
            <button onClick={() => setDismissed(true)} className="text-emerald-300 hover:text-white">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Priority 2: Web / Android GitHub Release Update Notification
  if (releaseUpdate) {
    const isAndroid = typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent);
    const directHref = isAndroid
      ? releaseUpdate.androidUrl || "/downloads"
      : releaseUpdate.windowsUrl || "/downloads";

    return (
      <div className="border-b border-sky-500/35 bg-sky-950/70 px-4 py-2 text-xs text-sky-100">
        <div className="mx-auto flex max-w-[1640px] flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-sky-400" />
            <span>
              {lang === "ar"
                ? `يتوفر إصدار جديد (v${releaseUpdate.latestVersion}) على GitHub — نسختك الحالية v${releaseUpdate.currentVersion}`
                : `New version v${releaseUpdate.latestVersion} available on GitHub (current: v${releaseUpdate.currentVersion})`}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href={directHref}
              className="inline-flex items-center gap-1 rounded-lg bg-sky-500 px-3 py-1 font-bold text-slate-950 hover:bg-sky-400"
            >
              <ArrowDownToLine className="h-3.5 w-3.5" />
              {lang === "ar" ? "تنزيل التحديث" : "Download Update"}
            </Link>
            <button onClick={() => setDismissed(true)} className="text-sky-300 hover:text-white">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
