import { NextResponse } from "next/server";
import {
  AI_PROVIDER_DEFAULTS,
  getAiAgentSettings,
  saveAiAgentSettings,
  testAiAgentConnection,
} from "@/lib/services/ai-assistant";
import type { AiAgentSettings } from "@/types/domain";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const settings = getAiAgentSettings(false);
    return NextResponse.json({
      ok: true,
      settings,
      providers: AI_PROVIDER_DEFAULTS,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed to load AI settings" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      action?: "save" | "test";
      settings?: Partial<AiAgentSettings>;
    };

    if (body.action === "test") {
      const testResult = await testAiAgentConnection(body.settings);
      return NextResponse.json(testResult);
    }

    const updated = saveAiAgentSettings(body.settings || (body as Partial<AiAgentSettings>));
    return NextResponse.json({
      ok: true,
      settings: updated,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed to save AI settings" },
      { status: 500 }
    );
  }
}
