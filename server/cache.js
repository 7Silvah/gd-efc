/**
 * server/cache.js — SQLite cache for /info responses.
 *
 * The Drive folder listing for a (folder, pageToken) pair is cached briefly
 * to save Drive API quota. /clone is never cached. TTL comes from
 * CACHE_TTL_SECONDS (0 = disabled).
 */
import Database from 'better-sqlite3';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
function dbPath() {
  return process.env.CACHE_DB || path.join(__dirname, '..', 'cache.db');
}

let db = null;
let dbPathUsed = null;

function getDb() {
  const p = dbPath();
  if (!db || dbPathUsed !== p) {
    if (db) db.close();
    db = new Database(p);
    dbPathUsed = p;
    db.exec(`CREATE TABLE IF NOT EXISTS info_cache (
      key TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )`);
  }
  return db;
}

export function cacheKey(folder, pageToken) {
  return 'info:' + crypto.createHash('sha256')
    .update(`${folder}|${pageToken || ''}`)
    .digest('hex');
}

export function cacheTtlSeconds() {
  return Number(process.env.CACHE_TTL_SECONDS || 60);
}

export function cacheGet(key) {
  const ttl = cacheTtlSeconds();
  if (ttl <= 0) return null;
  try {
    const row = getDb().prepare('SELECT data, created_at FROM info_cache WHERE key = ?').get(key);
    if (!row) return null;
    if (Date.now() - row.created_at > ttl * 1000) {
      getDb().prepare('DELETE FROM info_cache WHERE key = ?').run(key);
      return null;
    }
    return JSON.parse(row.data);
  } catch {
    return null;
  }
}

export function cacheSet(key, data) {
  const ttl = cacheTtlSeconds();
  if (ttl <= 0) return;
  try {
    getDb().prepare(
      'INSERT OR REPLACE INTO info_cache (key, data, created_at) VALUES (?, ?, ?)'
    ).run(key, JSON.stringify(data), Date.now());
  } catch {
    // cache is best-effort; never break the request
  }
}

/** For tests: close the DB handle. */
export function cacheClose() {
  if (db) {
    db.close();
    db = null;
  }
}
