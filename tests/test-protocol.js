import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { generateKey, decrypt } from '../shared/crypto.js';
import { createApp } from '../server/index.js';

describe('protocol routes', () => {
  let base;
  let server;

  before(async () => {
    process.env.EFC_KEY = await generateKey();
    delete process.env.EFC_PUBLIC_URL;
    const app = createApp();
    server = app.listen(0);
    await new Promise((r) => server.on('listening', r));
    base = `http://127.0.0.1:${server.address().port}`;
  });

  after(() => server.close());

  const post = (p, body, raw) => fetch(`${base}${p}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: raw !== undefined ? raw : JSON.stringify(body),
  });

  it('GET /health', async () => {
    const r = await (await fetch(`${base}/health`)).json();
    assert.equal(r.status, 'ok');
    assert.equal(r.version, 4);
  });

  it('POST /encrypt validates input', async () => {
    const res = await post('/encrypt', {});
    assert.equal(res.status, 400);
    const r = await res.json();
    assert.equal(r.status, 'error');
    assert.equal(r.version, 4);
    assert.match(r.reason, /Missing folder/);
  });

  it('POST /encrypt roundtrips through shared crypto', async () => {
    const res = await post('/encrypt', { folder: 'driveFolderId123' });
    assert.equal(res.status, 200);
    const r = await res.json();
    assert.equal(r.status, 'ok');
    assert.equal(r.version, 4);
    assert.equal(await decrypt(r.data, process.env.EFC_KEY), 'driveFolderId123');
  });

  it('POST /info rejects undecryptable folder with protocol error shape', async () => {
    const res = await post('/info', { auth: 'x', folder: '!!!not-base64!!!' });
    assert.equal(res.status, 400);
    const r = await res.json();
    assert.equal(r.status, 'error');
    assert.equal(r.version, 4);
    assert.ok(r.reason.length > 0);
  });

  it('POST /clone validates input', async () => {
    const res = await post('/clone', { auth: 'x' });
    assert.equal(res.status, 400);
    const r = await res.json();
    assert.equal(r.status, 'error');
    assert.equal(r.version, 4);
  });

  it('malformed JSON -> Invalid json data', async () => {
    const res = await post('/info', null, '{bad json');
    assert.equal(res.status, 400);
    const r = await res.json();
    assert.equal(r.status, 'error');
    assert.equal(r.reason, 'Invalid json data');
  });

  it('GET /encrypt serves the encrypt page with a self prefix', async () => {
    const res = await fetch(`${base}/encrypt`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /html/);
    const html = await res.text();
    assert.ok(html.includes('async function encryptId(folderId)'));
    assert.ok(html.includes('fetch("encrypt"'));
    // prefix must decode to a server entry pointing back at this server
    const m = html.match(/value = "([A-Za-z0-9+/=]+)\." \+ \(await encryptFolder\(\)\)/);
    assert.ok(m, 'prefix placeholder replaced');
    const entry = Buffer.from(m[1], 'base64').toString('utf8');
    assert.match(entry, /^k:127\.0\.0\.1:\d+$/);
  });

  it('missing EFC_KEY -> 501 with clear message', async () => {
    const saved = process.env.EFC_KEY;
    delete process.env.EFC_KEY;
    try {
      const res = await post('/encrypt', { folder: 'abc' });
      assert.equal(res.status, 501);
      const r = await res.json();
      assert.equal(r.status, 'error');
      assert.match(r.reason, /EFC_KEY/);
    } finally {
      process.env.EFC_KEY = saved;
    }
  });
});
