/* Halal Crypto Intelligence — Standalone 5-Tab Mobile Application Engine */
(function () {
  "use strict";

  const GITHUB_REPO = "aliazizdbab/halal-crypto-intelligence";
  const LEVERAGED_RX = /(UPUSDT|DOWNUSDT|BULLUSDT|BEARUSDT|2LUSDT|2SUSDT|3LUSDT|3SUSDT|5LUSDT|5SUSDT)$/i;

  const PROVIDERS = {
    gemini: { ar: "Google Gemini API", en: "Google Gemini", model: "gemini-2.5-flash", url: "https://generativelanguage.googleapis.com", needKey: true },
    openai: { ar: "OpenAI (GPT-4o)", en: "OpenAI API", model: "gpt-4o-mini", url: "https://api.openai.com/v1", needKey: true },
    deepseek: { ar: "DeepSeek (V3/R1)", en: "DeepSeek API", model: "deepseek-chat", url: "https://api.deepseek.com/v1", needKey: true },
    openrouter: { ar: "OpenRouter (شامل)", en: "OpenRouter", model: "google/gemini-2.5-flash", url: "https://openrouter.ai/api/v1", needKey: true },
    anthropic: { ar: "Anthropic Claude", en: "Claude API", model: "claude-3-5-haiku-latest", url: "https://api.anthropic.com/v1", needKey: true },
    ollama: { ar: "Ollama (شبكة محلية)", en: "Ollama LAN", model: "llama3.1", url: "http://192.168.1.100:11434", needKey: false },
    lmstudio: { ar: "LM Studio (محلي)", en: "LM Studio", model: "local-model", url: "http://192.168.1.100:1234/v1", needKey: false },
    custom_webhook: { ar: "وكيل / Webhook خارجي", en: "Custom Webhook", model: "custom-agent", url: "", needKey: false },
    builtin_heuristic: { ar: "المحلل المدمج (بدون مفتاح)", en: "Built-in Analyzer (No Key)", model: "hci-mobile-v1.1", url: "", needKey: false },
  };

  const SHARIAH_LABELS = {
    HALAL: { ar: "مباح", en: "Halal", cls: "tag-halal" },
    HALAL_WITH_CONDITIONS: { ar: "مباح بشروط", en: "Conditional", cls: "tag-cond" },
    SCHOLARLY_DISAGREEMENT: { ar: "مختلف فيه", en: "Disputed", cls: "tag-disp" },
    NON_COMPLIANT: { ar: "غير مباح", en: "Excluded", cls: "tag-non" },
    UNVERIFIED: { ar: "غير محلل", en: "Unanalyzed", cls: "tag-unv" },
  };

  // Persistent State
  function loadJson(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v ? JSON.parse(v) : fallback;
    } catch {
      return fallback;
    }
  }
  function saveJson(key, val) {
    try {
      localStorage.setItem(key, JSON.stringify(val));
    } catch {}
  }

  const state = {
    lang: localStorage.getItem("hci_lang") || "ar",
    tab: "markets", // markets | ai | watchlist | registry | settings
    aiSubTab: "chat", // chat | batch
    syncing: false,
    toast: null,
    lastSyncAt: localStorage.getItem("hci_last_sync") || null,
    binanceCount: 0,
    bybitCount: 0,
    // Filters
    shariahPreset: "HALAL_DEFAULT",
    exchangeFilter: "ALL",
    search: "",
    sort: "price_asc",
    page: 1,
    pageSize: 40,
    // Data maps
    assetsMap: new Map(), // symbol -> unified asset object
    customOverrides: loadJson("hci_custom_overrides_v2", {}), // symbol -> override assessment/profile
    marketCache: loadJson("hci_market_cache_v2", {}), // symbol -> { p, bp, yp, chg, qv, bqv, yqv, h, l, mcap, fdv, ex }
    watchlist: new Set(loadJson("hci_watchlist_v2", ["BTCUSDT", "XLMUSDT", "KASUSDT"])),
    priceAlerts: loadJson("hci_price_alerts_v2", []), // { id, symbol, dir: 'ABOVE'|'BELOW', target, triggered }
    triggeredNotifications: loadJson("hci_triggered_notes_v2", []),
    aiSettings: loadJson("hci_ai_settings_v2", {
      provider: "gemini",
      apiKey: "",
      baseUrl: "https://generativelanguage.googleapis.com",
      model: "gemini-2.5-flash",
      webhookUrl: "",
    }),
    serverUrl: localStorage.getItem("hci_server_url") || "",
    // Interactive UI states
    analyzingMap: {},
    chatMessages: [],
    chatSymbol: "",
    batchRunning: false,
    batchStatus: "",
    batchLogs: [],
    // Detail modal
    activeSymbol: null,
    detailTimeframe: "4h",
    detailCandleVenue: "AUTO",
    detailTech: null,
    detailTechLoading: false,
    detailLiqVenue: "COMBINED",
    detailLiq: null,
    detailLiqLoading: false,
    updateInfo: null,
  };

  // Initialize Assets Map from Seed + Cached Market + Overrides
  function rebuildAssetsMap() {
    const map = new Map();
    const seeds = Array.isArray(window.HCI_SEED_ASSETS) ? window.HCI_SEED_ASSETS : [];

    for (const s of seeds) {
      const credValid = (s.credibility || []).filter((f) => f.isAvailable && f.score !== null);
      const credScore =
        credValid.length > 0
          ? Number(
              (
                credValid.reduce((acc, f) => acc + f.score, 0) / credValid.length
              ).toFixed(1)
            )
          : null;

      map.set(s.symbol, {
        symbol: s.symbol,
        baseAsset: s.baseAsset,
        name: s.name,
        category: s.category,
        website: s.officialWebsite,
        exchanges: s.exchanges ? [...s.exchanges] : ["BINANCE", "BYBIT"],
        descriptionAr: s.descriptionAr,
        descriptionEn: s.descriptionEn,
        shariah: { ...s.shariah },
        tokenomics: { ...s.tokenomics },
        credibilityScore: credScore,
        credibilityFactors: s.credibility || [],
        scenarios: s.scenarios || [],
        priceUsdt: null,
        binancePrice: null,
        bybitPrice: null,
        change24h: null,
        quoteVol24h: null,
        high24h: null,
        low24h: null,
        marketCap: null,
        fdv: null,
        primaryExchange: (s.exchanges && s.exchanges[0]) || "BINANCE",
      });
    }

    // Merge cached live market pairs (including 400+ discovered Binance & Bybit pairs!)
    for (const [sym, m] of Object.entries(state.marketCache)) {
      let item = map.get(sym);
      const base = sym.replace(/USDT$/, "");
      if (!item) {
        item = {
          symbol: sym,
          baseAsset: base,
          name: m.name || base,
          category: m.ex && m.ex.length === 1 && m.ex[0] === "BYBIT" ? "Bybit Spot Asset" : "Spot Crypto Asset",
          website: null,
          exchanges: m.ex || ["BINANCE"],
          descriptionAr: "عملة متداولة في السوق الفوري (Spot) — اضغط «تحليل بالـ AI» لفحص نشاطها وتوكنوميكسها.",
          descriptionEn: "Active Spot trading pair — tap 'AI Analyze' for automated screening & tokenomics.",
          shariah: {
            classification: "UNVERIFIED",
            authorityName: "غير مفحوص بعد — بانتظار التحقق أو فحص الـ AI",
            sourceUrl: null,
            assessmentDate: "—",
            methodology: "Not yet screened",
            coreActivityNotesAr: "لم يتم فحص هذا المشروع بعد. يمكنك إرساله لوكيل الذكاء الاصطناعي بضغطة زر.",
            coreActivityNotesEn: "Not yet screened. Tap AI Analyze to evaluate.",
            conditionsAr: "التداول الفوري (Spot) فقط.",
            conditionsEn: "Spot ownership only.",
            verificationStatus: "UNVERIFIED",
          },
          tokenomics: {
            inflationRatePct: null,
            insiderAllocationPct: null,
            tokenUtilityAr: "يتطلب فحص الوثائق الرسمية أو تحليل الـ AI.",
            tokenUtilityEn: "Requires whitepaper or AI review.",
            unlockScheduleSummaryAr: "يتطلب تحققاً.",
            unlockScheduleSummaryEn: "Requires verification.",
            tokenomicsRisk: "UNAVAILABLE",
            riskFlags: [],
          },
          credibilityScore: null,
          credibilityFactors: [],
          scenarios: [],
          priceUsdt: null,
          binancePrice: null,
          bybitPrice: null,
          change24h: null,
          quoteVol24h: null,
          high24h: null,
          low24h: null,
          marketCap: null,
          fdv: null,
          primaryExchange: "BINANCE",
        };
        map.set(sym, item);
      }
      if (m.ex && m.ex.length > 0) item.exchanges = m.ex;
      if (m.name && item.name === item.baseAsset) item.name = m.name;
      item.priceUsdt = m.p ?? item.priceUsdt;
      item.binancePrice = m.bp ?? item.binancePrice;
      item.bybitPrice = m.yp ?? item.bybitPrice;
      item.change24h = m.chg ?? item.change24h;
      item.quoteVol24h = m.qv ?? item.quoteVol24h;
      item.high24h = m.h ?? item.high24h;
      item.low24h = m.l ?? item.low24h;
      item.marketCap = m.mcap ?? item.marketCap;
      item.fdv = m.fdv ?? item.fdv;
      item.primaryExchange = m.pex || item.primaryExchange;
    }

    // Apply user / AI overrides stored on device
    for (const [sym, ov] of Object.entries(state.customOverrides)) {
      let item = map.get(sym);
      const base = sym.replace(/USDT$/, "");
      if (!item) {
        item = {
          symbol: sym,
          baseAsset: base,
          name: ov.name || base,
          category: ov.category || "Custom Screened Asset",
          website: ov.website || null,
          exchanges: ["BINANCE"],
          descriptionAr: ov.descriptionAr || "",
          descriptionEn: ov.descriptionEn || "",
          shariah: ov.shariah,
          tokenomics: ov.tokenomics || { tokenomicsRisk: "MODERATE", riskFlags: [] },
          credibilityScore: ov.credibilityScore ?? null,
          credibilityFactors: ov.credibilityFactors || [],
          scenarios: ov.scenarios || [],
          priceUsdt: null,
          change24h: null,
          quoteVol24h: null,
          marketCap: null,
          fdv: null,
          primaryExchange: "BINANCE",
        };
        map.set(sym, item);
      } else {
        if (ov.name) item.name = ov.name;
        if (ov.category) item.category = ov.category;
        if (ov.descriptionAr) item.descriptionAr = ov.descriptionAr;
        if (ov.descriptionEn) item.descriptionEn = ov.descriptionEn;
        if (ov.shariah) item.shariah = { ...item.shariah, ...ov.shariah };
        if (ov.tokenomics) item.tokenomics = { ...item.tokenomics, ...ov.tokenomics };
        if (ov.credibilityScore !== undefined) item.credibilityScore = ov.credibilityScore;
        if (ov.scenarios && ov.scenarios.length > 0) item.scenarios = ov.scenarios;
      }
    }

    // Compute quantitative growth & dilution metrics on every row
    for (const item of map.values()) {
      const dil =
        item.fdv && item.marketCap && item.marketCap > 0
          ? Number((item.fdv / item.marketCap).toFixed(2))
          : null;
      item.dilutionRatio = dil;

      let liqScore = null;
      if (item.quoteVol24h !== null) {
        const v = item.quoteVol24h;
        liqScore = v >= 2e8 ? 94 : v >= 5e7 ? 84 : v >= 1e7 ? 72 : v >= 2e6 ? 58 : 36;
      }
      item.liquidityScore = liqScore;

      if (item.credibilityScore !== null || dil !== null) {
        const base = item.credibilityScore ?? 64;
        const dilAdj = dil !== null ? (dil <= 1.3 ? 8 : dil >= 2.5 ? -14 : 0) : 0;
        const liqAdj = liqScore !== null ? (liqScore - 65) * 0.2 : 0;
        item.growthScore = Math.max(15, Math.min(96, Number((base + dilAdj + liqAdj).toFixed(1))));
      } else {
        item.growthScore = null;
      }

      item.combinedScore =
        item.credibilityScore !== null && item.growthScore !== null
          ? Number((item.credibilityScore * 0.52 + item.growthScore * 0.48).toFixed(1))
          : null;
    }

    state.assetsMap = map;
  }

  // Formatting Helpers
  function fmtPrice(p) {
    if (p === null || p === undefined || !Number.isFinite(p)) return "—";
    if (p >= 1000) return "$" + p.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (p >= 1) return "$" + p.toFixed(4);
    if (p >= 0.01) return "$" + p.toFixed(5);
    if (p >= 0.0001) return "$" + p.toFixed(6);
    return "$" + p.toFixed(8);
  }

  function fmtUsd(v) {
    if (v === null || v === undefined || !Number.isFinite(v)) return "—";
    if (v >= 1e12) return "$" + (v / 1e12).toFixed(2) + "T";
    if (v >= 1e9) return "$" + (v / 1e9).toFixed(2) + "B";
    if (v >= 1e6) return "$" + (v / 1e6).toFixed(2) + "M";
    if (v >= 1e3) return "$" + (v / 1e3).toFixed(1) + "K";
    return "$" + v.toFixed(0);
  }

  function esc(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function showToast(msg) {
    state.toast = msg;
    render();
    setTimeout(() => {
      if (state.toast === msg) {
        state.toast = null;
        render();
      }
    }, 4500);
  }

  // =========================================================================
  // LIVE MULTI-EXCHANGE SYNC (BINANCE SPOT + BYBIT SPOT + MARKET CAPS)
  // =========================================================================
  async function fetchJsonWithFallback(urls, timeoutMs = 12000) {
    let lastErr = null;
    for (const u of urls) {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), timeoutMs);
      try {
        const res = await fetch(u, { signal: ctrl.signal, cache: "no-store" });
        clearTimeout(t);
        if (res.ok) return await res.json();
      } catch (e) {
        clearTimeout(t);
        lastErr = e;
      }
    }
    throw lastErr || new Error("Network unreachable");
  }

  async function syncAllSpotMarkets() {
    if (state.syncing) return;
    state.syncing = true;
    render();

    const nextCache = { ...state.marketCache };
    const binanceSet = new Set();
    const bybitSet = new Set();

    try {
      const [binSettled, bybSettled, mcapSettled] = await Promise.allSettled([
        // 1. Binance Spot exchangeInfo + 24hr tickers
        (async () => {
          const [info, tickers] = await Promise.all([
            fetchJsonWithFallback([
              "https://api.binance.com/api/v3/exchangeInfo?permissions=SPOT",
              "https://data-api.binance.vision/api/v3/exchangeInfo?permissions=SPOT",
            ]),
            fetchJsonWithFallback([
              "https://api.binance.com/api/v3/ticker/24hr",
              "https://data-api.binance.vision/api/v3/ticker/24hr",
            ]),
          ]);
          const allowed = new Set();
          for (const s of info.symbols || []) {
            if (
              s.status === "TRADING" &&
              s.quoteAsset === "USDT" &&
              s.isSpotTradingAllowed !== false &&
              !LEVERAGED_RX.test(s.symbol)
            ) {
              allowed.add(s.symbol);
            }
          }
          for (const tk of tickers || []) {
            if (!allowed.has(tk.symbol)) continue;
            const p = parseFloat(tk.lastPrice);
            const qv = parseFloat(tk.quoteVolume);
            if (!Number.isFinite(p) || p <= 0) continue;
            binanceSet.add(tk.symbol);
            const cur = nextCache[tk.symbol] || {};
            cur.bp = p;
            cur.bqv = Number.isFinite(qv) ? qv : 0;
            cur.p = p;
            cur.chg = parseFloat(tk.priceChangePercent) || 0;
            cur.h = parseFloat(tk.highPrice) || null;
            cur.l = parseFloat(tk.lowPrice) || null;
            cur.qv = cur.bqv + (cur.yqv || 0);
            cur.pex = "BINANCE";
            nextCache[tk.symbol] = cur;
          }
        })(),

        // 2. Bybit Spot v5 instruments + tickers
        (async () => {
          const [instRes, tickRes] = await Promise.all([
            fetchJsonWithFallback([
              "https://api.bybit.com/v5/market/instruments-info?category=spot&limit=1000",
              "https://api.bytick.com/v5/market/instruments-info?category=spot&limit=1000",
            ]),
            fetchJsonWithFallback([
              "https://api.bybit.com/v5/market/tickers?category=spot",
              "https://api.bytick.com/v5/market/tickers?category=spot",
            ]),
          ]);
          const allowed = new Set();
          for (const inst of instRes?.result?.list || []) {
            if (
              inst.status === "Trading" &&
              inst.quoteCoin === "USDT" &&
              !LEVERAGED_RX.test(inst.symbol) &&
              !/(2L|2S|3L|3S|5L|5S)$/i.test(inst.baseCoin || "")
            ) {
              allowed.add(inst.symbol);
            }
          }
          for (const tk of tickRes?.result?.list || []) {
            if (!allowed.has(tk.symbol)) continue;
            const p = parseFloat(tk.lastPrice);
            const yqv = parseFloat(tk.turnover24h);
            if (!Number.isFinite(p) || p <= 0) continue;
            bybitSet.add(tk.symbol);
            const cur = nextCache[tk.symbol] || {};
            cur.yp = p;
            cur.yqv = Number.isFinite(yqv) ? yqv : 0;
            const bqv = cur.bqv || 0;
            cur.qv = bqv + cur.yqv;
            if (!binanceSet.has(tk.symbol) || cur.yqv > bqv) {
              cur.p = p;
              cur.chg = (parseFloat(tk.price24hPcnt) || 0) * 100;
              cur.h = parseFloat(tk.highPrice24h) || cur.h || null;
              cur.l = parseFloat(tk.lowPrice24h) || cur.l || null;
              cur.pex = "BYBIT";
            }
            nextCache[tk.symbol] = cur;
          }
        })(),

        // 3. CoinPaprika top 500 market caps & FDV
        fetchJsonWithFallback(["https://api.coinpaprika.com/v1/tickers?limit=500"], 10000),
      ]);

      // Set unified exchanges array on each synced symbol
      const allSyncedSyms = new Set([...binanceSet, ...bybitSet]);
      for (const sym of allSyncedSyms) {
        const ex = [];
        if (binanceSet.has(sym)) ex.push("BINANCE");
        if (bybitSet.has(sym)) ex.push("BYBIT");
        nextCache[sym].ex = ex;
      }

      if (mcapSettled.status === "fulfilled" && Array.isArray(mcapSettled.value)) {
        const byBase = new Map();
        for (const c of mcapSettled.value) {
          const b = String(c.symbol || "").toUpperCase();
          if (!byBase.has(b)) byBase.set(b, c);
        }
        for (const [sym, entry] of Object.entries(nextCache)) {
          const base = sym.replace(/USDT$/, "");
          const cg = byBase.get(base);
          if (cg) {
            entry.name = cg.name || entry.name;
            entry.mcap = cg.quotes?.USD?.market_cap || entry.mcap || null;
            const maxS = cg.max_supply || cg.total_supply || 0;
            const pr = cg.quotes?.USD?.price || entry.p || 0;
            if (maxS > 0 && pr > 0) entry.fdv = maxS * pr;
          }
        }
      }

      if (binanceSet.size > 0 || bybitSet.size > 0) {
        state.binanceCount = binanceSet.size;
        state.bybitCount = bybitSet.size;
        state.marketCache = nextCache;
        state.lastSyncAt = new Date().toISOString();
        saveJson("hci_market_cache_v2", nextCache);
        localStorage.setItem("hci_last_sync", state.lastSyncAt);
        rebuildAssetsMap();
        evaluatePriceAlerts();
        showToast(
          state.lang === "ar"
            ? `تمت المزامنة: ${binanceSet.size} زوج Binance + ${bybitSet.size} زوج Bybit Spot`
            : `Synced ${binanceSet.size} Binance + ${bybitSet.size} Bybit Spot pairs`
        );
      } else {
        showToast(state.lang === "ar" ? "تعذر الوصول لواجهات الأسواق حالياً" : "Exchange APIs unreachable");
      }
    } finally {
      state.syncing = false;
      render();
    }
  }

  function evaluatePriceAlerts() {
    let changed = false;
    for (const al of state.priceAlerts) {
      if (al.triggered) continue;
      const item = state.assetsMap.get(al.symbol);
      const p = item?.priceUsdt;
      if (!p) continue;
      if ((al.dir === "ABOVE" && p >= al.target) || (al.dir === "BELOW" && p <= al.target)) {
        al.triggered = true;
        changed = true;
        state.triggeredNotifications.unshift({
          symbol: al.symbol,
          msgAr: `تنبيه سعري: وصل ${al.symbol.replace("USDT", "")} إلى ${fmtPrice(p)} (الهدف ${fmtPrice(al.target)})`,
          msgEn: `Price Alert: ${al.symbol} hit ${fmtPrice(p)} (target ${fmtPrice(al.target)})`,
          at: new Date().toLocaleTimeString(),
        });
      }
    }
    if (changed) {
      saveJson("hci_price_alerts_v2", state.priceAlerts);
      saveJson("hci_triggered_notes_v2", state.triggeredNotifications.slice(0, 30));
    }
  }

  // =========================================================================
  // CLIENT-SIDE TECHNICAL ANALYSIS & ORDER BOOK LIQUIDITY WALL ENGINE
  // =========================================================================
  function calcEMA(vals, period) {
    if (vals.length < period) return [];
    const k = 2 / (period + 1);
    let ema = vals.slice(0, period).reduce((a, b) => a + b, 0) / period;
    const out = new Array(period - 1).fill(null);
    out.push(ema);
    for (let i = period; i < vals.length; i++) {
      ema = vals[i] * k + ema * (1 - k);
      out.push(ema);
    }
    return out;
  }

  function calcRSI(closes, period = 14) {
    if (closes.length <= period) return null;
    let g = 0, l = 0;
    for (let i = 1; i <= period; i++) {
      const d = closes[i] - closes[i - 1];
      if (d >= 0) g += d; else l -= d;
    }
    let ag = g / period, al = l / period;
    for (let i = period + 1; i < closes.length; i++) {
      const d = closes[i] - closes[i - 1];
      ag = (ag * (period - 1) + (d > 0 ? d : 0)) / period;
      al = (al * (period - 1) + (d < 0 ? -d : 0)) / period;
    }
    if (al === 0) return 100;
    return 100 - 100 / (1 + ag / al);
  }

  async function loadDetailTechnicals(symbol, tf, venue) {
    state.detailTechLoading = true;
    renderDetailIfOpen();
    const item = state.assetsMap.get(symbol);
    const preferBybit =
      venue === "BYBIT" ||
      (venue === "AUTO" && item && !item.exchanges.includes("BINANCE") && item.exchanges.includes("BYBIT"));

    const bybitTfMap = { "1m": "1", "5m": "5", "15m": "15", "30m": "30", "1h": "60", "4h": "240", "1d": "D", "1w": "W", "1M": "M" };

    async function getBinanceCandles() {
      const raw = await fetchJsonWithFallback([
        `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${tf}&limit=140`,
        `https://data-api.binance.vision/api/v3/klines?symbol=${symbol}&interval=${tf}&limit=140`,
      ]);
      return {
        source: "Binance Spot",
        candles: raw.map((k) => ({
          time: Math.floor(k[0] / 1000),
          open: +k[1],
          high: +k[2],
          low: +k[3],
          close: +k[4],
          volume: +k[5],
        })),
      };
    }

    async function getBybitCandles() {
      const bTf = bybitTfMap[tf] || "240";
      const raw = await fetchJsonWithFallback([
        `https://api.bybit.com/v5/market/kline?category=spot&symbol=${symbol}&interval=${bTf}&limit=140`,
        `https://api.bytick.com/v5/market/kline?category=spot&symbol=${symbol}&interval=${bTf}&limit=140`,
      ]);
      const list = (raw?.result?.list || [])
        .map((k) => ({
          time: Math.floor(+k[0] / 1000),
          open: +k[1],
          high: +k[2],
          low: +k[3],
          close: +k[4],
          volume: +k[5],
        }))
        .sort((a, b) => a.time - b.time);
      return { source: "Bybit Spot", candles: list };
    }

    try {
      let res;
      if (preferBybit) {
        try { res = await getBybitCandles(); } catch { res = await getBinanceCandles(); }
      } else {
        try { res = await getBinanceCandles(); } catch { res = await getBybitCandles(); }
      }
      const candles = res.candles || [];
      const closes = candles.map((c) => c.close);
      const ema20Arr = calcEMA(closes, 20);
      const ema50Arr = calcEMA(closes, 50);
      const rsi14 = calcRSI(closes, 14);
      const ema12 = calcEMA(closes, 12);
      const ema26 = calcEMA(closes, 26);
      const macdVal =
        ema12.length && ema26.length && ema12[ema12.length - 1] !== null && ema26[ema26.length - 1] !== null
          ? ema12[ema12.length - 1] - ema26[ema26.length - 1]
          : null;

      const slice20 = closes.slice(-20);
      const bbMid = slice20.length ? slice20.reduce((a, b) => a + b, 0) / slice20.length : null;
      const bbStd = bbMid
        ? Math.sqrt(slice20.reduce((s, v) => s + (v - bbMid) ** 2, 0) / slice20.length)
        : null;

      const lows = candles.slice(-50).map((c) => c.low).sort((a, b) => a - b);
      const highs = candles.slice(-50).map((c) => c.high).sort((a, b) => b - a);

      state.detailTech = {
        source: res.source,
        candles,
        ema20Arr,
        ema50Arr,
        ema20: ema20Arr[ema20Arr.length - 1] ?? null,
        ema50: ema50Arr[ema50Arr.length - 1] ?? null,
        rsi14,
        macdVal,
        bbUpper: bbMid !== null && bbStd !== null ? bbMid + 2 * bbStd : null,
        bbLower: bbMid !== null && bbStd !== null ? bbMid - 2 * bbStd : null,
        support: lows[2] ?? lows[0] ?? null,
        resistance: highs[2] ?? highs[0] ?? null,
      };
    } catch {
      state.detailTech = null;
    } finally {
      state.detailTechLoading = false;
      renderDetailIfOpen();
    }
  }

  async function loadDetailOrderBookLiquidity(symbol, mode) {
    state.detailLiqLoading = true;
    renderDetailIfOpen();
    const books = [];

    async function pullBin() {
      try {
        const d = await fetchJsonWithFallback([
          `https://api.binance.com/api/v3/depth?symbol=${symbol}&limit=500`,
          `https://data-api.binance.vision/api/v3/depth?symbol=${symbol}&limit=500`,
        ], 8000);
        if (d?.bids?.length && d?.asks?.length) {
          books.push({
            venue: "BINANCE",
            bids: d.bids.map(([p, q]) => ({ price: +p, qty: +q })).filter((x) => x.price > 0 && x.qty > 0),
            asks: d.asks.map(([p, q]) => ({ price: +p, qty: +q })).filter((x) => x.price > 0 && x.qty > 0),
          });
        }
      } catch {}
    }

    async function pullByb() {
      try {
        const d = await fetchJsonWithFallback([
          `https://api.bybit.com/v5/market/orderbook?category=spot&symbol=${symbol}&limit=200`,
          `https://api.bytick.com/v5/market/orderbook?category=spot&symbol=${symbol}&limit=200`,
        ], 8000);
        const b = d?.result?.b || [];
        const a = d?.result?.a || [];
        if (b.length && a.length) {
          books.push({
            venue: "BYBIT",
            bids: b.map(([p, q]) => ({ price: +p, qty: +q })).filter((x) => x.price > 0 && x.qty > 0),
            asks: a.map(([p, q]) => ({ price: +p, qty: +q })).filter((x) => x.price > 0 && x.qty > 0),
          });
        }
      } catch {}
    }

    if (mode === "BINANCE") await pullBin();
    else if (mode === "BYBIT") await pullByb();
    else await Promise.all([pullBin(), pullByb()]);

    if (books.length === 0) {
      state.detailLiq = null;
      state.detailLiqLoading = false;
      renderDetailIfOpen();
      return;
    }

    const mids = books.map((bk) => (bk.bids[0].price + bk.asks[0].price) / 2);
    const midPrice = mids.reduce((a, b) => a + b, 0) / mids.length;

    const allBids = books
      .flatMap((bk) => bk.bids.map((x) => ({ price: x.price, qty: x.qty, usd: x.price * x.qty, venue: bk.venue })))
      .filter((x) => x.price <= midPrice * 1.002 && x.price >= midPrice * 0.88)
      .sort((a, b) => b.price - a.price);

    const allAsks = books
      .flatMap((bk) => bk.asks.map((x) => ({ price: x.price, qty: x.qty, usd: x.price * x.qty, venue: bk.venue })))
      .filter((x) => x.price >= midPrice * 0.998 && x.price <= midPrice * 1.12)
      .sort((a, b) => a.price - b.price);

    const bid2 = allBids.filter((x) => x.price >= midPrice * 0.98).reduce((s, x) => s + x.usd, 0);
    const ask2 = allAsks.filter((x) => x.price <= midPrice * 1.02).reduce((s, x) => s + x.usd, 0);
    const totBid = allBids.reduce((s, x) => s + x.usd, 0);
    const totAsk = allAsks.reduce((s, x) => s + x.usd, 0);
    const bRef = bid2 > 0 ? bid2 : totBid;
    const aRef = ask2 > 0 ? ask2 : totAsk;
    const buyPct = bRef + aRef > 0 ? Number(((bRef / (bRef + aRef)) * 100).toFixed(1)) : 50;

    const band = midPrice * 0.0025;
    function cluster(levels, totalSide) {
      const m = new Map();
      for (const l of levels) {
        const idx = Math.floor(l.price / band);
        const cur = m.get(idx) || { wp: 0, usd: 0, venues: new Set() };
        cur.wp += l.price * l.usd;
        cur.usd += l.usd;
        cur.venues.add(l.venue);
        m.set(idx, cur);
      }
      const arr = Array.from(m.values());
      const avg = totalSide / Math.max(1, arr.length);
      return arr
        .sort((a, b) => b.usd - a.usd)
        .slice(0, 5)
        .map((c) => {
          const price = c.wp / c.usd;
          const pct = Number((((price - midPrice) / midPrice) * 100).toFixed(2));
          const share = Number(((c.usd / Math.max(1, totalSide)) * 100).toFixed(1));
          const strength = share >= 18 || c.usd >= avg * 2.8 ? "MAJOR" : share >= 10 ? "STRONG" : "MOD";
          return { price, usd: c.usd, pct, share, strength, venues: Array.from(c.venues) };
        });
    }

    // Build 18-step cumulative curve per side for SVG Depth Chart
    const curve = [];
    const minB = allBids.length ? Math.max(midPrice * 0.95, allBids[allBids.length - 1].price) : midPrice * 0.98;
    const maxA = allAsks.length ? Math.min(midPrice * 1.05, allAsks[allAsks.length - 1].price) : midPrice * 1.02;
    for (let i = 16; i >= 1; i--) {
      const p = midPrice - ((midPrice - minB) * i) / 16;
      const cum = allBids.filter((x) => x.price >= p).reduce((s, x) => s + x.usd, 0);
      curve.push({ p, bid: cum, ask: 0 });
    }
    curve.push({ p: midPrice, bid: 0, ask: 0 });
    for (let i = 1; i <= 16; i++) {
      const p = midPrice + ((maxA - midPrice) * i) / 16;
      const cum = allAsks.filter((x) => x.price <= p).reduce((s, x) => s + x.usd, 0);
      curve.push({ p, bid: 0, ask: cum });
    }

    state.detailLiq = {
      midPrice,
      venues: books.map((b) => b.venue),
      bid2Usd: bRef,
      ask2Usd: aRef,
      buyPct,
      buyWalls: cluster(allBids, totBid),
      sellWalls: cluster(allAsks, totAsk),
      curve,
    };
    state.detailLiqLoading = false;
    renderDetailIfOpen();
  }

  // =========================================================================
  // DIRECT UNIVERSAL AI AGENT CLIENT (STANDALONE ANDROID)
  // =========================================================================
  function isMobileAiConfigured(cfg) {
    if (cfg.provider === "builtin_heuristic") return true;
    if (cfg.provider === "ollama" || cfg.provider === "lmstudio") return Boolean(cfg.baseUrl);
    if (cfg.provider === "custom_webhook") return Boolean(cfg.webhookUrl || cfg.baseUrl);
    return Boolean(cfg.apiKey && cfg.apiKey.trim());
  }

  async function callMobileAiAgent(systemPrompt, userPrompt, jsonMode = false) {
    const cfg = state.aiSettings;
    const meta = PROVIDERS[cfg.provider] || PROVIDERS.gemini;
    const model = (cfg.model || meta.model).trim();
    const baseUrl = (cfg.baseUrl || meta.url).trim().replace(/\/+$/, "");

    if (cfg.provider === "gemini") {
      if (!cfg.apiKey) throw new Error("يرجى إدخال مفتاح Gemini API في تبويب الإعدادات");
      const url = `${baseUrl}/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(cfg.apiKey.trim())}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: "user", parts: [{ text: userPrompt }] }],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 1600,
            ...(jsonMode ? { responseMimeType: "application/json" } : {}),
          },
        }),
      });
      if (!res.ok) throw new Error("Gemini HTTP " + res.status);
      const j = await res.json();
      const txt = j.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!txt) throw new Error("استجابة فارغة من Gemini");
      return { text: txt, label: `Gemini (${model})` };
    }

    if (cfg.provider === "anthropic") {
      if (!cfg.apiKey) throw new Error("يرجى إدخال مفتاح Claude API في الإعدادات");
      const res = await fetch(`${baseUrl}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": cfg.apiKey.trim(),
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body: JSON.stringify({
          model,
          max_tokens: 1600,
          system: systemPrompt,
          messages: [{ role: "user", content: userPrompt }],
        }),
      });
      if (!res.ok) throw new Error("Claude HTTP " + res.status);
      const j = await res.json();
      return { text: j.content?.[0]?.text || "", label: `Claude (${model})` };
    }

    if (cfg.provider === "ollama") {
      const res = await fetch(`${baseUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          stream: false,
          ...(jsonMode ? { format: "json" } : {}),
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
        }),
      });
      if (!res.ok) throw new Error("Ollama HTTP " + res.status);
      const j = await res.json();
      return { text: j.message?.content || "", label: `Ollama (${model})` };
    }

    if (cfg.provider === "custom_webhook") {
      const target = (cfg.webhookUrl || baseUrl).trim();
      if (!target) throw new Error("أدخل رابط الـ Webhook في الإعدادات");
      const headers = { "Content-Type": "application/json" };
      if (cfg.apiKey) headers.Authorization = "Bearer " + cfg.apiKey.trim();
      const res = await fetch(target, {
        method: "POST",
        headers,
        body: JSON.stringify({ model, systemPrompt, prompt: userPrompt, question: userPrompt, jsonMode }),
      });
      if (!res.ok) throw new Error("Webhook HTTP " + res.status);
      const raw = await res.text();
      try {
        const p = JSON.parse(raw);
        const out = p.choices?.[0]?.message?.content || p.output || p.answer || p.text || p.response || raw;
        return { text: typeof out === "string" ? out : JSON.stringify(out), label: "Custom Agent" };
      } catch {
        return { text: raw, label: "Custom Agent" };
      }
    }

    // OpenAI / DeepSeek / OpenRouter / LM Studio
    if (meta.needKey && !cfg.apiKey) {
      throw new Error(`يرجى إدخال مفتاح ${meta.en} في تبويب الإعدادات`);
    }
    const headers = { "Content-Type": "application/json" };
    if (cfg.apiKey) headers.Authorization = "Bearer " + cfg.apiKey.trim();
    const ep = baseUrl.endsWith("/chat/completions") ? baseUrl : `${baseUrl}/chat/completions`;
    const res = await fetch(ep, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model,
        temperature: 0.2,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });
    if (!res.ok) throw new Error(`${cfg.provider} HTTP ${res.status}`);
    const j = await res.json();
    return { text: j.choices?.[0]?.message?.content || "", label: `${cfg.provider.toUpperCase()} (${model})` };
  }

  async function analyzeCoinOnDevice(symbol, allowBuiltInFallback = false) {
    if (state.analyzingMap[symbol]) return;
    if (!isMobileAiConfigured(state.aiSettings) && !allowBuiltInFallback) {
      state.tab = "settings";
      showToast(
        state.lang === "ar"
          ? "اربط وكيل الذكاء الاصطناعي أولاً أو اختر «المحلل المدمج» من الإعدادات"
          : "Connect your AI Agent or select Built-in Analyzer in Settings"
      );
      return;
    }

    state.analyzingMap[symbol] = true;
    render();

    const item = state.assetsMap.get(symbol);
    const base = symbol.replace(/USDT$/, "");

    try {
      // Fetch CoinGecko public description/categories for grounding
      let cgMeta = null;
      try {
        const sRes = await fetchJsonWithFallback(
          [`https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(base)}`],
          6000
        );
        const hit = (sRes.coins || []).find((c) => String(c.symbol).toUpperCase() === base);
        if (hit?.id) {
          const cRes = await fetchJsonWithFallback(
            [`https://api.coingecko.com/api/v3/coins/${encodeURIComponent(hit.id)}?localization=false&tickers=false&market_data=false&community_data=false&developer_data=false`],
            6000
          );
          cgMeta = {
            name: cRes.name || hit.name,
            categories: cRes.categories || [],
            desc: String(cRes.description?.en || "").replace(/<[^>]+>/g, "").slice(0, 900),
          };
        }
      } catch {}

      let overrideRecord = null;

      if (state.aiSettings.provider === "builtin_heuristic" || !isMobileAiConfigured(state.aiSettings)) {
        const txt = `${(cgMeta?.categories || []).join(" ")} ${cgMeta?.desc || ""}`.toLowerCase();
        let cls = "HALAL_WITH_CONDITIONS";
        let reasonAr = "فحص كمي ووصف عام يشير إلى مشروع تقني فوري — يتطلب مراجعة شرعية بشرية للتثبت.";
        if (/\b(lending|borrow|interest|treasury|bond|riba|cdp|yield-bearing)\b/.test(txt)) {
          cls = "NON_COMPLIANT";
          reasonAr = "رصد مؤشرات إقراض واقتراض بفائدة أو سندات دين ربوية في وصف المشروع.";
        } else if (/\b(perpetual|futures|derivatives|margin|leverage|casino|gambling|betting)\b/.test(txt)) {
          cls = "NON_COMPLIANT";
          reasonAr = "رصد ارتباط بالمشتقات أو الرافعة المالية أو المراهنات.";
        } else if (/\b(meme|pepe|doge|inu|shib|frog)\b/.test(txt)) {
          cls = "NON_COMPLIANT";
          reasonAr = "عملة ميم مضاربية عالية الغرر تفتقر للمنفعة التقنية الجوهرية.";
        } else if (/\b(defi|dex|swap|amm|gaming)\b/.test(txt)) {
          cls = "SCHOLARLY_DISAGREEMENT";
          reasonAr = "نشاط تمويل لامركزي أو ألعاب يتطلب التحقق من خلو الإيرادات من المحظورات.";
        }
        const mcap = item?.marketCap || 0;
        const cScore = cls === "NON_COMPLIANT" ? 42 : mcap > 5e8 ? 75 : 64;
        overrideRecord = {
          name: cgMeta?.name || item?.name || base,
          category: cgMeta?.categories?.[0] || item?.category || "Spot Asset",
          descriptionAr: `مشروع ${cgMeta?.name || base} المتداول في السوق الفوري.`,
          descriptionEn: cgMeta?.desc?.slice(0, 260) || `${base} Spot asset.`,
          credibilityScore: cScore,
          shariah: {
            classification: cls,
            authorityName: "تحليل AI مدمج أولي — يتطلب مراجعة شرعية",
            sourceUrl: null,
            assessmentDate: new Date().toISOString().slice(0, 10),
            methodology: "فحص آلي أولي لنشاط البروتوكول (Spot فقط)",
            coreActivityNotesAr: reasonAr,
            coreActivityNotesEn: cgMeta?.desc?.slice(0, 260) || "Automated preliminary screening.",
            conditionsAr: "التداول الفوري (Spot) فقط؛ ليس فتوى شرعية رسمية.",
            conditionsEn: "Spot only; preliminary opinion.",
            verificationStatus: "AI_OPINION",
          },
          tokenomics: {
            tokenUtilityAr: `استخدامات منظومة ${cgMeta?.name || base}.`,
            tokenUtilityEn: `${base} network utility.`,
            unlockScheduleSummaryAr: "راجع الوثائق الرسمية لفك القفل.",
            unlockScheduleSummaryEn: "Check official vesting docs.",
            tokenomicsRisk: cls === "NON_COMPLIANT" ? "HIGH" : "MODERATE",
            riskFlags: cls === "NON_COMPLIANT" ? ["SHARIAH_NON_COMPLIANT"] : [],
          },
        };
      } else {
        const sys = `أنت محلل شرعي (وفق معايير AAOIFI للتداول الفوري Spot) ومحلل توكنوميكس للعملات الرقمية.
قواعد صارمة:
- صنّف NON_COMPLIANT إذا كان النشاط الأساسي يتضمن الإقراض بفائدة (ربا)، السندات، المشتقات والعقود الآجلة والرافعة، القمار، أو عملة ميم عديمة المنفعة.
- صنّف SCHOLARLY_DISAGREEMENT إذا كان بروتوكول DeFi مختلطاً محل خلاف.
- صنّف HALAL_WITH_CONDITIONS أو HALAL للمشاريع التقنية والبنية التحتية ذات المنفعة المشروعة (Spot فقط).
- أعد كائن JSON صالح فقط بدون أي نص خارجي.`;

        const usr = `حلل العملة ${symbol} وأعد JSON بهذا الشكل:
{
  "name": "${cgMeta?.name || item?.name || base}",
  "category": "فئة المشروع",
  "descriptionAr": "وصف المشروع بالعربية في جملتين",
  "descriptionEn": "2-sentence English summary",
  "classification": "HALAL" | "HALAL_WITH_CONDITIONS" | "SCHOLARLY_DISAGREEMENT" | "NON_COMPLIANT",
  "coreActivityNotesAr": "تفصيل النشاط الأساسي وسبب التقييم الشرعي الأولي بالعربية",
  "coreActivityNotesEn": "English rationale",
  "conditionsAr": "شروط التداول الفوري",
  "credibilityScore": 65,
  "tokenUtilityAr": "منفعة العملة",
  "tokenomicsRisk": "LOW" | "MODERATE" | "HIGH" | "VERY_HIGH",
  "bullAr": "السيناريو الإيجابي",
  "bearAr": "أبرز المخاطر والسيناريو السلبي"
}
بيانات مساندة:
${JSON.stringify({ cgMeta, price: item?.priceUsdt, marketCap: item?.marketCap, fdv: item?.fdv, exchanges: item?.exchanges })}`;

        const resp = await callMobileAiAgent(sys, usr, true);
        const clean = resp.text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
        const sIdx = clean.indexOf("{");
        const eIdx = clean.lastIndexOf("}");
        const parsed = JSON.parse(sIdx >= 0 && eIdx > sIdx ? clean.slice(sIdx, eIdx + 1) : clean);

        const validCls = ["HALAL", "HALAL_WITH_CONDITIONS", "SCHOLARLY_DISAGREEMENT", "NON_COMPLIANT"];
        const cls = validCls.includes(parsed.classification) ? parsed.classification : "HALAL_WITH_CONDITIONS";

        overrideRecord = {
          name: parsed.name || cgMeta?.name || base,
          category: parsed.category || "Spot Asset",
          descriptionAr: parsed.descriptionAr || "",
          descriptionEn: parsed.descriptionEn || "",
          credibilityScore: Math.max(15, Math.min(96, Number(parsed.credibilityScore) || 68)),
          shariah: {
            classification: cls,
            authorityName: `تحليل AI أولي (${resp.label}) — يتطلب مراجعة شرعية`,
            sourceUrl: null,
            assessmentDate: new Date().toISOString().slice(0, 10),
            methodology: "فحص نشاط البروتوكول والهيكل المالي بالذكاء الاصطناعي (Spot فقط)",
            coreActivityNotesAr: parsed.coreActivityNotesAr || "",
            coreActivityNotesEn: parsed.coreActivityNotesEn || "",
            conditionsAr: parsed.conditionsAr || "التملك الفوري (Spot) فقط؛ تقييم آلي أولي وليس فتوى رسمية.",
            conditionsEn: "Spot ownership only; preliminary AI assessment.",
            verificationStatus: "AI_OPINION",
          },
          tokenomics: {
            tokenUtilityAr: parsed.tokenUtilityAr || "منفعة ضمن منظومة البروتوكول.",
            tokenUtilityEn: "Protocol utility.",
            unlockScheduleSummaryAr: "تقييم بالـ AI — راجع مستندات المشروع الرسمية.",
            tokenomicsRisk: parsed.tokenomicsRisk || "MODERATE",
            riskFlags: cls === "NON_COMPLIANT" ? ["SHARIAH_NON_COMPLIANT"] : [],
          },
          scenarios: [
            { scenarioType: "BEARISH", assumptionsAr: parsed.bearAr || "تراجع السيولة أو ضغوط السوق.", assumptionsEn: "Market drawdown risk.", timeHorizon: "12–24M" },
            { scenarioType: "BULLISH", assumptionsAr: parsed.bullAr || "توسع تبني الشبكة والسيولة الفورية.", assumptionsEn: "Adoption expansion.", timeHorizon: "18–36M" },
          ],
        };
      }

      state.customOverrides[symbol] = overrideRecord;
      saveJson("hci_custom_overrides_v2", state.customOverrides);
      rebuildAssetsMap();
      showToast(
        state.lang === "ar"
          ? `تم تحليل وحفظ ${base}: ${SHARIAH_LABELS[overrideRecord.shariah.classification].ar}`
          : `Analyzed & saved ${base}: ${overrideRecord.shariah.classification}`
      );
    } catch (err) {
      showToast((state.lang === "ar" ? "فشل التحليل: " : "AI Error: ") + (err.message || "Error"));
    } finally {
      delete state.analyzingMap[symbol];
      render();
      renderDetailIfOpen();
    }
  }

  // =========================================================================
  // FILTERING & SORTING
  // =========================================================================
  function getFilteredRows() {
    let rows = Array.from(state.assetsMap.values());

    if (state.shariahPreset !== "ALL") {
      rows = rows.filter((r) => {
        const c = r.shariah.classification;
        if (state.shariahPreset === "HALAL_DEFAULT") return c === "HALAL" || c === "HALAL_WITH_CONDITIONS";
        return c === state.shariahPreset;
      });
    }

    if (state.exchangeFilter !== "ALL") {
      rows = rows.filter((r) => {
        const ex = r.exchanges || ["BINANCE"];
        if (state.exchangeFilter === "BINANCE") return ex.includes("BINANCE");
        if (state.exchangeFilter === "BYBIT") return ex.includes("BYBIT");
        if (state.exchangeFilter === "BYBIT_EXCLUSIVE") return ex.includes("BYBIT") && !ex.includes("BINANCE");
        return true;
      });
    }

    if (state.search.trim()) {
      const q = state.search.trim().toLowerCase();
      rows = rows.filter(
        (r) =>
          r.symbol.toLowerCase().includes(q) ||
          r.baseAsset.toLowerCase().includes(q) ||
          r.name.toLowerCase().includes(q) ||
          r.category.toLowerCase().includes(q)
      );
    }

    const numCmp = (a, b, asc) => {
      if (a === null || a === undefined) return 1;
      if (b === null || b === undefined) return -1;
      return asc ? a - b : b - a;
    };

    rows.sort((a, b) => {
      switch (state.sort) {
        case "price_asc": return numCmp(a.priceUsdt, b.priceUsdt, true) || a.symbol.localeCompare(b.symbol);
        case "price_desc": return numCmp(a.priceUsdt, b.priceUsdt, false);
        case "combined_desc": return numCmp(a.combinedScore, b.combinedScore, false);
        case "credibility_desc": return numCmp(a.credibilityScore, b.credibilityScore, false);
        case "growth_desc": return numCmp(a.growthScore, b.growthScore, false);
        case "mcap_desc": return numCmp(a.marketCap, b.marketCap, false);
        case "vol_desc": return numCmp(a.quoteVol24h, b.quoteVol24h, false);
        default: return numCmp(a.priceUsdt, b.priceUsdt, true);
      }
    });

    return rows;
  }

  // =========================================================================
  // CANVAS CANDLESTICK CHART RENDERER
  // =========================================================================
  function drawCandlestickCanvas() {
    const canvas = document.getElementById("hciCandleCanvas");
    if (!canvas || !state.detailTech || !state.detailTech.candles.length) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const W = Math.max(300, rect.width);
    const H = 220;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);

    ctx.fillStyle = "#050914";
    ctx.fillRect(0, 0, W, H);

    const candles = state.detailTech.candles.slice(-75);
    const offset = state.detailTech.candles.length - candles.length;
    if (!candles.length) return;

    let minP = Infinity, maxP = -Infinity, maxV = 0;
    for (const c of candles) {
      if (c.low < minP) minP = c.low;
      if (c.high > maxP) maxP = c.high;
      if (c.volume > maxV) maxV = c.volume;
    }
    const span = Math.max(maxP - minP, minP * 0.005 || 1);
    const padT = 14, padB = 38, padR = 58, padL = 8;
    const chartW = W - padL - padR;
    const chartH = H - padT - padB;

    const xOf = (i) => padL + ((i + 0.5) / candles.length) * chartW;
    const yOf = (p) => padT + ((maxP - p) / span) * chartH;

    // Grid lines + price labels
    ctx.strokeStyle = "rgba(148,163,184,0.1)";
    ctx.fillStyle = "#64748b";
    ctx.font = "10px monospace";
    for (let g = 0; g <= 4; g++) {
      const py = padT + (g / 4) * chartH;
      const pv = maxP - (g / 4) * span;
      ctx.beginPath();
      ctx.moveTo(padL, py);
      ctx.lineTo(W - padR, py);
      ctx.stroke();
      ctx.fillText(fmtPrice(pv).replace("$", ""), W - padR + 4, py + 3);
    }

    // Volume bars + Candles
    const barW = Math.max(2, (chartW / candles.length) * 0.68);
    candles.forEach((c, i) => {
      const x = xOf(i);
      const up = c.close >= c.open;
      const col = up ? "#10b981" : "#f43f5e";

      // Volume at bottom
      if (maxV > 0) {
        const vh = (c.volume / maxV) * 26;
        ctx.fillStyle = up ? "rgba(16,185,129,0.22)" : "rgba(244,63,94,0.22)";
        ctx.fillRect(x - barW / 2, H - 6 - vh, barW, vh);
      }

      // Wick
      ctx.strokeStyle = col;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, yOf(c.high));
      ctx.lineTo(x, yOf(c.low));
      ctx.stroke();

      // Body
      const yTop = yOf(Math.max(c.open, c.close));
      const yBot = yOf(Math.min(c.open, c.close));
      ctx.fillStyle = col;
      ctx.fillRect(x - barW / 2, yTop, barW, Math.max(1.5, yBot - yTop));
    });

    // EMA20 & EMA50 overlays
    function drawLine(arr, color) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      let started = false;
      candles.forEach((_, i) => {
        const val = arr[offset + i];
        if (val === null || val === undefined) return;
        const x = xOf(i), y = yOf(val);
        if (!started) { ctx.moveTo(x, y); started = true; }
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    }
    drawLine(state.detailTech.ema20Arr, "#38bdf8");
    drawLine(state.detailTech.ema50Arr, "#f59e0b");
  }

  // =========================================================================
  // UI RENDERING (5 TABS + FULL COIN DETAIL SHEET)
  // =========================================================================
  function renderMarketsTab() {
    const ar = state.lang === "ar";
    const all = Array.from(state.assetsMap.values());
    const halalCnt = all.filter((r) => r.shariah.classification === "HALAL").length;
    const condCnt = all.filter((r) => r.shariah.classification === "HALAL_WITH_CONDITIONS").length;
    const unvCnt = all.filter((r) => r.shariah.classification === "UNVERIFIED").length;
    const aiCnt = all.filter((r) => r.shariah.verificationStatus === "AI_OPINION").length;

    const filtered = getFilteredRows();
    const totalPages = Math.max(1, Math.ceil(filtered.length / state.pageSize));
    if (state.page > totalPages) state.page = 1;
    const slice = filtered.slice((state.page - 1) * state.pageSize, state.page * state.pageSize);

    const presets = [
      { k: "HALAL_DEFAULT", l: ar ? `مباح + بشروط (${halalCnt + condCnt})` : `Halal + Cond (${halalCnt + condCnt})` },
      { k: "HALAL", l: ar ? `مباح (${halalCnt})` : `Halal (${halalCnt})` },
      { k: "HALAL_WITH_CONDITIONS", l: ar ? `بشروط (${condCnt})` : `Cond (${condCnt})` },
      { k: "UNVERIFIED", l: ar ? `غير محلل (${unvCnt})` : `Unanalyzed (${unvCnt})` },
      { k: "SCHOLARLY_DISAGREEMENT", l: ar ? "مختلف فيه" : "Disputed" },
      { k: "NON_COMPLIANT", l: ar ? "مستبعد" : "Excluded" },
      { k: "ALL", l: ar ? `الكل (${all.length})` : `All (${all.length})` },
    ];

    const exChips = [
      { k: "ALL", l: ar ? "كل المنصات" : "All Venues" },
      { k: "BINANCE", l: "Binance" },
      { k: "BYBIT", l: "Bybit" },
      { k: "BYBIT_EXCLUSIVE", l: ar ? "حصري لـ Bybit" : "Bybit Only" },
    ];

    return `
      <div class="kpi-grid">
        <div class="kpi-card">
          <div class="kpi-label">${ar ? "المفحوص / الكلي" : "Screened / Total"}</div>
          <div class="kpi-val mono">${all.length - unvCnt} <span style="font-size:11px;color:#64748b">/ ${all.length}</span></div>
          <div class="kpi-sub">${aiCnt > 0 ? (ar ? `+${aiCnt} بتحليل AI` : `+${aiCnt} AI`) : "Binance + Bybit"}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">${ar ? "مباح + بشروط" : "Halal + Cond"}</div>
          <div class="kpi-val mono" style="color:#34d399">${halalCnt} <span style="font-size:11px;color:#fcd34d">+${condCnt}</span></div>
          <div class="kpi-sub">${ar ? "تداول فوري Spot" : "Spot Only"}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">${ar ? "غير محلل بعد" : "Unanalyzed"}</div>
          <div class="kpi-val mono" style="color:#c084fc">${unvCnt}</div>
          <div class="kpi-sub">${ar ? "جاهز لفحص AI" : "Tap AI Analyze"}</div>
        </div>
      </div>

      <div class="chip-scroll">
        ${presets
          .map(
            (p) =>
              `<button class="chip ${state.shariahPreset === p.k ? "active" : ""}" data-act="preset" data-val="${p.k}">${esc(p.l)}</button>`
          )
          .join("")}
      </div>

      <div class="chip-scroll">
        ${exChips
          .map(
            (e) =>
              `<button class="chip ${state.exchangeFilter === e.k ? "ex-active" : ""}" data-act="exfilter" data-val="${e.k}">${esc(e.l)}</button>`
          )
          .join("")}
      </div>

      <div class="filter-row">
        <input id="mobSearchInput" class="input-dark" value="${esc(state.search)}" placeholder="${
          ar ? "ابحث بالرمز أو الاسم (BTC, KAS, MNT, SOL)..." : "Search symbol or name..."
        }" />
        <select id="mobSortSelect" class="select-dark" style="width:auto;max-width:155px">
          <option value="price_asc" ${state.sort === "price_asc" ? "selected" : ""}>${ar ? "الأقل سعراً أولاً" : "Lowest Price"}</option>
          <option value="combined_desc" ${state.sort === "combined_desc" ? "selected" : ""}>${ar ? "أفضل تقييم مدمج" : "Best Combined"}</option>
          <option value="credibility_desc" ${state.sort === "credibility_desc" ? "selected" : ""}>${ar ? "الأعلى موثوقية" : "Credibility"}</option>
          <option value="growth_desc" ${state.sort === "growth_desc" ? "selected" : ""}>${ar ? "الأعلى نمواً" : "Growth"}</option>
          <option value="mcap_desc" ${state.sort === "mcap_desc" ? "selected" : ""}>${ar ? "القيمة السوقية" : "Market Cap"}</option>
          <option value="vol_desc" ${state.sort === "vol_desc" ? "selected" : ""}>${ar ? "الأعلى سيولة 24س" : "24h Volume"}</option>
          <option value="price_desc" ${state.sort === "price_desc" ? "selected" : ""}>${ar ? "الأعلى سعراً" : "Highest Price"}</option>
        </select>
      </div>

      <div class="note-card">
        ${
          ar
            ? "⚠️ تنبيه استثماري: انخفاض سعر الوحدة لا يعني أن العملة رخيصة؛ قارن دائماً القيمة السوقية (MCap) وFDV وجدران السيولة."
            : "⚠️ Low unit price ≠ cheap valuation. Always compare Market Cap, FDV, and order-book liquidity."
        }
      </div>

      <div class="coin-list">
        ${
          slice.length === 0
            ? `<div class="card-panel" style="text-align:center;color:#94a3b8;font-size:12px">${
                ar ? "لا توجد عملات مطابقة للفلاتر الحالية." : "No matching Spot assets."
              }</div>`
            : slice
                .map((r) => {
                  const sm = SHARIAH_LABELS[r.shariah.classification] || SHARIAH_LABELS.UNVERIFIED;
                  const isPos = (r.change24h || 0) >= 0;
                  const isUnv = r.shariah.classification === "UNVERIFIED";
                  const isAi = r.shariah.verificationStatus === "AI_OPINION";
                  const busy = Boolean(state.analyzingMap[r.symbol]);
                  const starred = state.watchlist.has(r.symbol);
                  const ex = r.exchanges || ["BINANCE"];

                  return `
                    <div class="coin-card" data-act="open-coin" data-sym="${r.symbol}">
                      <div class="coin-top">
                        <div>
                          <div>
                            <span data-act="star" data-sym="${r.symbol}" style="margin-inline-end:5px;color:${starred ? "#fbbf24" : "#475569"}">★</span>
                            <span class="coin-sym">${esc(r.baseAsset)}</span>
                            <span class="coin-name">${esc(r.name)}</span>
                          </div>
                          <div class="coin-cat">${esc(r.category)} ${r.marketCap ? "• MCap " + fmtUsd(r.marketCap) : ""}</div>
                        </div>
                        <div>
                          <div class="coin-price mono">${fmtPrice(r.priceUsdt)}</div>
                          <div class="coin-chg mono ${isPos ? "pos" : "neg"}">${
                            r.change24h !== null ? (isPos ? "+" : "") + r.change24h.toFixed(2) + "%" : "—"
                          }</div>
                        </div>
                      </div>
                      <div class="coin-bottom">
                        <div class="badge-row">
                          <span class="tag ${sm.cls}">${ar ? sm.ar : sm.en}</span>
                          ${isAi ? `<span class="tag tag-ai">✨ ${ar ? "تحليل AI" : "AI"}</span>` : ""}
                          ${ex.includes("BINANCE") ? `<span class="tag tag-bin">Binance</span>` : ""}
                          ${ex.includes("BYBIT") ? `<span class="tag tag-byb">Bybit</span>` : ""}
                        </div>
                        <div class="badge-row">
                          ${
                            isUnv
                              ? `<button class="btn-ai-inline" data-act="ai-row" data-sym="${r.symbol}" ${busy ? "disabled" : ""}>
                                  ${busy ? `<span class="spin">⟳</span> ${ar ? "يحلل..." : "..."}` : `✨ ${ar ? "تحليل بالـ AI" : "AI Analyze"}`}
                                </button>`
                              : `<span class="mono" style="font-size:10.5px;color:#94a3b8">
                                  ${ar ? "موثوقية" : "Cred"}: <strong style="color:#34d399">${r.credibilityScore ?? "—"}</strong>
                                  • ${ar ? "نمو" : "Grw"}: <strong style="color:#38bdf8">${r.growthScore ?? "—"}</strong>
                                </span>`
                          }
                        </div>
                      </div>
                    </div>
                  `;
                })
                .join("")
        }
      </div>

      ${
        totalPages > 1
          ? `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 2px;font-size:11px">
              <button class="btn-sm" data-act="page" data-val="${state.page - 1}" ${state.page <= 1 ? "disabled" : ""}>${ar ? "السابق" : "Prev"}</button>
              <span class="mono">${state.page} / ${totalPages} (${filtered.length})</span>
              <button class="btn-sm" data-act="page" data-val="${state.page + 1}" ${state.page >= totalPages ? "disabled" : ""}>${ar ? "التالي" : "Next"}</button>
            </div>`
          : ""
      }
    `;
  }

  function renderAiTab() {
    const ar = state.lang === "ar";
    const unvList = Array.from(state.assetsMap.values())
      .filter((r) => r.shariah.classification === "UNVERIFIED")
      .sort((a, b) => (b.quoteVol24h || 0) - (a.quoteVol24h || 0));

    const activeProv = PROVIDERS[state.aiSettings.provider] || PROVIDERS.gemini;
    const ready = isMobileAiConfigured(state.aiSettings);

    return `
      <div class="card-panel" style="display:flex;justify-content:space-between;align-items:center;gap:8px">
        <div>
          <div style="font-size:12px;font-weight:800;color:#fff">${ar ? "الوكيل المتصل حالياً:" : "Active AI Agent:"} ${esc(ar ? activeProv.ar : activeProv.en)}</div>
          <div style="font-size:10.5px;color:${ready ? "#34d399" : "#fbbf24"}">
            ${ready ? (ar ? "جاهز للتحليل والمحادثة" : "Connected & Ready") : ar ? "غير مربوط بمفتاح بعد — اضغط إعداد الوكيل" : "API Key missing — tap Configure"}
          </div>
        </div>
        <button class="btn-sm btn-purple" data-act="goto-settings">⚙️ ${ar ? "إعداد الوكيل" : "Configure"}</button>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
        <button class="btn-sm ${state.aiSubTab === "chat" ? "btn-sync" : ""}" style="justify-content:center" data-act="aisub" data-val="chat">
          💬 ${ar ? "المحادثة البحثية" : "Research Chat"}
        </button>
        <button class="btn-sm ${state.aiSubTab === "batch" ? "btn-purple" : ""}" style="justify-content:center" data-act="aisub" data-val="batch">
          ✨ ${ar ? `المحلل الجماعي (${unvList.length})` : `Batch Analyze (${unvList.length})`}
        </button>
      </div>

      ${
        state.aiSubTab === "chat"
          ? `
            <div class="card-panel">
              <div style="display:flex;gap:6px;margin-bottom:8px">
                <input id="mobChatSym" class="input-dark mono" style="width:120px" value="${esc(state.chatSymbol)}" placeholder="BTC, KAS..." />
                <span style="font-size:11px;color:#94a3b8;align-self:center">${ar ? "رمز العملة (اختياري لربط السيولة والتقرير)" : "Optional focus symbol"}</span>
              </div>

              <div style="max-height:330px;overflow-y:auto;margin-bottom:8px">
                ${
                  state.chatMessages.length === 0
                    ? `<div style="font-size:11px;color:#94a3b8;line-height:1.6">
                        ${ar ? "اسأل الوكيل عن الحكم الشرعي لأي عملة، التضخم وفك القفل، أو اطلب تحليل جدران الشراء والبيع الحية." : "Ask about Shariah status, tokenomics, or live Buy/Sell liquidity walls."}
                      </div>`
                    : state.chatMessages
                        .map(
                          (m) =>
                            `<div class="chat-bubble ${m.role === "user" ? "chat-user" : "chat-bot"}">${esc(m.text)}</div>`
                        )
                        .join("")
                }
              </div>

              <div style="display:flex;gap:6px">
                <input id="mobChatInput" class="input-dark" placeholder="${ar ? "اكتب سؤالك البحثي هنا..." : "Ask research question..."}" />
                <button class="btn-primary" style="white-space:nowrap" data-act="send-chat">${ar ? "إرسال" : "Ask"}</button>
              </div>
            </div>
          `
          : `
            <div class="card-panel">
              <div class="section-title">${ar ? "تحليل العملات غير المفحوصة تلقائياً" : "Batch Analyze Unscreened Coins"}</div>
              <p style="font-size:11px;color:#94a3b8;margin:0 0 10px;line-height:1.6">
                ${
                  ar
                    ? `يوجد (${unvList.length}) عملة غير محللة على Binance وBybit مرتبة حسب أعلى سيولة تداول. اضغط لفحص أعلى 5 أو 10 عملات وإضافتها فوراً بشارة «تحليل AI».`
                    : `${unvList.length} unanalyzed Spot pairs sorted by 24h volume. Run batch analysis to screen & save automatically.`
                }
              </p>
              <div style="display:flex;flex-wrap:wrap;gap:7px">
                <button class="btn-primary" data-act="run-batch" data-val="5" ${state.batchRunning ? "disabled" : ""}>
                  ${state.batchRunning ? "..." : ar ? "تحليل أعلى 5 عملات بالـ AI" : "Analyze Top 5"}
                </button>
                <button class="btn-sm btn-purple" data-act="run-batch" data-val="10" ${state.batchRunning ? "disabled" : ""}>
                  ${ar ? "تحليل أعلى 10 عملات" : "Analyze Top 10"}
                </button>
                <button class="btn-sm" data-act="run-batch-builtin" data-val="10" ${state.batchRunning ? "disabled" : ""}>
                  ${ar ? "فحص سريع مدمج (10 عملات)" : "Quick Built-in (10)"}
                </button>
              </div>
              ${state.batchStatus ? `<div style="margin-top:10px;font-size:11px;color:#e9d5ff">${esc(state.batchStatus)}</div>` : ""}
              ${
                state.batchLogs.length > 0
                  ? `<div style="margin-top:8px;display:flex;flex-direction:column;gap:4px">
                      ${state.batchLogs
                        .map(
                          (l) =>
                            `<div style="font-size:11px;padding:5px 8px;background:#070d19;border-radius:7px;display:flex;justify-content:space-between">
                              <strong class="mono">${esc(l.sym)}</strong>
                              <span style="color:#6ee7b7">${esc(l.res)}</span>
                            </div>`
                        )
                        .join("")}
                    </div>`
                  : ""
              }
            </div>
          `
      }
    `;
  }

  function renderWatchlistTab() {
    const ar = state.lang === "ar";
    const favs = Array.from(state.watchlist)
      .map((s) => state.assetsMap.get(s))
      .filter(Boolean);

    return `
      <div class="card-panel">
        <div class="section-title">${ar ? `⭐ قائمة المفضلة (${favs.length})` : `⭐ Watchlist (${favs.length})`}</div>
        ${
          favs.length === 0
            ? `<div style="font-size:11px;color:#94a3b8">${ar ? "اضغط نجمة ★ بجانب أي عملة في تبويب السوق لإضافتها هنا." : "Tap ★ on any coin in Markets to add it here."}</div>`
            : `<div class="coin-list">
                ${favs
                  .map((r) => {
                    const sm = SHARIAH_LABELS[r.shariah.classification] || SHARIAH_LABELS.UNVERIFIED;
                    return `
                      <div class="coin-card" data-act="open-coin" data-sym="${r.symbol}">
                        <div class="coin-top">
                          <div>
                            <strong>${esc(r.baseAsset)}</strong> <span class="coin-name">${esc(r.name)}</span>
                            <div style="margin-top:4px"><span class="tag ${sm.cls}">${ar ? sm.ar : sm.en}</span></div>
                          </div>
                          <div class="mono" style="text-align:end">
                            <div style="font-weight:800">${fmtPrice(r.priceUsdt)}</div>
                            <button class="btn-sm" style="margin-top:4px;padding:2px 7px;font-size:10px" data-act="star" data-sym="${r.symbol}">${ar ? "إزالة" : "Remove"}</button>
                          </div>
                        </div>
                      </div>
                    `;
                  })
                  .join("")}
              </div>`
        }
      </div>

      <div class="card-panel">
        <div class="section-title">${ar ? "🔔 منبهات الأسعار المستهدفة" : "🔔 Price Target Alerts"}</div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr auto;gap:5px;margin-bottom:10px">
          <input id="alSym" class="input-dark mono" placeholder="BTC" />
          <select id="alDir" class="select-dark">
            <option value="ABOVE">${ar ? "أعلى من ≥" : "Above ≥"}</option>
            <option value="BELOW">${ar ? "أقل من ≤" : "Below ≤"}</option>
          </select>
          <input id="alPrice" type="number" step="any" class="input-dark mono" placeholder="100000" />
          <button class="btn-primary" style="padding:8px 10px" data-act="add-alert">+</button>
        </div>

        ${state.priceAlerts
          .map(
            (a, i) => `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:7px 9px;background:#070d19;border-radius:8px;margin-bottom:5px;font-size:11px">
              <span class="mono"><strong>${esc(a.symbol)}</strong> ${a.dir === "ABOVE" ? "≥" : "≤"} $${a.target}</span>
              <div style="display:flex;gap:6px;align-items:center">
                <span style="color:${a.triggered ? "#34d399" : "#94a3b8"}">${a.triggered ? (ar ? "تحقق ✓" : "Hit ✓") : ar ? "نشط" : "Active"}</span>
                <button class="btn-sm" style="padding:2px 6px" data-act="del-alert" data-val="${i}">×</button>
              </div>
            </div>
          `
          )
          .join("")}

        ${
          state.triggeredNotifications.length > 0
            ? `<div style="margin-top:10px;border-top:1px solid var(--border);padding-top:8px">
                <div style="font-size:11px;font-weight:700;color:#fcd34d;margin-bottom:5px">${ar ? "التنبيهات المتحققة مؤخراً:" : "Triggered Alerts:"}</div>
                ${state.triggeredNotifications
                  .slice(0, 6)
                  .map((n) => `<div style="font-size:11px;color:#cbd5e1;margin-bottom:4px">• ${esc(ar ? n.msgAr : n.msgEn)}</div>`)
                  .join("")}
              </div>`
            : ""
        }
      </div>
    `;
  }

  function renderRegistryTab() {
    const ar = state.lang === "ar";
    const ovEntries = Object.entries(state.customOverrides);

    return `
      <div class="card-panel">
        <div class="section-title">${ar ? "📜 إضافة / اعتماد حكم شرعي موثّق" : "📜 Add / Override Shariah Record"}</div>
        <div style="display:flex;flex-direction:column;gap:7px">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:7px">
            <input id="regSym" class="input-dark mono" placeholder="${ar ? "الرمز مثل TIAUSDT" : "Symbol e.g. TIAUSDT"}" />
            <select id="regCls" class="select-dark">
              <option value="HALAL">HALAL — مباح</option>
              <option value="HALAL_WITH_CONDITIONS">مباح بشروط</option>
              <option value="SCHOLARLY_DISAGREEMENT">مختلف فيه</option>
              <option value="NON_COMPLIANT">غير مباح / مستبعد</option>
            </select>
          </div>
          <input id="regAuth" class="input-dark" placeholder="${ar ? "الجهة المرجعية (مثل Sharlife / SRB / مراجعة خاصة)" : "Screening Authority"}" />
          <input id="regUrl" class="input-dark mono" placeholder="https://..." />
          <textarea id="regNotes" rows="2" class="input-dark" placeholder="${ar ? "سبب الحكم الشرعي والشروط..." : "Ruling rationale & Spot conditions..."}"></textarea>
          <button class="btn-primary" data-act="save-reg">${ar ? "حفظ وتوثيق في السجل المحلي" : "Save Shariah Record"}</button>
        </div>
      </div>

      <div class="card-panel">
        <div class="section-title">
          <span>${ar ? `السجلات المضافة وتحليلات الـ AI المحفوظة (${ovEntries.length})` : `Saved AI & Custom Records (${ovEntries.length})`}</span>
          <button class="btn-sm" data-act="export-reg">JSON ⬇</button>
        </div>
        ${
          ovEntries.length === 0
            ? `<div style="font-size:11px;color:#94a3b8">${ar ? "أي عملة تحللها بزر «تحليل بالـ AI» أو تضيفها يدوياً ستظهر هنا ويمكنك تعديلها أو تصديرها." : "Coins analyzed via AI or added manually appear here."}</div>`
            : ovEntries
                .map(([sym, ov]) => {
                  const sm = SHARIAH_LABELS[ov.shariah?.classification] || SHARIAH_LABELS.UNVERIFIED;
                  return `
                    <div style="display:flex;justify-content:space-between;align-items:center;padding:8px;background:#070d19;border-radius:9px;margin-bottom:6px;font-size:11px">
                      <div data-act="open-coin" data-sym="${sym}" style="cursor:pointer">
                        <strong class="mono">${esc(sym)}</strong>
                        <span class="tag ${sm.cls}" style="margin-inline-start:5px">${ar ? sm.ar : sm.en}</span>
                        <div style="color:#94a3b8;font-size:10px;margin-top:2px">${esc(ov.shariah?.authorityName || "")}</div>
                      </div>
                      <button class="btn-sm" style="padding:3px 7px" data-act="del-reg" data-sym="${sym}">🗑</button>
                    </div>
                  `;
                })
                .join("")
        }
      </div>
    `;
  }

  function renderSettingsTab() {
    const ar = state.lang === "ar";
    const cfg = state.aiSettings;
    const meta = PROVIDERS[cfg.provider] || PROVIDERS.gemini;

    return `
      <div class="card-panel">
        <div class="section-title">🔌 ${ar ? "ربط وكيل الذكاء الاصطناعي (AI Agent)" : "Connect AI Agent"}</div>
        <p style="font-size:11px;color:#94a3b8;margin:0 0 9px;line-height:1.5">
          ${ar ? "اختر مزود الـ AI الذي سيقوم بتحليل العملات غير المفحوصة والإجابة عن أسئلتك مباشرة من هاتفك:" : "Select the AI provider used by inline 'AI Analyze' buttons and research chat:"}
        </p>

        <div class="provider-grid" style="margin-bottom:10px">
          ${Object.entries(PROVIDERS)
            .map(
              ([k, m]) => `
              <button class="prov-btn ${cfg.provider === k ? "active" : ""}" data-act="pick-prov" data-val="${k}">
                <div style="font-weight:800">${esc(ar ? m.ar : m.en)}</div>
                <div class="mono" style="font-size:9.5px;color:#64748b">${esc(m.model)}</div>
              </button>
            `
            )
            .join("")}
        </div>

        ${
          cfg.provider !== "builtin_heuristic"
            ? `
              <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:10px">
                <div>
                  <label style="font-size:11px;color:#cbd5e1;display:block;margin-bottom:4px">${ar ? "مفتاح الـ API (يُحفظ محلياً على هاتفك فقط)" : "API Key (Stored locally on device)"}</label>
                  <input id="setApiKey" type="password" class="input-dark mono" value="${esc(cfg.apiKey)}" placeholder="${cfg.provider === "gemini" ? "AIzaSy..." : "sk-..."}" />
                </div>
                <div>
                  <label style="font-size:11px;color:#cbd5e1;display:block;margin-bottom:4px">${ar ? "اسم النموذج (Model)" : "Model Name"}</label>
                  <input id="setModel" class="input-dark mono" value="${esc(cfg.model || meta.model)}" />
                </div>
                <div>
                  <label style="font-size:11px;color:#cbd5e1;display:block;margin-bottom:4px">${cfg.provider === "custom_webhook" ? "Webhook / Agent URL" : "API Base URL"}</label>
                  <input id="setBaseUrl" class="input-dark mono" value="${esc(cfg.provider === "custom_webhook" ? cfg.webhookUrl || cfg.baseUrl : cfg.baseUrl || meta.url)}" placeholder="https://..." />
                </div>
              </div>
            `
            : ""
        }

        <div style="display:flex;gap:8px">
          <button class="btn-primary" style="flex:1" data-act="save-ai-settings">${ar ? "حفظ وتفعيل الوكيل" : "Save AI Agent"}</button>
          <button class="btn-sm btn-purple" data-act="test-ai-settings">${ar ? "اختبار الاتصال" : "Test"}</button>
        </div>
      </div>

      <div class="card-panel">
        <div class="section-title">🖥️ ${ar ? "مزامنة اختيارية مع خادم سطح المكتب / السحابة" : "Optional Server Sync"}</div>
        <p style="font-size:11px;color:#94a3b8;margin:0 0 8px">
          ${ar ? "التطبيق يعمل بالكامل بدون خادم! إذا أردت ربطه بخادمك على الكمبيوتر (Wi-Fi) أو السحابة فضع الرابط هنا:" : "App works 100% standalone. Optionally connect to a desktop/cloud server:"}
        </p>
        <input id="setServerUrl" class="input-dark mono" value="${esc(state.serverUrl)}" placeholder="http://192.168.1.10:3000" />
        <div style="display:flex;gap:8px;margin-top:8px">
          <button class="btn-sm btn-sync" data-act="sync-from-server">${ar ? "جلب السجل الشرعي من الخادم" : "Pull Registry"}</button>
          <button class="btn-sm" data-act="open-remote-server">${ar ? "فتح واجهة الخادم" : "Open Server UI"}</button>
        </div>
      </div>

      <div class="card-panel" style="display:flex;justify-content:space-between;align-items:center">
        <div>
          <div style="font-size:12px;font-weight:800">${ar ? "إصدار التطبيق والتحديثات" : "App Version & Updates"}</div>
          <div class="mono" style="font-size:11px;color:#94a3b8">v${esc(window.HCI_APP_VERSION || "1.1.0")} • GitHub Releases</div>
        </div>
        <button class="btn-sm" data-act="check-update">${ar ? "فحص التحديث (.apk)" : "Check Update"}</button>
      </div>
    `;
  }

  // =========================================================================
  // FULL-SCREEN COIN DETAIL & ORDER BOOK LIQUIDITY SHEET
  // =========================================================================
  function renderDepthSvg(liq) {
    if (!liq || !liq.curve || liq.curve.length < 3) return "";
    const W = 360, H = 125, padX = 10, padY = 12;
    const pts = liq.curve;
    const maxU = Math.max(1, ...pts.map((p) => Math.max(p.bid, p.ask)));
    const xOf = (i) => padX + (i / (pts.length - 1)) * (W - padX * 2);
    const yOf = (u) => H - padY - (u / maxU) * (H - padY * 2);
    const midIdx = Math.floor(pts.length / 2);

    const bPts = pts.slice(0, midIdx + 1);
    const aPts = pts.slice(midIdx);
    const bLine = bPts.map((p, i) => `${i === 0 ? "M" : "L"}${xOf(i).toFixed(1)},${yOf(p.bid).toFixed(1)}`).join(" ");
    const bArea = `${bLine} L${xOf(midIdx).toFixed(1)},${H - padY} L${xOf(0).toFixed(1)},${H - padY} Z`;

    const aLine = aPts.map((p, i) => `${i === 0 ? "M" : "L"}${xOf(midIdx + i).toFixed(1)},${yOf(p.ask).toFixed(1)}`).join(" ");
    const aArea = `${aLine} L${xOf(pts.length - 1).toFixed(1)},${H - padY} L${xOf(midIdx).toFixed(1)},${H - padY} Z`;

    return `
      <svg viewBox="0 0 ${W} ${H}" style="width:100%;height:125px;background:#050914;border-radius:9px;border:1px solid #1e293b;margin:8px 0">
        <path d="${bArea}" fill="rgba(16,185,129,0.28)" />
        <path d="${bLine}" fill="none" stroke="#10b981" stroke-width="1.8" />
        <path d="${aArea}" fill="rgba(244,63,94,0.28)" />
        <path d="${aLine}" fill="none" stroke="#f43f5e" stroke-width="1.8" />
        <line x1="${xOf(midIdx)}" y1="${padY}" x2="${xOf(midIdx)}" y2="${H - padY}" stroke="#64748b" stroke-dasharray="3 3" />
      </svg>
    `;
  }

  function renderDetailIfOpen() {
    const container = document.getElementById("hciDetailPortal");
    if (!container) return;
    if (!state.activeSymbol) {
      container.innerHTML = "";
      return;
    }

    const ar = state.lang === "ar";
    const item = state.assetsMap.get(state.activeSymbol);
    if (!item) {
      container.innerHTML = "";
      return;
    }

    const sm = SHARIAH_LABELS[item.shariah.classification] || SHARIAH_LABELS.UNVERIFIED;
    const isAi = item.shariah.verificationStatus === "AI_OPINION";
    const busyAi = Boolean(state.analyzingMap[item.symbol]);
    const ex = item.exchanges || ["BINANCE"];
    const tfs = ["15m", "1h", "4h", "1d", "1w"];
    const tech = state.detailTech;
    const liq = state.detailLiq;
    const maxBuyW = Math.max(1, ...(liq?.buyWalls || []).map((w) => w.usd));
    const maxSellW = Math.max(1, ...(liq?.sellWalls || []).map((w) => w.usd));

    container.innerHTML = `
      <div class="detail-overlay">
        <div class="detail-header">
          <button class="btn-sm" data-act="close-detail">${ar ? "← رجوع للسوق" : "← Back"}</button>
          <div style="display:flex;gap:6px">
            <button class="btn-ai-inline" data-act="ai-row" data-sym="${item.symbol}" ${busyAi ? "disabled" : ""}>
              ${busyAi ? "..." : `✨ ${ar ? "تحليل وحفظ بالـ AI" : "AI Analyze"}`}
            </button>
            <button class="btn-sm" data-act="ask-coin-ai" data-sym="${item.symbol}">💬 AI</button>
          </div>
        </div>

        <div class="main-wrap">
          <!-- Hero -->
          <div class="card-panel">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
              <div>
                <div style="font-size:18px;font-weight:800;color:#fff">${esc(item.name)} (${esc(item.baseAsset)})</div>
                <div class="badge-row" style="margin-top:5px">
                  <span class="tag ${sm.cls}">${ar ? sm.ar : sm.en}</span>
                  ${isAi ? `<span class="tag tag-ai">✨ ${ar ? "تحليل AI أولي" : "AI Opinion"}</span>` : ""}
                  ${ex.includes("BINANCE") ? `<span class="tag tag-bin">Binance</span>` : ""}
                  ${ex.includes("BYBIT") ? `<span class="tag tag-byb">Bybit</span>` : ""}
                </div>
              </div>
              <div class="mono" style="text-align:end">
                <div style="font-size:19px;font-weight:800;color:#fff">${fmtPrice(item.priceUsdt)}</div>
                <div class="${(item.change24h || 0) >= 0 ? "pos" : "neg"}" style="font-size:12px;font-weight:700">
                  ${item.change24h !== null ? ((item.change24h >= 0 ? "+" : "") + item.change24h.toFixed(2) + "%") : "—"}
                </div>
              </div>
            </div>
            <p style="font-size:11.5px;color:#cbd5e1;line-height:1.6;margin:8px 0 0">${esc(ar ? item.descriptionAr : item.descriptionEn)}</p>

            <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-top:10px;padding-top:9px;border-top:1px solid var(--border);font-size:10.5px">
              <div><span style="color:#64748b">MCap:</span> <strong class="mono">${fmtUsd(item.marketCap)}</strong></div>
              <div><span style="color:#64748b">FDV:</span> <strong class="mono">${fmtUsd(item.fdv)}</strong></div>
              <div><span style="color:#64748b">24h Vol:</span> <strong class="mono">${fmtUsd(item.quoteVol24h)}</strong></div>
              <div><span style="color:#64748b">Binance:</span> <strong class="mono">${fmtPrice(item.binancePrice)}</strong></div>
              <div><span style="color:#64748b">Bybit:</span> <strong class="mono">${fmtPrice(item.bybitPrice)}</strong></div>
              <div><span style="color:#64748b">${ar ? "الموثوقية:" : "Cred:"}</span> <strong class="mono" style="color:#34d399">${item.credibilityScore ?? "—"}/100</strong></div>
            </div>

            <div style="display:flex;gap:6px;margin-top:10px">
              ${ex.includes("BINANCE") ? `<a class="btn-sm" style="flex:1;justify-content:center;text-decoration:none;color:#fbbf24" href="https://www.binance.com/en/trade/${item.baseAsset}_USDT?type=spot" target="_blank">Binance Spot ↗</a>` : ""}
              ${ex.includes("BYBIT") ? `<a class="btn-sm" style="flex:1;justify-content:center;text-decoration:none;color:#fb923c" href="https://www.bybit.com/en/trade/spot/${item.baseAsset}/USDT" target="_blank">Bybit Spot ↗</a>` : ""}
            </div>
          </div>

          <!-- Interactive Candlestick Chart & Technicals -->
          <div class="card-panel">
            <div class="section-title">
              <span>📈 ${ar ? "الشارت والمؤشرات الفنية" : "Chart & Technicals"}</span>
              <div style="display:flex;gap:3px">
                ${["AUTO", "BINANCE", "BYBIT"]
                  .map(
                    (v) =>
                      `<button class="btn-sm" style="padding:3px 6px;font-size:9.5px;${state.detailCandleVenue === v ? "border-color:#f59e0b;color:#fde68a" : ""}" data-act="det-cvenue" data-val="${v}">${v === "AUTO" ? (ar ? "تلقائي" : "Auto") : v}</button>`
                  )
                  .join("")}
              </div>
            </div>
            <div style="display:flex;gap:4px;margin-bottom:7px">
              ${tfs
                .map(
                  (tf) =>
                    `<button class="btn-sm mono" style="padding:4px 8px;font-size:10.5px;${state.detailTimeframe === tf ? "border-color:#10b981;color:#6ee7b7" : ""}" data-act="det-tf" data-val="${tf}">${tf}</button>`
                )
                .join("")}
            </div>
            ${
              state.detailTechLoading && !tech
                ? `<div style="height:180px;display:flex;align-items:center;justify-content:center;font-size:11px;color:#94a3b8">${ar ? "جاري جلب الشموع الحية..." : "Loading candles..."}</div>`
                : `<canvas id="hciCandleCanvas" style="width:100%;height:220px;border-radius:9px;display:block"></canvas>`
            }
            ${
              tech
                ? `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-top:8px;font-size:10.5px" class="mono">
                    <div style="background:#070d19;padding:6px;border-radius:7px">RSI(14): <strong style="color:#38bdf8">${tech.rsi14 ? tech.rsi14.toFixed(1) : "—"}</strong></div>
                    <div style="background:#070d19;padding:6px;border-radius:7px">EMA20: <strong style="color:#38bdf8">${fmtPrice(tech.ema20)}</strong></div>
                    <div style="background:#070d19;padding:6px;border-radius:7px">EMA50: <strong style="color:#f59e0b">${fmtPrice(tech.ema50)}</strong></div>
                    <div style="background:#070d19;padding:6px;border-radius:7px">Supp: <strong style="color:#34d399">${fmtPrice(tech.support)}</strong></div>
                    <div style="background:#070d19;padding:6px;border-radius:7px">Res: <strong style="color:#fb7185">${fmtPrice(tech.resistance)}</strong></div>
                    <div style="background:#070d19;padding:6px;border-radius:7px">Src: <strong>${esc(tech.source)}</strong></div>
                  </div>`
                : ""
            }
          </div>

          <!-- ORDER BOOK BUY & SELL LIQUIDITY CENTERS -->
          <div class="card-panel">
            <div class="section-title">
              <span>📊 ${ar ? "مراكز أوامر السيولة البيعية والشرائية" : "Buy & Sell Liquidity Walls"}</span>
              <div style="display:flex;gap:3px">
                ${[
                  { k: "COMBINED", l: ar ? "مدمج" : "Combined" },
                  { k: "BINANCE", l: "Binance" },
                  { k: "BYBIT", l: "Bybit" },
                ]
                  .map(
                    (m) =>
                      `<button class="btn-sm" style="padding:3px 7px;font-size:9.5px;${state.detailLiqVenue === m.k ? "border-color:#38bdf8;color:#bae6fd" : ""}" data-act="det-lvenue" data-val="${m.k}">${m.l}</button>`
                  )
                  .join("")}
              </div>
            </div>

            ${
              state.detailLiqLoading && !liq
                ? `<div style="padding:18px;text-align:center;font-size:11px;color:#94a3b8">${ar ? "جاري تحليل دفتر الأوامر وتكتلات السيولة..." : "Analyzing Spot order-book walls..."}</div>`
                : !liq
                  ? `<div style="padding:14px;text-align:center;font-size:11px;color:#94a3b8">${ar ? "دفتر الأوامر غير متاح حالياً." : "Order book unavailable."}</div>`
                  : `
                    <div style="display:flex;justify-content:space-between;font-size:11px" class="mono">
                      <span style="color:#34d399;font-weight:700">${ar ? "شراء" : "Bids"} (±2%): ${liq.buyPct}% (${fmtUsd(liq.bid2Usd)})</span>
                      <span style="color:#fb7185;font-weight:700">${ar ? "بيع" : "Asks"}: ${(100 - liq.buyPct).toFixed(1)}% (${fmtUsd(liq.ask2Usd)})</span>
                    </div>
                    <div class="pressure-track">
                      <div style="width:${liq.buyPct}%;background:#10b981"></div>
                      <div style="width:${100 - liq.buyPct}%;background:#f43f5e"></div>
                    </div>

                    ${renderDepthSvg(liq)}

                    <div style="font-size:11.5px;font-weight:800;color:#6ee7b7;margin:6px 0 5px">${ar ? "🟢 أقوى مراكز أوامر الشراء (جدران الدعم)" : "🟢 Strongest Buy Walls"}</div>
                    ${liq.buyWalls
                      .map(
                        (w) => `
                        <div class="wall-row mono">
                          <div class="wall-fill-buy" style="width:${Math.min(100, (w.usd / maxBuyW) * 100)}%"></div>
                          <div class="wall-content">
                            <span><strong style="color:#6ee7b7">${fmtPrice(w.price)}</strong> <span style="color:#94a3b8">(${w.pct}%)</span></span>
                            <span><strong>${fmtUsd(w.usd)}</strong> <span style="color:#fbbf24;font-size:9.5px">[${w.strength} • ${w.venues.map((v) => v[0]).join("+")}]</span></span>
                          </div>
                        </div>
                      `
                      )
                      .join("")}

                    <div style="font-size:11.5px;font-weight:800;color:#fda4af;margin:10px 0 5px">${ar ? "🔴 أقوى مراكز أوامر البيع (جدران المقاومة)" : "🔴 Strongest Sell Walls"}</div>
                    ${liq.sellWalls
                      .map(
                        (w) => `
                        <div class="wall-row mono">
                          <div class="wall-fill-sell" style="width:${Math.min(100, (w.usd / maxSellW) * 100)}%"></div>
                          <div class="wall-content">
                            <span><strong style="color:#fda4af">${fmtPrice(w.price)}</strong> <span style="color:#94a3b8">(+${w.pct}%)</span></span>
                            <span><strong>${fmtUsd(w.usd)}</strong> <span style="color:#fbbf24;font-size:9.5px">[${w.strength} • ${w.venues.map((v) => v[0]).join("+")}]</span></span>
                          </div>
                        </div>
                      `
                      )
                      .join("")}
                  `
            }
          </div>

          <!-- Shariah Card -->
          <div class="card-panel">
            <div class="section-title">🛡️ ${ar ? "التقرير الشرعي والمراجع" : "Shariah Compliance Report"}</div>
            <div style="font-size:11.5px;line-height:1.65;color:#e2e8f0">
              <div><strong style="color:#94a3b8">${ar ? "الجهة المرجعية:" : "Authority:"}</strong> ${esc(item.shariah.authorityName)}
                ${item.shariah.sourceUrl ? `<a href="${esc(item.shariah.sourceUrl)}" target="_blank" style="color:#34d399;margin-inline-start:6px">${ar ? "المصدر ↗" : "Source ↗"}</a>` : ""}
              </div>
              <div style="margin-top:5px"><strong style="color:#94a3b8">${ar ? "حيثيات الحكم:" : "Rationale:"}</strong> ${esc(ar ? item.shariah.coreActivityNotesAr : item.shariah.coreActivityNotesEn)}</div>
              <div style="margin-top:5px;padding:7px 9px;border-radius:8px;background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.25);color:#fde68a">
                <strong>${ar ? "الشروط:" : "Conditions:"}</strong> ${esc(ar ? item.shariah.conditionsAr || "تداول فوري Spot فقط دون رافعة." : item.shariah.conditionsEn || "Spot only.")}
              </div>
            </div>
          </div>

          <!-- Tokenomics & Scenarios -->
          <div class="card-panel">
            <div class="section-title">🪙 ${ar ? "التوكنوميكس والسيناريوهات" : "Tokenomics & Scenarios"}</div>
            <div style="font-size:11.5px;line-height:1.6;color:#cbd5e1">
              <div><strong>${ar ? "منفعة التوكن:" : "Utility:"}</strong> ${esc(ar ? item.tokenomics.tokenUtilityAr : item.tokenomics.tokenUtilityEn)}</div>
              <div style="margin-top:4px"><strong>${ar ? "فك القفل والتخفيف:" : "Unlocks:"}</strong> ${esc(ar ? item.tokenomics.unlockScheduleSummaryAr : item.tokenomics.unlockScheduleSummaryEn)} ${item.dilutionRatio ? `(FDV/MCap: ${item.dilutionRatio}x)` : ""}</div>
              ${(item.scenarios || [])
                .map(
                  (sc) => `
                  <div style="margin-top:7px;padding:7px 9px;background:#070d19;border-radius:8px;border:1px solid var(--border)">
                    <strong style="color:${sc.scenarioType === "BULLISH" ? "#34d399" : sc.scenarioType === "BEARISH" ? "#fb7185" : "#38bdf8"}">${sc.scenarioType}:</strong>
                    ${esc(ar ? sc.assumptionsAr : sc.assumptionsEn)}
                  </div>
                `
                )
                .join("")}
            </div>
          </div>
        </div>
      </div>
    `;

    requestAnimationFrame(() => drawCandlestickCanvas());
  }

  function render() {
    const ar = state.lang === "ar";
    document.documentElement.lang = ar ? "ar" : "en";
    document.documentElement.dir = ar ? "rtl" : "ltr";

    const root = document.getElementById("hciAppRoot");
    if (!root) return;

    let bodyHtml = "";
    if (state.tab === "markets") bodyHtml = renderMarketsTab();
    else if (state.tab === "ai") bodyHtml = renderAiTab();
    else if (state.tab === "watchlist") bodyHtml = renderWatchlistTab();
    else if (state.tab === "registry") bodyHtml = renderRegistryTab();
    else bodyHtml = renderSettingsTab();

    root.innerHTML = `
      <header class="topbar">
        <div class="topbar-row">
          <div>
            <div class="brand-title">
              <span>🛡️ ${ar ? "الاستخبارات الشرعية للكريبتو" : "Halal Crypto Intelligence"}</span>
              <span class="spot-pill">SPOT v${esc(window.HCI_APP_VERSION || "1.1.0")}</span>
            </div>
            <div class="brand-sub">
              ${
                state.lastSyncAt
                  ? ar
                    ? `متصل: Binance + Bybit Spot • آخر تحديث ${new Date(state.lastSyncAt).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" })}`
                    : `Live: Binance + Bybit • Synced ${new Date(state.lastSyncAt).toLocaleTimeString()}`
                  : ar
                    ? "تطبيق مستقل بالكامل • Binance + Bybit Spot + AI"
                    : "Standalone App • Binance + Bybit Spot + AI"
              }
            </div>
          </div>
          <div class="top-actions">
            <button class="btn-sm btn-sync" data-act="sync" ${state.syncing ? "disabled" : ""}>
              <span class="${state.syncing ? "spin" : ""}">⟳</span>
              ${state.syncing ? (ar ? "يزامن..." : "...") : ar ? "مزامنة" : "Sync"}
            </button>
            <button class="btn-sm" data-act="toggle-lang">${ar ? "EN" : "عربي"}</button>
          </div>
        </div>
      </header>

      <main class="main-wrap">
        ${state.toast ? `<div class="toast-banner"><span>${esc(state.toast)}</span><button class="btn-sm" style="padding:2px 6px" data-act="clear-toast">×</button></div>` : ""}
        ${
          state.updateInfo
            ? `<div class="toast-banner" style="background:rgba(14,165,233,0.16);border-color:rgba(56,189,248,0.5)">
                <span>${ar ? "يتوفر تحديث جديد:" : "New APK Update:"} <strong>v${esc(state.updateInfo.ver)}</strong></span>
                <a class="btn-sm" style="color:#7dd3fc;text-decoration:none" href="${esc(state.updateInfo.url)}" target="_blank">${ar ? "تنزيل APK" : "Download"}</a>
              </div>`
            : ""
        }
        ${bodyHtml}
      </main>

      <nav class="bottom-nav">
        <button class="nav-item ${state.tab === "markets" ? "active" : ""}" data-act="tab" data-val="markets">
          <span class="nav-icon">📈</span>
          <span>${ar ? "السوق" : "Markets"}</span>
        </button>
        <button class="nav-item ${state.tab === "ai" ? "active" : ""}" data-act="tab" data-val="ai">
          <span class="nav-icon">🤖</span>
          <span>${ar ? "وكيل AI" : "AI Agent"}</span>
        </button>
        <button class="nav-item ${state.tab === "watchlist" ? "active" : ""}" data-act="tab" data-val="watchlist">
          <span class="nav-icon">⭐</span>
          <span>${ar ? "المفضلة" : "Watchlist"}</span>
        </button>
        <button class="nav-item ${state.tab === "registry" ? "active" : ""}" data-act="tab" data-val="registry">
          <span class="nav-icon">📜</span>
          <span>${ar ? "السجل الشرعي" : "Shariah"}</span>
        </button>
        <button class="nav-item ${state.tab === "settings" ? "active" : ""}" data-act="tab" data-val="settings">
          <span class="nav-icon">⚙️</span>
          <span>${ar ? "الإعدادات" : "Settings"}</span>
        </button>
      </nav>
    `;

    // Bind input listeners
    const sInp = document.getElementById("mobSearchInput");
    if (sInp) {
      sInp.addEventListener("input", (e) => {
        state.search = e.target.value;
        state.page = 1;
        const pos = e.target.selectionStart;
        render();
        const nextInp = document.getElementById("mobSearchInput");
        if (nextInp) {
          nextInp.focus();
          nextInp.setSelectionRange(pos, pos);
        }
      });
    }
    const sortSel = document.getElementById("mobSortSelect");
    if (sortSel) {
      sortSel.addEventListener("change", (e) => {
        state.sort = e.target.value;
        state.page = 1;
        render();
      });
    }
  }

  // =========================================================================
  // EVENT DELEGATION
  // =========================================================================
  document.addEventListener("click", async (ev) => {
    const btn = ev.target.closest("[data-act]");
    if (!btn) return;
    const act = btn.getAttribute("data-act");
    const val = btn.getAttribute("data-val");
    const sym = btn.getAttribute("data-sym");

    if (act === "ai-row") {
      ev.stopPropagation();
      analyzeCoinOnDevice(sym, false);
      return;
    }
    if (act === "star") {
      ev.stopPropagation();
      if (state.watchlist.has(sym)) state.watchlist.delete(sym);
      else state.watchlist.add(sym);
      saveJson("hci_watchlist_v2", Array.from(state.watchlist));
      render();
      return;
    }
    if (act === "open-coin") {
      state.activeSymbol = sym;
      state.detailTech = null;
      state.detailLiq = null;
      renderDetailIfOpen();
      loadDetailTechnicals(sym, state.detailTimeframe, state.detailCandleVenue);
      loadDetailOrderBookLiquidity(sym, state.detailLiqVenue);
      return;
    }
    if (act === "close-detail") {
      state.activeSymbol = null;
      renderDetailIfOpen();
      return;
    }
    if (act === "det-tf") {
      state.detailTimeframe = val;
      loadDetailTechnicals(state.activeSymbol, val, state.detailCandleVenue);
      return;
    }
    if (act === "det-cvenue") {
      state.detailCandleVenue = val;
      loadDetailTechnicals(state.activeSymbol, state.detailTimeframe, val);
      return;
    }
    if (act === "det-lvenue") {
      state.detailLiqVenue = val;
      loadDetailOrderBookLiquidity(state.activeSymbol, val);
      return;
    }
    if (act === "ask-coin-ai") {
      state.chatSymbol = sym.replace(/USDT$/, "");
      state.activeSymbol = null;
      state.tab = "ai";
      state.aiSubTab = "chat";
      renderDetailIfOpen();
      render();
      return;
    }
    if (act === "tab") {
      state.tab = val;
      render();
      window.scrollTo({ top: 0, behavior: "instant" });
      return;
    }
    if (act === "aisub") {
      state.aiSubTab = val;
      render();
      return;
    }
    if (act === "goto-settings") {
      state.tab = "settings";
      render();
      return;
    }
    if (act === "preset") {
      state.shariahPreset = val;
      state.page = 1;
      render();
      return;
    }
    if (act === "exfilter") {
      state.exchangeFilter = val;
      state.page = 1;
      render();
      return;
    }
    if (act === "page") {
      state.page = Math.max(1, Number(val) || 1);
      render();
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    if (act === "sync") {
      syncAllSpotMarkets();
      return;
    }
    if (act === "toggle-lang") {
      state.lang = state.lang === "ar" ? "en" : "ar";
      localStorage.setItem("hci_lang", state.lang);
      render();
      renderDetailIfOpen();
      return;
    }
    if (act === "clear-toast") {
      state.toast = null;
      render();
      return;
    }
    if (act === "pick-prov") {
      const m = PROVIDERS[val];
      state.aiSettings.provider = val;
      state.aiSettings.model = m.model;
      state.aiSettings.baseUrl = m.url;
      render();
      return;
    }
    if (act === "save-ai-settings") {
      const kEl = document.getElementById("setApiKey");
      const mEl = document.getElementById("setModel");
      const uEl = document.getElementById("setBaseUrl");
      if (kEl) state.aiSettings.apiKey = kEl.value.trim();
      if (mEl) state.aiSettings.model = mEl.value.trim();
      if (uEl) {
        if (state.aiSettings.provider === "custom_webhook") state.aiSettings.webhookUrl = uEl.value.trim();
        state.aiSettings.baseUrl = uEl.value.trim();
      }
      saveJson("hci_ai_settings_v2", state.aiSettings);
      showToast(state.lang === "ar" ? "تم حفظ وتفعيل وكيل الـ AI بنجاح!" : "AI Agent saved & activated!");
      return;
    }
    if (act === "test-ai-settings") {
      const kEl = document.getElementById("setApiKey");
      const mEl = document.getElementById("setModel");
      const uEl = document.getElementById("setBaseUrl");
      if (kEl) state.aiSettings.apiKey = kEl.value.trim();
      if (mEl) state.aiSettings.model = mEl.value.trim();
      if (uEl) {
        if (state.aiSettings.provider === "custom_webhook") state.aiSettings.webhookUrl = uEl.value.trim();
        state.aiSettings.baseUrl = uEl.value.trim();
      }
      saveJson("hci_ai_settings_v2", state.aiSettings);
      if (state.aiSettings.provider === "builtin_heuristic") {
        showToast("المحلل المدمج جاهز للعمل فورا بدون مفتاح!");
        return;
      }
      try {
        const t0 = Date.now();
        const r = await callMobileAiAgent("Reply briefly.", "Say: Connected OK");
        showToast(`✅ نجح الاتصال بـ ${r.label} (${Date.now() - t0}ms)`);
      } catch (e) {
        showToast("❌ فشل الاتصال: " + (e.message || "Error"));
      }
      return;
    }
    if (act === "send-chat") {
      const qInp = document.getElementById("mobChatInput");
      const symInp = document.getElementById("mobChatSym");
      const q = (qInp?.value || "").trim();
      if (!q) return;
      if (symInp) state.chatSymbol = symInp.value.trim().toUpperCase();
      state.chatMessages.push({ role: "user", text: q });
      qInp.value = "";
      render();

      const targetSym = state.chatSymbol
        ? state.chatSymbol.endsWith("USDT")
          ? state.chatSymbol
          : state.chatSymbol + "USDT"
        : null;
      const coin = targetSym ? state.assetsMap.get(targetSym) : null;

      const ctx = coin
        ? `العملة: ${coin.name} (${coin.symbol}) | المنصات: ${coin.exchanges.join("+")} | السعر: ${fmtPrice(coin.priceUsdt)} | القيمة السوقية: ${fmtUsd(coin.marketCap)} | التصنيف الشرعي: ${coin.shariah.classification} (${coin.shariah.authorityName}) | السبب: ${coin.shariah.coreActivityNotesAr} | التوكنوميكس: ${coin.tokenomics.tokenUtilityAr}`
        : "سؤال عام عن السوق الفوري الحلال (Binance + Bybit Spot).";

      if (isMobileAiConfigured(state.aiSettings) && state.aiSettings.provider !== "builtin_heuristic") {
        try {
          const r = await callMobileAiAgent(
            `أنت باحث متخصص في الكريبتو الشرعي والتوكنوميكس وسيولة السوق الفوري. أجب بالعربية بدقة بناءً على البيانات المتاحة فقط وحذّر من أن المخرج رأي بحثي وليس فتوى رسمية.\nالبيانات:\n${ctx}`,
            q
          );
          state.chatMessages.push({ role: "bot", text: `${r.text}\n\n— [${r.label}]` });
        } catch (e) {
          state.chatMessages.push({ role: "bot", text: `${ctx}\n\n(ملاحظة: تعذر الوصول للمزود الخارجي: ${e.message})` });
        }
      } else {
        state.chatMessages.push({
          role: "bot",
          text: coin
            ? `📌 ملخص ${coin.name} (${coin.baseAsset}):\n• التصنيف: ${coin.shariah.classification}\n• المرجع: ${coin.shariah.authorityName}\n• التفاصيل: ${coin.shariah.coreActivityNotesAr}\n• السعر الفوري: ${fmtPrice(coin.priceUsdt)} | MCap: ${fmtUsd(coin.marketCap)}\n\n(اربط مفتاح Gemini أو OpenAI أو DeepSeek من تبويب الإعدادات لإجابات تحليلية حوارية أعمق).`
            : "حدد رمز العملة في الحقل العلوي (مثل BTC أو KAS أو XLM) لعرض ملفها البحثي، أو اربط وكيل AI من تبويب الإعدادات.",
        });
      }
      render();
      return;
    }
    if (act === "run-batch" || act === "run-batch-builtin") {
      const useBuiltin = act === "run-batch-builtin";
      if (!useBuiltin && !isMobileAiConfigured(state.aiSettings)) {
        state.tab = "settings";
        showToast("يرجى ربط وكيل AI في الإعدادات أولاً أو اختيار الفحص السريع المدمج");
        return;
      }
      const n = Number(val) || 5;
      const targets = Array.from(state.assetsMap.values())
        .filter((r) => r.shariah.classification === "UNVERIFIED")
        .sort((a, b) => (b.quoteVol24h || 0) - (a.quoteVol24h || 0))
        .slice(0, n);

      state.batchRunning = true;
      state.batchLogs = [];
      for (let i = 0; i < targets.length; i++) {
        const t = targets[i];
        state.batchStatus = `جاري فحص (${i + 1}/${targets.length}): ${t.symbol}...`;
        render();
        await analyzeCoinOnDevice(t.symbol, useBuiltin);
        const updated = state.assetsMap.get(t.symbol);
        state.batchLogs.push({ sym: t.symbol, res: updated?.shariah?.classification || "DONE" });
      }
      state.batchRunning = false;
      state.batchStatus = `اكتمل فحص ${targets.length} عملات وحفظها محلياً بنجاح!`;
      render();
      return;
    }
    if (act === "add-alert") {
      const s = (document.getElementById("alSym")?.value || "").trim().toUpperCase();
      const dir = document.getElementById("alDir")?.value || "ABOVE";
      const pr = parseFloat(document.getElementById("alPrice")?.value || "");
      if (!s || !Number.isFinite(pr) || pr <= 0) return;
      const fullSym = s.endsWith("USDT") ? s : s + "USDT";
      state.priceAlerts.unshift({ symbol: fullSym, dir, target: pr, triggered: false });
      saveJson("hci_price_alerts_v2", state.priceAlerts);
      evaluatePriceAlerts();
      render();
      return;
    }
    if (act === "del-alert") {
      state.priceAlerts.splice(Number(val), 1);
      saveJson("hci_price_alerts_v2", state.priceAlerts);
      render();
      return;
    }
    if (act === "save-reg") {
      const rawS = (document.getElementById("regSym")?.value || "").trim().toUpperCase();
      const cls = document.getElementById("regCls")?.value || "HALAL";
      const auth = (document.getElementById("regAuth")?.value || "").trim() || "مراجعة مستخدم موثقة";
      const url = (document.getElementById("regUrl")?.value || "").trim() || null;
      const notes = (document.getElementById("regNotes")?.value || "").trim() || "تم التوثيق يدوياً في السجل الشرعي.";
      if (!rawS) return;
      const fullSym = rawS.endsWith("USDT") ? rawS : rawS + "USDT";
      state.customOverrides[fullSym] = {
        ...(state.customOverrides[fullSym] || {}),
        shariah: {
          classification: cls,
          authorityName: auth,
          sourceUrl: url,
          assessmentDate: new Date().toISOString().slice(0, 10),
          methodology: "توثيق يدوي في السجل الشرعي",
          coreActivityNotesAr: notes,
          coreActivityNotesEn: notes,
          verificationStatus: "VERIFIED",
        },
      };
      saveJson("hci_custom_overrides_v2", state.customOverrides);
      rebuildAssetsMap();
      showToast(`تم حفظ تصنيف ${fullSym} بنجاح`);
      return;
    }
    if (act === "del-reg") {
      delete state.customOverrides[sym];
      saveJson("hci_custom_overrides_v2", state.customOverrides);
      rebuildAssetsMap();
      render();
      return;
    }
    if (act === "export-reg") {
      const blob = new Blob([JSON.stringify(state.customOverrides, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "halal-crypto-registry.json";
      a.click();
      return;
    }
    if (act === "sync-from-server") {
      const u = (document.getElementById("setServerUrl")?.value || "").trim().replace(/\/+$/, "");
      if (!u) return;
      localStorage.setItem("hci_server_url", u);
      state.serverUrl = u;
      try {
        const res = await fetch(`${u}/api/assets?classifications=ALL&pageSize=500`);
        const d = await res.json();
        if (d.ok && Array.isArray(d.rows)) {
          let imported = 0;
          for (const r of d.rows) {
            if (r.shariahClassification && r.shariahClassification !== "UNVERIFIED") {
              state.customOverrides[r.symbol] = {
                name: r.name,
                category: r.category,
                credibilityScore: r.credibilityScore,
                shariah: {
                  classification: r.shariahClassification,
                  authorityName: r.shariahAuthority,
                  sourceUrl: r.shariahSourceUrl,
                  assessmentDate: r.shariahAssessmentDate || "",
                  coreActivityNotesAr: r.shariahMethodology || "",
                  coreActivityNotesEn: r.shariahMethodology || "",
                  verificationStatus: r.shariahVerificationStatus || "VERIFIED",
                },
              };
              imported++;
            }
          }
          saveJson("hci_custom_overrides_v2", state.customOverrides);
          rebuildAssetsMap();
          showToast(`تم استيراد ${imported} سجل مفحوص من الخادم بنجاح!`);
        }
      } catch {
        showToast("تعذر الاتصال بالخادم — تأكد من العنوان والشبكة.");
      }
      return;
    }
    if (act === "open-remote-server") {
      const u = (document.getElementById("setServerUrl")?.value || "").trim().replace(/\/+$/, "");
      if (!u) return;
      localStorage.setItem("hci_server_url", u);
      window.location.href = u;
      return;
    }
    if (act === "check-update") {
      checkGithubApkUpdate(true);
      return;
    }
  });

  function cmpSemver(a, b) {
    const pa = String(a).replace(/^v/i, "").split(".").map(Number);
    const pb = String(b).replace(/^v/i, "").split(".").map(Number);
    for (let i = 0; i < 3; i++) {
      if ((pa[i] || 0) > (pb[i] || 0)) return 1;
      if ((pa[i] || 0) < (pb[i] || 0)) return -1;
    }
    return 0;
  }

  async function checkGithubApkUpdate(notifyIfLatest) {
    try {
      const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      const tag = String(data.tag_name || "").replace(/^v/i, "");
      const cur = window.HCI_APP_VERSION || "1.1.0";
      const apk = (data.assets || []).find((a) => String(a.name).toLowerCase().endsWith(".apk"));
      if (tag && cmpSemver(tag, cur) > 0) {
        state.updateInfo = { ver: tag, url: apk ? apk.browser_download_url : data.html_url };
        render();
      } else if (notifyIfLatest) {
        showToast(`أنت تستخدم أحدث إصدار بالفعل (v${cur})`);
      }
    } catch {
      if (notifyIfLatest) showToast("تعذر فحص GitHub Releases حالياً");
    }
  }

  // Boot Standalone Mobile App
  rebuildAssetsMap();
  render();
  syncAllSpotMarkets();
  checkGithubApkUpdate(false);
})();
