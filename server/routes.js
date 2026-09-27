/**
 * server/routes.js — mounts the decrypt-server protocol routes:
 *   POST /info, POST /clone, GET /encrypt, POST /encrypt
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
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
    success(res, await handleInfo(req.body));
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
