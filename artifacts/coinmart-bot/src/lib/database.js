import { createRequire } from "module";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "fs";

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "../../data");
mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = join(DATA_DIR, "coinmart.db");

const initSqlJs = require("sql.js");
const SQL = await initSqlJs();

let db;

function loadDb() {
  if (existsSync(DB_PATH)) {
    const fileBuffer = readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }
}

function saveDb() {
  const data = db.export();
  writeFileSync(DB_PATH, Buffer.from(data));
}

loadDb();

// Save DB to disk every 10 seconds and on exit
setInterval(saveDb, 10_000);
process.on("exit", saveDb);
process.on("SIGINT", () => { saveDb(); process.exit(0); });
process.on("SIGTERM", () => { saveDb(); process.exit(0); });

export function initDatabase() {
  db.run(`
    CREATE TABLE IF NOT EXISTS codes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      prize TEXT NOT NULL,
      prize_type TEXT NOT NULL DEFAULT 'custom',
      role_id TEXT,
      creator_id TEXT NOT NULL,
      creator_name TEXT NOT NULL,
      guild_id TEXT NOT NULL,
      max_uses INTEGER NOT NULL DEFAULT 1,
      uses_left INTEGER NOT NULL,
      expires_at INTEGER,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      active INTEGER NOT NULL DEFAULT 1,
      requires_approval INTEGER NOT NULL DEFAULT 0
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS claims (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL,
      user_id TEXT NOT NULL,
      username TEXT NOT NULL,
      guild_id TEXT NOT NULL,
      claimed_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      status TEXT NOT NULL DEFAULT 'approved',
      UNIQUE(code, user_id)
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      action TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      actor_name TEXT NOT NULL,
      details TEXT,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS cooldowns (
      user_id TEXT NOT NULL,
      command TEXT NOT NULL,
      last_used INTEGER NOT NULL,
      PRIMARY KEY (user_id, command)
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS config (
      guild_id TEXT NOT NULL,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      PRIMARY KEY (guild_id, key)
    )
  `);
  saveDb();
  console.log("[CoinMart] Database initialized.");
}

// Thin synchronous query helpers matching better-sqlite3 API shape
export const dbQuery = {
  /** Returns first row as object, or undefined */
  get(sql, ...params) {
    const stmt = db.prepare(sql);
    stmt.bind(params);
    if (stmt.step()) {
      const row = stmt.getAsObject();
      stmt.free();
      return row;
    }
    stmt.free();
    return undefined;
  },

  /** Returns all rows as array of objects */
  all(sql, ...params) {
    const results = [];
    const stmt = db.prepare(sql);
    stmt.bind(params);
    while (stmt.step()) {
      results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
  },

  /** Runs a mutation, returns { changes } */
  run(sql, ...params) {
    db.run(sql, params);
    saveDb();
    return { changes: db.getRowsModified() };
  },
};
