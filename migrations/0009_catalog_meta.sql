-- Migration 0009: small key/value table for site-wide settings.
-- catalog_version: part of every edge-cache key for public catalog reads (worker/cache.js);
-- admin writes bump it, so every cached variant (filters, pages, languages) goes stale at once.

CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT OR IGNORE INTO meta (key, value) VALUES ('catalog_version', '1');
