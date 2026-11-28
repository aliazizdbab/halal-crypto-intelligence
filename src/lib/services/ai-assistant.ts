import {
  getAssetDetail,
  getDirectoryAssets,
  upsertFullAiAssetAnalysis,
  type AssetFullDetail,
  type FullAiAssetAnalysisPayload,
} from "./repository";
import { fetchAssetOrderBookLiquidity } from "./liquidity";
import { getSetting, setSetting } from "@/lib/db/client";
import type {
  AiAgentSettings,
  AiProviderType,
  CredibilityFactorKey,
  RiskLevel,
  ShariahClassification,
} from "@/types/domain";

export interface AiResearchRequest {
  question: string;
  symbol?: string;
  lang?: "ar" | "en";
}

export interface AiResearchResponse {
  answer: string;
  mode: string;
  symbolAnalyzed: string | null;
  disclaimer: string;
  citations: Array<{ label: string; url: string | null }>;
  generatedAt: string;
}

export const AI_PROVIDER_DEFAULTS: Record<
  AiProviderType,
  { labelAr: string; labelEn: string; defaultModel: string; defaultBaseUrl: string; requiresKey: boolean }
> = {
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
    labelAr: "LM Studio (محلي OpenAI-Compatible)",
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
    labelEn: "Built-in Quantitative & Metadata Analyzer (No API Key)",
    defaultModel: "hci-evidence-v1.1",
    defaultBaseUrl: "",
    requiresKey: false,
  },
};

export function maskSecretKey(raw: string): string {
  if (!raw || raw.length < 6) return raw ? "••••••••" : "";
  return `••••••••${raw.slice(-4)}`;
}

export function getAiAgentSettings(includeRawKey = false): AiAgentSettings {
  const rawProvider = (
    getSetting("ai_provider", process.env.AI_PROVIDER || "gemini") || "gemini"
  ).toLowerCase() as AiProviderType;
  const provider: AiProviderType = AI_PROVIDER_DEFAULTS[rawProvider] ? rawProvider : "gemini";
  const def = AI_PROVIDER_DEFAULTS[provider];

  const envFallbackKey =
    provider === "gemini"
      ? process.env.GEMINI_API_KEY || ""
      : provider === "openai"
        ? process.env.OPENAI_API_KEY || ""
        : "";

  const storedKey = getSetting("ai_api_key", "") || envFallbackKey;
  const storedBaseUrl =
    getSetting("ai_base_url", "") ||
    (provider === "ollama" ? process.env.OLLAMA_BASE_URL || def.defaultBaseUrl : def.defaultBaseUrl);
  const storedModel =
    getSetting("ai_model", "") ||
    (provider === "gemini"
      ? process.env.GEMINI_MODEL || def.defaultModel
      : provider === "openai"
        ? process.env.OPENAI_MODEL || def.defaultModel
        : provider === "ollama"
          ? process.env.OLLAMA_MODEL || def.defaultModel
          : def.defaultModel);

  return {
    provider,
    apiKey: includeRawKey ? storedKey : maskSecretKey(storedKey),
    hasApiKey: Boolean(storedKey),
    baseUrl: storedBaseUrl,
    model: storedModel,
    webhookUrl: getSetting("ai_webhook_url", ""),
    customHeadersJson: getSetting("ai_custom_headers", ""),
    autoAnalyzeOnSync: getSetting("ai_auto_analyze", "false") === "true",
  };
}

export function saveAiAgentSettings(input: Partial<AiAgentSettings>): AiAgentSettings {
  if (input.provider && AI_PROVIDER_DEFAULTS[input.provider]) {
    setSetting("ai_provider", input.provider);
  }
  if (typeof input.apiKey === "string") {
    const trimmed = input.apiKey.trim();
    // Ignore masked placeholder so saving model/url does not wipe an existing key
    if (!trimmed.startsWith("••••")) {
      setSetting("ai_api_key", trimmed);
    }
  }
  if (typeof input.baseUrl === "string") {
    setSetting("ai_base_url", input.baseUrl.trim());
  }
  if (typeof input.model === "string") {
    setSetting("ai_model", input.model.trim());
  }
  if (typeof input.webhookUrl === "string") {
    setSetting("ai_webhook_url", input.webhookUrl.trim());
  }
  if (typeof input.customHeadersJson === "string") {
    setSetting("ai_custom_headers", input.customHeadersJson.trim());
  }
  if (typeof input.autoAnalyzeOnSync === "boolean") {
    setSetting("ai_auto_analyze", input.autoAnalyzeOnSync ? "true" : "false");
  }
  return getAiAgentSettings(false);
}

export function isExternalAiReady(settings: AiAgentSettings): boolean {
  if (settings.provider === "builtin_heuristic") return true;
  if (settings.provider === "ollama" || settings.provider === "lmstudio") {
    return Boolean(settings.baseUrl);
  }
  if (settings.provider === "custom_webhook") {
    return Boolean(settings.webhookUrl || settings.baseUrl);
  }
  return Boolean(settings.apiKey);
}

export async function callConnectedAiAgent(params: {
  systemPrompt: string;
  userPrompt: string;
  jsonMode?: boolean;
  maxTokens?: number;
  overrideSettings?: Partial<AiAgentSettings>;
}): Promise<{ text: string; providerLabel: string }> {
  const base = getAiAgentSettings(true);
  const cfg: AiAgentSettings = {
    ...base,
    ...params.overrideSettings,
    apiKey:
      params.overrideSettings?.apiKey && !params.overrideSettings.apiKey.startsWith("••••")
        ? params.overrideSettings.apiKey
        : base.apiKey,
  };

  const def = AI_PROVIDER_DEFAULTS[cfg.provider] || AI_PROVIDER_DEFAULTS.gemini;
  const model = cfg.model || def.defaultModel;
  const baseUrl = (cfg.baseUrl || def.defaultBaseUrl).replace(/\/+$/, "");
  const maxTokens = params.maxTokens || 1800;

  let extraHeaders: Record<string, string> = {};
  if (cfg.customHeadersJson) {
    try {
      extraHeaders = JSON.parse(cfg.customHeadersJson) as Record<string, string>;
    } catch {
      extraHeaders = {};
    }
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 35_000);

  try {
    // 1. Google Gemini API
    if (cfg.provider === "gemini") {
      if (!cfg.apiKey) throw new Error("Gemini API Key is not configured");
      const url = `${baseUrl}/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(cfg.apiKey)}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...extraHeaders },
        signal: controller.signal,
        body: JSON.stringify({
          system_instruction: { parts: [{ text: params.systemPrompt }] },
          contents: [{ role: "user", parts: [{ text: params.userPrompt }] }],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: maxTokens,
            ...(params.jsonMode ? { responseMimeType: "application/json" } : {}),
          },
        }),
      });
      if (!res.ok) {
        const errBody = await res.text().catch(() => "");
        throw new Error(`Gemini HTTP ${res.status}: ${errBody.slice(0, 180)}`);
      }
      const json = (await res.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };
      const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) throw new Error("Empty response from Gemini");
      return { text, providerLabel: `Gemini (${model})` };
    }

    // 2. Anthropic Claude API
    if (cfg.provider === "anthropic") {
      if (!cfg.apiKey) throw new Error("Anthropic API Key is not configured");
      const url = `${baseUrl}/messages`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": cfg.apiKey,
          "anthropic-version": "2023-06-01",
          ...extraHeaders,
        },
        signal: controller.signal,
        body: JSON.stringify({
          model,
          max_tokens: maxTokens,
          temperature: 0.2,
          system: params.systemPrompt,
          messages: [{ role: "user", content: params.userPrompt }],
        }),
      });
      if (!res.ok) {
        const errBody = await res.text().catch(() => "");
        throw new Error(`Anthropic HTTP ${res.status}: ${errBody.slice(0, 180)}`);
      }
      const json = (await res.json()) as { content?: Array<{ text?: string }> };
      const text = json.content?.[0]?.text;
      if (!text) throw new Error("Empty response from Claude");
      return { text, providerLabel: `Claude (${model})` };
    }

    // 3. Ollama Native Local API
    if (cfg.provider === "ollama") {
      const url = `${baseUrl}/api/chat`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...extraHeaders },
        signal: controller.signal,
        body: JSON.stringify({
          model,
          stream: false,
          ...(params.jsonMode ? { format: "json" } : {}),
          messages: [
            { role: "system", content: params.systemPrompt },
            { role: "user", content: params.userPrompt },
          ],
        }),
      });
      if (!res.ok) throw new Error(`Ollama HTTP ${res.status} at ${baseUrl}`);
      const json = (await res.json()) as { message?: { content?: string } };
      const text = json.message?.content;
      if (!text) throw new Error("Empty response from Ollama");
      return { text, providerLabel: `Ollama (${model})` };
    }

    // 4. Custom Agent / Webhook (supports n8n/Make JSON webhooks AND OpenAI-compatible endpoints)
    if (cfg.provider === "custom_webhook") {
      const targetUrl = (cfg.webhookUrl || cfg.baseUrl).trim();
      if (!targetUrl) throw new Error("Custom Agent / Webhook URL is missing");
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...extraHeaders,
      };
      if (cfg.apiKey) {
        headers.Authorization = `Bearer ${cfg.apiKey}`;
      }

      const isOpenAiStyle = /\/chat\/completions\/?$/i.test(targetUrl) || /\/v1\/?$/i.test(targetUrl);
      const finalUrl = /\/v1\/?$/i.test(targetUrl)
        ? `${targetUrl.replace(/\/+$/, "")}/chat/completions`
        : targetUrl;

      const body = isOpenAiStyle
        ? {
            model,
            temperature: 0.2,
            messages: [
              { role: "system", content: params.systemPrompt },
              { role: "user", content: params.userPrompt },
            ],
          }
        : {
            model,
            systemPrompt: params.systemPrompt,
            prompt: params.userPrompt,
            question: params.userPrompt,
            jsonMode: Boolean(params.jsonMode),
          };

      const res = await fetch(finalUrl, {
        method: "POST",
        headers,
        signal: controller.signal,
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const errBody = await res.text().catch(() => "");
        throw new Error(`Webhook HTTP ${res.status}: ${errBody.slice(0, 180)}`);
      }
      const rawText = await res.text();
      try {
        const parsed = JSON.parse(rawText) as Record<string, unknown>;
        const openAiMsg = (parsed as { choices?: Array<{ message?: { content?: string } }> }).choices?.[0]?.message
          ?.content;
        const candidate =
          openAiMsg ||
          (typeof parsed.output === "string" && parsed.output) ||
          (typeof parsed.answer === "string" && parsed.answer) ||
          (typeof parsed.response === "string" && parsed.response) ||
          (typeof parsed.text === "string" && parsed.text) ||
          (typeof parsed.message === "string" && parsed.message) ||
          (params.jsonMode ? rawText : JSON.stringify(parsed));
        return { text: candidate, providerLabel: `Custom Agent (${model})` };
      } catch {
        return { text: rawText, providerLabel: `Custom Agent (${model})` };
      }
    }

    // 5. OpenAI-Compatible Providers: OpenAI, DeepSeek, OpenRouter, LM Studio
    if (def.requiresKey && !cfg.apiKey) {
      throw new Error(`${def.labelEn} API Key is not configured`);
    }
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...extraHeaders,
    };
    if (cfg.apiKey) {
      headers.Authorization = `Bearer ${cfg.apiKey}`;
    }
    if (cfg.provider === "openrouter") {
      headers["HTTP-Referer"] = "https://halal-crypto-intelligence.local";
      headers["X-Title"] = "Halal Crypto Intelligence";
    }

    const endpoint = baseUrl.endsWith("/chat/completions") ? baseUrl : `${baseUrl}/chat/completions`;
    const res = await fetch(endpoint, {
      method: "POST",
      headers,
      signal: controller.signal,
      body: JSON.stringify({
        model,
        temperature: 0.2,
        max_tokens: maxTokens,
        ...(params.jsonMode && cfg.provider !== "lmstudio"
          ? { response_format: { type: "json_object" } }
          : {}),
        messages: [
          { role: "system", content: params.systemPrompt },
          { role: "user", content: params.userPrompt },
        ],
      }),
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      throw new Error(`${cfg.provider.toUpperCase()} HTTP ${res.status}: ${errBody.slice(0, 180)}`);
    }
    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = json.choices?.[0]?.message?.content;
    if (!text) throw new Error(`Empty response from ${cfg.provider}`);
    return { text, providerLabel: `${cfg.provider.toUpperCase()} (${model})` };
  } finally {
    clearTimeout(timer);
  }
}

export async function testAiAgentConnection(override?: Partial<AiAgentSettings>): Promise<{
  ok: boolean;
  provider: string;
  model: string;
  latencyMs: number;
  preview?: string;
  error?: string;
}> {
  const start = Date.now();
  const merged = { ...getAiAgentSettings(true), ...override };
  if (merged.provider === "builtin_heuristic") {
    return {
      ok: true,
      provider: "builtin_heuristic",
      model: "hci-evidence-v1.1",
      latencyMs: 5,
      preview: "المحلل الكمي المدمج جاهز للعمل محلياً دون الحاجة لمفتاح خارجي.",
    };
  }
  try {
    const res = await callConnectedAiAgent({
      systemPrompt: "You are a connectivity check assistant. Reply concisely in one short sentence.",
      userPrompt: "Confirm connection is active by replying: AI Agent Connected Successfully.",
      maxTokens: 60,
      overrideSettings: override,
    });
    return {
      ok: true,
      provider: res.providerLabel,
      model: merged.model,
      latencyMs: Date.now() - start,
      preview: res.text.slice(0, 160),
    };
  } catch (err) {
    return {
      ok: false,
      provider: merged.provider,
      model: merged.model,
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : "Connection test failed",
    };
  }
}

function fmtUsd(val: number | null): string {
  if (val === null || !Number.isFinite(val)) return "DATA UNAVAILABLE";
  if (val >= 1e9) return `$${(val / 1e9).toFixed(2)}B`;
  if (val >= 1e6) return `$${(val / 1e6).toFixed(2)}M`;
  if (val >= 1) return `$${val.toLocaleString("en-US", { maximumFractionDigits: 4 })}`;
  return `$${val.toFixed(6)}`;
}

function buildDeterministicAnswer(
  question: string,
  symbol: string | undefined,
  lang: "ar" | "en",
  liquiditySummary?: string | null
): { answer: string; symbolAnalyzed: string | null; citations: Array<{ label: string; url: string | null }> } {
  const q = question.toLowerCase();
  const citations: Array<{ label: string; url: string | null }> = [];

  let targetSymbol = symbol?.toUpperCase();
  if (!targetSymbol) {
    const dir = getDirectoryAssets({ classifications: "ALL", pageSize: 150 });
    for (const row of dir.rows) {
      const base = row.baseAsset.toLowerCase();
      const name = row.name.toLowerCase();
      if (new RegExp(`\\b${base}\\b`, "i").test(q) || (name.length >= 4 && q.includes(name))) {
        targetSymbol = row.symbol;
        break;
      }
    }
  }

  if (!targetSymbol) {
    const halalTop = getDirectoryAssets({
      classifications: ["HALAL", "HALAL_WITH_CONDITIONS"],
      sort: "combined_desc",
      pageSize: 8,
    });
    const lowPrice = getDirectoryAssets({
      classifications: ["HALAL", "HALAL_WITH_CONDITIONS"],
      sort: "price_asc",
      pageSize: 5,
    });

    citations.push({ label: "Binance & Bybit Spot Public APIs", url: "https://www.binance.com/en/markets/overview" });
    citations.push({ label: "Verified Shariah Registry (Local Auditable DB)", url: null });

    if (lang === "ar") {
      const topLines = halalTop.rows
        .map(
          (r, i) =>
            `${i + 1}. **${r.name} (${r.baseAsset})** [${(r.exchanges || ["BINANCE"]).join("+")}] — السعر: ${fmtUsd(r.priceUsdt)} | القيمة السوقية: ${fmtUsd(r.marketCap)} | الموثوقية: ${r.credibilityScore ?? "غير متوفر"}/100 | فرص النمو: ${r.investmentPotentialScore ?? "غير متوفر"}/100 | التصنيف: \`${r.shariahClassification}\``
        )
        .join("\n");

      const cheapLines = lowPrice.rows
        .map((r) => `- **${r.baseAsset}**: ${fmtUsd(r.priceUsdt)} (القيمة السوقية: ${fmtUsd(r.marketCap)})`)
        .join("\n");

      return {
        symbolAnalyzed: null,
        citations,
        answer: `### ملخص بحثي مبني على بيانات المنصة الموثّقة (Binance + Bybit Spot)\n\n**أعلى العملات المباحة / المباحة بشروط وفق التقييم البحثي المدمج (الموثوقية + فرص النمو):**\n${topLines}\n\n**أقل العملات سعراً للوحدة حالياً (مع تنبيه مهم):**\n${cheapLines}\n\n> **ملاحظة استثمارية حاسمة:** انخفاض سعر الوحدة لا يعني أن المشروع "رخيص" استثمارياً؛ يجب مقارنة **القيمة السوقية (Market Cap)** و**التقييم المخفف بالكامل (FDV)** ونسبة التضخم.\n\nيمكنك تحديد اسم أو رمز أي عملة (مثل \`BTC\`, \`XLM\`, \`KAS\`, \`SOL\`, \`LINK\`, \`ARB\`) للحصول على تقرير شرعي وسيولة أوامر البيع والشراء وتوكنوميكس مفصّل.`,
      };
    }

    const topLinesEn = halalTop.rows
      .map(
        (r, i) =>
          `${i + 1}. **${r.name} (${r.baseAsset})** [${(r.exchanges || ["BINANCE"]).join("+")}] — Price: ${fmtUsd(r.priceUsdt)} | MCap: ${fmtUsd(r.marketCap)} | Credibility: ${r.credibilityScore ?? "N/A"}/100 | Growth: ${r.investmentPotentialScore ?? "N/A"}/100 | Shariah: \`${r.shariahClassification}\``
      )
      .join("\n");

    return {
      symbolAnalyzed: null,
      citations,
      answer: `### Evidence-Backed Platform Research Summary (Binance + Bybit Spot)\n\n**Highest Combined Research Rating (Halal / Conditional Halal Spot Assets):**\n${topLinesEn}\n\n> **Valuation Note:** A low token unit price does **not** mean an asset is undervalued. Always compare **Market Capitalization**, **FDV**, and **supply dilution**.\n\nSpecify any asset symbol (e.g., \`BTC\`, \`XLM\`, \`KAS\`, \`HBAR\`, \`LINK\`, \`ARB\`) for an evidence-cited Shariah, order-book liquidity walls, tokenomics, and risk breakdown.`,
    };
  }

  const detail = getAssetDetail(targetSymbol);
  if (!detail) {
    return {
      symbolAnalyzed: targetSymbol,
      citations,
      answer:
        lang === "ar"
          ? `البيانات غير متوفرة حالياً للرمز \`${targetSymbol}\` في سجل Spot المحلي. يرجى الضغط على "مزامنة الأسواق" أولاً.`
          : `DATA UNAVAILABLE – REQUIRES VERIFICATION for \`${targetSymbol}\`. Please run Spot Market Sync first.`,
    };
  }

  const { overview, shariah, credibility, tokenomics, scenarios, investmentPotential } = detail;
  if (shariah.sourceUrl) citations.push({ label: `Shariah Source: ${shariah.authorityName}`, url: shariah.sourceUrl });
  if (overview.officialWebsite) citations.push({ label: `${overview.name} Official Website`, url: overview.officialWebsite });
  if (tokenomics.sourceUrl) citations.push({ label: `Tokenomics: ${tokenomics.sourceName}`, url: tokenomics.sourceUrl });
  if (overview.exchanges?.includes("BINANCE")) {
    citations.push({ label: `Binance Spot (${overview.symbol})`, url: overview.binanceSpotUrl });
  }
  if (overview.exchanges?.includes("BYBIT") && overview.bybitSpotUrl) {
    citations.push({ label: `Bybit Spot (${overview.symbol})`, url: overview.bybitSpotUrl });
  }

  const askShariah = /halal|shariah|fatwa|scholar|haram|riba|حلال|شرع|فتو|خلاف|مباح|حكم/.test(q);
  const askTokenomics = /inflat|unlock|supply|fdv|overvalu|tokenomic|dilut|تضخم|فك القفل|معروض|تقييم|توكنوميكس/.test(q);
  const askLiquidity = /liquid|wall|order|book|bid|ask|buy|sell|سيول|جدار|جدران|أوامر|اوامر|شراء|بيع|عمق/.test(q);
  const askRisk = /fail|risk|bear|compet|مخاطر|فشل|منافس|متشائم/.test(q);
  const askGrowth = /grow|bull|thesis|useful|utility|نجاح|نمو|منفعة|متفائل/.test(q);
  const showAll = !askShariah && !askTokenomics && !askLiquidity && !askRisk && !askGrowth;

  const sections: string[] = [];
  const bear = scenarios.find((s) => s.scenarioType === "BEARISH");
  const base = scenarios.find((s) => s.scenarioType === "BASE");
  const bull = scenarios.find((s) => s.scenarioType === "BULLISH");
  const venuesStr = (overview.exchanges || ["BINANCE"]).join(" + ");

  if (lang === "ar") {
    sections.push(
      `### التقرير البحثي الموثّق: ${overview.name} (${overview.symbol}) — [${venuesStr}]\n- **السعر الحالي (Spot):** ${fmtUsd(overview.priceUsdt)} (تغير 24س: ${overview.priceChangePct24h !== null ? `${overview.priceChangePct24h.toFixed(2)}%` : "غير متوفر"})\n- **القيمة السوقية:** ${fmtUsd(overview.marketCap)} | **FDV:** ${fmtUsd(overview.fdv)} | **نسبة التخفيف:** ${overview.dilutionRatio ? `${overview.dilutionRatio}x` : "غير متوفر"}\n- **موثوقية المشروع:** ${credibility.score ?? "غير متوفر"}/100 (${credibility.confidence}) | **تقييم إمكانية النمو:** ${investmentPotential.score ?? "غير متوفر"}/100`
    );

    if (showAll || askShariah) {
      sections.push(
        `#### 1. التحليل الشرعي والمراجع\n- **التصنيف:** \`${shariah.classification}\` (${shariah.verificationStatus})\n- **الجهة المرجعية:** ${shariah.authorityName} (تاريخ التقييم: ${shariah.assessmentDate})\n- **المنهجية:** ${shariah.methodology}\n- **سبب الحكم:** ${shariah.coreActivityNotesAr}\n- **الشروط والتحفظات:** ${shariah.conditionsAr || "لا توجد شروط إضافية موثقة"}\n- **الخلافات الفقهية المعروفة:** ${shariah.scholarlyDisagreementsAr || "البيانات غير متوفرة – تتطلب تحققاً"}`
      );
    }

    if ((showAll || askLiquidity) && liquiditySummary) {
      sections.push(`#### 2. تحليل سيولة أوامر الشراء والبيع (Order Book Depth)\n- ${liquiditySummary}`);
    }

    if (showAll || askTokenomics) {
      sections.push(
        `#### 3. التوكنوميكس والتضخم والتقييم\n- **التضخم السنوي التقديري:** ${tokenomics.inflationRatePct !== null ? `${tokenomics.inflationRatePct}%` : "غير متوفر"}\n- **تخصيص المطلعين (الفريق + VC):** ${tokenomics.insiderAllocationPct !== null ? `${tokenomics.insiderAllocationPct}%` : "غير متوفر"}\n- **جدول فك القفل:** ${tokenomics.unlockScheduleSummaryAr}\n- **منفعة التوكن:** ${tokenomics.tokenUtilityAr}\n- **آلية الحرق:** ${tokenomics.burnMechanismAr}\n- **إشارات المخاطر:** ${tokenomics.riskFlags.length > 0 ? tokenomics.riskFlags.join("، ") : "لا توجد إشارات خطر مرتفعة حالياً"}`
      );
    }

    if (showAll || askGrowth) {
      sections.push(
        `#### 4. المنفعة وفرضية النمو (تقييم تحليلي وليس ضماناً)\n- **وصف المشروع:** ${overview.descriptionAr}\n- **السيناريو الأساسي:** ${base ? base.assumptionsAr : "البيانات غير متوفرة"}\n- **السيناريو المتفائل ومحفزاته:** ${bull ? `${bull.assumptionsAr} — المحفزات: ${bull.catalystsAr}` : "البيانات غير متوفرة"}`
      );
    }

    if (showAll || askRisk) {
      sections.push(
        `#### 5. المخاطر وأسباب الفشل المحتملة\n- **مستوى المخاطر العام:** \`${overview.overallRiskLevel}\` | **مخاطر التوكنوميكس:** \`${overview.tokenomicsRisk}\`\n- **السيناريو المتشائم:** ${bear ? bear.assumptionsAr : "البيانات غير متوفرة"}\n- **أبرز المخاطر:** ${bear ? bear.risksAr : "البيانات غير متوفرة"}`
      );
    }
  } else {
    sections.push(
      `### Evidence-Backed Research Dossier: ${overview.name} (${overview.symbol}) — [${venuesStr}]\n- **Live Spot Price:** ${fmtUsd(overview.priceUsdt)} (24h: ${overview.priceChangePct24h !== null ? `${overview.priceChangePct24h.toFixed(2)}%` : "N/A"})\n- **Market Cap:** ${fmtUsd(overview.marketCap)} | **FDV:** ${fmtUsd(overview.fdv)} | **Dilution Ratio:** ${overview.dilutionRatio ? `${overview.dilutionRatio}x` : "N/A"}\n- **Project Credibility:** ${credibility.score ?? "N/A"}/100 (${credibility.confidence}) | **Investment Potential:** ${investmentPotential.score ?? "N/A"}/100`
    );

    if (showAll || askShariah) {
      sections.push(
        `#### 1. Shariah Compliance & Sources\n- **Classification:** \`${shariah.classification}\` (${shariah.verificationStatus})\n- **Authority:** ${shariah.authorityName} (Date: ${shariah.assessmentDate})\n- **Methodology:** ${shariah.methodology}\n- **Rationale:** ${shariah.coreActivityNotesEn}\n- **Conditions:** ${shariah.conditionsEn || "None documented"}\n- **Scholarly Disagreements:** ${shariah.scholarlyDisagreementsEn || "DATA UNAVAILABLE – REQUIRES VERIFICATION"}`
      );
    }

    if ((showAll || askLiquidity) && liquiditySummary) {
      sections.push(`#### 2. Spot Order Book Buy/Sell Liquidity Walls\n- ${liquiditySummary}`);
    }

    if (showAll || askTokenomics) {
      sections.push(
        `#### 3. Tokenomics, Inflation & Unlocks\n- **Estimated Annual Inflation:** ${tokenomics.inflationRatePct !== null ? `${tokenomics.inflationRatePct}%` : "DATA UNAVAILABLE"}\n- **Insider Allocation:** ${tokenomics.insiderAllocationPct !== null ? `${tokenomics.insiderAllocationPct}%` : "DATA UNAVAILABLE"}\n- **Unlock Schedule:** ${tokenomics.unlockScheduleSummaryEn}\n- **Token Utility:** ${tokenomics.tokenUtilityEn}\n- **Risk Flags:** ${tokenomics.riskFlags.length > 0 ? tokenomics.riskFlags.join(", ") : "None flagged"}`
      );
    }

    if (showAll || askGrowth) {
      sections.push(
        `#### 4. Utility & Growth Thesis (Analytical Rating — Not Guaranteed)\n- **Overview:** ${overview.descriptionEn}\n- **Base Scenario:** ${base ? base.assumptionsEn : "DATA UNAVAILABLE"}\n- **Bullish Scenario:** ${bull ? `${bull.assumptionsEn} — Catalysts: ${bull.catalystsEn}` : "DATA UNAVAILABLE"}`
      );
    }

    if (showAll || askRisk) {
      sections.push(
        `#### 5. Risk Assessment & Failure Modes\n- **Overall Risk:** \`${overview.overallRiskLevel}\` | **Tokenomics Risk:** \`${overview.tokenomicsRisk}\`\n- **Bearish Scenario:** ${bear ? bear.assumptionsEn : "DATA UNAVAILABLE"}\n- **Key Risks:** ${bear ? bear.risksEn : "DATA UNAVAILABLE"}`
      );
    }
  }

  return {
    symbolAnalyzed: overview.symbol,
    citations,
    answer: sections.join("\n\n"),
  };
}

export async function runAiResearchQuery(req: AiResearchRequest): Promise<AiResearchResponse> {
  const lang = req.lang === "en" ? "en" : "ar";
  let liquiditySummary: string | null = null;

  if (req.symbol) {
    try {
      const liq = await fetchAssetOrderBookLiquidity(req.symbol, "COMBINED");
      if (liq.midPrice) {
        liquiditySummary = lang === "ar" ? liq.summaryAr : liq.summaryEn;
      }
    } catch {
      liquiditySummary = null;
    }
  }

  const deterministic = buildDeterministicAnswer(req.question, req.symbol, lang, liquiditySummary);

  const disclaimer =
    lang === "ar"
      ? "تنبيه: هذا المخرج رأي بحثي تحليلي مبني على بيانات المنصة ومصادرها، وليس فتوى شرعية رسمية ولا نصيحة استثمارية أو ضماناً للربح."
      : "Disclaimer: This output is an analytical research opinion grounded in platform records — NOT a formal Shariah fatwa and NOT guaranteed financial advice.";

  const settings = getAiAgentSettings(true);
  if (settings.provider !== "builtin_heuristic" && isExternalAiReady(settings)) {
    try {
      const systemInstruction = `You are an institutional cryptocurrency, order-book microstructure, and Islamic finance research assistant.
RULES:
1. Answer strictly in ${lang === "ar" ? "Arabic" : "English"}.
2. Base EVERY factual claim strictly on the Grounded Platform Data below. If information is missing, explicitly state "DATA UNAVAILABLE – REQUIRES VERIFICATION".
3. NEVER fabricate Shariah fatwas, partnerships, or guaranteed returns.
4. Clearly label your output as an analytical research opinion — NOT a formal fatwa and NOT financial advice.
5. Separate Shariah compliance from project fundamentals, order-book liquidity walls, and price performance.

GROUNDED PLATFORM DATA:
${deterministic.answer}`;

      const llmRes = await callConnectedAiAgent({
        systemPrompt: systemInstruction,
        userPrompt: req.question,
        maxTokens: 1300,
      });

      return {
        answer: llmRes.text,
        mode: llmRes.providerLabel,
        symbolAnalyzed: deterministic.symbolAnalyzed,
        disclaimer,
        citations: deterministic.citations,
        generatedAt: new Date().toISOString(),
      };
    } catch {
      // Gracefully fall back to deterministic evidence engine
    }
  }

  return {
    answer: deterministic.answer,
    mode: "EVIDENCE_ENGINE",
    symbolAnalyzed: deterministic.symbolAnalyzed,
    disclaimer,
    citations: deterministic.citations,
    generatedAt: new Date().toISOString(),
  };
}

// ============================================================================
// SINGLE & BATCH COIN AI ANALYZER (Inline Row Button + Batch Queue)
// ============================================================================

interface PublicCoinMetadata {
  name: string;
  description: string;
  tags: string[];
  website: string | null;
}

async function fetchPublicCoinMetadata(baseAsset: string): Promise<PublicCoinMetadata | null> {
  const upper = baseAsset.toUpperCase();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    // Search CoinGecko public search + coin detail or CoinPaprika search
    const searchRes = await fetch(
      `https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(upper)}`,
      { headers: { Accept: "application/json" }, signal: controller.signal, cache: "no-store" }
    );
    if (searchRes.ok) {
      const sJson = (await searchRes.json()) as {
        coins?: Array<{ id: string; name: string; symbol: string; market_cap_rank?: number | null }>;
      };
      const exact = (sJson.coins || [])
        .filter((c) => c.symbol.toUpperCase() === upper)
        .sort((a, b) => (a.market_cap_rank ?? 99999) - (b.market_cap_rank ?? 99999))[0];

      if (exact?.id) {
        const coinRes = await fetch(
          `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(exact.id)}?localization=false&tickers=false&market_data=false&community_data=false&developer_data=false`,
          { headers: { Accept: "application/json" }, signal: controller.signal, cache: "no-store" }
        );
        if (coinRes.ok) {
          const cJson = (await coinRes.json()) as {
            name?: string;
            categories?: string[];
            description?: { en?: string };
            links?: { homepage?: string[] };
          };
          clearTimeout(timer);
          return {
            name: cJson.name || exact.name || upper,
            description: (cJson.description?.en || "").replace(/<[^>]+>/g, "").slice(0, 1200),
            tags: (cJson.categories || []).filter(Boolean).slice(0, 8),
            website: cJson.links?.homepage?.find((h) => h && h.startsWith("http")) || null,
          };
        }
      }
    }
  } catch {
    // ignore metadata network errors; fallback to snapshot context
  } finally {
    clearTimeout(timer);
  }
  return null;
}

function extractFirstJsonObject(raw: string): Record<string, unknown> {
  const stripped = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  try {
    return JSON.parse(stripped) as Record<string, unknown>;
  } catch {
    const start = stripped.indexOf("{");
    const end = stripped.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(stripped.slice(start, end + 1)) as Record<string, unknown>;
    }
    throw new Error("AI response did not contain valid JSON");
  }
}

function buildHeuristicPayload(
  symbol: string,
  baseAsset: string,
  detail: AssetFullDetail | null,
  meta: PublicCoinMetadata | null
): FullAiAssetAnalysisPayload {
  const name = meta?.name || detail?.overview.name || baseAsset;
  const rawDesc = meta?.description || detail?.overview.descriptionEn || "";
  const tagsJoined = `${(meta?.tags || []).join(" ")} ${rawDesc}`.toLowerCase();

  let classification: ShariahClassification = "HALAL_WITH_CONDITIONS";
  let category = meta?.tags?.[0] || detail?.overview.category || "Spot Digital Asset";
  let notesEn =
    rawDesc.slice(0, 320) ||
    `${name} (${baseAsset}) is an active Spot cryptocurrency pair evaluated via public metadata & quantitative metrics.`;
  let notesAr = `تحليل آلي أولي لمشروع ${name} (${baseAsset}) بناءً على البيانات الوصفية العامة والمؤشرات الكمية للتداول الفوري.`;
  const riskFlags: string[] = [];

  if (/\b(lending|borrow|interest|yield-bearing|treasury bill|usdy|riba|money market|cdp)\b/i.test(tagsJoined)) {
    classification = "NON_COMPLIANT";
    category = "DeFi Lending / Interest Yield";
    notesEn = `Flagged NON_COMPLIANT by automated keyword & category screening due to lending/interest-bearing debt indicators: ${notesEn}`;
    notesAr = `صُنّف غير متوافق أولياً لوجود مؤشرات إقراض واقتراض بفائدة أو سندات دين في نشاط البروتوكول الأساسي.`;
    riskFlags.push("SHARIAH_NON_COMPLIANT");
  } else if (/\b(perpetual|futures|derivatives|margin|leverage|synthetic|options|casino|gambling|betting)\b/i.test(tagsJoined)) {
    classification = "NON_COMPLIANT";
    category = "Derivatives / Leveraged / Wagering";
    notesEn = `Flagged NON_COMPLIANT due to derivatives, margin leverage, or wagering protocol activity.`;
    notesAr = `صُنّف غير متوافق أولياً لارتباط نشاط البروتوكول بالمشتقات أو الرافعة المالية أو المراهنات.`;
    riskFlags.push("SHARIAH_NON_COMPLIANT");
  } else if (/\b(meme|dog|frog|cat|pepe|inu|shib|elon)\b/i.test(tagsJoined)) {
    classification = "NON_COMPLIANT";
    category = "Meme Token";
    notesEn = `Flagged NON_COMPLIANT / high-Gharar meme asset lacking clear real-world technical utility.`;
    notesAr = `صُنّف غير متوافق أولياً لكونه توكن ميم مضاربي يفتقر لمنفعة تقنية أو اقتصادية واضحة.`;
    riskFlags.push("WEAK_FUNDAMENTAL_UTILITY", "SHARIAH_NON_COMPLIANT");
  } else if (/\b(dex|amm|defi|swap|yield|gaming|metaverse)\b/i.test(tagsJoined)) {
    classification = "SCHOLARLY_DISAGREEMENT";
    notesAr = `نشاط المشروع مرتبط بالتمويل اللامركزي أو الألعاب ويتطلب مراجعة تفصيلية لمصادر إيرادات البروتوكول واجتناب المحظورات.`;
  } else if (/\b(layer 1|layer 2|infrastructure|oracle|storage|depin|zero knowledge|scaling|identity|iot)\b/i.test(tagsJoined)) {
    classification = "HALAL_WITH_CONDITIONS";
    notesAr = `بنية تحتية تقنية / شبكية للتداول الفوري (Spot) فقط، مع شرط التحقق البشري النهائي واجتناب أي عقود إقراض ربوي.`;
  }

  const vol = detail?.overview.quoteVolume24h ?? 0;
  const mcap = detail?.overview.marketCap ?? 0;
  const dil = detail?.overview.dilutionRatio ?? null;
  const baseScore = mcap >= 1e9 ? 76 : mcap >= 2e8 ? 68 : vol >= 10_000_000 ? 64 : 56;
  const factorKeys: CredibilityFactorKey[] = [
    "team_credibility",
    "technology_security",
    "independent_audits",
    "real_world_adoption",
    "transparency_documentation",
    "development_activity",
    "strategic_partnerships",
  ];

  const tokRisk: RiskLevel =
    riskFlags.includes("SHARIAH_NON_COMPLIANT") || (dil !== null && dil >= 3)
      ? "HIGH"
      : dil !== null && dil >= 1.8
        ? "MODERATE"
        : "MODERATE";

  return {
    symbol,
    name,
    category,
    officialWebsite: meta?.website || detail?.overview.officialWebsite || null,
    descriptionEn:
      rawDesc.slice(0, 420) || `${name} (${baseAsset}) Spot trading asset listed on verified exchanges.`,
    descriptionAr: `مشروع ${name} (${baseAsset}) المتداول في السوق الفوري ضمن فئة (${category}).`,
    aiModelLabel: "Built-in Evidence Analyzer",
    shariah: {
      classification,
      methodology: "Automated preliminary activity & financial-structure screening (Spot only — requires human scholar review)",
      coreActivityNotesEn: notesEn,
      coreActivityNotesAr: notesAr,
      conditionsEn: "Preliminary automated screening only — Spot ownership only; verify primary revenue sources.",
      conditionsAr: "فحص آلي أولي للتداول الفوري (Spot) فقط — يجب مراجعة المصادر الشرعية المختصة قبل اتخاذ القرار.",
      scholarlyDisagreementsEn: "Automated preliminary opinion, NOT an official Shariah fatwa.",
      scholarlyDisagreementsAr: "تقدير آلي أولي وليس فتوى شرعية معتمدة.",
      confidenceLevel: "LOW",
    },
    tokenomics: {
      inflationRatePct: null,
      insiderAllocationPct: null,
      unlockScheduleSummaryEn:
        dil !== null
          ? `Observed FDV/Market Cap ratio is ${dil}x; verify vesting schedule in official whitepaper.`
          : "Supply unlock schedule requires official documentation review.",
      unlockScheduleSummaryAr:
        dil !== null
          ? `نسبة التقييم المخفف إلى القيمة السوقية الحالية تبلغ ${dil}x؛ يُنصح بمراجعة جدول فك القفل الرسمي.`
          : "جدول فك القفل يتطلب مراجعة الوثائق الرسمية للمشروع.",
      tokenUtilityEn: `Ecosystem utility within ${category} (${name}).`,
      tokenUtilityAr: `استخدامات الشبكة والمنظومة ضمن قطاع ${category}.`,
      burnMechanismEn: "Refer to official protocol documentation.",
      burnMechanismAr: "يُرجع للوثائق الرسمية للبروتوكول للتحقق من آلية الحرق.",
      stakingMechanismEn: "Spot holding only recommended unless native non-Riba PoS is verified.",
      stakingMechanismAr: "يُكتفى بالتملك الفوري ما لم يثبت خلو التحصيص من الفائدة الربوية.",
      governanceRightsEn: "Token governance per protocol smart contracts.",
      governanceRightsAr: "حقوق الحوكمة وفق العقود الذكية للبروتوكول.",
      riskFlags,
      tokenomicsRisk: tokRisk,
    },
    credibility: factorKeys.map((factorKey) => ({
      factorKey,
      score: classification === "NON_COMPLIANT" && riskFlags.includes("WEAK_FUNDAMENTAL_UTILITY") ? 38 : baseScore,
      evidenceEn: `Quantitative liquidity & public metadata baseline for ${name}.`,
      evidenceAr: `تقييم كمي أولي مبني على السيولة والبيانات العامة لمشروع ${name}.`,
    })),
    scenarios: [
      {
        scenarioType: "BEARISH",
        assumptionsEn: `Liquidity contraction or weak adoption pressures ${baseAsset} Spot valuation.`,
        assumptionsAr: `تراجع السيولة أو ضعف التبني يضغط على القيمة السوقية لعملة ${baseAsset}.`,
        catalystsEn: "Market risk-off rotation or supply unlocks.",
        catalystsAr: "تراجع السوق العام أو ضغوط زيادة المعروض.",
        risksEn: "High Spot drawdown and thin order-book support.",
        risksAr: "تذبذب سعري مرتفع واحتمال ضعف جدران الدعم.",
        timeHorizon: "6–18 Months",
      },
      {
        scenarioType: "BASE",
        assumptionsEn: `${name} tracks broader ${category} sector liquidity and development milestones.`,
        assumptionsAr: `تحرك ${name} بشكل متوازن مع سيولة ونمو قطاع ${category}.`,
        catalystsEn: "Consistent Spot volume and roadmap delivery.",
        catalystsAr: "استقرار حجم التداول الفوري وتنفيذ التحديثات.",
        risksEn: "Sector competition and macro volatility.",
        risksAr: "منافسة المشاريع البديلة وتقلبات السوق.",
        timeHorizon: "12–24 Months",
      },
      {
        scenarioType: "BULLISH",
        assumptionsEn: `Expanded real utility and deeper Binance/Bybit Spot liquidity support ${name}.`,
        assumptionsAr: `نمو الاستخدام الفعلي وتعمق السيولة الفورية يدعمان توسع مشروع ${name}.`,
        catalystsEn: "Ecosystem integrations and rising Spot buyer absorption.",
        catalystsAr: "شراكات تقنية جديدة وارتفاع الطلب الشرائي الفوري.",
        risksEn: "Speculative overheating above intrinsic value.",
        risksAr: "تضخم السعر فوق القيمة الأساسية للمشروع.",
        timeHorizon: "18–36 Months",
      },
    ],
  };
}

const VALID_SHARIAH_SET = new Set<ShariahClassification>([
  "HALAL",
  "HALAL_WITH_CONDITIONS",
  "SCHOLARLY_DISAGREEMENT",
  "NON_COMPLIANT",
]);

const VALID_RISK_SET = new Set<RiskLevel>(["LOW", "MODERATE", "HIGH", "VERY_HIGH"]);

export async function analyzeAndSaveAssetWithAi(params: {
  symbol: string;
  lang?: "ar" | "en";
  allowHeuristicFallback?: boolean;
  overwriteVerified?: boolean;
}): Promise<{
  ok: boolean;
  code?: "AI_NOT_CONFIGURED";
  symbol: string;
  classification?: ShariahClassification;
  providerUsed?: string;
  detail?: AssetFullDetail | null;
  error?: string;
}> {
  const safeSymbol = params.symbol.toUpperCase().endsWith("USDT")
    ? params.symbol.toUpperCase().replace(/[^A-Z0-9]/g, "")
    : `${params.symbol.toUpperCase().replace(/[^A-Z0-9]/g, "")}USDT`;
  const baseAsset = safeSymbol.replace(/USDT$/, "");

  const settings = getAiAgentSettings(true);
  if (!isExternalAiReady(settings) && !params.allowHeuristicFallback) {
    return {
      ok: false,
      code: "AI_NOT_CONFIGURED",
      symbol: safeSymbol,
      error:
        params.lang === "en"
          ? "No AI Agent is connected yet. Open AI Agent Settings to connect Gemini, OpenAI, DeepSeek, OpenRouter, Claude, Ollama, or enable Built-in Analyzer."
          : "لم يتم ربط وكيل الذكاء الاصطناعي بعد. افتح «إعدادات وكيل الـ AI» لربط Gemini أو OpenAI أو DeepSeek أو Ollama أو تفعيل المحلل المدمج.",
    };
  }

  const [detail, meta, liquidity] = await Promise.all([
    Promise.resolve(getAssetDetail(safeSymbol)),
    fetchPublicCoinMetadata(baseAsset),
    fetchAssetOrderBookLiquidity(safeSymbol, "COMBINED").catch(() => null),
  ]);

  if (settings.provider === "builtin_heuristic" || !isExternalAiReady(settings)) {
    const heuristicPayload = buildHeuristicPayload(safeSymbol, baseAsset, detail, meta);
    heuristicPayload.overwriteVerified = params.overwriteVerified;
    const saved = upsertFullAiAssetAnalysis(heuristicPayload);
    return {
      ok: true,
      symbol: safeSymbol,
      classification: saved.classification,
      providerUsed: heuristicPayload.aiModelLabel,
      detail: getAssetDetail(safeSymbol),
    };
  }

  const contextBlock = JSON.stringify(
    {
      symbol: safeSymbol,
      baseAsset,
      knownName: meta?.name || detail?.overview.name || baseAsset,
      publicCategories: meta?.tags || [detail?.overview.category || "Unknown"],
      publicDescription: meta?.description || detail?.overview.descriptionEn || "Not fetched",
      officialWebsite: meta?.website || detail?.overview.officialWebsite || null,
      exchangesListed: detail?.overview.exchanges || ["BINANCE"],
      marketMetrics: {
        priceUsdt: detail?.overview.priceUsdt ?? null,
        marketCapUsd: detail?.overview.marketCap ?? null,
        fdvUsd: detail?.overview.fdv ?? null,
        dilutionRatio: detail?.overview.dilutionRatio ?? null,
        quoteVolume24hUsd: detail?.overview.quoteVolume24h ?? null,
        priceChangePct24h: detail?.overview.priceChangePct24h ?? null,
      },
      orderBookLiquidity: liquidity?.midPrice
        ? {
            pressureBias: liquidity.pressureBias,
            buyPressurePct2Pct: liquidity.buyPressurePct2Pct,
            bidDepth2PctUsd: liquidity.bidDepth2PctUsd,
            askDepth2PctUsd: liquidity.askDepth2PctUsd,
            topBuyWall: liquidity.buyWalls[0] || null,
            topSellWall: liquidity.sellWalls[0] || null,
          }
        : null,
    },
    null,
    2
  );

  const systemPrompt = `You are a senior Islamic Finance (AAOIFI Shariah Standard) & Institutional Crypto Tokenomics Analyst.
Analyze the target Spot cryptocurrency using ONLY verifiable knowledge and the provided live market/metadata JSON.
STRICT SHARIAH SCREENING RULES (Spot Ownership Only):
- Classify as "NON_COMPLIANT" if the protocol's core business involves Riba (interest-bearing lending/borrowing, tokenized US Treasury bills/bonds), leveraged derivatives/perpetuals/margin/options, gambling/casinos/betting, prohibited entertainment, or pure zero-utility speculative meme coins (Maysir/Gharar).
- Classify as "SCHOLARLY_DISAGREEMENT" if the protocol has mixed DeFi/revenue elements debated by contemporary scholars.
- Classify as "HALAL_WITH_CONDITIONS" if the core utility is permissible (e.g. L1/L2 infrastructure, DePIN, storage, payments) but users must avoid secondary DeFi Riba/impermissible dApps.
- Classify as "HALAL" ONLY if the project has clear permissible technical/real-world utility and clean structure.
- NEVER fabricate fatwas from scholars; this will be stored explicitly as a preliminary AI_OPINION requiring human scholarly review.
- Return ONLY a single valid JSON object matching the exact schema requested (no markdown commentary).`;

  const userPrompt = `Analyze this Spot cryptocurrency and return a JSON object with this exact structure:
{
  "name": "Full Project Name",
  "category": "Concise Sector Category (e.g. Layer-1 Smart Contracts, DePIN Storage, DeFi Lending, Meme Coin)",
  "descriptionEn": "2-sentence factual overview in English",
  "descriptionAr": "وصف دقيق وموجز للمشروع باللغة العربية من جملتين",
  "shariah": {
    "classification": "HALAL" | "HALAL_WITH_CONDITIONS" | "SCHOLARLY_DISAGREEMENT" | "NON_COMPLIANT",
    "methodology": "AAOIFI-inspired core activity & financial screening (Spot only)",
    "coreActivityNotesEn": "Detailed English explanation of what the project does and why it received this preliminary Shariah status",
    "coreActivityNotesAr": "شرح تفصيلي بالعربية لنشاط المشروع الأساسي وسبب هذا التقييم الشرعي الأولي",
    "conditionsEn": "Specific Spot-only conditions in English",
    "conditionsAr": "الشروط والضوابط الواجب مراعاتها بالعربية",
    "scholarlyDisagreementsEn": "Key fiqh considerations in English",
    "scholarlyDisagreementsAr": "الاعتبارات أو الخلافات الفقهية المحتملة بالعربية"
  },
  "tokenomics": {
    "inflationRatePct": number_or_null,
    "insiderAllocationPct": number_or_null,
    "unlockScheduleSummaryEn": "English summary of supply & dilution",
    "unlockScheduleSummaryAr": "ملخص المعروض وفك القفل ومخاطر التخفيف بالعربية",
    "tokenUtilityEn": "Real token utility in English",
    "tokenUtilityAr": "منفعة التوكن الفعلية بالعربية",
    "burnMechanismEn": "Burn mechanism in English",
    "burnMechanismAr": "آلية الحرق بالعربية",
    "stakingMechanismEn": "Staking mechanism & Shariah note in English",
    "stakingMechanismAr": "آلية التحصيص وملاحظتها الشرعية بالعربية",
    "governanceRightsEn": "Governance rights in English",
    "governanceRightsAr": "حقوق الحوكمة بالعربية",
    "riskFlags": ["OPTIONAL_RISK_FLAGS"],
    "tokenomicsRisk": "LOW" | "MODERATE" | "HIGH" | "VERY_HIGH"
  },
  "credibilityScores": {
    "team_credibility": { "score": 0_to_100, "en": "Brief evidence EN", "ar": "الدليل المختصر بالعربية" },
    "technology_security": { "score": 0_to_100, "en": "Brief evidence EN", "ar": "الدليل المختصر بالعربية" },
    "independent_audits": { "score": 0_to_100, "en": "Brief evidence EN", "ar": "الدليل المختصر بالعربية" },
    "real_world_adoption": { "score": 0_to_100, "en": "Brief evidence EN", "ar": "الدليل المختصر بالعربية" },
    "transparency_documentation": { "score": 0_to_100, "en": "Brief evidence EN", "ar": "الدليل المختصر بالعربية" },
    "development_activity": { "score": 0_to_100, "en": "Brief evidence EN", "ar": "الدليل المختصر بالعربية" },
    "strategic_partnerships": { "score": 0_to_100, "en": "Brief evidence EN", "ar": "الدليل المختصر بالعربية" }
  },
  "scenarios": {
    "BEARISH": { "assumptionsEn": "...", "assumptionsAr": "...", "catalystsEn": "...", "catalystsAr": "...", "risksEn": "...", "risksAr": "..." },
    "BASE": { "assumptionsEn": "...", "assumptionsAr": "...", "catalystsEn": "...", "catalystsAr": "...", "risksEn": "...", "risksAr": "..." },
    "BULLISH": { "assumptionsEn": "...", "assumptionsAr": "...", "catalystsEn": "...", "catalystsAr": "...", "risksEn": "...", "risksAr": "..." }
  }
}

LIVE ASSET CONTEXT:
${contextBlock}`;

  try {
    const aiResp = await callConnectedAiAgent({
      systemPrompt,
      userPrompt,
      jsonMode: true,
      maxTokens: 2200,
    });

    const parsed = extractFirstJsonObject(aiResp.text) as Record<string, any>;
    const fallback = buildHeuristicPayload(safeSymbol, baseAsset, detail, meta);

    const rawClass = String(parsed.shariah?.classification || "").toUpperCase() as ShariahClassification;
    const classification: ShariahClassification = VALID_SHARIAH_SET.has(rawClass)
      ? rawClass
      : fallback.shariah.classification;

    const rawTokRisk = String(parsed.tokenomics?.tokenomicsRisk || "").toUpperCase() as RiskLevel;
    const tokenomicsRisk: RiskLevel = VALID_RISK_SET.has(rawTokRisk)
      ? rawTokRisk
      : fallback.tokenomics.tokenomicsRisk;

    const factorKeys: CredibilityFactorKey[] = [
      "team_credibility",
      "technology_security",
      "independent_audits",
      "real_world_adoption",
      "transparency_documentation",
      "development_activity",
      "strategic_partnerships",
    ];

    const credibility = factorKeys.map((fk, idx) => {
      const node = parsed.credibilityScores?.[fk];
      const numScore = Number(node?.score);
      return {
        factorKey: fk,
        score: Number.isFinite(numScore) ? Math.max(5, Math.min(98, numScore)) : fallback.credibility[idx].score,
        evidenceEn: String(node?.en || fallback.credibility[idx].evidenceEn),
        evidenceAr: String(node?.ar || fallback.credibility[idx].evidenceAr),
      };
    });

    const scTypes: Array<"BEARISH" | "BASE" | "BULLISH"> = ["BEARISH", "BASE", "BULLISH"];
    const scenarios = scTypes.map((st, idx) => {
      const scNode = parsed.scenarios?.[st];
      const fbSc = fallback.scenarios[idx];
      return {
        scenarioType: st,
        assumptionsEn: String(scNode?.assumptionsEn || fbSc.assumptionsEn),
        assumptionsAr: String(scNode?.assumptionsAr || fbSc.assumptionsAr),
        catalystsEn: String(scNode?.catalystsEn || fbSc.catalystsEn),
        catalystsAr: String(scNode?.catalystsAr || fbSc.catalystsAr),
        risksEn: String(scNode?.risksEn || fbSc.risksEn),
        risksAr: String(scNode?.risksAr || fbSc.risksAr),
        timeHorizon: st === "BULLISH" ? "18–36 Months" : "12–24 Months",
      };
    });

    const finalPayload: FullAiAssetAnalysisPayload = {
      symbol: safeSymbol,
      name: String(parsed.name || fallback.name || baseAsset),
      category: String(parsed.category || fallback.category),
      officialWebsite: meta?.website || detail?.overview.officialWebsite || null,
      descriptionEn: String(parsed.descriptionEn || fallback.descriptionEn),
      descriptionAr: String(parsed.descriptionAr || fallback.descriptionAr),
      aiModelLabel: aiResp.providerLabel,
      overwriteVerified: params.overwriteVerified,
      shariah: {
        classification,
        methodology: String(parsed.shariah?.methodology || fallback.shariah.methodology),
        coreActivityNotesEn: String(parsed.shariah?.coreActivityNotesEn || fallback.shariah.coreActivityNotesEn),
        coreActivityNotesAr: String(parsed.shariah?.coreActivityNotesAr || fallback.shariah.coreActivityNotesAr),
        conditionsEn: String(parsed.shariah?.conditionsEn || fallback.shariah.conditionsEn),
        conditionsAr: String(parsed.shariah?.conditionsAr || fallback.shariah.conditionsAr),
        scholarlyDisagreementsEn: String(
          parsed.shariah?.scholarlyDisagreementsEn || fallback.shariah.scholarlyDisagreementsEn
        ),
        scholarlyDisagreementsAr: String(
          parsed.shariah?.scholarlyDisagreementsAr || fallback.shariah.scholarlyDisagreementsAr
        ),
        confidenceLevel: "MEDIUM",
      },
      tokenomics: {
        inflationRatePct:
          typeof parsed.tokenomics?.inflationRatePct === "number"
            ? parsed.tokenomics.inflationRatePct
            : null,
        insiderAllocationPct:
          typeof parsed.tokenomics?.insiderAllocationPct === "number"
            ? parsed.tokenomics.insiderAllocationPct
            : null,
        unlockScheduleSummaryEn: String(
          parsed.tokenomics?.unlockScheduleSummaryEn || fallback.tokenomics.unlockScheduleSummaryEn
        ),
        unlockScheduleSummaryAr: String(
          parsed.tokenomics?.unlockScheduleSummaryAr || fallback.tokenomics.unlockScheduleSummaryAr
        ),
        tokenUtilityEn: String(parsed.tokenomics?.tokenUtilityEn || fallback.tokenomics.tokenUtilityEn),
        tokenUtilityAr: String(parsed.tokenomics?.tokenUtilityAr || fallback.tokenomics.tokenUtilityAr),
        burnMechanismEn: String(parsed.tokenomics?.burnMechanismEn || fallback.tokenomics.burnMechanismEn),
        burnMechanismAr: String(parsed.tokenomics?.burnMechanismAr || fallback.tokenomics.burnMechanismAr),
        stakingMechanismEn: String(
          parsed.tokenomics?.stakingMechanismEn || fallback.tokenomics.stakingMechanismEn
        ),
        stakingMechanismAr: String(
          parsed.tokenomics?.stakingMechanismAr || fallback.tokenomics.stakingMechanismAr
        ),
        governanceRightsEn: String(
          parsed.tokenomics?.governanceRightsEn || fallback.tokenomics.governanceRightsEn
        ),
        governanceRightsAr: String(
          parsed.tokenomics?.governanceRightsAr || fallback.tokenomics.governanceRightsAr
        ),
        riskFlags: Array.isArray(parsed.tokenomics?.riskFlags)
          ? parsed.tokenomics.riskFlags.map(String).slice(0, 6)
          : fallback.tokenomics.riskFlags,
        tokenomicsRisk,
      },
      credibility,
      scenarios,
    };

    const saved = upsertFullAiAssetAnalysis(finalPayload);
    return {
      ok: true,
      symbol: safeSymbol,
      classification: saved.classification,
      providerUsed: aiResp.providerLabel,
      detail: getAssetDetail(safeSymbol),
    };
  } catch (err) {
    if (params.allowHeuristicFallback) {
      const heuristicPayload = buildHeuristicPayload(safeSymbol, baseAsset, detail, meta);
      heuristicPayload.overwriteVerified = params.overwriteVerified;
      const saved = upsertFullAiAssetAnalysis(heuristicPayload);
      return {
        ok: true,
        symbol: safeSymbol,
        classification: saved.classification,
        providerUsed: `${heuristicPayload.aiModelLabel} (Fallback)`,
        detail: getAssetDetail(safeSymbol),
      };
    }
    return {
      ok: false,
      symbol: safeSymbol,
      error: err instanceof Error ? err.message : "AI analysis failed",
    };
  }
}
