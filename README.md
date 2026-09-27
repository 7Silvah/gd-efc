# gd-efc

**Google Drive — encrypted folder copy.** Share Google Drive folders through
encrypted links that hide the real folder ID.

## How it works

1. A folder ID is encrypted with **AES-256-GCM** (WebCrypto, random 12-byte IV).
2. The encrypted ID is shared as a link instead of the real folder ID.
3. A *decrypt server* resolves the encrypted ID back to the real folder, and the
   visitor copies the folder into their own Google account.

## Pages

| File | Purpose |
|---|---|
| `index.html` | **Decrypt links** — paste an encrypted link, pick a Google account, copy the folder. Set `showBuilder = true` in the inline config to reveal the builder link. Optional: `encryptedIdPrefix`, `defaultClientId` / `defaultClientSecret` (rclone OAuth). |
| `build.html` | **Builder** — enter a 32-byte base64 encryption key and your decrypt server URL(s) or server list(s), then download `gd.zip` with ready-to-deploy decrypters. |

## What the builder generates (`gd.zip`)

- `STATIC_ENCRYPTION/encrypt.html` — static page version
- `WORKER/worker.js` — Cloudflare Worker version (optional `/encrypt` endpoint)
- `PHP/decrypt.php`, `PHP/encrypt.php`, `PHP/.htaccess` — PHP version
- `key.txt` — your encryption key (keep it private)

Server lists can be hosted as a GitHub Gist, `p.teknik.io`, Pastebin raw, or any
raw HTTPS/HTTP URL.

## Security notes

- The app itself warns: **always use a dummy Google account**, never your main one.
- The encryption key lives in the generated files — whoever holds `key.txt` (or a
  generated decrypter) can resolve your encrypted links.
- `main.obf.js` is the obfuscated copy engine; `common.js` holds the shared
  AES-GCM encrypt/decrypt helpers.

## Stack

Vanilla JS + jQuery, Bootstrap 4, JSZip, Cloudflare Workers / PHP templates.
Dark mode included.
