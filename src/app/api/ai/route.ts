import { NextResponse } from "next/server";
import { z } from "zod";
import { runAiResearchQuery } from "@/lib/services/ai-assistant";

export const dynamic = "force-dynamic";

const AiQuerySchema = z.object({
  question: z.string().min(2).max(1500),
  symbol: z.string().max(20).optional(),
  lang: z.enum(["ar", "en"]).optional(),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = AiQuerySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: "Invalid research question" }, { status: 400 });
    }
    const response = await runAiResearchQuery(parsed.data);
    return NextResponse.json({ ok: true, ...response });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "AI Research Assistant error" },
      { status: 500 }
    );
  }
}
