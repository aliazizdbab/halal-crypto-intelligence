import { NextResponse } from "next/server";
import { generateCsvReport, generateExcelReport, generatePdfReport } from "@/lib/services/export";
import type { DirectorySortOption } from "@/lib/services/repository";
import type { ShariahClassification } from "@/types/domain";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const format = (searchParams.get("format") || "excel").toLowerCase();
    const classParam = searchParams.get("classifications");
    const sort = (searchParams.get("sort") || "price_asc") as DirectorySortOption;
    const symbol = searchParams.get("symbol") || undefined;

    const classifications: ShariahClassification[] | "ALL" | undefined =
      classParam === "ALL"
        ? "ALL"
        : classParam
          ? (classParam.split(",").map((c) => c.trim().toUpperCase()) as ShariahClassification[])
          : ["HALAL", "HALAL_WITH_CONDITIONS"];

    const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");

    if (format === "csv") {
      const csv = generateCsvReport({ classifications, sort });
      return new NextResponse(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="halal-crypto-directory-${stamp}.csv"`,
        },
      });
    }

    if (format === "pdf") {
      const pdfBuf = generatePdfReport({ classifications, sort, symbol });
      const name = symbol ? `halal-crypto-${symbol.toUpperCase()}-${stamp}.pdf` : `halal-crypto-report-${stamp}.pdf`;
      return new NextResponse(new Uint8Array(pdfBuf), {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${name}"`,
        },
      });
    }

    // Default: multi-sheet Excel report
    const xlsxBuf = await generateExcelReport({ classifications, sort });
    return new NextResponse(new Uint8Array(xlsxBuf), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="halal-crypto-intelligence-${stamp}.xlsx"`,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Report generation failed" },
      { status: 500 }
    );
  }
}
