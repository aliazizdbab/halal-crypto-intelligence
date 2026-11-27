import { NextResponse } from "next/server";
import { fetchLatestGithubRelease, GITHUB_OWNER, GITHUB_REPO } from "@/lib/services/updates";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const force = searchParams.get("refresh") === "true";
  const release = await fetchLatestGithubRelease(force);
  return NextResponse.json({
    ok: true,
    repo: `${GITHUB_OWNER}/${GITHUB_REPO}`,
    runtime: process.env.HCI_RUNTIME || "web",
    ...release,
  });
}
