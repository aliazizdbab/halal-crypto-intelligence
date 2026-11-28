import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { DATABASE_SCHEMA_SQL } from "./schema";

let dbInstance: DatabaseSync | null = null;
let initializedPath: string | null = null;

function resolveDbPath(): string {
  const configured = process.env.DATABASE_PATH || "./data/halal-crypto.sqlite";
  if (configured === ":memory:") return ":memory:";
  return path.isAbsolute(configured) ? configured : path.resolve(process.cwd(), configured);
}

function ensureColumn(db: DatabaseSync, table: string, column: string, definition: string): void {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

function runMigrations(db: DatabaseSync): void {
  ensureColumn(db, "assets", "bybit_status", "TEXT NOT NULL DEFAULT 'NOT_LISTED'");
  ensureColumn(db, "market_snapshots", "binance_price_usdt", "REAL");
  ensureColumn(db, "market_snapshots", "bybit_price_usdt", "REAL");
  ensureColumn(db, "market_snapshots", "binance_quote_volume_24h", "REAL");
  ensureColumn(db, "market_snapshots", "bybit_quote_volume_24h", "REAL");
  ensureColumn(db, "market_snapshots", "primary_exchange", "TEXT NOT NULL DEFAULT 'BINANCE'");
}

export function getDb(): DatabaseSync {
  const targetPath = resolveDbPath();
  if (dbInstance && initializedPath === targetPath) {
    return dbInstance;
  }

  if (targetPath !== ":memory:") {
    const dir = path.dirname(targetPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  const db = new DatabaseSync(targetPath);
  // Ensure existing DB tables receive new columns BEFORE index creation in schema SQL
  const existingAssets = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='assets'")
    .get();
  if (existingAssets) {
    runMigrations(db);
  }
  db.exec(DATABASE_SCHEMA_SQL);
  runMigrations(db);
  dbInstance = db;
  initializedPath = targetPath;
  return db;
}

export function resetDbConnectionForTests(): void {
  if (dbInstance) {
    try {
      dbInstance.close();
    } catch {
      // ignore
    }
  }
  dbInstance = null;
  initializedPath = null;
}

export function runInTransaction<T>(fn: (db: DatabaseSync) => T): T {
  const db = getDb();
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = fn(db);
    db.exec("COMMIT");
    return result;
  } catch (err) {
    try {
      db.exec("ROLLBACK");
    } catch {
      // ignore rollback errors
    }
    throw err;
  }
}

export function getSetting(key: string, fallback = ""): string {
  const db = getDb();
  const row = db.prepare("SELECT value FROM app_settings WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row ? row.value : fallback;
}

export function setSetting(key: string, value: string): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO app_settings (key, value, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  ).run(key, value, new Date().toISOString());
}
