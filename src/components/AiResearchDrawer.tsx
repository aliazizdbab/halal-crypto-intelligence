"use client";

import React, { useState } from "react";
import { Bot, ExternalLink, Send, ShieldAlert, X } from "lucide-react";
import { useLanguage } from "./LanguageProvider";

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

export function AiResearchDrawer({ open, onClose, defaultSymbol }: AiResearchDrawerProps) {
  const { lang } = useLanguage();
  const [symbol, setSymbol] = useState(defaultSymbol || "");
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<AiMessage[]>([]);

  React.useEffect(() => {
    if (defaultSymbol) setSymbol(defaultSymbol);
  }, [defaultSymbol]);

  if (!open) return null;

  const quickPrompts =
    lang === "ar"
      ? [
          "لماذا هذه العملة مصنفة مباحة؟ وما هي الجهة المرجعية وهل يوجد خلاف فقهي؟",
          "هل التوكن تضخمي؟ وما هي مواعيد فك القفل القادمة ومخاطر التخفيف؟",
          "هل المشروع مفيد فعلاً وما الذي قد يؤدي إلى فشله؟",
          "ما هي أفضل العملات المباحة من حيث التوازن بين الموثوقية وفرص النمو؟",
        ]
      : [
          "Why is this token classified as Halal, which authority supports it, and are there conflicting opinions?",
          "Is the token inflationary and what are the upcoming unlocks and dilution risks?",
          "Is the project genuinely useful and what could cause it to fail?",
          "Which Halal Spot assets have the strongest combined credibility and growth scores?",
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
                {lang === "ar" ? "المساعد البحثي الشرعي والاستثماري" : "AI Shariah & Investment Researcher"}
              </h2>
              <p className="text-[11px] text-slate-400">
                {lang === "ar"
                  ? "مبني على بيانات المنصة ومصادرها الموثقة • ليس فتوى أو نصيحة مالية"
                  : "Grounded in verified platform records • Research opinion only"}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-800 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Context Symbol Bar */}
        <div className="flex items-center gap-2 border-b border-slate-800/80 bg-slate-900/50 px-4 py-2 text-xs">
          <span className="text-slate-400">
            {lang === "ar" ? "العملة المستهدفة (اختياري):" : "Focus Asset (optional):"}
          </span>
          <input
            value={symbol}
            onChange={(e) => setSymbol(e.target.value.toUpperCase())}
            placeholder="BTC, XLM, SOL, LINK..."
            className="w-36 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs font-mono-num text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
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
                  ? "لا يختلق المساعد أي فتوى أو تقييم أو شراكة؛ جميع الإجابات مرتبطة بسجل البيانات الموثّق ومصادره."
                  : "Never fabricates fatwas, partnerships, or scores. Every claim is linked to verified records or explicitly marked unverified."}
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
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 text-xs text-slate-400 animate-pulse">
              {lang === "ar" ? "جاري فحص السجلات والمصادر..." : "Analyzing verified records & sources..."}
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
                  ? "اسأل عن الحكم الشرعي، التضخم، المخاطر، أو المقارنة..."
                  : "Ask about Shariah ruling, unlocks, risks, or valuation..."
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
      </div>
    </div>
  );
}
