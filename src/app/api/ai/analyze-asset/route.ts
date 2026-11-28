import { NextResponse } from "next/server";
import { z } from "zod";
import { analyzeAndSaveAssetWithAi } from "@/lib/services/ai-assistant";

export const dynamic = "force-dynamic";

const AnalyzeSchema = z.object({
  symbol: z.string().min(1).max(24).optional(),
  symbols: z.array(z.string().min(1).max(24)).max(15).optional(),
  lang: z.enum(["ar", "en"]).optional(),
  allowHeuristicFallback: z.boolean().optional(),
  overwriteVerified: z.boolean().optional(),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = AnalyzeSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: "Invalid asset symbol payload" }, { status: 400 });
    }

    const { symbol, symbols, lang, allowHeuristicFallback, overwriteVerified } = parsed.data;
    const targets = symbols && symbols.length > 0 ? symbols : symbol ? [symbol] : [];
    if (targets.length === 0) {
      return NextResponse.json({ ok: false, error: "Provide symbol or symbols[]" }, { status: 400 });
    }

    if (targets.length === 1) {
      const res = await analyzeAndSaveAssetWithAi({
        symbol: targets[0],
        lang,
        allowHeuristicFallback,
        overwriteVerified,
      });
      return NextResponse.json(res, { status: res.ok ? 200 : res.code === "AI_NOT_CONFIGURED" ? 422 : 500 });
    }

    const results = [];
    for (const sym of targets) {
      const res = await analyzeAndSaveAssetWithAi({
        symbol: sym,
        lang,
        allowHeuristicFallback,
        overwriteVerified,
      });
      results.push({
        symbol: res.symbol,
        ok: res.ok,
        code: res.code,
        classification: res.classification,
        providerUsed: res.providerUsed,
        row: res.detail?.overview || null,
        error: res.error,
      });
      if (res.code === "AI_NOT_CONFIGURED") {
        break;
      }
    }

    const anyNotConfigured = results.some((r) => r.code === "AI_NOT_CONFIGURED");
    return NextResponse.json(
      {
        ok: !anyNotConfigured && results.some((r) => r.ok),
        code: anyNotConfigured ? "AI_NOT_CONFIGURED" : undefined,
        results,
      },
      { status: anyNotConfigured ? 422 : 200 }
    );
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "AI coin analyzer error" },
      { status: 500 }
    );
  }
}
