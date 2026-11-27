import type { Metadata, Viewport } from "next";
import "./globals.css";
import { LanguageProvider } from "@/components/LanguageProvider";
import { UpdateBanner } from "@/components/UpdateBanner";

export const metadata: Metadata = {
  title: "Halal Crypto Intelligence | منصة الاستخبارات الشرعية والاستثمارية للعملات الرقمية",
  description:
    "Institutional Shariah-compliant cryptocurrency screening, verified Binance Spot market analytics, tokenomics, technical indicators & evidence-backed research terminal.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/icon.svg",
    apple: "/icons/icon-192.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#060a13",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700;800&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body
        className="min-h-screen bg-[#060a13] text-slate-100 antialiased"
        style={{ fontFamily: "'Cairo', 'Inter', 'Segoe UI', Tahoma, sans-serif" }}
      >
        <LanguageProvider>
          <UpdateBanner />
          {children}
        </LanguageProvider>
      </body>
    </html>
  );
}
