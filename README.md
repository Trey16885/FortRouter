# FortRouter

Welcome to FortRouter — a token beast of a place. Make API keys, use the API
keys, and run **free AI hosted on your own computer**. Zero dependencies,
pure Node.js: clone it, start it, and the whole platform — models, dashboard,
API, and safety layer — lives on your machine.

```bash
node server.js
# FortRouter ready on http://localhost:3616
```

## The Fort model family (all free)

| Model | Type | What it's for |
|---|---|---|
| **Fort 1 Flash** | text | The usual good AI — best for quick answers. |
| **Fort 1 Thinking** | text | Researches subjects in the local index and shows its thinking. Free, like Flash. |
| **Fort 1 Pro** | text | Researches subjects and is a beast — deepest research, longest answers. Still free. |
| **Fort Gen 1 V** | video | Video generation — animated, looping, prompt-seeded vector art. Free. |
| **Fort Gen 1 I** | image | Image generation — deterministic procedural art steered by your prompt. Free. |

### How the models are made

The text models are built through **tokenization + fine-tuning**, for real,
at a scale your laptop trains in milliseconds:

1. A **BPE tokenizer** (`lib/tokenizer.js`) learns ~400 merges over the
   corpus in `data/corpus/`, turning characters into a shared token
   vocabulary.
2. Each Fort text model (`lib/model.js`) is an **n-gram language model with
   backoff** over those tokens — Flash uses order 3, Thinking order 4, Pro
   order 5 — trained fresh at startup.
3. **Fine-tuning** (`POST /api/finetune` or the dashboard tab) tokenizes new
   text with the shared vocabulary and folds it into every text model's
   counts with extra weight, updates the research index, and persists the
   upload so it survives restarts.

These are honest small statistical models, not neural networks: fully
inspectable, fully local, and genuinely trained on whatever you feed them.
Thinking and Pro add a TF-IDF research pass (`lib/research.js`) over the
corpus before answering, and cite the passages they used. Fort Gen 1 I/V
(`lib/gen.js`) render prompt-seeded procedural SVG — the video variant
animates and loops in any browser — and every output is watermarked as
AI-generated.

## Core safety guidelines

One safety layer (`lib/safety.js`) fronts **every** model. It screens
prompts before generation, generations before they're returned, and
fine-tune uploads before they're trained on. The guidelines — no violence or
weapons help, care-first self-harm refusals, no hate, no clearly illegal
activity, no sexual content involving minors, no impersonating humans or
professionals, privacy protection, and AI-generated media labeling — are
served live at `GET /api/safety` and documented in [SAFETY.md](SAFETY.md).

## API keys

Keys look like `fort-<40 hex>`. Only a SHA-256 hash is stored
(`data/keys.json`, git-ignored), so a key is shown exactly once at creation.
Create, list, and revoke them from the dashboard or the API; each key tracks
its request count.

## API

```bash
# create a key (open — it's your machine)
curl -s -X POST localhost:3616/api/keys -d '{"name":"my-app"}'

KEY=fort-...   # from the response

# quick answer
curl -s localhost:3616/api/generate -H "Authorization: Bearer $KEY" \
  -d '{"model":"fort-1-flash","prompt":"what is tokenization?"}'

# research model with thinking + sources
curl -s localhost:3616/api/generate -H "Authorization: Bearer $KEY" \
  -d '{"model":"fort-1-pro","prompt":"tell me about black holes"}'

# image / video
curl -s localhost:3616/api/generate -H "Authorization: Bearer $KEY" \
  -d '{"model":"fort-gen-1-i","prompt":"ocean at sunset"}'
curl -s localhost:3616/api/generate -H "Authorization: Bearer $KEY" \
  -d '{"model":"fort-gen-1-v","prompt":"night sky","options":{"duration":8}}'

# fine-tune all text models on your own text
curl -s localhost:3616/api/finetune -H "Authorization: Bearer $KEY" \
  -d '{"name":"my-notes","text":"...at least 40 characters of training text..."}'
```

| Route | Auth | Purpose |
|---|---|---|
| `GET /api/health` | none | liveness + ready state |
| `GET /api/models` | none | model cards with live training stats |
| `GET /api/safety` | none | the core safety guidelines |
| `POST /api/keys` | none | create a key (self-hosted, your box) |
| `GET /api/keys` | bearer | list key metadata |
| `DELETE /api/keys/:id` | bearer | revoke a key |
| `POST /api/generate` | bearer | run any Fort model |
| `POST /api/finetune` | bearer | fine-tune all text models |

## Dashboard

Open `http://localhost:3616` for the full dashboard: model cards with live
stats, chat with all three text models (including thinking traces and
sources), an image/video studio, one-click fine-tuning, key management, and
the safety guidelines.

## Test

```bash
npm test   # trains the models and exercises every endpoint + the safety layer
```
