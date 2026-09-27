/**
 * server/ratelimit.js — simple in-memory per-IP rate limiter for POST routes.
 * Env: RATE_LIMIT_MAX (default 60), RATE_LIMIT_WINDOW_SECONDS (default 60).
 */
const hits = new Map();

export function rateLimitMax() {
  return Number(process.env.RATE_LIMIT_MAX || 60);
}

export function rateLimitWindowMs() {
  return Number(process.env.RATE_LIMIT_WINDOW_SECONDS || 60) * 1000;
}

export function rateLimitMiddleware(req, res, next) {
  if (req.method !== 'POST') return next();
  const max = rateLimitMax();
  if (max <= 0) return next();
  const windowMs = rateLimitWindowMs();
  const now = Date.now();
  const ip = req.ip || req.socket?.remoteAddress || 'unknown';

  let entry = hits.get(ip);
  if (!entry || now - entry.start > windowMs) {
    entry = { count: 0, start: now };
    hits.set(ip, entry);
  }
  entry.count += 1;

  // opportunistic cleanup
  if (hits.size > 10000) {
    for (const [k, v] of hits) {
      if (now - v.start > windowMs) hits.delete(k);
    }
  }

  if (entry.count > max) {
    return res.status(429).json({
      status: 'error',
      reason: 'Rate limit exceeded, try again later',
      version: 4,
    });
  }
  next();
}

/** For tests: reset counters. */
export function rateLimitReset() {
  hits.clear();
}
