'use strict';

/**
 * The Fort model family. Text models share one corpus and research index but
 * differ in n-gram order, sampling budget, and how hard they research before
 * answering. Generative models are procedural (see lib/gen.js).
 */

const fs = require('fs');
const path = require('path');
const { FortModel } = require('./model');
const { ResearchIndex, extractAnswer } = require('./research');
const { generateImage, generateVideo } = require('./gen');
const safety = require('./safety');

const CORPUS_DIR = path.join(__dirname, '..', 'data', 'corpus');
const FINETUNE_DIR = path.join(__dirname, '..', 'data', 'finetune');

const MODEL_CARDS = [
  {
    id: 'fort-1-flash',
    name: 'Fort 1 Flash',
    type: 'text',
    price: 'free',
    description: 'The usual good AI. Short context, fast sampling - best for quick answers.',
  },
  {
    id: 'fort-1-thinking',
    name: 'Fort 1 Thinking',
    type: 'text',
    price: 'free',
    description: 'Researches subjects in the local index and shows its thinking before answering. Free, like Flash.',
  },
  {
    id: 'fort-1-pro',
    name: 'Fort 1 Pro',
    type: 'text',
    price: 'free',
    description: 'The beast: deepest research pass, longest context and answers. Still completely free.',
  },
  {
    id: 'fort-gen-1-v',
    name: 'Fort Gen 1 V',
    type: 'video',
    price: 'free',
    description: 'Video generation. Prompt-seeded animated vector art that loops in any browser. Free.',
  },
  {
    id: 'fort-gen-1-i',
    name: 'Fort Gen 1 I',
    type: 'image',
    price: 'free',
    description: 'Image generation. Deterministic procedural art steered by prompt keywords. Free.',
  },
];

/** Cut generated text back to its last complete sentence. */
function trimToSentence(text) {
  const t = String(text || '').trim();
  const last = Math.max(t.lastIndexOf('.'), t.lastIndexOf('!'), t.lastIndexOf('?'));
  return last >= 20 ? t.slice(0, last + 1) : t;
}

const TEXT_CONFIG = {
  'fort-1-flash':    { order: 3, maxTokens: 60,  temperature: 1.0, research: 0 },
  'fort-1-thinking': { order: 4, maxTokens: 110, temperature: 0.85, research: 2 },
  'fort-1-pro':      { order: 5, maxTokens: 170, temperature: 0.75, research: 4 },
};

class Registry {
  constructor() {
    this.models = new Map();   // id -> FortModel
    this.index = new ResearchIndex();
    this.ready = false;
  }

  _readCorpus() {
    const pieces = [];
    for (const dir of [CORPUS_DIR, FINETUNE_DIR]) {
      if (!fs.existsSync(dir)) continue;
      for (const f of fs.readdirSync(dir).sort()) {
        if (!f.endsWith('.txt')) continue;
        pieces.push({ source: f, text: fs.readFileSync(path.join(dir, f), 'utf8') });
      }
    }
    return pieces;
  }

  /** Train all text models from the corpus (base + saved fine-tunes). */
  boot() {
    const started = Date.now();
    const pieces = this._readCorpus();
    const baseText = pieces.map((p) => p.text).join('\n\n');
    for (const [id, cfg] of Object.entries(TEXT_CONFIG)) {
      const model = new FortModel({ order: cfg.order });
      model.train(baseText, 400);
      this.models.set(id, model);
    }
    for (const { source, text } of pieces) this.index.addDocument(source, text);
    this.ready = true;
    return { models: this.models.size + 2, documents: this.index.size(), ms: Date.now() - started };
  }

  cards() {
    return MODEL_CARDS.map((card) => {
      const model = this.models.get(card.id);
      return model ? { ...card, stats: model.stats() } : { ...card };
    });
  }

  /**
   * Run one generation request. Assumes the prompt already passed the safety
   * screen (the server enforces that); output is screened here.
   */
  generate(modelId, prompt, options = {}) {
    const card = MODEL_CARDS.find((c) => c.id === modelId);
    if (!card) throw Object.assign(new Error(`unknown model: ${modelId}`), { status: 404 });

    if (card.type === 'image') {
      const image = generateImage(prompt, options);
      return { model: card.id, type: 'image', prompt, image };
    }
    if (card.type === 'video') {
      const video = generateVideo(prompt, options);
      return { model: card.id, type: 'video', prompt, video };
    }

    const cfg = TEXT_CONFIG[modelId];
    const model = this.models.get(modelId);
    const research = cfg.research > 0 ? this.index.search(prompt, cfg.research) : [];
    const genOpts = {
      maxTokens: options.maxTokens ? Math.min(Number(options.maxTokens), 400) : cfg.maxTokens,
      temperature: options.temperature ? Number(options.temperature) : cfg.temperature,
      seed: options.seed,
    };

    // Research models answer extractively from the passages they retrieved,
    // then let the model extend from the answer's tail. Without a usable
    // passage (and always for Flash) generation is free-running.
    let raw;
    let answerMode = 'freeform';
    const lead = research.length ? extractAnswer(research, prompt, cfg.research + 1) : null;
    if (lead) {
      answerMode = 'grounded';
      const extension = trimToSentence(
        model.generate(lead, { ...genOpts, maxTokens: Math.floor(genOpts.maxTokens / 2) })
      );
      raw = lead + (extension && !lead.toLowerCase().includes(extension.slice(0, 40).toLowerCase())
        ? ' ' + extension
        : '');
    } else {
      raw = model.generate(prompt, genOpts);
    }
    const screened = safety.checkOutput(raw);

    const result = { model: card.id, type: 'text', prompt, text: screened.text, answerMode };
    if (!screened.allowed) result.safety = { outputFiltered: true, category: screened.category };
    if (cfg.research > 0) {
      result.thinking = research.length
        ? `Searched the local index for "${prompt.slice(0, 80)}", picked the most relevant sentence(s) from ${research.length} passage(s), and extended them with the model.`
        : 'Searched the local index but found no relevant passages; answering freeform from base training alone.';
      result.sources = research;
    }
    return result;
  }

  /** Fine-tune every text model on new material and persist it. */
  finetune(text, name) {
    fs.mkdirSync(FINETUNE_DIR, { recursive: true });
    const safeName = String(name || 'upload').replace(/[^a-z0-9_-]/gi, '_').slice(0, 40);
    const file = `${Date.now()}-${safeName}.txt`;
    fs.writeFileSync(path.join(FINETUNE_DIR, file), text);

    let tokens = 0;
    for (const model of this.models.values()) tokens = model.finetune(text);
    this.index.addDocument(file, text);
    return { file, tokensAdded: tokens, models: [...this.models.keys()] };
  }
}

module.exports = { Registry, MODEL_CARDS };
