import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../backend/package.json', import.meta.url));
process.env.JWT_SECRET = 'media-test-secret-'.repeat(3);
process.env.JWT_REFRESH_SECRET = 'media-refresh-secret-'.repeat(3);
const express = require('express');
const { sign } = require('jsonwebtoken');
const mediaAccess = require('./dist/middleware/mediaAccess.js').default;
const secret = process.env.JWT_SECRET;

test('Community files require scoped, unexpired capabilities for the exact filename', async t => {
  const app = express();
  app.use('/public', mediaAccess, (_req, res) => res.send('private fixture'));
  app.use((error, _req, res, _next) => res.status(error.statusCode || 500).json({ message: error.message }));
  const server = await new Promise(resolve => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  const base = `http://127.0.0.1:${server.address().port}/public`;
  const url = (filename, payload, expiresIn = '5m') => `${base}/${filename}?mediaToken=${sign(payload, secret, { algorithm: 'HS256', expiresIn })}`;
  try {
    await t.test('direct anonymous access is denied', async () => {
      assert.equal((await fetch(`${base}/photo.png`)).status, 403);
    });
    await t.test('wrong file, scope and expired tokens are denied', async () => {
      for (const target of [
        url('other.png', { scope: 'media', filename: 'photo.png' }),
        url('photo.png', { scope: 'session', filename: 'photo.png' }),
        url('photo.png', { scope: 'media', filename: 'photo.png' }, -1),
        url('folder%2Fphoto.png', { scope: 'media', filename: 'folder/photo.png' }),
      ]) assert.equal((await fetch(target)).status, 403);
    });
    await t.test('authorized media receives private cache and nosniff headers', async () => {
      const response = await fetch(url('photo.png', { scope: 'media', filename: 'photo.png' }));
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('cache-control'), 'private, no-store');
      assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    });
    await t.test('active content is downloaded instead of rendered inline', async () => {
      const response = await fetch(url('document.html', { scope: 'media', filename: 'document.html' }));
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('content-disposition'), 'attachment');
    });
  } finally { await new Promise(resolve => server.close(resolve)); }
});
