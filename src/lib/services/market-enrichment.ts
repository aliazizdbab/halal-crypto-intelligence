import { getDb, runInTransaction } from "@/lib/db/client";

interface MarketCapRecord {
  baseAsset: string;
  coingeckoId?: string;
  name?: string;
  marketCap: number | null;
  fdv: number | null;
  circulatingSupply: number | null;
  totalSupply: number | null;
  maxSupply: number | null;
  marketCapRank: number | null;
  source: string;
}

export interface MarketCapSyncResult {
  updatedAssets: number;
  sourceUsed: string;
  syncedAt: string;
}

async function fetchFromCoinGecko(): Promise<MarketCapRecord[]> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "User-Agent": "HalalCryptoIntelligence/1.0",
  };
  if (process.env.COINGECKO_API_KEY) {
    headers["x-cg-demo-api-key"] = process.env.COINGECKO_API_KEY;
  }

  const results: MarketCapRecord[] = [];
  // Fetch top 250 coins in a single request to stay well within free rate limits
  const url =
    "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=1&sparkline=false";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);

  try {
    const res = await fetch(url, { headers, signal: controller.signal, cache: "no-store" });
    clearTimeout(timer);
    if (!res.ok) {
      throw new Error(`CoinGecko HTTP ${res.status}`);
    }
    const items = (await res.json()) as Array<{
      id: string;
      symbol: string;
      name: string;
      market_cap: number | null;
      fully_diluted_valuation: number | null;
      circulating_supply: number | null;
      total_supply: number | null;
      max_supply: number | null;
      market_cap_rank: number | null;
    }>;

    for (const item of items) {
      results.push({
        baseAsset: item.symbol.toUpperCase(),
        coingeckoId: item.id,
        name: item.name,
        marketCap: item.market_cap ?? null,
        fdv: item.fully_diluted_valuation ?? null,
        circulatingSupply: item.circulating_supply ?? null,
        totalSupply: item.total_supply ?? null,
        maxSupply: item.max_supply ?? null,
        marketCapRank: item.market_cap_rank ?? null,
        source: "CoinGecko Public API",
      });
    }
    return results;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

async function fetchFromCoinPaprika(): Promise<MarketCapRecord[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch("https://api.coinpaprika.com/v1/tickers?limit=500", {
      headers: { Accept: "application/json", "User-Agent": "HalalCryptoIntelligence/1.0" },
      signal: controller.signal,
      cache: "no-store",
    });
    clearTimeout(timer);
    if (!res.ok) {
      throw new Error(`CoinPaprika HTTP ${res.status}`);
    }
    const items = (await res.json()) as Array<{
      name: string;
      symbol: string;
      rank: number;
      circulating_supply?: number;
      total_supply?: number;
      max_supply?: number;
      quotes?: { USD?: { price?: number; market_cap?: number } };
    }>;

    return items.map((item) => {
      const price = item.quotes?.USD?.price ?? null;
      const mcap = item.quotes?.USD?.market_cap ?? null;
      const maxOrTotal = item.max_supply && item.max_supply > 0 ? item.max_supply : item.total_supply ?? null;
      const fdv = price && maxOrTotal ? price * maxOrTotal : null;
      return {
        baseAsset: item.symbol.toUpperCase(),
        name: item.name,
        marketCap: mcap && mcap > 0 ? mcap : null,
        fdv: fdv && fdv > 0 ? fdv : null,
        circulatingSupply: item.circulating_supply && item.circulating_supply > 0 ? item.circulating_supply : null,
        totalSupply: item.total_supply && item.total_supply > 0 ? item.total_supply : null,
        maxSupply: item.max_supply && item.max_supply > 0 ? item.max_supply : null,
        marketCapRank: item.rank ?? null,
        source: "CoinPaprika Public API",
      };
    });
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

export async function syncMarketCapAndSupply(): Promise<MarketCapSyncResult> {
  const db = getDb();
  const now = new Date().toISOString();

  let records: MarketCapRecord[] = [];
  let sourceUsed = "CoinGecko Public API";

  try {
    records = await fetchFromCoinGecko();
  } catch {
    records = await fetchFromCoinPaprika();
    sourceUsed = "CoinPaprika Public API";
  }

  // Index by coingeckoId AND highest-ranked baseAsset to avoid symbol collisions
  const byCgId = new Map<string, MarketCapRecord>();
  const bySymbol = new Map<string, MarketCapRecord>();

  for (const rec of records) {
    if (rec.coingeckoId) {
      byCgId.set(rec.coingeckoId, rec);
    }
    const existing = bySymbol.get(rec.baseAsset);
    if (!existing || ((rec.marketCapRank ?? 99999) < (existing.marketCapRank ?? 99999))) {
      bySymbol.set(rec.baseAsset, rec);
    }
  }

  const assets = db
    .prepare("SELECT symbol, base_asset, coingecko_id, name, is_curated FROM assets WHERE is_spot_allowed = 1")
    .all() as Array<{
    symbol: string;
    base_asset: string;
    coingecko_id: string | null;
    name: string;
    is_curated: number;
  }>;

  let updatedAssets = 0;

  runInTransaction((tx) => {
    const updateSnap = tx.prepare(`
      UPDATE market_snapshots
      SET market_cap = ?,
          fdv = ?,
          circulating_supply = ?,
          total_supply = ?,
          max_supply = ?,
          market_cap_rank = ?,
          market_cap_source = ?
      WHERE symbol = ?
    `);

    const updateName = tx.prepare(`
      UPDATE assets SET name = ?, updated_at = ? WHERE symbol = ? AND is_curated = 0
    `);

    for (const asset of assets) {
      const match =
        (asset.coingecko_id ? byCgId.get(asset.coingecko_id) : undefined) ||
        bySymbol.get(asset.base_asset.toUpperCase());

      if (!match) continue;

      const info = updateSnap.run(
        match.marketCap,
        match.fdv,
        match.circulatingSupply,
        match.totalSupply,
        match.maxSupply,
        match.marketCapRank,
        match.source,
        asset.symbol
      );

      if (info.changes > 0) {
        updatedAssets++;
      }

      if (asset.is_curated === 0 && match.name && asset.name === asset.base_asset) {
        updateName.run(match.name, now, asset.symbol);
      }
    }

    tx.prepare(
      `INSERT INTO sync_status (service_name, status, endpoint_used, records_processed, error_message, last_synced_at)
       VALUES ('market_cap', 'CONNECTED', ?, ?, NULL, ?)
       ON CONFLICT(service_name) DO UPDATE SET
         status = 'CONNECTED',
         endpoint_used = excluded.endpoint_used,
         records_processed = excluded.records_processed,
         error_message = NULL,
         last_synced_at = excluded.last_synced_at`
    ).run(sourceUsed, updatedAssets, now);
  });

  return {
    updatedAssets,
    sourceUsed,
    syncedAt: now,
  };
}

export interface GithubRepoMetrics {
  repo: string;
  stars: number | null;
  forks: number | null;
  openIssues: number | null;
  pushedAt: string | null;
  fetchedAt: string;
  available: boolean;
}

export async function getGithubRepoMetrics(repo: string | null): Promise<GithubRepoMetrics | null> {
  if (!repo || !repo.includes("/")) return null;
  const db = getDb();

  const cached = db
    .prepare("SELECT repo, stars, forks, open_issues, pushed_at, fetched_at FROM github_metrics_cache WHERE repo = ?")
    .get(repo) as
    | {
        repo: string;
        stars: number | null;
        forks: number | null;
        open_issues: number | null;
        pushed_at: string | null;
        fetched_at: string;
      }
    | undefined;

  if (cached) {
    const ageMs = Date.now() - new Date(cached.fetched_at).getTime();
    if (ageMs < 6 * 60 * 60 * 1000) {
      return {
        repo: cached.repo,
        stars: cached.stars,
        forks: cached.forks,
        openIssues: cached.open_issues,
        pushedAt: cached.pushed_at,
        fetchedAt: cached.fetched_at,
        available: true,
      };
    }
  }

  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "HalalCryptoIntelligence/1.0",
  };
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 7000);
  try {
    const res = await fetch(`https://api.github.com/repos/${repo}`, {
      headers,
      signal: controller.signal,
      cache: "no-store",
    });
    clearTimeout(timer);
    if (!res.ok) {
      return cached
        ? {
            repo: cached.repo,
            stars: cached.stars,
            forks: cached.forks,
            openIssues: cached.open_issues,
            pushedAt: cached.pushed_at,
            fetchedAt: cached.fetched_at,
            available: true,
          }
        : null;
    }

    const data = (await res.json()) as {
      stargazers_count?: number;
      forks_count?: number;
      open_issues_count?: number;
      pushed_at?: string;
    };
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO github_metrics_cache (repo, stars, forks, open_issues, pushed_at, commits_30d, fetched_at)
       VALUES (?, ?, ?, ?, ?, NULL, ?)
       ON CONFLICT(repo) DO UPDATE SET
         stars = excluded.stars,
         forks = excluded.forks,
         open_issues = excluded.open_issues,
         pushed_at = excluded.pushed_at,
         fetched_at = excluded.fetched_at`
    ).run(
      repo,
      data.stargazers_count ?? null,
      data.forks_count ?? null,
      data.open_issues_count ?? null,
      data.pushed_at ?? null,
      now
    );

    return {
      repo,
      stars: data.stargazers_count ?? null,
      forks: data.forks_count ?? null,
      openIssues: data.open_issues_count ?? null,
      pushedAt: data.pushed_at ?? null,
      fetchedAt: now,
      available: true,
    };
  } catch {
    clearTimeout(timer);
    return null;
  }
}
