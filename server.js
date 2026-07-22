#!/usr/bin/env node
'use strict';

/**
 * FortRouter server - zero-dependency Node.js.
 *
 *   node server.js            # http://localhost:3616
 *   PORT=8080 node server.js
 *
 * API (Bearer auth with a fort-... key, except where noted):
 *   GET  /api/health          - status, no auth
 *   GET  /api/models          - model cards + stats, no auth
 *   GET  /api/safety          - core safety guidelines, no auth
 *   POST /api/keys            - create key {name}, no auth (self-hosted)
 *   GET  /api/keys            - list keys (metadata only)
 *   DELETE /api/keys/:id      - revoke a key
 *   POST /api/generate        - {model, prompt, options?}
 *   POST /api/finetune        - {text, name?} fine-tunes all text models
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const { Registry } = require('./lib/registry');
const { KeyStore } = require('./lib/keys');
const safety = require('./lib/safety');

const PORT = Number(process.env.PORT) || 3616;
const PUBLIC_DIR = path.join(__dirname, 'public');
const MAX_BODY = 1024 * 1024; // 1 MiB

const registry = new Registry();
const keys = new KeyStore();

function json(res, status, body) {
  const data = JSON.stringify(body, null, 2);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(data);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(Object.assign(new Error('body too large'), { status: 413 })); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { reject(Object.assign(new Error('invalid JSON body'), { status: 400 })); }
    });
    req.on('error', reject);
  });
}

function auth(req) {
  const header = req.headers.authorization || '';
  const match = /^Bearer\s+(\S+)$/i.exec(header);
  return match ? keys.verify(match[1]) : null;
}

function serveStatic(req, res, urlPath) {
  const rel = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
  const file = path.join(PUBLIC_DIR, path.normalize(rel));
  if (!file.startsWith(PUBLIC_DIR) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('not found');
    return;
  }
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
  res.writeHead(200, { 'Content-Type': (types[path.extname(file)] || 'application/octet-stream') + '; charset=utf-8' });
  fs.createReadStream(file).pipe(res);
}

async function route(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const p = url.pathname;

  if (!p.startsWith('/api/')) return serveStatic(req, res, p);

  // --- open endpoints ---
  if (req.method === 'GET' && p === '/api/health') {
    return json(res, 200, { ok: true, platform: 'FortRouter', ready: registry.ready });
  }
  if (req.method === 'GET' && p === '/api/models') {
    return json(res, 200, { models: registry.cards() });
  }
  if (req.method === 'GET' && p === '/api/safety') {
    return json(res, 200, { coreGuidelines: safety.CORE_GUIDELINES });
  }
  if (req.method === 'POST' && p === '/api/keys') {
    const body = await readBody(req);
    const { key, record } = keys.create(body.name);
    return json(res, 201, { key, record, note: 'Store this key now - it is only shown once.' });
  }

  // --- authenticated endpoints ---
  const keyRecord = auth(req);
  if (!keyRecord) {
    return json(res, 401, { error: 'missing or invalid API key. Create one with POST /api/keys and send it as "Authorization: Bearer fort-..."' });
  }

  if (req.method === 'GET' && p === '/api/keys') {
    return json(res, 200, { keys: keys.list() });
  }
  if (req.method === 'DELETE' && /^\/api\/keys\/[a-f0-9]+$/.test(p)) {
    const id = p.split('/').pop();
    return keys.revoke(id)
      ? json(res, 200, { revoked: id })
      : json(res, 404, { error: 'no such key id' });
  }

  if (req.method === 'POST' && p === '/api/generate') {
    const body = await readBody(req);
    const prompt = String(body.prompt || '').trim();
    if (!body.model || !prompt) return json(res, 400, { error: 'required fields: model, prompt' });

    const screen = safety.checkPrompt(prompt);
    if (!screen.allowed) {
      return json(res, 200, {
        model: body.model, type: 'refusal', refused: true,
        safety: { category: screen.category }, text: screen.message,
      });
    }
    const result = registry.generate(body.model, prompt, body.options || {});
    return json(res, 200, result);
  }

  if (req.method === 'POST' && p === '/api/finetune') {
    const body = await readBody(req);
    const text = String(body.text || '').trim();
    if (text.length < 40) return json(res, 400, { error: 'finetune text must be at least 40 characters' });
    const screen = safety.checkFinetuneText(text);
    if (!screen.allowed) {
      return json(res, 400, { error: 'fine-tune text rejected by the safety layer', safety: { category: screen.category } });
    }
    return json(res, 200, registry.finetune(text, body.name));
  }

  return json(res, 404, { error: `no route: ${req.method} ${p}` });
}

const server = http.createServer((req, res) => {
  route(req, res).catch((err) => {
    json(res, err.status || 500, { error: err.message || 'internal error' });
  });
});

const boot = registry.boot();
server.listen(PORT, () => {
  console.log(`FortRouter ready on http://localhost:${PORT}`);
  console.log(`  trained ${boot.models} models from ${boot.documents} corpus documents in ${boot.ms}ms`);
});
