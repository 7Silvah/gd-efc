import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createApp } from '../server/index.js';

describe('oauth routes', () => {
  let base;
  let server;
  let stub;
  let stubBase;
  let stubHandler = null;

  before(async () => {
    // Stub que simula oauth2.googleapis.com/token
    stub = http.createServer((req, res) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => stubHandler(req, body, res));
    });
    stub.listen(0);
    await new Promise((r) => stub.on('listening', r));
    stubBase = `http://127.0.0.1:${stub.address().port}`;

    process.env.OAUTH_TOKEN_URL = `${stubBase}/token`;
    const app = createApp();
    server = app.listen(0);
    await new Promise((r) => server.on('listening', r));
    base = `http://127.0.0.1:${server.address().port}`;
  });

  after(() => {
    server.close();
    stub.close();
  });

  const post = (p, body) => fetch(`${base}${p}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  it('GET /oauth/config sin env -> clientId vacío', async () => {
    delete process.env.GOOGLE_CLIENT_ID;
    const r = await (await fetch(`${base}/oauth/config`)).json();
    assert.equal(r.clientId, '');
  });

  it('GET /oauth/config con env -> lo devuelve', async () => {
    process.env.GOOGLE_CLIENT_ID = 'test-client-id.apps.googleusercontent.com';
    const r = await (await fetch(`${base}/oauth/config`)).json();
    assert.equal(r.clientId, 'test-client-id.apps.googleusercontent.com');
  });

  it('POST /oauth/token sin credenciales -> 501', async () => {
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
    const res = await post('/oauth/token', { code: 'x', grant_type: 'authorization_code' });
    assert.equal(res.status, 501);
    const r = await res.json();
    assert.equal(r.status, 'error');
    assert.match(r.reason, /GOOGLE_CLIENT_ID/);
  });

  it('POST /oauth/token sin code ni refresh_token -> 400', async () => {
    process.env.GOOGLE_CLIENT_ID = 'id';
    process.env.GOOGLE_CLIENT_SECRET = 'secret';
    const res = await post('/oauth/token', { grant_type: 'authorization_code' });
    assert.equal(res.status, 400);
    const r = await res.json();
    assert.equal(r.reason, 'Missing code or refresh_token');
  });

  it('POST /oauth/token reenvía a Google y devuelve los tokens', async () => {
    process.env.GOOGLE_CLIENT_ID = 'id';
    process.env.GOOGLE_CLIENT_SECRET = 'secret';
    let seen = null;
    stubHandler = (req, body, res) => {
      seen = body;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        access_token: 'ya29.test', expires_in: 3599, refresh_token: 'refresh.test',
      }));
    };
    const res = await post('/oauth/token', {
      code: 'authcode123', grant_type: 'authorization_code', redirect_uri: 'http://127.0.0.1:53683/',
    });
    assert.equal(res.status, 200);
    const r = await res.json();
    assert.equal(r.access_token, 'ya29.test');
    assert.equal(r.refresh_token, 'refresh.test');
    // el servidor inyectó client_id/secret sin exponerlos al cliente
    assert.ok(seen.includes('client_id=id'));
    assert.ok(seen.includes('client_secret=secret'));
    assert.ok(seen.includes('code=authcode123'));
  });

  it('POST /oauth/token propaga errores de Google con forma sana', async () => {
    stubHandler = (req, body, res) => {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'invalid_grant', error_description: 'Bad code' }));
    };
    const res = await post('/oauth/token', { code: 'bad', grant_type: 'authorization_code' });
    assert.equal(res.status, 400);
    const r = await res.json();
    assert.equal(r.status, 'error');
    assert.equal(r.version, 4);
    assert.equal(r.reason, 'Bad code');
  });

  it('POST /oauth/token refresh_token flow', async () => {
    let seen = null;
    stubHandler = (req, body, res) => {
      seen = body;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ access_token: 'ya29.new', expires_in: 3599 }));
    };
    const res = await post('/oauth/token', { refresh_token: 'refresh.test', grant_type: 'refresh_token' });
    assert.equal(res.status, 200);
    const r = await res.json();
    assert.equal(r.access_token, 'ya29.new');
    assert.ok(seen.includes('grant_type=refresh_token'));
    assert.ok(seen.includes('refresh_token=refresh.test'));
  });
});
