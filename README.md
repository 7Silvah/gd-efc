# gd-efc

**Google Drive — encrypted folder copy.** Share Google Drive folders through
encrypted links that hide the real folder ID.

> **Node.js edition.** The whole stack is now pure JavaScript: a Node 20 +
> Express backend plus the original static frontend. See `README.txt`
> (Spanish) for the full setup and testing guide.

## How it works

1. A folder ID is encrypted with **AES-256-GCM** (WebCrypto, random 12-byte IV).
2. The encrypted ID is shared as a link instead of the real folder ID.
3. The Node backend resolves the encrypted ID back to the real folder
   (`POST /info`), and the visitor copies the folder into their own Google
   account (`POST /clone`).
4. OAuth code↔token exchange happens server-side (`POST /oauth/token`), so
   the `client_secret` never reaches the browser.

## Layout

| Path | Purpose |
|---|---|
| `server/` | Express backend: protocol v4 routes, OAuth, SQLite cache, rate limiting |
| `shared/` | `crypto.js` — AES-256-GCM ES module used by the server (and tests) |
| `public/` | Static frontend served by the backend |
| `public/index.html` | **Decrypt links** — paste an encrypted link, pick a Google account, copy the folder. `?dev=1` loads readable `main.js`; otherwise `main.obf.js`. `BACKEND_URL` const points at the backend (`''` = same origin). |
| `public/main.js` | Deobfuscated, editable copy engine (regenerate `main.obf.js` from it) |
| `public/build.html` | **Legacy builder** (kept as-is) — generates `gd.zip` decrypters |
| `public/templates/` | **Legacy** Cloudflare Worker / PHP / static decrypters |
| `tests/` | `node:test` suites: crypto, protocol, oauth, cache, rate limit |

## API (protocol v4)

| Endpoint | Purpose |
|---|---|
| `GET /health` | `{status:"ok", version:4}` |
| `POST /info` | `{auth, folder, pageToken?}` → folder listing (IDs re-encrypted) |
| `POST /clone` | `{auth, files[], destination}` → copies files |
| `GET /encrypt` | HTML page that encrypts folder IDs (self-referencing links) |
| `POST /encrypt` | `{folder}` → `{status:"ok", data:"<encrypted>"}` |
| `GET /oauth/config` | `{clientId}` for the browser login flow |
| `POST /oauth/token` | `{code\|refresh_token, grant_type, redirect_uri?}` → Google tokens |

All protocol responses carry `{status, version:4}`; errors use
`{status:"error", reason, version:4}`.

## Quick start

```bash
cp .env.example .env   # fill in EFC_KEY + Google OAuth credentials
npm install
npm test
npm run dev            # http://localhost:3000
```

`EFC_KEY` (base64, 32 bytes):
```bash
node -e "import('./shared/crypto.js').then(m => m.generateKey().then(console.log))"
```

Docker:
```bash
docker compose up --build
```

## Security notes

- The app itself warns: **always use a dummy Google account**, never your main one.
- `EFC_KEY` resolves your encrypted links — keep it private, never commit `.env`.
- `public/build.html` and `public/templates/` are legacy; the Node backend
  replaces the generated decrypters.
- Copying through a "dummy" account is still unimplemented (inherited limitation).

## Regenerating the obfuscated frontend

Edit `public/main.js`, then:
```bash
npx javascript-obfuscator public/main.js --output public/main.obf.js
```

## Stack

Node 20, Express, better-sqlite3, WebCrypto AES-256-GCM, vanilla JS +
jQuery + Bootstrap 4 frontend. Dark mode included.
