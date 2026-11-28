import { getDb, runInTransaction } from "./client";
import { VERIFIED_SEED_ASSETS } from "@/lib/data/verified-seed";
import { CREDIBILITY_WEIGHTS } from "@/types/domain";

let seeded = false;

export function ensureSeeded(force = false): { insertedAssets: number } {
  const db = getDb();
  if (seeded && !force) {
    const row = db.prepare("SELECT COUNT(*) as cnt FROM assets WHERE is_curated = 1").get() as { cnt: number };
    if (row.cnt >= VERIFIED_SEED_ASSETS.length) {
      return { insertedAssets: 0 };
    }
  }

  const now = new Date().toISOString();
  let insertedAssets = 0;

  runInTransaction((tx) => {
    const upsertAsset = tx.prepare(`
      INSERT INTO assets (
        symbol, base_asset, quote_asset, name, category, binance_status, bybit_status, is_spot_allowed,
        spot_verified_at, official_website, github_repo, coingecko_id,
        description_en, description_ar, is_curated, created_at, updated_at
      ) VALUES (?, ?, 'USDT', ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, 1, ?, ?)
      ON CONFLICT(symbol) DO UPDATE SET
        name = excluded.name,
        category = excluded.category,
        official_website = excluded.official_website,
        github_repo = excluded.github_repo,
        coingecko_id = excluded.coingecko_id,
        description_en = excluded.description_en,
        description_ar = excluded.description_ar,
        is_curated = 1,
        updated_at = excluded.updated_at
    `);

    const upsertShariah = tx.prepare(`
      INSERT INTO shariah_assessments (
        symbol, base_asset, classification, authority_name, source_url, assessment_date,
        methodology, core_activity_notes_en, core_activity_notes_ar,
        conditions_en, conditions_ar, scholarly_disagreements_en, scholarly_disagreements_ar,
        verification_status, confidence_level, last_verified_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(symbol) DO NOTHING
    `);

    const upsertCredibility = tx.prepare(`
      INSERT INTO credibility_factors (
        symbol, factor_key, weight, score, evidence_en, evidence_ar,
        source_name, source_url, research_date, confidence_level, is_available
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(symbol, factor_key) DO NOTHING
    `);

    const upsertTokenomics = tx.prepare(`
      INSERT INTO tokenomics_profiles (
        symbol, inflation_rate_pct, insider_allocation_pct, team_allocation_pct,
        vc_allocation_pct, community_allocation_pct, treasury_allocation_pct,
        unlock_schedule_summary_en, unlock_schedule_summary_ar,
        next_major_unlock_date, next_major_unlock_pct,
        token_utility_en, token_utility_ar,
        burn_mechanism_en, burn_mechanism_ar,
        staking_mechanism_en, staking_mechanism_ar,
        governance_rights_en, governance_rights_ar,
        risk_flags_json, tokenomics_risk, source_name, source_url, last_updated
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(symbol) DO NOTHING
    `);

    const upsertScenario = tx.prepare(`
      INSERT INTO investment_scenarios (
        symbol, scenario_type, assumptions_en, assumptions_ar,
        catalysts_en, catalysts_ar, risks_en, risks_ar,
        time_horizon, supporting_evidence_en, supporting_evidence_ar,
        source_url, last_updated
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(symbol, scenario_type) DO NOTHING
    `);

    const existingCheck = tx.prepare("SELECT symbol FROM assets WHERE symbol = ?");

    for (const item of VERIFIED_SEED_ASSETS) {
      const existed = existingCheck.get(item.symbol);
      const itemExchanges = item.exchanges ?? ["BINANCE", "BYBIT"];
      const binStatus = itemExchanges.includes("BINANCE") ? "TRADING" : "NOT_LISTED";
      const bybStatus = itemExchanges.includes("BYBIT") ? "TRADING" : "NOT_LISTED";

      upsertAsset.run(
        item.symbol,
        item.baseAsset,
        item.name,
        item.category,
        binStatus,
        bybStatus,
        now,
        item.officialWebsite,
        item.githubRepo,
        item.coingeckoId,
        item.descriptionEn,
        item.descriptionAr,
        now,
        now
      );

      if (!existed) {
        insertedAssets++;
      }

      upsertShariah.run(
        item.symbol,
        item.baseAsset,
        item.shariah.classification,
        item.shariah.authorityName,
        item.shariah.sourceUrl,
        item.shariah.assessmentDate,
        item.shariah.methodology,
        item.shariah.coreActivityNotesEn,
        item.shariah.coreActivityNotesAr,
        item.shariah.conditionsEn,
        item.shariah.conditionsAr,
        item.shariah.scholarlyDisagreementsEn,
        item.shariah.scholarlyDisagreementsAr,
        item.shariah.verificationStatus,
        item.shariah.confidenceLevel,
        now
      );

      for (const factor of item.credibility) {
        upsertCredibility.run(
          item.symbol,
          factor.factorKey,
          CREDIBILITY_WEIGHTS[factor.factorKey],
          factor.score,
          factor.evidenceEn,
          factor.evidenceAr,
          factor.sourceName,
          factor.sourceUrl,
          item.shariah.assessmentDate,
          factor.confidenceLevel,
          factor.isAvailable ? 1 : 0
        );
      }

      upsertTokenomics.run(
        item.symbol,
        item.tokenomics.inflationRatePct,
        item.tokenomics.insiderAllocationPct,
        item.tokenomics.teamAllocationPct,
        item.tokenomics.vcAllocationPct,
        item.tokenomics.communityAllocationPct,
        item.tokenomics.treasuryAllocationPct,
        item.tokenomics.unlockScheduleSummaryEn,
        item.tokenomics.unlockScheduleSummaryAr,
        item.tokenomics.nextMajorUnlockDate,
        item.tokenomics.nextMajorUnlockPct,
        item.tokenomics.tokenUtilityEn,
        item.tokenomics.tokenUtilityAr,
        item.tokenomics.burnMechanismEn,
        item.tokenomics.burnMechanismAr,
        item.tokenomics.stakingMechanismEn,
        item.tokenomics.stakingMechanismAr,
        item.tokenomics.governanceRightsEn,
        item.tokenomics.governanceRightsAr,
        JSON.stringify(item.tokenomics.riskFlags),
        item.tokenomics.tokenomicsRisk,
        item.tokenomics.sourceName,
        item.tokenomics.sourceUrl,
        now
      );

      for (const sc of item.scenarios) {
        upsertScenario.run(
          item.symbol,
          sc.scenarioType,
          sc.assumptionsEn,
          sc.assumptionsAr,
          sc.catalystsEn,
          sc.catalystsAr,
          sc.risksEn,
          sc.risksAr,
          sc.timeHorizon,
          sc.supportingEvidenceEn,
          sc.supportingEvidenceAr,
          sc.sourceUrl,
          now
        );
      }
    }

    // Ensure default alert rules exist once
    const ruleCount = tx.prepare("SELECT COUNT(*) as cnt FROM alert_rules").get() as { cnt: number };
    if (ruleCount.cnt === 0) {
      const insertRule = tx.prepare(
        `INSERT INTO alert_rules (symbol, rule_type, threshold, enabled, notify_telegram, created_at)
         VALUES (?, ?, ?, 1, 0, ?)`
      );
      insertRule.run(null, "SHARIAH_CHANGE", null, now);
      insertRule.run(null, "SPOT_DELISTING", null, now);
      insertRule.run(null, "PRICE_CHANGE_PCT", 10, now);
      insertRule.run(null, "VOLUME_SPIKE_USD", 250_000_000, now);
    }

    // Seed initial welcome/monitoring alert once
    const alertCount = tx.prepare("SELECT COUNT(*) as cnt FROM alerts").get() as { cnt: number };
    if (alertCount.cnt === 0) {
      tx.prepare(
        `INSERT INTO alerts (symbol, alert_type, severity, title_en, title_ar, message_en, message_ar, is_read, telegram_sent, created_at)
         VALUES (NULL, 'CUSTOM', 'INFO', ?, ?, ?, ?, 0, 0, ?)`
      ).run(
        "Shariah Registry Initialized",
        "تم تهيئة سجل الفحص الشرعي الموثّق",
        `Loaded ${VERIFIED_SEED_ASSETS.length} evidence-backed asset profiles. Sync with Binance Spot to validate live TRADING & SPOT eligibility and prices.`,
        `تم تحميل ${VERIFIED_SEED_ASSETS.length} ملفاً بحثياً موثّقاً بالمصادر. قم بالمزامنة مع Binance Spot للتحقق من أهلية التداول الفوري وجلب الأسعار الحية.`,
        now
      );
    }
  });

  seeded = true;
  return { insertedAssets };
}
