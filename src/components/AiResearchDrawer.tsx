"use client";

import React, { useEffect, useState } from "react";
import { Bot, CheckCircle2, ExternalLink, Loader2, PlugZap, Send, ShieldAlert, Sparkles, X } from "lucide-react";
import { useLanguage } from "./LanguageProvider";
import type { AssetDirectoryRow } from "@/types/domain";

interface AiMessage {
  role: "user" | "assistant";
  content: string;
  mode?: string;
  disclaimer?: string;
  citations?: Array<{ label: string; url: string | null }>;
  generatedAt?: string;
}

interface AiResearchDrawerProps {
  open: boolean;
  onClose: () => void;
  defaultSymbol?: string;
  onOpenSettings?: () => void;
  onBatchCompleted?: () => void;
}

function renderInlineMarkdown(text: string): React.ReactNode[] {
  const tokens = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return tokens.map((tok, i) => {
    if (tok.startsWith("**") && tok.endsWith("**")) {
      return (
        <strong key={i} className="font-bold text-white">
          {tok.slice(2, -2)}
        </strong>
      );
    }
    if (tok.startsWith("`") && tok.endsWith("`")) {
      return (
        <code
          key={i}
          dir="ltr"
          className="inline-block rounded bg-slate-800 px-1.5 py-0.5 font-mono-num text-[11px] text-emerald-300"
        >
          {tok.slice(1, -1)}
        </code>
      );
    }
    return <React.Fragment key={i}>{tok}</React.Fragment>;
  });
}

function FormattedMarkdown({ content }: { content: string }) {
  const lines = content.split("\n");
  return (
    <div className="space-y-1.5">
      {lines.map((line, idx) => {
        const trimmed = line.trim();
        if (!trimmed) return <div key={idx} className="h-1" />;
        if (trimmed.startsWith("### ")) {
          return (
            <h3 key={idx} className="pt-1 text-sm font-bold text-emerald-300">
              {renderInlineMarkdown(trimmed.slice(4))}
            </h3>
          );
        }
        if (trimmed.startsWith("## ")) {
          return (
            <h3 key={idx} className="pt-1 text-sm font-bold text-emerald-300">
              {renderInlineMarkdown(trimmed.slice(3))}
            </h3>
          );
        }
        if (trimmed.startsWith("#### ")) {
          return (
            <h4 key={idx} className="pt-1.5 text-xs font-bold text-sky-300">
              {renderInlineMarkdown(trimmed.slice(5))}
            </h4>
          );
        }
        if (trimmed.startsWith("> ")) {
          return (
            <blockquote
              key={idx}
              className="border-s-2 border-amber-400/60 bg-amber-500/5 py-1 ps-2.5 text-[11px] text-amber-200/90"
            >
              {renderInlineMarkdown(trimmed.slice(2))}
            </blockquote>
          );
        }
        if (trimmed.startsWith("- ")) {
          return (
            <div key={idx} className="flex gap-1.5">
              <span className="text-emerald-400">•</span>
              <span className="flex-1">{renderInlineMarkdown(trimmed.slice(2))}</span>
            </div>
          );
        }
        return <p key={idx}>{renderInlineMarkdown(trimmed)}</p>;
      })}
    </div>
  );
}

export function AiResearchDrawer({
  open,
  onClose,
  defaultSymbol,
  onOpenSettings,
  onBatchCompleted,
}: AiResearchDrawerProps) {
  const { lang } = useLanguage();
  const [tab, setTab] = useState<"chat" | "batch">("chat");
  const [symbol, setSymbol] = useState(defaultSymbol || "");
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<AiMessage[]>([]);

  // Batch Analyzer State
  const [unverifiedList, setUnverifiedList] = useState<AssetDirectoryRow[]>([]);
  const [batchCount, setBatchCount] = useState(10);
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{ done: number; total: number; current: string } | null>(null);
  const [batchLog, setBatchLog] = useState<Array<{ symbol: string; status: string; ok: boolean }>>([]);

  useEffect(() => {
    if (defaultSymbol) setSymbol(defaultSymbol);
  }, [defaultSymbol]);

  useEffect(() => {
    if (!open || tab !== "batch") return;
    fetch("/api/assets?classifications=UNVERIFIED&sort=volume_desc&pageSize=100")
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) setUnverifiedList(d.rows || []);
      })
      .catch(() => {});
  }, [open, tab]);

  if (!open) return null;

  const quickPrompts =
    lang === "ar"
      ? [
          "لماذا هذه العملة مصنفة مباحة؟ وما هي الجهة المرجعية وهل يوجد خلاف فقهي؟",
          "حلل مراكز أوامر السيولة البيعية والشرائية وجدران الدعم والمقاومة الحالية.",
          "هل التوكن تضخمي؟ وما هي مواعيد فك القفل القادمة ومخاطر التخفيف؟",
          "ما هي أفضل العملات المباحة على Binance وBybit من حيث الموثوقية وفرص النمو؟",
        ]
      : [
          "Why is this token classified as Halal, which authority supports it, and are there conflicting opinions?",
          "Analyze the current Spot order-book Buy/Sell liquidity walls and bid-ask pressure.",
          "Is the token inflationary and what are the upcoming unlocks and dilution risks?",
          "Which Halal Spot assets across Binance & Bybit have the strongest combined scores?",
        ];

  async function ask(qText?: string) {
    const q = (qText ?? question).trim();
    if (!q || loading) return;

    setMessages((prev) => [...prev, { role: "user", content: q }]);
    if (!qText) setQuestion("");
    setLoading(true);

    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: q,
          symbol: symbol.trim() || undefined,
          lang,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: data.answer,
            mode: data.mode,
            disclaimer: data.disclaimer,
            citations: data.citations,
            generatedAt: data.generatedAt,
          },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: data.error || "Research assistant error." },
        ]);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: lang === "ar" ? "تعذر الاتصال بالمساعد البحثي." : "Failed to reach AI research endpoint.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  async function runBatchAnalyze(allowHeuristic = false) {
    const targets = unverifiedList.slice(0, batchCount);
    if (targets.length === 0 || batchRunning) return;

    setBatchRunning(true);
    setBatchLog([]);
    setBatchProgress({ done: 0, total: targets.length, current: targets[0].symbol });

    for (let i = 0; i < targets.length; i++) {
      const item = targets[i];
      setBatchProgress({ done: i, total: targets.length, current: item.symbol });
      try {
        const res = await fetch("/api/ai/analyze-asset", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            symbol: item.symbol,
            lang,
            allowHeuristicFallback: allowHeuristic,
          }),
        });
        const data = await res.json();
        if (data.code === "AI_NOT_CONFIGURED" && !allowHeuristic) {
          setBatchLog((prev) => [
            ...prev,
            {
              symbol: item.symbol,
              status:
                lang === "ar"
                  ? "يرجى ربط وكيل AI أولاً أو الضغط على «فحص بالمحلل المدمج»"
                  : "Connect an AI Agent first or use Built-in Analyzer",
              ok: false,
            },
          ]);
          break;
        }
        setBatchLog((prev) => [
          ...prev,
          {
            symbol: item.symbol,
            status: data.ok ? `${data.classification} (${data.providerUsed})` : data.error || "Failed",
            ok: Boolean(data.ok),
          },
        ]);
      } catch {
        setBatchLog((prev) => [...prev, { symbol: item.symbol, status: "Network Error", ok: false }]);
      }
    }

    setBatchProgress((prev) => (prev ? { ...prev, done: prev.total } : null));
    setBatchRunning(false);
    onBatchCompleted?.();
    // Refresh remaining unverified list
    fetch("/api/assets?classifications=UNVERIFIED&sort=volume_desc&pageSize=100")
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) setUnverifiedList(d.rows || []);
      })
      .catch(() => {});
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-xs">
      <div className="flex h-full w-full max-w-xl flex-col border-s border-slate-800 bg-[#090f1d] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500/20 text-indigo-300">
              <Bot className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">
                {lang === "ar" ? "المساعد البحثي والمحلل الذكي (AI)" : "AI Researcher & Batch Coin Analyzer"}
              </h2>
              <p className="text-[11px] text-slate-400">
                {lang === "ar"
                  ? "محادثة بحثية بالسيولة الحية + تحليل جماعي للعملات غير المفحوصة"
                  : "Grounded chat with live liquidity walls + batch unverified coin analyzer"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {onOpenSettings && (
              <button
                onClick={onOpenSettings}
                className="inline-flex items-center gap-1 rounded-lg border border-purple-500/40 bg-purple-500/15 px-2.5 py-1 text-[11px] font-semibold text-purple-200 hover:bg-purple-500/25"
              >
                <PlugZap className="h-3 w-3" />
                {lang === "ar" ? "إعداد الوكيل" : "AI Setup"}
              </button>
            )}
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-800 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Mode Switcher */}
        <div className="flex gap-2 border-b border-slate-800 bg-slate-950/60 px-4 py-2 text-xs">
          <button
            onClick={() => setTab("chat")}
            className={`flex-1 rounded-lg py-1.5 font-semibold transition ${
              tab === "chat"
                ? "border border-indigo-500/50 bg-indigo-500/20 text-indigo-200"
                : "bg-slate-900 text-slate-400 hover:text-white"
            }`}
          >
            {lang === "ar" ? "المحادثة البحثية" : "Research Chat"}
          </button>
          <button
            onClick={() => setTab("batch")}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 font-semibold transition ${
              tab === "batch"
                ? "border border-purple-500/50 bg-purple-500/20 text-purple-200"
                : "bg-slate-900 text-slate-400 hover:text-white"
            }`}
          >
            <Sparkles className="h-3.5 w-3.5" />
            {lang === "ar" ? "تحليل جماعي للعملات غير المحللة" : "Batch Analyze Unverified"}
          </button>
        </div>

        {tab === "chat" ? (
          <>
            {/* Context Symbol Bar */}
            <div className="flex items-center gap-2 border-b border-slate-800/80 bg-slate-900/50 px-4 py-2 text-xs">
              <span className="text-slate-400">
                {lang === "ar" ? "العملة المستهدفة (اختياري):" : "Focus Asset (optional):"}
              </span>
              <input
                value={symbol}
                onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                placeholder="BTC, KAS, SOL, LINK..."
                className="w-36 rounded border border-slate-700 bg-slate-950 px-2 py-1 font-mono-num text-xs text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
              />
              {symbol && (
                <button
                  onClick={() => setSymbol("")}
                  className="text-[11px] text-slate-400 hover:text-white"
                >
                  {lang === "ar" ? "مسح" : "Clear"}
                </button>
              )}
            </div>

            {/* Messages */}
            <div className="flex-1 space-y-3 overflow-y-auto p-4">
              {messages.length === 0 && (
                <div className="space-y-3">
                  <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-3 text-xs text-amber-200/90">
                    <div className="mb-1 flex items-center gap-1.5 font-semibold">
                      <ShieldAlert className="h-3.5 w-3.5" />
                      {lang === "ar" ? "ضوابط الموثوقية" : "Verification Guardrails"}
                    </div>
                    {lang === "ar"
                      ? "لا يختلق المساعد أي فتوى أو شراكة؛ جميع الإجابات مرتبطة بسجل البيانات وجدران السيولة الحية ومصادرها."
                      : "Never fabricates fatwas or partnerships. Grounded in verified DB records and live Spot order-book walls."}
                  </div>

                  <div className="space-y-1.5">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                      {lang === "ar" ? "أسئلة بحثية مقترحة" : "Suggested Research Prompts"}
                    </p>
                    {quickPrompts.map((p, i) => (
                      <button
                        key={i}
                        onClick={() => ask(p)}
                        className="block w-full rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2 text-start text-xs text-slate-200 transition hover:border-indigo-500/40 hover:bg-slate-800/80"
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((m, idx) => (
                <div
                  key={idx}
                  className={`rounded-xl p-3 text-xs leading-relaxed ${
                    m.role === "user"
                      ? "ms-8 border border-indigo-500/30 bg-indigo-500/15 text-indigo-100"
                      : "me-4 border border-slate-800 bg-slate-900/90 text-slate-200"
                  }`}
                >
                  <FormattedMarkdown content={m.content} />
                  {m.citations && m.citations.length > 0 && (
                    <div className="mt-2.5 flex flex-wrap gap-1.5 border-t border-slate-800 pt-2">
                      {m.citations.map((c, ci) =>
                        c.url ? (
                          <a
                            key={ci}
                            href={c.url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 rounded bg-slate-800 px-2 py-0.5 text-[10px] text-sky-300 hover:bg-slate-700"
                          >
                            {c.label}
                            <ExternalLink className="h-2.5 w-2.5" />
                          </a>
                        ) : (
                          <span
                            key={ci}
                            className="rounded bg-slate-800/80 px-2 py-0.5 text-[10px] text-slate-400"
                          >
                            {c.label}
                          </span>
                        )
                      )}
                    </div>
                  )}
                  {m.disclaimer && (
                    <div className="mt-2 flex items-center justify-between gap-2 border-t border-slate-800/80 pt-1.5 text-[10px] text-amber-300/80">
                      <span>{m.disclaimer}</span>
                      {m.mode && (
                        <span className="shrink-0 rounded bg-slate-800 px-1.5 py-0.5 font-mono-num text-[9px] text-slate-400">
                          {m.mode}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              ))}

              {loading && (
                <div className="animate-pulse rounded-xl border border-slate-800 bg-slate-900/60 p-3 text-xs text-slate-400">
                  {lang === "ar" ? "جاري فحص السجلات وسيولة السوق..." : "Analyzing verified records & order-book liquidity..."}
                </div>
              )}
            </div>

            {/* Input */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                ask();
              }}
              className="border-t border-slate-800 p-3"
            >
              <div className="flex gap-2">
                <input
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  placeholder={
                    lang === "ar"
                      ? "اسأل عن الحكم الشرعي، جدران السيولة، التضخم، أو المخاطر..."
                      : "Ask about Shariah ruling, buy/sell walls, unlocks, or risks..."
                  }
                  className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={loading || !question.trim()}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50"
                >
                  <Send className="h-3.5 w-3.5" />
                  {lang === "ar" ? "إرسال" : "Ask"}
                </button>
              </div>
            </form>
          </>
        ) : (
          <div className="flex-1 space-y-4 overflow-y-auto p-4 text-xs">
            <div className="rounded-xl border border-purple-500/30 bg-purple-500/10 p-3.5 text-slate-200">
              <div className="mb-1 font-bold text-purple-200">
                {lang === "ar"
                  ? "فحص وإضافة العملات غير المحللة دفعة واحدة (الأعلى سيولة أولاً)"
                  : "Batch Analyze Unverified Spot Coins (Sorted by Highest 24h Liquidity)"}
              </div>
              <p className="text-[11px] leading-relaxed text-slate-300">
                {lang === "ar"
                  ? `يوجد حالياً (${unverifiedList.length}) عملة غير مفحوصة في القائمة النشطة. يقوم الوكيل بفحص نشاط كل عملة والتوكنوميكس والمخاطر وحفظها تلقائياً بشارة «تحليل AI» لتتمكن من مراجعتها لاحقاً.`
                  : `${unverifiedList.length} active Spot coins are currently unscreened. Run batch AI analysis to populate preliminary AI_OPINION assessments, credibility scores, and scenarios.`}
              </p>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <select
                  value={batchCount}
                  onChange={(e) => setBatchCount(Number(e.target.value))}
                  disabled={batchRunning}
                  className="rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-white"
                >
                  <option value={5}>{lang === "ar" ? "أعلى 5 عملات سيولة" : "Top 5 Unverified"}</option>
                  <option value={10}>{lang === "ar" ? "أعلى 10 عملات سيولة" : "Top 10 Unverified"}</option>
                  <option value={25}>{lang === "ar" ? "أعلى 25 عملة سيولة" : "Top 25 Unverified"}</option>
                </select>

                <button
                  onClick={() => runBatchAnalyze(false)}
                  disabled={batchRunning || unverifiedList.length === 0}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-purple-600 px-3.5 py-1.5 font-semibold text-white hover:bg-purple-500 disabled:opacity-50"
                >
                  {batchRunning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                  {lang === "ar" ? "بدء التحليل عبر وكيل AI" : "Run Connected AI Batch"}
                </button>

                <button
                  onClick={() => runBatchAnalyze(true)}
                  disabled={batchRunning || unverifiedList.length === 0}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 font-medium text-slate-200 hover:bg-slate-800 disabled:opacity-50"
                >
                  {lang === "ar" ? "فحص سريع بالمحلل المدمج" : "Quick Built-in Scan"}
                </button>
              </div>
            </div>

            {batchProgress && (
              <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
                <div className="mb-1 flex items-center justify-between font-mono-num text-[11px]">
                  <span className="text-slate-300">
                    {batchRunning
                      ? lang === "ar"
                        ? `جاري تحليل: ${batchProgress.current}...`
                        : `Analyzing ${batchProgress.current}...`
                      : lang === "ar"
                        ? "اكتملت الدفعة"
                        : "Batch Completed"}
                  </span>
                  <span className="text-purple-300">
                    {batchProgress.done} / {batchProgress.total}
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
                  <div
                    className="h-full bg-purple-500 transition-all"
                    style={{
                      width: `${Math.round((batchProgress.done / Math.max(1, batchProgress.total)) * 100)}%`,
                    }}
                  />
                </div>
              </div>
            )}

            {batchLog.length > 0 && (
              <div className="space-y-1.5">
                {batchLog.map((item, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2 font-mono-num text-[11px]"
                  >
                    <span className="font-bold text-white">{item.symbol}</span>
                    <span className={`inline-flex items-center gap-1 ${item.ok ? "text-emerald-300" : "text-rose-300"}`}>
                      {item.ok && <CheckCircle2 className="h-3.5 w-3.5" />}
                      {item.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
