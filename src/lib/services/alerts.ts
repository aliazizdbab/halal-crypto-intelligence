import { getDb } from "@/lib/db/client";
import { buildAllEvaluatedRows, getAlertRules } from "./repository";

export async function sendTelegramNotification(message: string): Promise<{ ok: boolean; reason: string }> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    return { ok: false, reason: "TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not configured in .env.local" };
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: "Markdown",
        disable_web_page_preview: true,
      }),
    });
    if (!res.ok) {
      return { ok: false, reason: `Telegram HTTP ${res.status}` };
    }
    return { ok: true, reason: "Sent" };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : "Telegram send error" };
  }
}

export async function evaluateMarketAlerts(delistedSymbols: string[] = []): Promise<{ createdAlerts: number }> {
  const db = getDb();
  const rules = getAlertRules().filter((r) => r.enabled);
  const rows = buildAllEvaluatedRows(false).filter((r) => r.shariahClassification !== "UNVERIFIED");
  const now = new Date().toISOString();
  const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();

  let createdAlerts = 0;

  const recentCheck = db.prepare(
    `SELECT id FROM alerts WHERE symbol IS ? AND alert_type = ? AND created_at > ? LIMIT 1`
  );
  const insertAlert = db.prepare(
    `INSERT INTO alerts (symbol, alert_type, severity, title_en, title_ar, message_en, message_ar, is_read, telegram_sent, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`
  );

  // 1. Delisted / Suspended Spot Alerts
  for (const sym of delistedSymbols) {
    if (recentCheck.get(sym, "SPOT_LISTING_CHANGE", sixHoursAgo)) continue;
    const titleEn = `Binance Spot Eligibility Lost: ${sym}`;
    const titleAr = `توقف أهلية التداول الفوري في بايننس: ${sym}`;
    const msgEn = `${sym} is no longer TRADING with SPOT permission on Binance exchangeInfo and has been excluded from active Spot listings.`;
    const msgAr = `لم يعد الزوج ${sym} متاحاً بحالة TRADING وصلاحية SPOT على Binance وتم استبعاده من القائمة النشطة.`;
    const tg = await sendTelegramNotification(`🚨 *${titleEn}*\n${msgEn}`);
    insertAlert.run(sym, "SPOT_LISTING_CHANGE", "CRITICAL", titleEn, titleAr, msgEn, msgAr, tg.ok ? 1 : 0, now);
    createdAlerts++;
  }

  // 2. Price movement & volume spike rules
  for (const rule of rules) {
    const candidates = rule.symbol ? rows.filter((r) => r.symbol === rule.symbol) : rows;

    for (const asset of candidates) {
      if (
        rule.ruleType === "PRICE_CHANGE_PCT" &&
        rule.threshold !== null &&
        asset.priceChangePct24h !== null &&
        Math.abs(asset.priceChangePct24h) >= rule.threshold
      ) {
        if (recentCheck.get(asset.symbol, "PRICE_MOVEMENT", sixHoursAgo)) continue;
        const dirEn = asset.priceChangePct24h >= 0 ? "surged" : "dropped";
        const dirAr = asset.priceChangePct24h >= 0 ? "ارتفع" : "انخفض";
        const titleEn = `Significant Price Move: ${asset.baseAsset} (${asset.priceChangePct24h.toFixed(2)}%)`;
        const titleAr = `تحرك سعري كبير: ${asset.baseAsset} (${asset.priceChangePct24h.toFixed(2)}%)`;
        const msgEn = `${asset.symbol} ${dirEn} ${asset.priceChangePct24h.toFixed(2)}% in 24h to $${asset.priceUsdt}. Shariah: ${asset.shariahClassification}.`;
        const msgAr = `${dirAr} سعر ${asset.symbol} بنسبة ${asset.priceChangePct24h.toFixed(2)}% خلال 24 ساعة ليصل إلى $${asset.priceUsdt}. التصنيف الشرعي: ${asset.shariahClassification}.`;
        let tgSent = 0;
        if (rule.notifyTelegram) {
          const tg = await sendTelegramNotification(`📊 *${titleEn}*\n${msgEn}`);
          tgSent = tg.ok ? 1 : 0;
        }
        insertAlert.run(asset.symbol, "PRICE_MOVEMENT", "WARNING", titleEn, titleAr, msgEn, msgAr, tgSent, now);
        createdAlerts++;
      }

      if (
        rule.ruleType === "PRICE_ABOVE" &&
        rule.threshold !== null &&
        asset.priceUsdt !== null &&
        asset.priceUsdt >= rule.threshold
      ) {
        if (recentCheck.get(asset.symbol, "PRICE_MOVEMENT", sixHoursAgo)) continue;
        const titleEn = `Price Target Reached (Above): ${asset.baseAsset}`;
        const titleAr = `تجاوز السعر المستهدف: ${asset.baseAsset}`;
        const msgEn = `${asset.symbol} traded at $${asset.priceUsdt}, above threshold $${rule.threshold}.`;
        const msgAr = `وصل سعر ${asset.symbol} إلى $${asset.priceUsdt} متجاوزاً الحد $${rule.threshold}.`;
        let tgSent = 0;
        if (rule.notifyTelegram) {
          const tg = await sendTelegramNotification(`🔔 *${titleEn}*\n${msgEn}`);
          tgSent = tg.ok ? 1 : 0;
        }
        insertAlert.run(asset.symbol, "PRICE_MOVEMENT", "INFO", titleEn, titleAr, msgEn, msgAr, tgSent, now);
        createdAlerts++;
      }

      if (
        rule.ruleType === "PRICE_BELOW" &&
        rule.threshold !== null &&
        asset.priceUsdt !== null &&
        asset.priceUsdt <= rule.threshold
      ) {
        if (recentCheck.get(asset.symbol, "PRICE_MOVEMENT", sixHoursAgo)) continue;
        const titleEn = `Price Alert (Below): ${asset.baseAsset}`;
        const titleAr = `تنبيه هبوط سعري: ${asset.baseAsset}`;
        const msgEn = `${asset.symbol} traded at $${asset.priceUsdt}, below threshold $${rule.threshold}.`;
        const msgAr = `انخفض سعر ${asset.symbol} إلى $${asset.priceUsdt} دون الحد $${rule.threshold}.`;
        let tgSent = 0;
        if (rule.notifyTelegram) {
          const tg = await sendTelegramNotification(`🔔 *${titleEn}*\n${msgEn}`);
          tgSent = tg.ok ? 1 : 0;
        }
        insertAlert.run(asset.symbol, "PRICE_MOVEMENT", "INFO", titleEn, titleAr, msgEn, msgAr, tgSent, now);
        createdAlerts++;
      }
    }
  }

  return { createdAlerts };
}

export function createAlertRule(input: {
  symbol?: string | null;
  ruleType: "PRICE_CHANGE_PCT" | "PRICE_ABOVE" | "PRICE_BELOW" | "VOLUME_SPIKE_USD" | "SHARIAH_CHANGE" | "SPOT_DELISTING";
  threshold?: number | null;
  notifyTelegram?: boolean;
}): { id: number } {
  const db = getDb();
  const sym = input.symbol
    ? input.symbol.toUpperCase().endsWith("USDT")
      ? input.symbol.toUpperCase()
      : `${input.symbol.toUpperCase()}USDT`
    : null;

  const info = db
    .prepare(
      `INSERT INTO alert_rules (symbol, rule_type, threshold, enabled, notify_telegram, created_at)
       VALUES (?, ?, ?, 1, ?, ?)`
    )
    .run(sym, input.ruleType, input.threshold ?? null, input.notifyTelegram ? 1 : 0, new Date().toISOString());

  return { id: Number(info.lastInsertRowid) };
}

export function deleteAlertRule(id: number): void {
  const db = getDb();
  db.prepare("DELETE FROM alert_rules WHERE id = ?").run(id);
}

export function markAllAlertsRead(): void {
  const db = getDb();
  db.prepare("UPDATE alerts SET is_read = 1 WHERE is_read = 0").run();
}
