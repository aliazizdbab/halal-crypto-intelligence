import { NextResponse } from "next/server";
import { syncBinanceSpotMarketData } from "@/lib/services/binance";
import { syncMarketCapAndSupply } from "@/lib/services/market-enrichment";
import { evaluateMarketAlerts } from "@/lib/services/alerts";
import { captureHistoricalSnapshots } from "@/lib/services/repository";
import { getDb } from "@/lib/db/client";
import { ensureSeeded } from "@/lib/db/seed";

export const dynamic = "force-dynamic";

export async function GET() {
  ensureSeeded();
  const db = getDb();
  const statuses = db.prepare("SELECT * FROM sync_status").all();
  return NextResponse.json({
    statuses,
    telegramConfigured: Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID),
    aiConfigured: {
      gemini: Boolean(process.env.GEMINI_API_KEY),
      openai: Boolean(process.env.OPENAI_API_KEY),
      ollama: Boolean(process.env.OLLAMA_BASE_URL),
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

    const binance = await syncBinanceSpotMarketData();

    let marketCap: { updatedAssets: number; sourceUsed: string; syncedAt: string } | null = null;
    let marketCapError: string | null = null;
    try {
      marketCap = await syncMarketCapAndSupply();
    } catch (err) {
      marketCapError = err instanceof Error ? err.message : "Market Cap enrichment unavailable";
    }

    const alertEval = await evaluateMarketAlerts(binance.delistedOrSuspended);

    let snapshotResult: { captured: number; recordedAt: string } | null = null;
    if (takeSnapshot) {
      snapshotResult = captureHistoricalSnapshots();
    }

    return NextResponse.json({
      ok: true,
      binance,
      marketCap,
      marketCapError,
      alertsCreated: alertEval.createdAlerts,
      snapshot: snapshotResult,
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "Failed to sync Binance Spot data",
      },
      { status: 502 }
    );
  }
}
