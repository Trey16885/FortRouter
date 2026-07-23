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

/**
 * Extractive answering: pick the sentences from the retrieved passages that
 * best match the query, keeping them in reading order. This is what lets
 * Thinking and Pro answer with the facts they retrieved instead of hoping
 * free-running generation stays on topic.
 */
function extractAnswer(passages, query, maxSentences = 3) {
  const qWords = new Set(words(query).filter((w) => !STOPWORDS.has(w) && w.length >= 3));
  const candidates = [];
  passages.forEach((p, pi) => {
    const sentences = p.excerpt.split(/(?<=[.!?])\s+/).filter((s) => s.trim().length > 15);
    sentences.forEach((s, si) => {
      let score = 0;
      for (const w of words(s)) if (qWords.has(w)) score++;
      // opening sentences usually define the subject; earlier passages ranked higher
      if (si === 0) score += 0.5;
      score += (passages.length - pi) * 0.25;
      candidates.push({ score, pi, si, text: s.trim() });
    });
  });
  const picked = candidates
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxSentences);
  if (!picked.length) return null;
  // best match opens the answer (it usually holds the definition the user
  // asked for); the rest follow in reading order
  const [best, ...rest] = picked;
  rest.sort((a, b) => a.pi - b.pi || a.si - b.si);
  return [best, ...rest].map((c) => c.text).join(' ');
}

module.exports = { ResearchIndex, extractAnswer };
