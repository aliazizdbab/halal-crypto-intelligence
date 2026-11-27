# Halal Crypto Intelligence & Investment Analytics Platform — Architecture & Engineering Specification

> **Classification:** Institutional Research & Shariah Screening Terminal (Analytical Only — **No Trade Execution, No Futures/Margin/Leverage, No Withdrawal Permissions**)

---

## 1. System Architecture

The platform is built as a modular, full-stack **Next.js (App Router) + TypeScript + SQLite (`node:sqlite`)** application with clean domain service boundaries:

```
┌────────────────────────────────────────────────────────────────────────────┐
│                   Frontend Institutional Terminal (RTL/LTR)                │
│  Dashboard │ Directory Table │ Asset Research Page │ Compare │ Watchlist   │
│  Shariah Registry Manager │ AI Research Drawer │ Alerts Center │ Exports   │
│         Binance Live WebSocket Stream (Real-time Spot Prices)              │
└───────────────────────────────┬────────────────────────────────────────────┘
                                │ REST / JSON API Routes (/api/*)
┌───────────────────────────────▼────────────────────────────────────────────┐
│                        Domain Services Layer (src/lib/)                    │
│  ┌──────────────────────┐ ┌─────────────────────┐ ┌─────────────────────┐  │
│  │ Binance Spot Service │ │ Market & Tokenomics │ │ Technical Analysis  │  │
│  │ exchangeInfo + 24hr  │ │ CoinGecko/CoinPapr. │ │ RSI, MACD, EMA/SMA, │  │
│  │ klines + depth + WS  │ │ + GitHub activity   │ │ BB, ATR, ADX, VWAP  │  │
│  └──────────┬───────────┘ └──────────┬──────────┘ └──────────┬──────────┘  │
│  ┌──────────▼───────────┐ ┌──────────▼──────────┐ ┌──────────▼──────────┐  │
│  │ Shariah Engine       │ │ Scoring Engine      │ │ AI Research Engine  │  │
│  │ Auditable Registry   │ │ Credibility (7 wts) │ │ Evidence-backed Q&A │  │
│  │ Sources + Diffs      │ │ Growth + 3 Scenarios│ │ + Gemini/OpenAI/Loc │  │
│  └──────────┬───────────┘ └──────────┬──────────┘ └──────────┬──────────┘  │
│  ┌──────────▼───────────┐ ┌──────────▼──────────┐ ┌──────────▼──────────┐  │
│  │ Alerts & Monitor     │ │ Export Service      │ │ Audit & Snapshots   │  │
│  │ In-App + Telegram    │ │ Excel / CSV / PDF   │ │ Historical Tracking │  │
│  └──────────┬───────────┘ └──────────┬──────────┘ └──────────┬──────────┘  │
└─────────────┴────────────────────────┴───────────────────────┴─────────────┘
                                       │
┌──────────────────────────────────────▼─────────────────────────────────────┐
│                    SQLite Database (WAL Mode, node:sqlite)                 │
│  assets │ market_snapshots │ shariah_assessments │ credibility_factors     │
│  tokenomics_profiles │ investment_scenarios │ research_audit_log           │
│  historical_snapshots │ watchlists │ alerts │ alert_rules │ app_settings   │
└────────────────────────────────────────────────────────────────────────────┘
```

### Core Operating Principles Enforced in Code
1. **Spot Only:** Strict validation against Binance `/api/v3/exchangeInfo` requiring `status === "TRADING"`, `isSpotTradingAllowed === true` (or `"SPOT"` in `permissions` / `permissionSets`), and `quoteAsset === "USDT"`.
2. **Zero Trade Execution:** No signed order/withdrawal endpoints exist anywhere in the codebase.
3. **Zero Fabricated Data:** Missing external metrics or unresearched assets explicitly display `DATA UNAVAILABLE – REQUIRES VERIFICATION` and lower confidence scores instead of inventing scores or Shariah rulings.
4. **Full Provenance:** Every material record stores `source`, `sourceUrl`, `timestamp`, `verificationStatus`, `confidenceLevel`, and `lastUpdated`.
5. **Separation of Concerns:** Technical trading signals, project quality scores, and Shariah compliance classifications are strictly separated in both data schema and UI.

---

## 2. Database Schema (SQLite WAL)

| Table | Purpose |
|---|---|
| `assets` | Master Binance Spot USDT assets (`symbol`, `base_asset`, `quote_asset`, `name`, `binance_status`, `is_spot_allowed`, `spot_verified_at`, `official_website`, `github_repo`, `category`, `description_en`, `description_ar`) |
| `market_snapshots` | Latest verified market data (`price_usdt`, `price_change_24h`, `price_change_pct_24h`, `volume_24h`, `quote_volume_24h`, `high_24h`, `low_24h`, `bid_price`, `ask_price`, `market_cap`, `fdv`, `circulating_supply`, `total_supply`, `max_supply`, `source`, `fetched_at`) |
| `shariah_assessments` | Documented Shariah screening record per asset (`classification`, `authority_name`, `source_url`, `assessment_date`, `methodology`, `conditions_en`, `conditions_ar`, `scholarly_disagreements_en`, `scholarly_disagreements_ar`, `core_activity_notes`, `verification_status`, `confidence_level`, `last_verified_at`) |
| `credibility_factors` | Evidence-backed 7-factor weighted credibility breakdown per asset (`factor_key`, `weight`, `score`, `evidence_en`, `evidence_ar`, `source_name`, `source_url`, `research_date`, `confidence_level`, `is_available`) |
| `tokenomics_profiles` | Supply, allocation, unlocks, utility, burn/staking, governance, inflation rate, risk flags, and tokenomics risk rating |
| `investment_scenarios` | Bearish, Base, and Bullish analytical scenarios per asset (`assumptions`, `catalysts`, `risks`, `time_horizon`, `supporting_evidence`, `source_url`) |
| `historical_snapshots` | Time-series snapshots of price, market cap, Shariah classification, credibility score, and investment potential score for historical delta comparisons |
| `research_audit_log` | Immutable audit trail recording every change to Shariah classifications, scores, or evidence |
| `watchlists` | User watchlists (`symbol`, `notes`, `created_at`) |
| `alert_rules` & `alerts` | Configurable monitoring rules (Shariah change, Binance delisting, price move %, volume spike, unlock alert) + triggered alert history + Telegram delivery status |
| `app_settings` | Non-secret application preferences (Telegram enabled flag, polling interval, default language, AI provider mode) |

---

## 3. API Integration Plan

| Provider | Endpoints Used | Auth | Rate Limit & Resilience |
|---|---|---|---|
| **Binance Spot Public API** | `/api/v3/exchangeInfo`, `/api/v3/ticker/24hr`, `/api/v3/klines`, `/api/v3/depth`, WebSocket `wss://stream.binance.com:9443/stream` | Public (No key needed) | Automatic fallback to `https://data-api.binance.vision`, exponential backoff retry, in-memory + SQLite caching |
| **CoinGecko Free API** | `/api/v3/coins/markets` | Public (optional Demo/Pro key via `.env`) | Cached 10 min in SQLite; graceful fallback to CoinPaprika |
| **CoinPaprika Free API** | `/v1/tickers` | Public (No key) | Fallback source for Market Cap, Circulating/Total/Max Supply, FDV |
| **GitHub Public API** | `/repos/{owner}/{repo}` | Public (optional `GITHUB_TOKEN`) | Cached 6 hours; gracefully falls back to `DATA UNAVAILABLE` on rate limit |
| **AI Providers (Optional)** | Gemini API (`generateContent`), OpenAI Chat Completions, Ollama Local | `.env` only (server-side) | Built-in deterministic evidence-backed Q&A engine works offline/zero-key |
| **Telegram Bot API (Optional)** | `sendMessage` | `.env` only (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`) | Fire-and-log with delivery status persisted in `alerts` table |

---

## 4. Shariah Screening Methodology

### Five Explicit Classifications
- **`HALAL`** — Classified as permissible for Spot ownership/trading by a named Shariah authority or recognized Islamic crypto screening organization. Never presented as unanimous consensus.
- **`HALAL_WITH_CONDITIONS`** — Permissible subject to explicit conditions (e.g., Spot only, avoiding interest-bearing lending/staking pools, separating network token utility from third-party dApps).
- **`SCHOLARLY_DISAGREEMENT`** — Recognized Islamic finance authorities hold materially conflicting views (e.g., exchange tokens, stablecoins with T-bill reserves, hybrid governance tokens).
- **`NON_COMPLIANT`** — Classified as impermissible due to core Riba (lending/borrowing interest), gambling/Maysir, excessive Gharar, or prohibited core activity.
- **`UNVERIFIED`** — Insufficient reliable Shariah research; excluded from default Halal view until verified.

### Strict Scholarly Guardrails
- Technical utility never automatically implies Shariah compliance.
- Native network tokens (Layer-1/Layer-2 gas tokens) are assessed separately from dApps deployed on those networks.
- Every classification cites the issuing authority, URL, methodology, assessment date, conditions, and known scholarly differences.

---

## 5. Scoring Methodology

### A. Project Credibility Score (0–100, Evidence-Weighted)
| Factor | Weight | Primary Evidence Inputs |
|---|---|---|
| Team credibility & experience | 15% | Public verifiable leadership, track record, foundation governance |
| Technology & security | 20% | Architecture, uptime, consensus security, incident history |
| Independent security audits | 15% | Named third-party audit firms (CertiK, Trail of Bits, OpenZeppelin, Zellic, Halborn, Kudelski) |
| Real-world adoption & utility | 20% | Live network usage, enterprise/institutional adoption, live liquidity |
| Transparency & documentation | 10% | Open-source repos, whitepapers, governance disclosures |
| Development activity | 10% | Live GitHub repository health/activity + release cadence |
| Strategic partnerships & ecosystem | 10% | Verified partnerships (strictly separated from basic integrations) |

*Missing factors are marked `DATA UNAVAILABLE`, excluded from inflated assumptions, and reduce the overall confidence score.*

### B. Investment Potential & Growth Score (0–100, Separate from Credibility & Shariah)
Computed transparently from:
- Liquidity & Market Depth Score (Binance 24h Quote Volume + Spread)
- Market Cap / Valuation Realism & Dilution Risk (FDV / Market Cap ratio + Circulating Supply %)
- Tokenomics Sustainability (Inflation, Insider concentration, Unlocks, Real utility)
- Adoption, Competitive Positioning & TAM Evidence
- Historical Volatility & Drawdown Profile

Explicitly labeled as an **analytical attractiveness rating** — never a guaranteed profit claim or statistical probability of success.

---

## 6. Security Plan

- **No Trade / Withdrawal Surface:** Zero authenticated Binance trading/withdrawal endpoints implemented.
- **Secret Isolation:** Any optional API keys (`GEMINI_API_KEY`, `OPENAI_API_KEY`, `TELEGRAM_BOT_TOKEN`, `COINGECKO_API_KEY`) live strictly in server-side `.env.local` and are never sent to client bundles.
- **Input Validation:** All API inputs validated via `zod` schemas; SQLite queries strictly parameterized (zero string interpolation in SQL).
- **Security Headers:** `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy`, `Permissions-Policy`.

---

## 7. Development Milestones & Testing Strategy

1. **Core Schema & Database Layer** — Verified with unit tests for CRUD, audit logging, and snapshots.
2. **Binance Spot & Market Data Services** — Verified against live Binance Spot API (`exchangeInfo` SPOT validation + `ticker/24hr` + `klines`).
3. **Technical Analysis Engine** — Verified with mathematical unit tests (RSI, MACD, EMA, SMA, Bollinger, ATR, ADX, VWAP, Support/Resistance).
4. **Shariah Registry & Scoring Engines** — Verified with unit tests enforcing zero-fabrication, weighted credibility math, tokenomics risk flags, and sorting logic.
5. **AI Assistant, Alerts & Exports** — Verified via automated tests for deterministic Q&A, alert evaluation, Excel/CSV/PDF export generation.
6. **Bilingual RTL/LTR Institutional UI** — Verified with TypeScript strict check (`tsc --noEmit`), production build (`next build`), and live HTTP/UI endpoint verification.
