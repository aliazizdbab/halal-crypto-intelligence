import { NextResponse } from "next/server";
import { z } from "zod";
import { toggleWatchlist } from "@/lib/services/repository";

export const dynamic = "force-dynamic";

const WatchlistSchema = z.object({
  symbol: z.string().min(2).max(20),
  notes: z.string().max(500).optional(),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = WatchlistSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: "Invalid symbol" }, { status: 400 });
    }
    const result = toggleWatchlist(parsed.data.symbol, parsed.data.notes || "");
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Watchlist error" },
      { status: 500 }
    );
  }
}
