'use strict';

/**
 * API key management. Keys look like `fort-<40 hex chars>`; only a SHA-256
 * hash is stored on disk, so the plaintext key is shown exactly once at
 * creation time. Store lives in data/keys.json.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const STORE_PATH = path.join(__dirname, '..', 'data', 'keys.json');

function hashKey(key) {
  return crypto.createHash('sha256').update(key).digest('hex');
}

class KeyStore {
  constructor(storePath = STORE_PATH) {
    this.storePath = storePath;
    this.keys = [];
    this._load();
  }

  _load() {
    try {
      this.keys = JSON.parse(fs.readFileSync(this.storePath, 'utf8'));
    } catch {
      this.keys = [];
    }
  }

  _save() {
    fs.mkdirSync(path.dirname(this.storePath), { recursive: true });
    fs.writeFileSync(this.storePath, JSON.stringify(this.keys, null, 2));
  }

  create(name) {
    const plaintext = 'fort-' + crypto.randomBytes(20).toString('hex');
    const record = {
      id: crypto.randomBytes(6).toString('hex'),
      name: String(name || 'unnamed key').slice(0, 64),
      hash: hashKey(plaintext),
      prefix: plaintext.slice(0, 12) + '…',
      createdAt: new Date().toISOString(),
      lastUsedAt: null,
      requests: 0,
    };
    this.keys.push(record);
    this._save();
    return { key: plaintext, record: this._public(record) };
  }

  list() {
    return this.keys.map((k) => this._public(k));
  }

  revoke(id) {
    const before = this.keys.length;
    this.keys = this.keys.filter((k) => k.id !== id);
    if (this.keys.length !== before) { this._save(); return true; }
    return false;
  }

  /** Verify a bearer token; returns the key record or null. */
  verify(plaintext) {
    if (!plaintext || !plaintext.startsWith('fort-')) return null;
    const h = hashKey(plaintext);
    const record = this.keys.find((k) => k.hash === h);
    if (!record) return null;
    record.lastUsedAt = new Date().toISOString();
    record.requests += 1;
    this._save();
    return this._public(record);
  }

  _public(k) {
    const { hash, ...pub } = k;
    return pub;
  }
}

module.exports = { KeyStore };
