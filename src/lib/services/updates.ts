export const GITHUB_OWNER = process.env.GITHUB_OWNER || "aliazizdbab";
export const GITHUB_REPO = process.env.GITHUB_REPO || "halal-crypto-intelligence";
export const APP_VERSION = process.env.npm_package_version || "1.0.0";

export interface ReleaseAssetInfo {
  name: string;
  downloadUrl: string;
  sizeBytes: number;
  platform: "windows" | "android" | "checksum" | "other";
}

export interface LatestReleaseInfo {
  currentVersion: string;
  latestVersion: string | null;
  updateAvailable: boolean;
  releaseName: string | null;
  releaseNotes: string | null;
  publishedAt: string | null;
  htmlUrl: string;
  windowsAsset: ReleaseAssetInfo | null;
  androidAsset: ReleaseAssetInfo | null;
  allAssets: ReleaseAssetInfo[];
  checkedAt: string;
  source: string;
}

/**
 * Compares two semantic version strings (e.g., "1.0.0" vs "v1.2.0").
 * Returns 1 if a > b, -1 if a < b, 0 if equal.
 */
export function compareSemver(a: string, b: string): number {
  const parse = (v: string) =>
    v
      .trim()
      .replace(/^v/i, "")
      .split("-")[0]
      .split(".")
      .map((n) => parseInt(n, 10) || 0);

  const pa = parse(a);
  const pb = parse(b);
  const len = Math.max(pa.length, pb.length, 3);
  for (let i = 0; i < len; i++) {
    const na = pa[i] ?? 0;
    const nb = pb[i] ?? 0;
    if (na > nb) return 1;
    if (na < nb) return -1;
  }
  return 0;
}

function classifyAsset(name: string): ReleaseAssetInfo["platform"] {
  const lower = name.toLowerCase();
  if (lower.endsWith(".exe") || lower.endsWith(".msi")) return "windows";
  if (lower.endsWith(".apk")) return "android";
  if (lower.includes("sha256") || lower.endsWith(".yml") || lower.endsWith(".blockmap")) return "checksum";
  return "other";
}

let cachedRelease: { expiresAt: number; data: LatestReleaseInfo } | null = null;

export async function fetchLatestGithubRelease(forceRefresh = false): Promise<LatestReleaseInfo> {
  if (!forceRefresh && cachedRelease && Date.now() < cachedRelease.expiresAt) {
    return cachedRelease.data;
  }

  const repoHtmlUrl = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases`;
  const apiUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`;
  const checkedAt = new Date().toISOString();

  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "HalalCryptoIntelligence/1.0",
  };
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(apiUrl, { headers, signal: controller.signal, cache: "no-store" });
    clearTimeout(timer);

    if (!res.ok) {
      const fallback: LatestReleaseInfo = {
        currentVersion: APP_VERSION,
        latestVersion: null,
        updateAvailable: false,
        releaseName: null,
        releaseNotes: null,
        publishedAt: null,
        htmlUrl: repoHtmlUrl,
        windowsAsset: null,
        androidAsset: null,
        allAssets: [],
        checkedAt,
        source: `GitHub Releases API (HTTP ${res.status})`,
      };
      cachedRelease = { expiresAt: Date.now() + 2 * 60 * 1000, data: fallback };
      return fallback;
    }

    const json = (await res.json()) as {
      tag_name?: string;
      name?: string;
      body?: string;
      published_at?: string;
      html_url?: string;
      assets?: Array<{ name: string; browser_download_url: string; size: number }>;
    };

    const latestVersion = (json.tag_name || "").replace(/^v/i, "") || null;
    const allAssets: ReleaseAssetInfo[] = (json.assets || []).map((a) => ({
      name: a.name,
      downloadUrl: a.browser_download_url,
      sizeBytes: a.size,
      platform: classifyAsset(a.name),
    }));

    const windowsAsset = allAssets.find((a) => a.platform === "windows") ?? null;
    const androidAsset = allAssets.find((a) => a.platform === "android") ?? null;
    const updateAvailable = latestVersion ? compareSemver(latestVersion, APP_VERSION) > 0 : false;

    const info: LatestReleaseInfo = {
      currentVersion: APP_VERSION,
      latestVersion,
      updateAvailable,
      releaseName: json.name || json.tag_name || null,
      releaseNotes: json.body || null,
      publishedAt: json.published_at || null,
      htmlUrl: json.html_url || repoHtmlUrl,
      windowsAsset,
      androidAsset,
      allAssets,
      checkedAt,
      source: "GitHub Releases API",
    };

    cachedRelease = { expiresAt: Date.now() + 5 * 60 * 1000, data: info };
    return info;
  } catch {
    clearTimeout(timer);
    return {
      currentVersion: APP_VERSION,
      latestVersion: null,
      updateAvailable: false,
      releaseName: null,
      releaseNotes: null,
      publishedAt: null,
      htmlUrl: repoHtmlUrl,
      windowsAsset: null,
      androidAsset: null,
      allAssets: [],
      checkedAt,
      source: "GitHub Releases API (Offline)",
    };
  }
}
