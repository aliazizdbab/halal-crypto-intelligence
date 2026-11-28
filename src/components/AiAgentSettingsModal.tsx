"use client";

import React, { useEffect, useState } from "react";
import { CheckCircle2, Cpu, Eye, EyeOff, KeyRound, Loader2, PlugZap, Server, X } from "lucide-react";
import type { AiAgentSettings, AiProviderType } from "@/types/domain";
import { useLanguage } from "./LanguageProvider";

interface ProviderMeta {
  labelAr: string;
  labelEn: string;
  defaultModel: string;
  defaultBaseUrl: string;
  requiresKey: boolean;
}

const FALLBACK_PROVIDERS: Record<AiProviderType, ProviderMeta> = {
  gemini: {
    labelAr: "Google Gemini API",
    labelEn: "Google Gemini API",
    defaultModel: "gemini-2.5-flash",
    defaultBaseUrl: "https://generativelanguage.googleapis.com",
    requiresKey: true,
  },
  openai: {
    labelAr: "OpenAI (GPT-4o / o3-mini)",
    labelEn: "OpenAI API",
    defaultModel: "gpt-4o-mini",
    defaultBaseUrl: "https://api.openai.com/v1",
    requiresKey: true,
  },
  deepseek: {
    labelAr: "DeepSeek (V3 / R1)",
    labelEn: "DeepSeek API",
    defaultModel: "deepseek-chat",
    defaultBaseUrl: "https://api.deepseek.com/v1",
    requiresKey: true,
  },
  openrouter: {
    labelAr: "OpenRouter (كل النماذج)",
    labelEn: "OpenRouter (Multi-Model)",
    defaultModel: "google/gemini-2.5-flash",
    defaultBaseUrl: "https://openrouter.ai/api/v1",
    requiresKey: true,
  },
  anthropic: {
    labelAr: "Anthropic Claude",
    labelEn: "Anthropic Claude API",
    defaultModel: "claude-3-5-haiku-latest",
    defaultBaseUrl: "https://api.anthropic.com/v1",
    requiresKey: true,
  },
  ollama: {
    labelAr: "Ollama (محلي على جهازك)",
    labelEn: "Ollama (Local LLM)",
    defaultModel: "llama3.1",
    defaultBaseUrl: "http://localhost:11434",
    requiresKey: false,
  },
  lmstudio: {
    labelAr: "LM Studio (خادم محلي)",
    labelEn: "LM Studio (Local Server)",
    defaultModel: "local-model",
    defaultBaseUrl: "http://localhost:1234/v1",
    requiresKey: false,
  },
  custom_webhook: {
    labelAr: "وكيل خارجي / Webhook (n8n أو OpenAI URL)",
    labelEn: "Custom AI Agent / Webhook",
    defaultModel: "custom-agent",
    defaultBaseUrl: "",
    requiresKey: false,
  },
  builtin_heuristic: {
    labelAr: "المحلل الكمي المدمج (بدون مفتاح API خارجي)",
    labelEn: "Built-in Quantitative & Metadata Analyzer",
    defaultModel: "hci-evidence-v1.1",
    defaultBaseUrl: "",
    requiresKey: false,
  },
};

interface AiAgentSettingsModalProps {
  open: boolean;
  onClose: () => void;
  onSaved?: (settings: AiAgentSettings) => void;
}

export function AiAgentSettingsModal({ open, onClose, onSaved }: AiAgentSettingsModalProps) {
  const { lang } = useLanguage();
  const [provider, setProvider] = useState<AiProviderType>("gemini");
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [baseUrl, setBaseUrl] = useState("https://generativelanguage.googleapis.com");
  const [model, setModel] = useState("gemini-2.5-flash");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [customHeadersJson, setCustomHeadersJson] = useState("");
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    message: string;
    latencyMs?: number;
  } | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setTestResult(null);
    fetch("/api/ai/settings")
      .then((r) => r.json())
      .then((data) => {
        if (data.ok && data.settings) {
          const s: AiAgentSettings = data.settings;
          setProvider(s.provider);
          setApiKey(s.apiKey || "");
          setBaseUrl(s.baseUrl || FALLBACK_PROVIDERS[s.provider]?.defaultBaseUrl || "");
          setModel(s.model || FALLBACK_PROVIDERS[s.provider]?.defaultModel || "");
          setWebhookUrl(s.webhookUrl || "");
          setCustomHeadersJson(s.customHeadersJson || "");
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open]);

  if (!open) return null;

  function handleSelectProvider(next: AiProviderType) {
    setProvider(next);
    const meta = FALLBACK_PROVIDERS[next];
    setBaseUrl(meta.defaultBaseUrl);
    setModel(meta.defaultModel);
    setTestResult(null);
  }

  async function handleTestConnection() {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/ai/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "test",
          settings: { provider, apiKey, baseUrl, model, webhookUrl, customHeadersJson },
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setTestResult({
          ok: true,
          latencyMs: data.latencyMs,
          message:
            lang === "ar"
              ? `نجح الاتصال بـ ${data.provider} (${data.latencyMs}ms): ${data.preview || ""}`
              : `Connected to ${data.provider} (${data.latencyMs}ms): ${data.preview || ""}`,
        });
      } else {
        setTestResult({
          ok: false,
          message: data.error || (lang === "ar" ? "فشل اختبار الاتصال" : "Connection test failed"),
        });
      }
    } catch {
      setTestResult({
        ok: false,
        message: lang === "ar" ? "تعذر الوصول إلى نقطة الفحص" : "Network error testing AI connection",
      });
    } finally {
      setTesting(false);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/ai/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save",
          settings: { provider, apiKey, baseUrl, model, webhookUrl, customHeadersJson },
        }),
      });
      const data = await res.json();
      if (data.ok) {
        onSaved?.(data.settings);
        onClose();
      } else {
        setTestResult({ ok: false, message: data.error || "Failed to save settings" });
      }
    } catch {
      setTestResult({ ok: false, message: "Network error while saving settings" });
    } finally {
      setSaving(false);
    }
  }

  const activeMeta = FALLBACK_PROVIDERS[provider];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-xs">
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-indigo-500/35 bg-[#0b1120] p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-indigo-500/40 bg-indigo-500/15 text-indigo-300">
              <PlugZap className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">
                {lang === "ar"
                  ? "ربط وإعداد وكيل الذكاء الاصطناعي (AI Agent)"
                  : "Universal AI Agent Connection & Settings"}
              </h2>
              <p className="text-[11px] text-slate-400">
                {lang === "ar"
                  ? "اربط Gemini أو OpenAI أو DeepSeek أو OpenRouter أو Claude أو Ollama المحلي أو Webhook خارجي لتحليل العملات فوراً"
                  : "Connect cloud LLMs, local Ollama/LM Studio, or custom n8n/OpenAI webhooks for 1-click coin screening"}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {loading ? (
          <div className="py-10 text-center text-xs text-slate-400">
            {lang === "ar" ? "جاري قراءة إعدادات الوكيل..." : "Loading AI Agent configuration..."}
          </div>
        ) : (
          <form onSubmit={handleSave} className="space-y-4 text-xs">
            {/* Provider Grid */}
            <div>
              <label className="mb-1.5 block font-semibold text-slate-200">
                {lang === "ar" ? "1. اختر مزود أو وكيل الذكاء الاصطناعي:" : "1. Select AI Provider / Agent:"}
              </label>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {(Object.keys(FALLBACK_PROVIDERS) as AiProviderType[]).map((key) => {
                  const m = FALLBACK_PROVIDERS[key];
                  const selected = provider === key;
                  return (
                    <button
                      type="button"
                      key={key}
                      onClick={() => handleSelectProvider(key)}
                      className={`flex flex-col items-start rounded-xl border p-2.5 text-start transition ${
                        selected
                          ? "border-indigo-500 bg-indigo-500/20 text-white shadow"
                          : "border-slate-800 bg-slate-950/70 text-slate-300 hover:border-slate-700 hover:bg-slate-900"
                      }`}
                    >
                      <span className="font-bold">{lang === "ar" ? m.labelAr : m.labelEn}</span>
                      <span className="mt-0.5 font-mono-num text-[10px] text-slate-400">
                        {m.defaultModel}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {provider !== "builtin_heuristic" && (
              <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-950/60 p-3.5">
                {/* API Key */}
                <div>
                  <label className="mb-1 flex items-center gap-1.5 text-slate-300">
                    <KeyRound className="h-3.5 w-3.5 text-amber-400" />
                    <span>
                      {lang === "ar" ? "مفتاح الـ API (API Key)" : "API Key / Bearer Token"}
                      {activeMeta.requiresKey ? " *" : lang === "ar" ? " (اختياري)" : " (Optional)"}
                    </span>
                  </label>
                  <div className="relative">
                    <input
                      type={showKey ? "text" : "password"}
                      dir="ltr"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder={
                        provider === "gemini"
                          ? "AIzaSy..."
                          : provider === "anthropic"
                            ? "sk-ant-..."
                            : "sk-..."
                      }
                      className="w-full rounded-lg border border-slate-700 bg-slate-950 py-2 pe-9 ps-3 font-mono text-xs text-white placeholder-slate-600 focus:border-indigo-500 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowKey((v) => !v)}
                      className="absolute end-2.5 top-2 text-slate-400 hover:text-white"
                    >
                      {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <p className="mt-1 text-[10px] text-slate-500">
                    {lang === "ar"
                      ? "يُحفظ المفتاح محلياً فقط في قاعدة بيانات جهازك ولا يُرسل لأي طرف ثالث غير المزود المختار."
                      : "Stored strictly in your local SQLite database; never transmitted except to your chosen provider."}
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 flex items-center gap-1.5 text-slate-300">
                      <Cpu className="h-3.5 w-3.5 text-emerald-400" />
                      {lang === "ar" ? "اسم النموذج (Model Name)" : "Model Name"}
                    </label>
                    <input
                      dir="ltr"
                      value={model}
                      onChange={(e) => setModel(e.target.value)}
                      placeholder={activeMeta.defaultModel}
                      className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-xs text-white"
                    />
                  </div>

                  <div>
                    <label className="mb-1 flex items-center gap-1.5 text-slate-300">
                      <Server className="h-3.5 w-3.5 text-sky-400" />
                      {provider === "custom_webhook"
                        ? lang === "ar"
                          ? "رابط الوكيل / Webhook URL *"
                          : "Agent / Webhook Endpoint URL *"
                        : lang === "ar"
                          ? "عنوان الخادم الأساسي (Base URL)"
                          : "API Base URL"}
                    </label>
                    <input
                      dir="ltr"
                      value={provider === "custom_webhook" ? webhookUrl || baseUrl : baseUrl}
                      onChange={(e) => {
                        if (provider === "custom_webhook") {
                          setWebhookUrl(e.target.value);
                          setBaseUrl(e.target.value);
                        } else {
                          setBaseUrl(e.target.value);
                        }
                      }}
                      placeholder={
                        provider === "custom_webhook"
                          ? "https://your-n8n-or-agent.example/webhook/crypto"
                          : activeMeta.defaultBaseUrl
                      }
                      className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-xs text-white"
                    />
                  </div>
                </div>

                {provider === "custom_webhook" && (
                  <div>
                    <label className="mb-1 block text-slate-300">
                      {lang === "ar"
                        ? "ترويسات HTTP إضافية بصيغة JSON (اختياري)"
                        : "Custom HTTP Headers JSON (Optional)"}
                    </label>
                    <input
                      dir="ltr"
                      value={customHeadersJson}
                      onChange={(e) => setCustomHeadersJson(e.target.value)}
                      placeholder='{"X-Custom-Auth": "secret"}'
                      className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-xs text-slate-200"
                    />
                  </div>
                )}
              </div>
            )}

            {testResult && (
              <div
                className={`flex items-start gap-2 rounded-xl border p-3 text-xs ${
                  testResult.ok
                    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
                    : "border-rose-500/40 bg-rose-500/10 text-rose-200"
                }`}
              >
                {testResult.ok && <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />}
                <span className="leading-relaxed">{testResult.message}</span>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-800 pt-3">
              <button
                type="button"
                onClick={handleTestConnection}
                disabled={testing}
                className="inline-flex items-center gap-1.5 rounded-lg border border-sky-500/40 bg-sky-500/15 px-3.5 py-2 font-semibold text-sky-200 transition hover:bg-sky-500/25 disabled:opacity-50"
              >
                {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PlugZap className="h-3.5 w-3.5" />}
                {lang === "ar" ? "اختبار الاتصال الآن" : "Test Connection"}
              </button>

              <div className="flex items-center gap-2">
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
                  className="rounded-lg bg-indigo-600 px-4 py-2 font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50"
                >
                  {saving
                    ? lang === "ar"
                      ? "جاري الحفظ..."
                      : "Saving..."
                    : lang === "ar"
                      ? "حفظ وتفعيل الوكيل"
                      : "Save & Activate Agent"}
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
