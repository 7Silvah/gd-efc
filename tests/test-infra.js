import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { cacheKey, cacheGet, cacheSet, cacheClose } from '../server/cache.js';
import { rateLimitReset } from '../server/ratelimit.js';
import { createApp } from '../server/index.js';

describe('cache', () => {
  before(() => {
    process.env.CACHE_DB = path.join(os.tmpdir(), `gd-efc-test-${process.pid}.db`);
    process.env.CACHE_TTL_SECONDS = '60';
  });
  after(() => cacheClose());

  it('set/get roundtrip', () => {
    const key = cacheKey('folderABC', undefined);
    assert.equal(cacheGet(key), null);
    cacheSet(key, { name: 'Mi carpeta', files: [] });
    assert.deepEqual(cacheGet(key), { name: 'Mi carpeta', files: [] });
  });

  it('la llave incluye el pageToken', () => {
    assert.notEqual(cacheKey('f', 't1'), cacheKey('f', 't2'));
    assert.notEqual(cacheKey('f1'), cacheKey('f2'));
  });

  it('TTL 0 = caché desactivada', () => {
    process.env.CACHE_TTL_SECONDS = '0';
    const key = cacheKey('folderXYZ');
    cacheSet(key, { a: 1 });
    assert.equal(cacheGet(key), null);
    process.env.CACHE_TTL_SECONDS = '60';
  });
});

describe('rate limit', () => {
  let base;
  let server;

  before(async () => {
    process.env.RATE_LIMIT_MAX = '2';
    process.env.RATE_LIMIT_WINDOW_SECONDS = '60';
    rateLimitReset();
    const app = createApp();
    server = app.listen(0);
    await new Promise((r) => server.on('listening', r));
    base = `http://127.0.0.1:${server.address().port}`;
  });

  after(() => server.close());

  it('bloquea el tercer POST con forma de error del protocolo', async () => {
    const post = () => fetch(`${base}/encrypt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    assert.equal((await post()).status, 400); // pasa (falta folder)
    assert.equal((await post()).status, 400); // pasa
    const res = await post();
    assert.equal(res.status, 429); // bloqueado
    const r = await res.json();
    assert.equal(r.status, 'error');
    assert.equal(r.version, 4);
    assert.match(r.reason, /Rate limit/);
  });

  it('GET no está limitado', async () => {
    for (let i = 0; i < 4; i++) {
      const res = await fetch(`${base}/health`);
      assert.equal(res.status, 200);
    }
  });
});
