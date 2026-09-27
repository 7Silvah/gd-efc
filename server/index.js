import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

export const PROTOCOL_VERSION = 4;

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));

  // CORS: igual que los templates originales (Access-Control-Allow-Origin: *)
  const corsOrigin = process.env.CORS_ORIGIN || '*';
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', corsOrigin);
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
  });

  app.get('/health', (req, res) => {
    res.json({ status: 'ok', version: PROTOCOL_VERSION });
  });

  // Las rutas del protocolo (/info, /clone, /encrypt, /oauth/*) se montan aquí
  // en las siguientes fases.

  // Frontend estático (index.html, build.html, main.js, ...)
  app.use(express.static(path.join(ROOT, 'public')));

  return app;
}

const app = createApp();
const port = Number(process.env.PORT || 3000);
app.listen(port, () => {
  console.log(`gd-efc server listening on http://localhost:${port}`);
});
