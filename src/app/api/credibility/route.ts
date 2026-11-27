import { NextResponse } from "next/server";
import { z } from "zod";
import { upsertCredibilityFactor } from "@/lib/services/repository";

export const dynamic = "force-dynamic";

const CredibilitySchema = z.object({
  symbol: z.string().min(2).max(20),
  factorKey: z.enum([
    "team_credibility",
    "technology_security",
    "independent_audits",
    "real_world_adoption",
    "transparency_documentation",
    "development_activity",
    "strategic_partnerships",
  ]),
  score: z.number().min(0).max(100).nullable(),
  evidenceEn: z.string().min(2).max(2000),
  evidenceAr: z.string().min(2).max(2000),
  sourceName: z.string().min(2).max(240),
  sourceUrl: z.string().url().nullable().optional().or(z.literal("")),
  confidenceLevel: z.enum(["HIGH", "MEDIUM", "LOW", "UNAVAILABLE"]),
  isAvailable: z.boolean(),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = CredibilitySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: "Invalid credibility factor payload", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    upsertCredibilityFactor({
      ...parsed.data,
      sourceUrl: parsed.data.sourceUrl === "" ? null : parsed.data.sourceUrl ?? null,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed to update credibility factor" },
      { status: 500 }
    );
  }
}
