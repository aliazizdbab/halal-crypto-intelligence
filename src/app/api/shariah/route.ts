import { NextResponse } from "next/server";
import { z } from "zod";
import { upsertShariahAssessment } from "@/lib/services/repository";
import { sendTelegramNotification } from "@/lib/services/alerts";

export const dynamic = "force-dynamic";

const ShariahItemSchema = z.object({
  symbol: z.string().min(2).max(20),
  classification: z.enum([
    "HALAL",
    "HALAL_WITH_CONDITIONS",
    "SCHOLARLY_DISAGREEMENT",
    "NON_COMPLIANT",
    "UNVERIFIED",
  ]),
  authorityName: z.string().min(2).max(240),
  sourceUrl: z.string().url().nullable().optional().or(z.literal("")),
  assessmentDate: z.string().max(32).optional(),
  methodology: z.string().min(2).max(500),
  coreActivityNotesEn: z.string().min(2).max(2000),
  coreActivityNotesAr: z.string().min(2).max(2000),
  conditionsEn: z.string().max(1500).nullable().optional(),
  conditionsAr: z.string().max(1500).nullable().optional(),
  scholarlyDisagreementsEn: z.string().max(2000).nullable().optional(),
  scholarlyDisagreementsAr: z.string().max(2000).nullable().optional(),
  verificationStatus: z
    .enum(["VERIFIED", "THIRD_PARTY_ASSESSMENT", "ANALYST_ESTIMATE", "AI_OPINION", "UNVERIFIED"])
    .optional(),
  confidenceLevel: z.enum(["HIGH", "MEDIUM", "LOW", "UNAVAILABLE"]).optional(),
  reason: z.string().max(500).optional(),
});

const RequestSchema = z.union([
  ShariahItemSchema,
  z.object({ items: z.array(ShariahItemSchema).min(1).max(200) }),
]);

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: "Invalid Shariah record payload", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const items = "items" in parsed.data ? parsed.data.items : [parsed.data];
    let changedCount = 0;

    for (const item of items) {
      const res = upsertShariahAssessment({
        ...item,
        sourceUrl: item.sourceUrl === "" ? null : item.sourceUrl ?? null,
      });
      if (res.changedClassification) {
        changedCount++;
        if (items.length === 1) {
          await sendTelegramNotification(
            `🕌 *Shariah Classification Updated*\nAsset: \`${item.symbol.toUpperCase()}\`\nPrevious: ${res.previousClassification ?? "NONE"}\nNew: *${item.classification}*\nAuthority: ${item.authorityName}`
          ).catch(() => null);
        }
      }
    }

    return NextResponse.json({
      ok: true,
      processed: items.length,
      changedCount,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed to save Shariah assessment" },
      { status: 500 }
    );
  }
}
