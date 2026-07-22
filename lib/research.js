'use strict';

/**
 * Local research engine used by Fort 1 Thinking and Fort 1 Pro.
 *
 * The corpus (base + fine-tuned uploads) is indexed as paragraphs; queries
 * are scored with TF-IDF-weighted word overlap. Everything is local - the
 * platform never leaves the machine, which is the whole point of FortRouter.
 */

const STOPWORDS = new Set(
  ('a an the and or but if then is are was were be been being of in on at to for from ' +
   'with by about as into like through after over under between out against during ' +
   'what which who whom this that these those i you he she it we they my your his her ' +
   'its our their me him them do does did doing have has had having can could will ' +
   'would shall should may might must not no nor so than too very just how why when where')
    .split(/\s+/)
);

function words(text) {
  return text.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').split(/\s+/).filter(Boolean);
}

class ResearchIndex {
  constructor() {
    this.docs = []; // { id, source, text, terms: Map(word -> tf) }
    this.docFreq = new Map();
  }

  addDocument(source, text) {
    for (const para of text.split(/\n\s*\n/)) {
      const trimmed = para.trim();
      if (trimmed.length < 40) continue;
      const terms = new Map();
      for (const w of words(trimmed)) {
        if (STOPWORDS.has(w) || w.length < 3) continue;
        terms.set(w, (terms.get(w) || 0) + 1);
      }
      if (!terms.size) continue;
      this.docs.push({ id: this.docs.length, source, text: trimmed, terms });
      for (const w of terms.keys()) {
        this.docFreq.set(w, (this.docFreq.get(w) || 0) + 1);
      }
    }
  }

  search(query, topK = 3) {
    const qWords = words(query).filter((w) => !STOPWORDS.has(w) && w.length >= 3);
    if (!qWords.length) return [];
    const n = Math.max(this.docs.length, 1);
    const scored = [];
    for (const doc of this.docs) {
      let score = 0;
      for (const w of qWords) {
        const tf = doc.terms.get(w);
        if (!tf) continue;
        const idf = Math.log(1 + n / (this.docFreq.get(w) || 1));
        score += tf * idf;
      }
      if (score > 0) scored.push({ score, doc });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK).map(({ score, doc }) => ({
      source: doc.source,
      score: Number(score.toFixed(3)),
      excerpt: doc.text.length > 400 ? doc.text.slice(0, 400) + '…' : doc.text,
    }));
  }

  size() { return this.docs.length; }
}

module.exports = { ResearchIndex };
