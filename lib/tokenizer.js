'use strict';

/**
 * FortRouter BPE tokenizer.
 *
 * A small byte-pair-encoding tokenizer trained on the local corpus. Words are
 * split into characters (with an end-of-word marker), then the most frequent
 * adjacent pair is merged repeatedly until the merge budget is spent. The
 * learned merge table is what every Fort model shares as its vocabulary.
 */

const EOW = '</w>';

class Tokenizer {
  constructor() {
    this.merges = [];          // ordered list of [left, right]
    this.mergeRank = new Map(); // "left right" -> rank
    this.vocab = new Map();     // token -> id
  }

  static wordsOf(text) {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9.,!?'\s-]/g, ' ')
      .split(/\s+/)
      .filter(Boolean);
  }

  train(text, numMerges = 400) {
    const wordFreq = new Map();
    for (const w of Tokenizer.wordsOf(text)) {
      wordFreq.set(w, (wordFreq.get(w) || 0) + 1);
    }
    // Each entry: { symbols: [...], freq }
    const entries = [];
    for (const [word, freq] of wordFreq) {
      entries.push({ symbols: [...word, EOW], freq });
    }

    for (let i = 0; i < numMerges; i++) {
      const pairCounts = new Map();
      for (const { symbols, freq } of entries) {
        for (let j = 0; j < symbols.length - 1; j++) {
          const key = symbols[j] + ' ' + symbols[j + 1];
          pairCounts.set(key, (pairCounts.get(key) || 0) + freq);
        }
      }
      let best = null;
      let bestCount = 1; // require a pair seen at least twice
      for (const [key, count] of pairCounts) {
        if (count > bestCount) { best = key; bestCount = count; }
      }
      if (!best) break;
      const [a, b] = best.split(' ');
      this.merges.push([a, b]);
      this.mergeRank.set(best, this.merges.length - 1);
      const merged = a + b;
      for (const entry of entries) {
        const out = [];
        const s = entry.symbols;
        for (let j = 0; j < s.length; j++) {
          if (j < s.length - 1 && s[j] === a && s[j + 1] === b) {
            out.push(merged);
            j++;
          } else {
            out.push(s[j]);
          }
        }
        entry.symbols = out;
      }
    }

    this.vocab.clear();
    const add = (t) => { if (!this.vocab.has(t)) this.vocab.set(t, this.vocab.size); };
    for (const { symbols } of entries) symbols.forEach(add);
    return this;
  }

  encodeWord(word) {
    let symbols = [...word, EOW];
    while (symbols.length > 1) {
      let bestRank = Infinity;
      let bestIdx = -1;
      for (let j = 0; j < symbols.length - 1; j++) {
        const rank = this.mergeRank.get(symbols[j] + ' ' + symbols[j + 1]);
        if (rank !== undefined && rank < bestRank) { bestRank = rank; bestIdx = j; }
      }
      if (bestIdx === -1) break;
      symbols = [
        ...symbols.slice(0, bestIdx),
        symbols[bestIdx] + symbols[bestIdx + 1],
        ...symbols.slice(bestIdx + 2),
      ];
    }
    return symbols;
  }

  encode(text) {
    const tokens = [];
    for (const w of Tokenizer.wordsOf(text)) tokens.push(...this.encodeWord(w));
    return tokens;
  }

  /** Join a token stream back into readable text. */
  static decode(tokens) {
    let out = '';
    for (const t of tokens) {
      if (t.endsWith(EOW)) out += t.slice(0, -EOW.length) + ' ';
      else out += t;
    }
    return out
      .replace(/\s+([.,!?])/g, '$1')
      .replace(/\s+/g, ' ')
      .trim();
  }

  vocabSize() { return this.vocab.size; }
}

module.exports = { Tokenizer, EOW };
