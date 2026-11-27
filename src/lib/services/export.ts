import ExcelJS from "exceljs";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { getDb } from "@/lib/db/client";
import { getAssetDetail, getDashboardSummary, getDirectoryAssets, type DirectoryQueryOptions } from "./repository";

function styleHeaderRow(row: ExcelJS.Row): void {
  row.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
  row.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF0F172A" },
  };
  row.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  row.height = 26;
}

export async function generateExcelReport(options: DirectoryQueryOptions = {}): Promise<Buffer> {
  const generatedAt = new Date().toISOString();
  const dir = getDirectoryAssets({
    ...options,
    page: 1,
    pageSize: 500,
  });
  const rows = dir.rows;
  const db = getDb();

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Halal Crypto Intelligence Platform";
  workbook.created = new Date();

  // 1. Cryptocurrency Directory
  const dirSheet = workbook.addWorksheet("1. Cryptocurrency Directory");
  dirSheet.addRow([
    "Halal Crypto Intelligence Platform — Verified Binance Spot Directory",
    `Retrieved At (UTC): ${generatedAt}`,
    "Spot Trading Only — Not a Fatwa or Financial Advice",
  ]);
  dirSheet.getRow(1).font = { bold: true, size: 12, color: { argb: "FF10B981" } };
  dirSheet.addRow([]);
  const dirHeaders = dirSheet.addRow([
    "Rank",
    "Name",
    "Symbol",
    "Binance Spot Pair",
    "Price (USDT)",
    "24h Change %",
    "Market Cap (USD)",
    "24h Volume (USDT)",
    "Shariah Classification",
    "Shariah Authority",
    "Credibility (0-100)",
    "Investment Potential (0-100)",
    "Tokenomics Risk",
    "Overall Risk",
    "Binance Spot URL",
    "Price Timestamp (UTC)",
  ]);
  styleHeaderRow(dirHeaders);
  for (const r of rows) {
    dirSheet.addRow([
      r.rank,
      r.name,
      r.baseAsset,
      r.symbol,
      r.priceUsdt ?? "DATA UNAVAILABLE",
      r.priceChangePct24h !== null ? Number(r.priceChangePct24h.toFixed(2)) : "DATA UNAVAILABLE",
      r.marketCap ?? "DATA UNAVAILABLE",
      r.quoteVolume24h ?? "DATA UNAVAILABLE",
      r.shariahClassification,
      r.shariahAuthority,
      r.credibilityScore ?? "DATA UNAVAILABLE",
      r.investmentPotentialScore ?? "DATA UNAVAILABLE",
      r.tokenomicsRisk,
      r.overallRiskLevel,
      r.binanceSpotUrl,
      r.marketFetchedAt ?? "DATA UNAVAILABLE",
    ]);
  }
  dirSheet.columns.forEach((col) => {
    col.width = 20;
  });

  // 2. Live Market Prices
  const marketSheet = workbook.addWorksheet("2. Live Market Prices");
  styleHeaderRow(
    marketSheet.addRow([
      "Symbol",
      "Price (USDT)",
      "24h High",
      "24h Low",
      "Bid Price",
      "Ask Price",
      "Spread %",
      "24h Volatility %",
      "24h Quote Vol (USDT)",
      "Liquidity Score",
      "Price Source",
      "Market Cap Source",
      "Fetched At (UTC)",
    ])
  );
  for (const r of rows) {
    marketSheet.addRow([
      r.symbol,
      r.priceUsdt ?? "DATA UNAVAILABLE",
      r.high24h ?? "DATA UNAVAILABLE",
      r.low24h ?? "DATA UNAVAILABLE",
      r.bidPrice ?? "DATA UNAVAILABLE",
      r.askPrice ?? "DATA UNAVAILABLE",
      r.spreadPct ?? "DATA UNAVAILABLE",
      r.volatility24hPct ?? "DATA UNAVAILABLE",
      r.quoteVolume24h ?? "DATA UNAVAILABLE",
      r.liquidityScore ?? "DATA UNAVAILABLE",
      r.priceSource,
      r.marketCapSource ?? "DATA UNAVAILABLE",
      r.marketFetchedAt ?? "DATA UNAVAILABLE",
    ]);
  }
  marketSheet.columns.forEach((col) => {
    col.width = 18;
  });

  // 3. Shariah Screening Results
  const shariahSheet = workbook.addWorksheet("3. Shariah Screening");
  styleHeaderRow(
    shariahSheet.addRow([
      "Symbol",
      "Name",
      "Classification",
      "Authority",
      "Assessment Date",
      "Methodology",
      "Conditions (EN)",
      "Conditions (AR)",
      "Scholarly Disagreements (EN)",
      "Confidence",
      "Source URL",
    ])
  );
  for (const r of rows) {
    shariahSheet.addRow([
      r.symbol,
      r.name,
      r.shariahClassification,
      r.shariahAuthority,
      r.shariahAssessmentDate ?? "DATA UNAVAILABLE",
      r.shariahMethodology ?? "DATA UNAVAILABLE",
      r.shariahConditionsEn ?? "",
      r.shariahConditionsAr ?? "",
      r.shariahDisagreementsEn ?? "",
      r.shariahConfidence,
      r.shariahSourceUrl ?? "DATA UNAVAILABLE",
    ]);
  }
  shariahSheet.columns.forEach((col) => {
    col.width = 24;
  });

  // 4. Project Credibility Scores
  const credSheet = workbook.addWorksheet("4. Credibility Scores");
  styleHeaderRow(
    credSheet.addRow([
      "Symbol",
      "Overall Credibility",
      "Confidence",
      "Factor",
      "Weight %",
      "Factor Score",
      "Evidence",
      "Source",
      "Research Date",
    ])
  );
  for (const r of rows.slice(0, 80)) {
    const detail = getAssetDetail(r.symbol);
    if (!detail) continue;
    for (const f of detail.credibility.factors) {
      credSheet.addRow([
        r.symbol,
        detail.credibility.score ?? "DATA UNAVAILABLE",
        detail.credibility.confidence,
        f.factorKey,
        Math.round(f.weight * 100),
        f.isAvailable && f.score !== null ? f.score : "DATA UNAVAILABLE",
        f.evidenceEn,
        f.sourceName,
        f.researchDate,
      ]);
    }
  }
  credSheet.columns.forEach((col) => {
    col.width = 22;
  });

  // 5. Investment Potential & Scenarios
  const invSheet = workbook.addWorksheet("5. Investment Potential");
  styleHeaderRow(
    invSheet.addRow([
      "Symbol",
      "Name",
      "Investment Potential Score",
      "Confidence",
      "Combined Research Rating",
      "Bearish Scenario",
      "Base Scenario",
      "Bullish Scenario",
    ])
  );
  for (const r of rows.slice(0, 80)) {
    const detail = getAssetDetail(r.symbol);
    if (!detail) continue;
    const bear = detail.scenarios.find((s) => s.scenarioType === "BEARISH");
    const base = detail.scenarios.find((s) => s.scenarioType === "BASE");
    const bull = detail.scenarios.find((s) => s.scenarioType === "BULLISH");
    invSheet.addRow([
      r.symbol,
      r.name,
      r.investmentPotentialScore ?? "DATA UNAVAILABLE",
      r.investmentConfidence,
      r.combinedResearchRating ?? "DATA UNAVAILABLE",
      bear?.assumptionsEn ?? "DATA UNAVAILABLE",
      base?.assumptionsEn ?? "DATA UNAVAILABLE",
      bull?.assumptionsEn ?? "DATA UNAVAILABLE",
    ]);
  }
  invSheet.columns.forEach((col) => {
    col.width = 28;
  });

  // 6. Tokenomics Analysis
  const tokSheet = workbook.addWorksheet("6. Tokenomics Analysis");
  styleHeaderRow(
    tokSheet.addRow([
      "Symbol",
      "Circulating Supply",
      "Max Supply",
      "Market Cap (USD)",
      "FDV (USD)",
      "FDV / MCap Ratio",
      "Inflation %",
      "Insider Alloc %",
      "Next Major Unlock",
      "Tokenomics Risk",
      "Risk Flags",
    ])
  );
  for (const r of rows.slice(0, 120)) {
    const detail = getAssetDetail(r.symbol);
    const t = detail?.tokenomics;
    tokSheet.addRow([
      r.symbol,
      r.circulatingSupply ?? "DATA UNAVAILABLE",
      r.maxSupply ?? "Uncapped / Unavailable",
      r.marketCap ?? "DATA UNAVAILABLE",
      r.fdv ?? "DATA UNAVAILABLE",
      r.dilutionRatio ?? "DATA UNAVAILABLE",
      t?.inflationRatePct ?? "DATA UNAVAILABLE",
      t?.insiderAllocationPct ?? "DATA UNAVAILABLE",
      t?.nextMajorUnlockDate ? `${t.nextMajorUnlockDate} (${t.nextMajorUnlockPct ?? "?"}%)` : "None documented",
      r.tokenomicsRisk,
      t?.riskFlags.join(", ") ?? "",
    ]);
  }
  tokSheet.columns.forEach((col) => {
    col.width = 20;
  });

  // 7. Risk Assessment
  const riskSheet = workbook.addWorksheet("7. Risk Assessment");
  styleHeaderRow(
    riskSheet.addRow([
      "Symbol",
      "Name",
      "Overall Risk Level",
      "Tokenomics Risk",
      "Liquidity Score",
      "24h Volatility %",
      "Dilution Ratio",
      "Shariah Classification",
    ])
  );
  for (const r of rows) {
    riskSheet.addRow([
      r.symbol,
      r.name,
      r.overallRiskLevel,
      r.tokenomicsRisk,
      r.liquidityScore ?? "DATA UNAVAILABLE",
      r.volatility24hPct ?? "DATA UNAVAILABLE",
      r.dilutionRatio ?? "DATA UNAVAILABLE",
      r.shariahClassification,
    ]);
  }
  riskSheet.columns.forEach((col) => {
    col.width = 20;
  });

  // 8. Research Sources
  const srcSheet = workbook.addWorksheet("8. Research Sources");
  styleHeaderRow(
    srcSheet.addRow([
      "Symbol",
      "Official Website",
      "GitHub Repository",
      "Shariah Source URL",
      "Binance Spot Link",
      "Price Data Source",
      "Market Cap Data Source",
    ])
  );
  for (const r of rows) {
    srcSheet.addRow([
      r.symbol,
      r.officialWebsite ?? "DATA UNAVAILABLE",
      r.githubRepo ? `https://github.com/${r.githubRepo}` : "DATA UNAVAILABLE",
      r.shariahSourceUrl ?? "DATA UNAVAILABLE",
      r.binanceSpotUrl,
      r.priceSource,
      r.marketCapSource ?? "DATA UNAVAILABLE",
    ]);
  }
  srcSheet.columns.forEach((col) => {
    col.width = 28;
  });

  // 9. Historical Changes & Audit Trail
  const histSheet = workbook.addWorksheet("9. Historical Changes");
  styleHeaderRow(
    histSheet.addRow(["Timestamp (UTC)", "Symbol", "Entity", "Field", "Previous Value", "New Value", "Reason", "Source URL"])
  );
  const audits = db
    .prepare("SELECT * FROM research_audit_log ORDER BY created_at DESC LIMIT 200")
    .all() as Array<{
    created_at: string;
    symbol: string;
    entity_type: string;
    field_name: string;
    previous_value: string | null;
    new_value: string;
    reason: string | null;
    source_url: string | null;
  }>;
  for (const a of audits) {
    histSheet.addRow([
      a.created_at,
      a.symbol,
      a.entity_type,
      a.field_name,
      a.previous_value ?? "",
      a.new_value,
      a.reason ?? "",
      a.source_url ?? "",
    ]);
  }
  histSheet.columns.forEach((col) => {
    col.width = 24;
  });

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

function escapeCsvCell(val: unknown): string {
  const str = val === null || val === undefined ? "DATA UNAVAILABLE" : String(val);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function generateCsvReport(options: DirectoryQueryOptions = {}): string {
  const dir = getDirectoryAssets({
    ...options,
    page: 1,
    pageSize: 500,
  });

  const headers = [
    "Rank",
    "Name",
    "Symbol",
    "Binance_Spot_Pair",
    "Price_USDT",
    "Change_24h_Pct",
    "Market_Cap_USD",
    "Volume_24h_USDT",
    "Shariah_Classification",
    "Shariah_Authority",
    "Credibility_Score",
    "Investment_Potential_Score",
    "Tokenomics_Risk",
    "Overall_Risk",
    "Dilution_FDV_MCap",
    "Official_Website",
    "Binance_Spot_URL",
    "Shariah_Source_URL",
    "Retrieved_At_UTC",
  ];

  const lines = [headers.join(",")];
  for (const r of dir.rows) {
    lines.push(
      [
        r.rank,
        r.name,
        r.baseAsset,
        r.symbol,
        r.priceUsdt,
        r.priceChangePct24h !== null ? r.priceChangePct24h.toFixed(2) : null,
        r.marketCap,
        r.quoteVolume24h,
        r.shariahClassification,
        r.shariahAuthority,
        r.credibilityScore,
        r.investmentPotentialScore,
        r.tokenomicsRisk,
        r.overallRiskLevel,
        r.dilutionRatio,
        r.officialWebsite,
        r.binanceSpotUrl,
        r.shariahSourceUrl,
        r.marketFetchedAt || dir.generatedAt,
      ]
        .map(escapeCsvCell)
        .join(",")
    );
  }

  // UTF-8 BOM for clean Windows Excel compatibility
  return "\uFEFF" + lines.join("\r\n");
}

function formatCompact(val: number | null): string {
  if (val === null || !Number.isFinite(val)) return "N/A";
  if (val >= 1e9) return `$${(val / 1e9).toFixed(2)}B`;
  if (val >= 1e6) return `$${(val / 1e6).toFixed(2)}M`;
  if (val >= 1) return `$${val.toFixed(4)}`;
  return `$${val.toFixed(6)}`;
}

export function generatePdfReport(options: DirectoryQueryOptions & { symbol?: string } = {}): Buffer {
  const generatedAt = new Date().toISOString();
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });

  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, doc.internal.pageSize.getWidth(), 64, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.text("HALAL CRYPTO INTELLIGENCE & INVESTMENT ANALYTICS REPORT", 28, 30);
  doc.setFontSize(9);
  doc.setTextColor(148, 163, 184);
  doc.text(
    `Generated UTC: ${generatedAt}  |  Binance Spot Verified Only (No Futures/Margin/Leverage)  |  Analytical Research — Not a Fatwa or Financial Advice`,
    28,
    48
  );

  if (options.symbol) {
    const detail = getAssetDetail(options.symbol);
    if (detail) {
      const o = detail.overview;
      doc.setTextColor(15, 23, 42);
      doc.setFontSize(13);
      doc.text(`${o.name} (${o.symbol}) — Institutional Research Dossier`, 28, 90);
      doc.setFontSize(10);
      doc.text(
        `Price: ${formatCompact(o.priceUsdt)}  |  Market Cap: ${formatCompact(o.marketCap)}  |  24h Vol: ${formatCompact(o.quoteVolume24h)}  |  Shariah: ${o.shariahClassification}  |  Credibility: ${o.credibilityScore ?? "N/A"}/100  |  Growth: ${o.investmentPotentialScore ?? "N/A"}/100`,
        28,
        108
      );

      autoTable(doc, {
        startY: 122,
        head: [["Shariah Field", "Documented Record"]],
        body: [
          ["Classification", detail.shariah.classification],
          ["Authority", detail.shariah.authorityName],
          ["Assessment Date", detail.shariah.assessmentDate],
          ["Methodology", detail.shariah.methodology],
          ["Rationale", detail.shariah.coreActivityNotesEn],
          ["Conditions", detail.shariah.conditionsEn || "None documented"],
          ["Scholarly Disagreements", detail.shariah.scholarlyDisagreementsEn || "N/A"],
          ["Source URL", detail.shariah.sourceUrl || "DATA UNAVAILABLE"],
        ],
        styles: { fontSize: 8.5, cellPadding: 5 },
        headStyles: { fillColor: [16, 185, 129] },
      });

      const afterShariahY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 300;
      autoTable(doc, {
        startY: afterShariahY + 14,
        head: [["Credibility Factor", "Weight", "Score", "Confidence", "Evidence", "Source"]],
        body: detail.credibility.factors.map((f) => [
          f.factorKey,
          `${Math.round(f.weight * 100)}%`,
          f.isAvailable && f.score !== null ? `${f.score}/100` : "DATA UNAVAILABLE",
          f.confidenceLevel,
          f.evidenceEn,
          f.sourceName,
        ]),
        styles: { fontSize: 8, cellPadding: 4 },
        headStyles: { fillColor: [15, 23, 42] },
      });

      const arr = doc.output("arraybuffer");
      return Buffer.from(arr);
    }
  }

  const summary = getDashboardSummary();
  const dir = getDirectoryAssets({ ...options, page: 1, pageSize: 80 });

  doc.setTextColor(15, 23, 42);
  doc.setFontSize(10);
  doc.text(
    `Screened Assets: ${summary.totalScreenedAssets}  |  Halal: ${summary.countHalal}  |  Halal w/ Conditions: ${summary.countHalalWithConditions}  |  Disputed: ${summary.countScholarlyDisagreement}  |  Excluded: ${summary.countNonCompliant}  |  Avg Credibility: ${summary.averageCredibilityScore ?? "N/A"}  |  Avg Growth: ${summary.averageInvestmentPotentialScore ?? "N/A"}`,
    28,
    86
  );

  autoTable(doc, {
    startY: 100,
    head: [
      [
        "#",
        "Asset",
        "Pair",
        "Price USDT",
        "24h %",
        "Market Cap",
        "24h Vol",
        "Shariah",
        "Authority",
        "Cred.",
        "Growth",
        "Tok. Risk",
        "Risk",
      ],
    ],
    body: dir.rows.map((r) => [
      r.rank,
      `${r.name} (${r.baseAsset})`,
      r.symbol,
      formatCompact(r.priceUsdt),
      r.priceChangePct24h !== null ? `${r.priceChangePct24h.toFixed(2)}%` : "N/A",
      formatCompact(r.marketCap),
      formatCompact(r.quoteVolume24h),
      r.shariahClassification,
      r.shariahAuthority.slice(0, 32),
      r.credibilityScore ?? "N/A",
      r.investmentPotentialScore ?? "N/A",
      r.tokenomicsRisk,
      r.overallRiskLevel,
    ]),
    styles: { fontSize: 7.5, cellPadding: 4 },
    headStyles: { fillColor: [15, 23, 42] },
  });

  const arr = doc.output("arraybuffer");
  return Buffer.from(arr);
}
