'use strict';

/**
 * Fort language model: a token-level n-gram model with backoff, built on the
 * shared BPE tokenizer. `train` fits the base corpus; `finetune` folds new
 * counts in on top (heavier weight so fine-tuned material shows through).
 *
 * Every Fort text model (Flash / Thinking / Pro) is one of these with a
 * different context order, sampling budget, and research pipeline around it.
 */

const crypto = require('crypto');
const { Tokenizer } = require('./tokenizer');

const BOS = '<s>';

function seededRng(seed) {
  let h = crypto.createHash('sha256').update(String(seed)).digest();
  let i = 0;
  return () => {
    if (i + 4 > h.length) { h = crypto.createHash('sha256').update(h).digest(); i = 0; }
    const v = h.readUInt32BE(i); i += 4;
    return v / 0xffffffff;
  };
}

class FortModel {
  constructor({ order = 3 } = {}) {
    this.order = order;                 // context length in tokens
    this.counts = [];                   // counts[k]: Map(contextKey -> Map(next -> n))
    for (let k = 0; k <= order; k++) this.counts.push(new Map());
    this.tokenizer = new Tokenizer();
    this.trainedTokens = 0;
  }

  _observe(tokens, weight) {
    for (let k = 1; k <= this.order; k++) {
      const table = this.counts[k];
      const padded = [...Array(k).fill(BOS), ...tokens];
      for (let i = k; i < padded.length; i++) {
        const ctx = padded.slice(i - k, i).join('');
        const next = padded[i];
        let dist = table.get(ctx);
        if (!dist) { dist = new Map(); table.set(ctx, dist); }
        dist.set(next, (dist.get(next) || 0) + weight);
      }
    }
    // unigram
    const uni = this.counts[0];
    const key = '';
    let dist = uni.get(key);
    if (!dist) { dist = new Map(); uni.set(key, dist); }
    for (const t of tokens) dist.set(t, (dist.get(t) || 0) + weight);
    this.trainedTokens += tokens.length;
  }

  train(text, numMerges) {
    this.tokenizer.train(text, numMerges);
    for (const para of text.split(/\n\s*\n/)) {
      const tokens = this.tokenizer.encode(para);
      if (tokens.length) this._observe(tokens, 1);
    }
    return this;
  }

  /** Fine-tune on new text without retraining the tokenizer. */
  finetune(text, weight = 3) {
    let added = 0;
    for (const para of text.split(/\n\s*\n/)) {
      const tokens = this.tokenizer.encode(para);
      if (tokens.length) { this._observe(tokens, weight); added += tokens.length; }
    }
    return added;
  }

  _sampleNext(context, rng, temperature) {
    for (let k = Math.min(this.order, context.length); k >= 0; k--) {
      const ctx = k === 0 ? '' : context.slice(context.length - k).join('');
      const dist = this.counts[k].get(ctx);
      if (!dist || dist.size === 0) continue;
      // temperature-scaled sampling over counts
      const items = [...dist.entries()].filter(([t]) => t !== BOS);
      if (!items.length) continue;
      const weights = items.map(([, n]) => Math.pow(n, 1 / Math.max(temperature, 0.05)));
      const total = weights.reduce((a, b) => a + b, 0);
      let r = rng() * total;
      for (let i = 0; i < items.length; i++) {
        r -= weights[i];
        if (r <= 0) return items[i][0];
      }
      return items[items.length - 1][0];
    }
    return null;
  }

  /**
   * Generate a continuation. The prompt tokens seed the context window; a
   * seed string keeps sampling deterministic per request when provided.
   */
  generate(prompt, { maxTokens = 80, temperature = 0.9, seed } = {}) {
    const rng = seededRng(seed ?? (prompt + ':' + Date.now()));
    const promptTokens = this.tokenizer.encode(prompt);
    const context = promptTokens.length
      ? promptTokens.slice(-this.order)
      : Array(this.order).fill(BOS);
    const out = [];
    let current = [...context];
    for (let i = 0; i < maxTokens; i++) {
      const next = this._sampleNext(current, rng, temperature);
      if (next === null) break;
      out.push(next);
      current.push(next);
      if (current.length > this.order) current = current.slice(-this.order);
      // stop politely at sentence end once we have a reasonable length
      if (out.length > maxTokens * 0.6 && /[.!?]<\/w>$/.test(next)) break;
    }
    return Tokenizer.decode(out);
  }

  stats() {
    let contexts = 0;
    for (const table of this.counts) contexts += table.size;
    return {
      order: this.order,
      vocabSize: this.tokenizer.vocabSize(),
      contexts,
      trainedTokens: this.trainedTokens,
    };
  }
}

module.exports = { FortModel, seededRng };
