import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { b64, encrypt, decrypt, generateKey } from '../shared/crypto.js';

describe('crypto', () => {
  it('generateKey produces a 32-byte base64 key', async () => {
    const key = await generateKey();
    assert.equal(typeof key, 'string');
    assert.equal(b64.base64ToBytes(key).length, 32);
  });

  it('encrypt/decrypt roundtrip', async () => {
    const key = await generateKey();
    const plaintext = '1a2b3cDriveFolderId-_XYZ';
    const enc = await encrypt(plaintext, key);
    assert.notEqual(enc, plaintext);
    assert.equal(await decrypt(enc, key), plaintext);
  });

  it('uses a random IV (two encryptions differ)', async () => {
    const key = await generateKey();
    const a = await encrypt('same text', key);
    const b = await encrypt('same text', key);
    assert.notEqual(a, b);
    assert.equal(await decrypt(a, key), 'same text');
    assert.equal(await decrypt(b, key), 'same text');
  });

  it('decrypt fails with the wrong key', async () => {
    const key1 = await generateKey();
    const key2 = await generateKey();
    const enc = await encrypt('secret', key1);
    await assert.rejects(() => decrypt(enc, key2));
  });

  it('handles unicode text', async () => {
    const key = await generateKey();
    const text = 'carpeta-ñandú-日本語';
    assert.equal(await decrypt(await encrypt(text, key), key), text);
  });

  it('b64 helpers roundtrip', () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 255]);
    assert.deepEqual(b64.base64ToBytes(b64.bytesToBase64(bytes)), bytes);
    assert.equal(b64.base64decode(b64.base64encode('hola')), 'hola');
  });
});
