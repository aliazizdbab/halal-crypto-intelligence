import { getAssetDetail, getDirectoryAssets } from "./repository";
import { getSetting } from "@/lib/db/client";

export interface AiResearchRequest {
  question: string;
  symbol?: string;
  lang?: "ar" | "en";
}

export interface AiResearchResponse {
  answer: string;
  mode: "LLM_GEMINI" | "LLM_OPENAI" | "LLM_OLLAMA" | "EVIDENCE_ENGINE";
  symbolAnalyzed: string | null;
  disclaimer: string;
  citations: Array<{ label: string; url: string | null }>;
  generatedAt: string;
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
  lang: "ar" | "en"
): { answer: string; symbolAnalyzed: string | null; citations: Array<{ label: string; url: string | null }> } {
  const q = question.toLowerCase();
  const citations: Array<{ label: string; url: string | null }> = [];

  // Try to detect symbol from question if not explicitly provided
  let targetSymbol = symbol?.toUpperCase();
  if (!targetSymbol) {
    const dir = getDirectoryAssets({ classifications: "ALL", pageSize: 100 });
    for (const row of dir.rows) {
      const base = row.baseAsset.toLowerCase();
      const name = row.name.toLowerCase();
      if (
        new RegExp(`\\b${base}\\b`, "i").test(q) ||
        (name.length >= 4 && q.includes(name))
      ) {
        targetSymbol = row.symbol;
        break;
      }
    }
  }

  if (!targetSymbol) {
    // Portfolio / discovery-level question
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

    citations.push({ label: "Binance Spot Public API", url: "https://www.binance.com/en/markets/overview" });
    citations.push({ label: "Verified Shariah Registry (Local Auditable DB)", url: null });

    if (lang === "ar") {
      const topLines = halalTop.rows
        .map(
          (r, i) =>
            `${i + 1}. **${r.name} (${r.baseAsset})** — السعر: ${fmtUsd(r.priceUsdt)} | القيمة السوقية: ${fmtUsd(r.marketCap)} | الموثوقية: ${r.credibilityScore ?? "غير متوفر"}/100 | فرص النمو: ${r.investmentPotentialScore ?? "غير متوفر"}/100 | التصنيف: \`${r.shariahClassification}\``
        )
        .join("\n");

      const cheapLines = lowPrice.rows
        .map((r) => `- **${r.baseAsset}**: ${fmtUsd(r.priceUsdt)} (القيمة السوقية: ${fmtUsd(r.marketCap)})`)
        .join("\n");

      return {
        symbolAnalyzed: null,
        citations,
        answer: `### ملخص بحثي مبني على بيانات المنصة الموثّقة\n\n**أعلى العملات المباحة / المباحة بشروط وفق التقييم البحثي المدمج (الموثوقية + فرص النمو):**\n${topLines}\n\n**أقل العملات سعراً للوحدة حالياً (مع تنبيه مهم):**\n${cheapLines}\n\n> **ملاحظة استثمارية حاسمة:** انخفاض سعر الوحدة لا يعني أن المشروع "رخيص" استثمارياً؛ يجب مقارنة **القيمة السوقية (Market Cap)** و**التقييم المخفف بالكامل (FDV)** ونسبة التضخم.\n\nيمكنك تحديد اسم أو رمز أي عملة (مثل \`BTC\`, \`XLM\`, \`HBAR\`, \`SOL\`, \`LINK\`, \`ARB\`) للحصول على تقرير شرعي وتقني وتوكنوميكس مفصّل بالمصادر.`,
      };
    }

    const topLinesEn = halalTop.rows
      .map(
        (r, i) =>
          `${i + 1}. **${r.name} (${r.baseAsset})** — Price: ${fmtUsd(r.priceUsdt)} | MCap: ${fmtUsd(r.marketCap)} | Credibility: ${r.credibilityScore ?? "N/A"}/100 | Growth: ${r.investmentPotentialScore ?? "N/A"}/100 | Shariah: \`${r.shariahClassification}\``
      )
      .join("\n");

    return {
      symbolAnalyzed: null,
      citations,
      answer: `### Evidence-Backed Platform Research Summary\n\n**Highest Combined Research Rating (Halal / Conditional Halal Binance Spot Assets):**\n${topLinesEn}\n\n> **Valuation Note:** A low token unit price does **not** mean an asset is undervalued. Always compare **Market Capitalization**, **FDV**, and **supply dilution**.\n\nSpecify any asset symbol (e.g., \`BTC\`, \`XLM\`, \`ALGO\`, \`HBAR\`, \`LINK\`, \`ARB\`) for an evidence-cited Shariah, tokenomics, valuation, and risk breakdown.`,
    };
  }

  const detail = getAssetDetail(targetSymbol);
  if (!detail) {
    return {
      symbolAnalyzed: targetSymbol,
      citations,
      answer:
        lang === "ar"
          ? `البيانات غير متوفرة حالياً للرمز \`${targetSymbol}\` في سجل Binance Spot المحلي. يرجى الضغط على "مزامنة Binance Spot" أولاً.`
          : `DATA UNAVAILABLE – REQUIRES VERIFICATION for \`${targetSymbol}\`. Please run a Binance Spot sync first.`,
    };
  }

  const { overview, shariah, credibility, tokenomics, scenarios, investmentPotential } = detail;
  if (shariah.sourceUrl) citations.push({ label: `Shariah Source: ${shariah.authorityName}`, url: shariah.sourceUrl });
  if (overview.officialWebsite) citations.push({ label: `${overview.name} Official Website`, url: overview.officialWebsite });
  if (tokenomics.sourceUrl) citations.push({ label: `Tokenomics: ${tokenomics.sourceName}`, url: tokenomics.sourceUrl });
  citations.push({ label: `Binance Spot (${overview.symbol})`, url: overview.binanceSpotUrl });

  const askShariah = /halal|shariah|fatwa|scholar|haram|riba|حلال|شرع|فتو|خلاف|مباح|حكم/.test(q);
  const askTokenomics = /inflat|unlock|supply|fdv|overvalu|tokenomic|dilut|تضخم|فك القفل|معروض|تقييم|توكنوميكس/.test(q);
  const askRisk = /fail|risk|bear|compet|مخاطر|فشل|منافس|متشائم/.test(q);
  const askGrowth = /grow|bull|thesis|useful|utility|نجاح|نمو|منفعة|متفائل/.test(q);
  const showAll = !askShariah && !askTokenomics && !askRisk && !askGrowth;

  const sections: string[] = [];
  const bear = scenarios.find((s) => s.scenarioType === "BEARISH");
  const base = scenarios.find((s) => s.scenarioType === "BASE");
  const bull = scenarios.find((s) => s.scenarioType === "BULLISH");

  if (lang === "ar") {
    sections.push(
      `### التقرير البحثي الموثّق: ${overview.name} (${overview.symbol})\n- **السعر الحالي (Binance Spot):** ${fmtUsd(overview.priceUsdt)} (تغير 24س: ${overview.priceChangePct24h !== null ? `${overview.priceChangePct24h.toFixed(2)}%` : "غير متوفر"})\n- **القيمة السوقية:** ${fmtUsd(overview.marketCap)} | **FDV:** ${fmtUsd(overview.fdv)} | **نسبة التخفيف:** ${overview.dilutionRatio ? `${overview.dilutionRatio}x` : "غير متوفر"}\n- **موثوقية المشروع:** ${credibility.score ?? "غير متوفر"}/100 (${credibility.confidence}) | **تقييم إمكانية النمو:** ${investmentPotential.score ?? "غير متوفر"}/100`
    );

    if (showAll || askShariah) {
      sections.push(
        `#### 1. التحليل الشرعي والمراجع\n- **التصنيف:** \`${shariah.classification}\`\n- **الجهة المرجعية:** ${shariah.authorityName} (تاريخ التقييم: ${shariah.assessmentDate})\n- **المنهجية:** ${shariah.methodology}\n- **سبب الحكم:** ${shariah.coreActivityNotesAr}\n- **الشروط والتحفظات:** ${shariah.conditionsAr || "لا توجد شروط إضافية موثقة"}\n- **الخلافات الفقهية المعروفة:** ${shariah.scholarlyDisagreementsAr || "البيانات غير متوفرة – تتطلب تحققاً"}`
      );
    }

    if (showAll || askTokenomics) {
      sections.push(
        `#### 2. التوكنوميكس والتضخم والتقييم\n- **التضخم السنوي التقديري:** ${tokenomics.inflationRatePct !== null ? `${tokenomics.inflationRatePct}%` : "غير متوفر"}\n- **تخصيص المطلعين (الفريق + VC):** ${tokenomics.insiderAllocationPct !== null ? `${tokenomics.insiderAllocationPct}%` : "غير متوفر"}\n- **جدول فك القفل:** ${tokenomics.unlockScheduleSummaryAr}\n- **أقرب فك قفل كبير:** ${tokenomics.nextMajorUnlockDate ? `${tokenomics.nextMajorUnlockDate} (${tokenomics.nextMajorUnlockPct ?? "؟"}%)` : "لا يوجد فك قفل كبير قريب موثّق"}\n- **منفعة التوكن:** ${tokenomics.tokenUtilityAr}\n- **آلية الحرق:** ${tokenomics.burnMechanismAr}\n- **إشارات المخاطر:** ${tokenomics.riskFlags.length > 0 ? tokenomics.riskFlags.join("، ") : "لا توجد إشارات خطر مرتفعة حالياً"}`
      );
    }

    if (showAll || askGrowth) {
      sections.push(
        `#### 3. المنفعة وفرضية النمو (تقييم تحليلي وليس ضماناً)\n- **وصف المشروع:** ${overview.descriptionAr}\n- **السيناريو الأساسي:** ${base ? base.assumptionsAr : "البيانات غير متوفرة"}\n- **السيناريو المتفائل ومحفزاته:** ${bull ? `${bull.assumptionsAr} — المحفزات: ${bull.catalystsAr}` : "البيانات غير متوفرة"}`
      );
    }

    if (showAll || askRisk) {
      sections.push(
        `#### 4. المخاطر وأسباب الفشل المحتملة\n- **مستوى المخاطر العام:** \`${overview.overallRiskLevel}\` | **مخاطر التوكنوميكس:** \`${overview.tokenomicsRisk}\`\n- **السيناريو المتشائم:** ${bear ? bear.assumptionsAr : "البيانات غير متوفرة"}\n- **أبرز المخاطر:** ${bear ? bear.risksAr : "البيانات غير متوفرة"}`
      );
    }
  } else {
    sections.push(
      `### Evidence-Backed Research Dossier: ${overview.name} (${overview.symbol})\n- **Live Binance Spot Price:** ${fmtUsd(overview.priceUsdt)} (24h: ${overview.priceChangePct24h !== null ? `${overview.priceChangePct24h.toFixed(2)}%` : "N/A"})\n- **Market Cap:** ${fmtUsd(overview.marketCap)} | **FDV:** ${fmtUsd(overview.fdv)} | **Dilution Ratio:** ${overview.dilutionRatio ? `${overview.dilutionRatio}x` : "N/A"}\n- **Project Credibility:** ${credibility.score ?? "N/A"}/100 (${credibility.confidence}) | **Investment Potential:** ${investmentPotential.score ?? "N/A"}/100`
    );

    if (showAll || askShariah) {
      sections.push(
        `#### 1. Shariah Compliance & Sources\n- **Classification:** \`${shariah.classification}\`\n- **Authority:** ${shariah.authorityName} (Date: ${shariah.assessmentDate})\n- **Methodology:** ${shariah.methodology}\n- **Rationale:** ${shariah.coreActivityNotesEn}\n- **Conditions:** ${shariah.conditionsEn || "None documented"}\n- **Scholarly Disagreements:** ${shariah.scholarlyDisagreementsEn || "DATA UNAVAILABLE – REQUIRES VERIFICATION"}`
      );
    }

    if (showAll || askTokenomics) {
      sections.push(
        `#### 2. Tokenomics, Inflation & Unlocks\n- **Estimated Annual Inflation:** ${tokenomics.inflationRatePct !== null ? `${tokenomics.inflationRatePct}%` : "DATA UNAVAILABLE"}\n- **Insider Allocation (Team + VC):** ${tokenomics.insiderAllocationPct !== null ? `${tokenomics.insiderAllocationPct}%` : "DATA UNAVAILABLE"}\n- **Unlock Schedule:** ${tokenomics.unlockScheduleSummaryEn}\n- **Next Major Unlock:** ${tokenomics.nextMajorUnlockDate ? `${tokenomics.nextMajorUnlockDate} (${tokenomics.nextMajorUnlockPct ?? "?"}%)` : "None documented"}\n- **Token Utility:** ${tokenomics.tokenUtilityEn}\n- **Burn Mechanism:** ${tokenomics.burnMechanismEn}\n- **Risk Flags:** ${tokenomics.riskFlags.length > 0 ? tokenomics.riskFlags.join(", ") : "None flagged"}`
      );
    }

    if (showAll || askGrowth) {
      sections.push(
        `#### 3. Utility & Growth Thesis (Analytical Rating — Not Guaranteed)\n- **Overview:** ${overview.descriptionEn}\n- **Base Scenario:** ${base ? base.assumptionsEn : "DATA UNAVAILABLE"}\n- **Bullish Scenario & Catalysts:** ${bull ? `${bull.assumptionsEn} — Catalysts: ${bull.catalystsEn}` : "DATA UNAVAILABLE"}`
      );
    }

    if (showAll || askRisk) {
      sections.push(
        `#### 4. Risk Assessment & Failure Modes\n- **Overall Risk:** \`${overview.overallRiskLevel}\` | **Tokenomics Risk:** \`${overview.tokenomicsRisk}\`\n- **Bearish Scenario:** ${bear ? bear.assumptionsEn : "DATA UNAVAILABLE"}\n- **Key Risks:** ${bear ? bear.risksEn : "DATA UNAVAILABLE"}`
      );
    }
  }

  return {
    symbolAnalyzed: overview.symbol,
    citations,
    answer: sections.join("\n\n"),
  };
}

async function tryExternalLlm(
  question: string,
  groundedContext: string,
  lang: "ar" | "en"
): Promise<{ text: string; mode: AiResearchResponse["mode"] } | null> {
  const provider = (getSetting("ai_provider", process.env.AI_PROVIDER || "gemini") || "gemini").toLowerCase();
  const systemInstruction = `You are an institutional cryptocurrency & Islamic finance research assistant.
RULES:
1. Answer strictly in ${lang === "ar" ? "Arabic" : "English"}.
2. Base EVERY factual claim strictly on the Grounded Platform Data below. If information is missing, explicitly state "DATA UNAVAILABLE – REQUIRES VERIFICATION".
3. NEVER fabricate Shariah fatwas, partnerships, or guaranteed returns.
4. Clearly label your output as an analytical research opinion — NOT a formal fatwa and NOT financial advice.
5. Separate Shariah compliance from project fundamentals and price performance.

GROUNDED PLATFORM DATA:
${groundedContext}`;

  // 1. Gemini API
  if (provider === "gemini" && process.env.GEMINI_API_KEY) {
    const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(process.env.GEMINI_API_KEY)}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemInstruction }] },
        contents: [{ role: "user", parts: [{ text: question }] }],
        generationConfig: { temperature: 0.25, maxOutputTokens: 1200 },
      }),
    });
    if (res.ok) {
      const json = (await res.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };
      const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) return { text, mode: "LLM_GEMINI" };
    }
  }

  // 2. OpenAI API
  if (provider === "openai" && process.env.OPENAI_API_KEY) {
    const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.25,
        messages: [
          { role: "system", content: systemInstruction },
          { role: "user", content: question },
        ],
      }),
    });
    if (res.ok) {
      const json = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const text = json.choices?.[0]?.message?.content;
      if (text) return { text, mode: "LLM_OPENAI" };
    }
  }

  // 3. Ollama local
  if (provider === "ollama" && process.env.OLLAMA_BASE_URL) {
    const model = process.env.OLLAMA_MODEL || "llama3.1";
    const res = await fetch(`${process.env.OLLAMA_BASE_URL.replace(/\/+$/, "")}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        stream: false,
        messages: [
          { role: "system", content: systemInstruction },
          { role: "user", content: question },
        ],
      }),
    });
    if (res.ok) {
      const json = (await res.json()) as { message?: { content?: string } };
      if (json.message?.content) return { text: json.message.content, mode: "LLM_OLLAMA" };
    }
  }

  return null;
}

export async function runAiResearchQuery(req: AiResearchRequest): Promise<AiResearchResponse> {
  const lang = req.lang === "en" ? "en" : "ar";
  const deterministic = buildDeterministicAnswer(req.question, req.symbol, lang);

  const disclaimer =
    lang === "ar"
      ? "تنبيه: هذا المخرج رأي بحثي تحليلي مبني على بيانات المنصة ومصادرها، وليس فتوى شرعية رسمية ولا نصيحة استثمارية أو ضماناً للربح."
      : "Disclaimer: This output is an analytical research opinion grounded in platform records — NOT a formal Shariah fatwa and NOT guaranteed financial advice.";

  try {
    const llmResult = await tryExternalLlm(req.question, deterministic.answer, lang);
    if (llmResult) {
      return {
        answer: llmResult.text,
        mode: llmResult.mode,
        symbolAnalyzed: deterministic.symbolAnalyzed,
        disclaimer,
        citations: deterministic.citations,
        generatedAt: new Date().toISOString(),
      };
    }
  } catch {
    // Gracefully fall back to deterministic evidence engine
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
