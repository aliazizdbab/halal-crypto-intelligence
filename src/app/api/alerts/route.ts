import { NextResponse } from "next/server";
import { z } from "zod";
import { captureHistoricalSnapshots, getAlertRules, getAlerts } from "@/lib/services/repository";
import {
  createAlertRule,
  deleteAlertRule,
  markAllAlertsRead,
  sendTelegramNotification,
} from "@/lib/services/alerts";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    ok: true,
    alerts: getAlerts(60),
    rules: getAlertRules(),
    telegramConfigured: Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID),
  });
}

const ActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create_rule"),
    symbol: z.string().max(20).nullable().optional(),
    ruleType: z.enum([
      "PRICE_CHANGE_PCT",
      "PRICE_ABOVE",
      "PRICE_BELOW",
      "VOLUME_SPIKE_USD",
      "SHARIAH_CHANGE",
      "SPOT_DELISTING",
    ]),
    threshold: z.number().nullable().optional(),
    notifyTelegram: z.boolean().optional(),
  }),
  z.object({ action: z.literal("mark_all_read") }),
  z.object({ action: z.literal("capture_snapshot") }),
  z.object({ action: z.literal("test_telegram") }),
]);

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = ActionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: "Invalid alert action", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    if (parsed.data.action === "create_rule") {
      const res = createAlertRule({
        symbol: parsed.data.symbol ?? null,
        ruleType: parsed.data.ruleType,
        threshold: parsed.data.threshold ?? null,
        notifyTelegram: parsed.data.notifyTelegram ?? false,
      });
      return NextResponse.json({ ok: true, id: res.id });
    }

    if (parsed.data.action === "mark_all_read") {
      markAllAlertsRead();
      return NextResponse.json({ ok: true });
    }

    if (parsed.data.action === "capture_snapshot") {
      const snap = captureHistoricalSnapshots();
      return NextResponse.json({ ok: true, snapshot: snap });
    }

    if (parsed.data.action === "test_telegram") {
      const tg = await sendTelegramNotification(
        "✅ *Halal Crypto Intelligence Platform*\nTelegram alert connection verified successfully."
      );
      return NextResponse.json({ ok: tg.ok, reason: tg.reason });
    }

    return NextResponse.json({ ok: false, error: "Unsupported action" }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Alert operation failed" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = Number(searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ ok: false, error: "Invalid rule id" }, { status: 400 });
  }
  deleteAlertRule(id);
  return NextResponse.json({ ok: true });
}
