/**
 * server/routes.js — mounts the decrypt-server protocol routes:
 *   POST /info, POST /clone, GET /encrypt, POST /encrypt
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cacheKey, cacheGet, cacheSet } from './cache.js';
import { VERSION, success, fail, encode, handleInfo, handleClone } from './protocol.js';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENCRYPT_HTML_TEMPLATE = fs.readFileSync(
  path.join(__dirname, '..', 'public', 'templates', 'encrypt.html.template'),
  'utf8'
);

// Server-side variant of the encrypt page script (from build.js):
// the key never leaves the server, the page just calls POST encrypt.
const ENCRYPT_FUNCTION_SERVER = `async function encryptId(folderId) {
  const result = await fetch("encrypt", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({folder: folderId})});
  const data = await result.json();
  if (result.ok && data.status === "ok") {
    return data.data;
  }
  else {
    throw Error(data.reason || "encrypt failed");
  }
}`;

/** Build the encrypt page. The ID prefix encodes this server's own URL
 *  (scheme 'l:' = https, 'k:' = http), so generated links resolve back here
 *  from any client that speaks protocol v4 — no page config needed. */
function buildEncryptPage(req) {
  const publicUrl = process.env.EFC_PUBLIC_URL || `${req.protocol}://${req.get('host')}`;
  const u = new URL(publicUrl);
  const scheme = u.protocol === 'https:' ? 'l' : 'k';
  const prefix = Buffer.from(`${scheme}:${u.host}`).toString('base64');
  return ENCRYPT_HTML_TEMPLATE
    .replaceAll('{ENCRYPT_FUNCTION}', ENCRYPT_FUNCTION_SERVER)
    .replaceAll('{ENCODED_PREFIX}', prefix)
    .replaceAll('{OPTIONS_USED}', '');
}

export function mountProtocolRoutes(app) {
  const wrap = (handler) => async (req, res, next) => {
    try {
      await handler(req, res);
    } catch (e) {
      fail(res, e.message || String(e), e.status || 400);
    }
  };

  app.post('/info', wrap(async (req, res) => {
    const key = cacheKey(String(req.body?.folder || ''), req.body?.pageToken);
    const cached = cacheGet(key);
    if (cached) return success(res, cached);
    const data = await handleInfo(req.body);
    cacheSet(key, data);
    success(res, data);
  }));

  app.post('/clone', wrap(async (req, res) => {
    success(res, await handleClone(req.body));
  }));

  app.post('/encrypt', wrap(async (req, res) => {
    if (!req.body || typeof req.body.folder !== 'string' || !req.body.folder) {
      return fail(res, 'Missing folder', 400);
    }
    success(res, await encode(req.body.folder));
  }));

  app.get('/encrypt', (req, res) => {
    res.type('html').send(buildEncryptPage(req));
  });

  // ---- OAuth: el intercambio código<->token vive en el servidor ----
  // El front (public/main.js) llama aquí en vez de a oauth2.googleapis.com.
  // Así el client_secret nunca viaja al navegador.

  // client_id público para construir la URL de consentimiento en el front
  app.get('/oauth/config', (req, res) => {
    res.json({ clientId: process.env.GOOGLE_CLIENT_ID || '' });
  });

  app.post('/oauth/token', wrap(async (req, res) => {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      return fail(res, 'OAuth not configured on server (GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET)', 501);
    }
    const body = req.body || {};
    const params = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
    });
    if (body.grant_type === 'refresh_token' && body.refresh_token) {
      params.set('refresh_token', body.refresh_token);
      params.set('grant_type', 'refresh_token');
    } else if (body.code) {
      params.set('code', body.code);
      params.set('grant_type', 'authorization_code');
      if (body.redirect_uri) params.set('redirect_uri', body.redirect_uri);
    } else {
      return fail(res, 'Missing code or refresh_token', 400);
    }

    const tokenUrl = process.env.OAUTH_TOKEN_URL || 'https://oauth2.googleapis.com/token';
    const r = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    const text = await r.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { error: text };
    }
    if (!r.ok || data.error) {
      return fail(res, data.error_description || data.error || text, r.status >= 400 ? r.status : 400);
    }
    res.status(200).json(data);
  }));

  // Malformed JSON bodies -> protocol-shaped error (matches "Invalid json data")
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err && err.type === 'entity.parse.failed') {
      return fail(res, 'Invalid json data', 400);
    }
    next(err);
  });
}

export { VERSION };
