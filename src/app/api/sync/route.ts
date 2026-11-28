import { NextResponse } from "next/server";
import { syncBinanceSpotMarketData } from "@/lib/services/binance";
import { syncBybitSpotMarketData } from "@/lib/services/bybit";
import { syncMarketCapAndSupply } from "@/lib/services/market-enrichment";
import { evaluateMarketAlerts } from "@/lib/services/alerts";
import { captureHistoricalSnapshots } from "@/lib/services/repository";
import { getDb, getSetting } from "@/lib/db/client";
import { ensureSeeded } from "@/lib/db/seed";

export const dynamic = "force-dynamic";

export async function GET() {
  ensureSeeded();
  const db = getDb();
  const statuses = db.prepare("SELECT * FROM sync_status").all();
  const savedKey = getSetting("ai_api_key", "");
  const savedProvider = getSetting("ai_provider", process.env.AI_PROVIDER || "gemini");

  return NextResponse.json({
    statuses,
    telegramConfigured: Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID),
    aiConfigured: {
      activeProvider: savedProvider,
      hasSavedKey: Boolean(savedKey),
      gemini: Boolean(savedKey || process.env.GEMINI_API_KEY),
      openai: Boolean(savedKey || process.env.OPENAI_API_KEY),
      ollama: Boolean(getSetting("ai_base_url", "") || process.env.OLLAMA_BASE_URL),
    },
  });
}

export async function POST(request: Request) {
  try {
    let takeSnapshot = false;
    try {
      const body = (await request.json()) as { takeSnapshot?: boolean };
      takeSnapshot = Boolean(body?.takeSnapshot);
    } catch {
      // empty body is fine
    }

    const [binanceSettled, bybitSettled] = await Promise.allSettled([
      syncBinanceSpotMarketData(),
      syncBybitSpotMarketData(),
    ]);

    const binance = binanceSettled.status === "fulfilled" ? binanceSettled.value : null;
    const bybit = bybitSettled.status === "fulfilled" ? bybitSettled.value : null;

    if (!binance && !bybit) {
      const bErr = binanceSettled.status === "rejected" ? String(binanceSettled.reason) : "";
      const yErr = bybitSettled.status === "rejected" ? String(bybitSettled.reason) : "";
      throw new Error(`Both Spot exchanges unreachable. Binance: ${bErr} | Bybit: ${yErr}`);
    }

    let marketCap: { updatedAssets: number; sourceUsed: string; syncedAt: string } | null = null;
    let marketCapError: string | null = null;
    try {
      marketCap = await syncMarketCapAndSupply();
    } catch (err) {
      marketCapError = err instanceof Error ? err.message : "Market Cap enrichment unavailable";
    }

    const alertEval = await evaluateMarketAlerts(binance?.delistedOrSuspended || []);

    let snapshotResult: { captured: number; recordedAt: string } | null = null;
    if (takeSnapshot) {
      snapshotResult = captureHistoricalSnapshots();
    }

    return NextResponse.json({
      ok: true,
      binance,
      bybit,
      binanceError: binanceSettled.status === "rejected" ? String(binanceSettled.reason) : null,
      bybitError: bybitSettled.status === "rejected" ? String(bybitSettled.reason) : null,
      marketCap,
      marketCapError,
      alertsCreated: alertEval.createdAlerts,
      snapshot: snapshotResult,
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "Failed to sync Spot market data",
      },
      { status: 502 }
    );
  }
}
