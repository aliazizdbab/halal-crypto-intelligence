import type { Metadata, Viewport } from "next";
import { Cairo, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { LanguageProvider } from "@/components/LanguageProvider";
import { UpdateBanner } from "@/components/UpdateBanner";

const cairo = Cairo({
  subsets: ["arabic", "latin"],
  variable: "--font-cairo",
  weight: ["400", "500", "600", "700", "800"],
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  weight: ["400", "500", "600", "700"],
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  weight: ["400", "500", "600"],
});

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
    <html
      lang="ar"
      dir="rtl"
      className={`${cairo.variable} ${inter.variable} ${jetbrainsMono.variable} dark`}
    >
      <body className="min-h-screen bg-[#060a13] text-slate-100 antialiased" style={{ fontFamily: "var(--font-cairo), var(--font-inter), sans-serif" }}>
        <LanguageProvider>
          <UpdateBanner />
          {children}
        </LanguageProvider>
      </body>
    </html>
  );
}
