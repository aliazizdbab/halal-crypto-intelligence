import { NextResponse } from "next/server";
import { getDashboardSummary } from "@/lib/services/repository";
import { syncBinanceSpotMarketData } from "@/lib/services/binance";
import { syncMarketCapAndSupply } from "@/lib/services/market-enrichment";

export const dynamic = "force-dynamic";

let initialSyncPromise: Promise<void> | null = null;

export async function GET() {
  try {
    let summary = getDashboardSummary();

    // Auto-bootstrap live Binance Spot prices on very first load if DB has never been synced
    if (summary.binanceConnectionStatus === "NOT_SYNCED") {
      if (!initialSyncPromise) {
        initialSyncPromise = (async () => {
          try {
            await syncBinanceSpotMarketData();
            await syncMarketCapAndSupply().catch(() => null);
          } catch {
            // graceful degradation if offline
          } finally {
            initialSyncPromise = null;
          }
        })();
      }
      await initialSyncPromise;
      summary = getDashboardSummary();
    }

    return NextResponse.json({ ok: true, summary });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Dashboard error" },
      { status: 500 }
    );
  }
}
