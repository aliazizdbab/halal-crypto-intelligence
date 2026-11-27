export const DATABASE_SCHEMA_SQL = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA synchronous = NORMAL;

CREATE TABLE IF NOT EXISTS assets (
  symbol TEXT PRIMARY KEY,
  base_asset TEXT NOT NULL,
  quote_asset TEXT NOT NULL DEFAULT 'USDT',
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Unclassified',
  binance_status TEXT NOT NULL DEFAULT 'TRADING',
  is_spot_allowed INTEGER NOT NULL DEFAULT 1,
  spot_verified_at TEXT NOT NULL,
  official_website TEXT,
  github_repo TEXT,
  coingecko_id TEXT,
  description_en TEXT NOT NULL DEFAULT '',
  description_ar TEXT NOT NULL DEFAULT '',
  is_curated INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_assets_base ON assets(base_asset);
CREATE INDEX IF NOT EXISTS idx_assets_spot ON assets(binance_status, is_spot_allowed, quote_asset);

CREATE TABLE IF NOT EXISTS market_snapshots (
  symbol TEXT PRIMARY KEY REFERENCES assets(symbol) ON DELETE CASCADE,
  base_asset TEXT NOT NULL,
  quote_asset TEXT NOT NULL DEFAULT 'USDT',
  price_usdt REAL,
  price_change_24h REAL,
  price_change_pct_24h REAL,
  volume_24h REAL,
  quote_volume_24h REAL,
  high_24h REAL,
  low_24h REAL,
  bid_price REAL,
  ask_price REAL,
  spread_pct REAL,
  market_cap REAL,
  fdv REAL,
  circulating_supply REAL,
  total_supply REAL,
  max_supply REAL,
  market_cap_rank INTEGER,
  price_source TEXT NOT NULL DEFAULT 'Binance Spot Public API',
  market_cap_source TEXT,
  fetched_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS shariah_assessments (
  symbol TEXT PRIMARY KEY REFERENCES assets(symbol) ON DELETE CASCADE,
  base_asset TEXT NOT NULL,
  classification TEXT NOT NULL DEFAULT 'UNVERIFIED',
  authority_name TEXT NOT NULL DEFAULT 'DATA UNAVAILABLE – REQUIRES VERIFICATION',
  source_url TEXT,
  assessment_date TEXT,
  methodology TEXT NOT NULL DEFAULT 'Not yet screened',
  core_activity_notes_en TEXT NOT NULL DEFAULT 'DATA UNAVAILABLE – REQUIRES VERIFICATION',
  core_activity_notes_ar TEXT NOT NULL DEFAULT 'البيانات غير متوفرة – تتطلب تحققاً',
  conditions_en TEXT,
  conditions_ar TEXT,
  scholarly_disagreements_en TEXT,
  scholarly_disagreements_ar TEXT,
  verification_status TEXT NOT NULL DEFAULT 'UNVERIFIED',
  confidence_level TEXT NOT NULL DEFAULT 'UNAVAILABLE',
  last_verified_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_shariah_class ON shariah_assessments(classification);

CREATE TABLE IF NOT EXISTS credibility_factors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol TEXT NOT NULL REFERENCES assets(symbol) ON DELETE CASCADE,
  factor_key TEXT NOT NULL,
  weight REAL NOT NULL,
  score REAL,
  evidence_en TEXT NOT NULL,
  evidence_ar TEXT NOT NULL,
  source_name TEXT NOT NULL,
  source_url TEXT,
  research_date TEXT NOT NULL,
  confidence_level TEXT NOT NULL DEFAULT 'MEDIUM',
  is_available INTEGER NOT NULL DEFAULT 1,
  UNIQUE(symbol, factor_key)
);

CREATE INDEX IF NOT EXISTS idx_cred_symbol ON credibility_factors(symbol);

CREATE TABLE IF NOT EXISTS tokenomics_profiles (
  symbol TEXT PRIMARY KEY REFERENCES assets(symbol) ON DELETE CASCADE,
  inflation_rate_pct REAL,
  insider_allocation_pct REAL,
  team_allocation_pct REAL,
  vc_allocation_pct REAL,
  community_allocation_pct REAL,
  treasury_allocation_pct REAL,
  unlock_schedule_summary_en TEXT NOT NULL DEFAULT 'DATA UNAVAILABLE – REQUIRES VERIFICATION',
  unlock_schedule_summary_ar TEXT NOT NULL DEFAULT 'البيانات غير متوفرة – تتطلب تحققاً',
  next_major_unlock_date TEXT,
  next_major_unlock_pct REAL,
  token_utility_en TEXT NOT NULL DEFAULT 'DATA UNAVAILABLE – REQUIRES VERIFICATION',
  token_utility_ar TEXT NOT NULL DEFAULT 'البيانات غير متوفرة – تتطلب تحققاً',
  burn_mechanism_en TEXT NOT NULL DEFAULT 'None documented',
  burn_mechanism_ar TEXT NOT NULL DEFAULT 'لا يوجد آلية حرق موثّقة',
  staking_mechanism_en TEXT NOT NULL DEFAULT 'DATA UNAVAILABLE – REQUIRES VERIFICATION',
  staking_mechanism_ar TEXT NOT NULL DEFAULT 'البيانات غير متوفرة – تتطلب تحققاً',
  governance_rights_en TEXT NOT NULL DEFAULT 'DATA UNAVAILABLE – REQUIRES VERIFICATION',
  governance_rights_ar TEXT NOT NULL DEFAULT 'البيانات غير متوفرة – تتطلب تحققاً',
  risk_flags_json TEXT NOT NULL DEFAULT '[]',
  tokenomics_risk TEXT NOT NULL DEFAULT 'UNAVAILABLE',
  source_name TEXT NOT NULL DEFAULT 'DATA UNAVAILABLE – REQUIRES VERIFICATION',
  source_url TEXT,
  last_updated TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS investment_scenarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol TEXT NOT NULL REFERENCES assets(symbol) ON DELETE CASCADE,
  scenario_type TEXT NOT NULL,
  assumptions_en TEXT NOT NULL,
  assumptions_ar TEXT NOT NULL,
  catalysts_en TEXT NOT NULL,
  catalysts_ar TEXT NOT NULL,
  risks_en TEXT NOT NULL,
  risks_ar TEXT NOT NULL,
  time_horizon TEXT NOT NULL,
  supporting_evidence_en TEXT NOT NULL,
  supporting_evidence_ar TEXT NOT NULL,
  source_url TEXT,
  last_updated TEXT NOT NULL,
  UNIQUE(symbol, scenario_type)
);

CREATE TABLE IF NOT EXISTS historical_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol TEXT NOT NULL REFERENCES assets(symbol) ON DELETE CASCADE,
  price_usdt REAL,
  market_cap REAL,
  shariah_classification TEXT NOT NULL,
  credibility_score REAL,
  investment_potential_score REAL,
  tokenomics_risk TEXT NOT NULL,
  recorded_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_hist_symbol_date ON historical_snapshots(symbol, recorded_at DESC);

CREATE TABLE IF NOT EXISTS research_audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  field_name TEXT NOT NULL,
  previous_value TEXT,
  new_value TEXT NOT NULL,
  reason TEXT,
  source_url TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_symbol ON research_audit_log(symbol, created_at DESC);

CREATE TABLE IF NOT EXISTS watchlists (
  symbol TEXT PRIMARY KEY REFERENCES assets(symbol) ON DELETE CASCADE,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS alert_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol TEXT,
  rule_type TEXT NOT NULL,
  threshold REAL,
  enabled INTEGER NOT NULL DEFAULT 1,
  notify_telegram INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol TEXT,
  alert_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'INFO',
  title_en TEXT NOT NULL,
  title_ar TEXT NOT NULL,
  message_en TEXT NOT NULL,
  message_ar TEXT NOT NULL,
  is_read INTEGER NOT NULL DEFAULT 0,
  telegram_sent INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_alerts_created ON alerts(created_at DESC);

CREATE TABLE IF NOT EXISTS github_metrics_cache (
  repo TEXT PRIMARY KEY,
  stars INTEGER,
  forks INTEGER,
  open_issues INTEGER,
  pushed_at TEXT,
  commits_30d INTEGER,
  fetched_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sync_status (
  service_name TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  endpoint_used TEXT,
  records_processed INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  last_synced_at TEXT NOT NULL
);
`;
