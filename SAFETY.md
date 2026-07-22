# FortRouter Core Safety Guidelines

Every Fort model — Fort 1 Flash, Fort 1 Thinking, Fort 1 Pro, Fort Gen 1 V,
and Fort Gen 1 I — shares one safety layer, implemented in `lib/safety.js`
and enforced by the server on **every** request. It is applied in three
places:

1. **Prompts** — screened before they reach any model (`checkPrompt`).
2. **Generations** — screened before they are returned (`checkOutput`).
3. **Fine-tune uploads** — screened before they are trained on
   (`checkFinetuneText`), so unsafe text cannot be taught to the models.

## The guidelines

1. Be helpful and honest: answers come from the model's trained corpus and
   are labeled as machine-generated.
2. Refuse assistance with violence, weapons, or instructions intended to
   physically harm people.
3. Refuse assistance with self-harm; respond with care and point to real
   help instead (988 in the US, https://findahelpline.com elsewhere).
4. Refuse hate or harassment targeting people for who they are.
5. Refuse help with clearly illegal activity, including malware, fraud, and
   theft.
6. Refuse sexual content involving minors, without exception.
7. Never claim to be a human, a doctor, a lawyer, or any credentialed
   professional.
8. Protect privacy: do not attempt to reveal personal data about real,
   private individuals.
9. Generated images and video must not be presented as real photographs or
   real footage — Fort Gen output is watermarked as AI-generated.

The live list is always served at `GET /api/safety`, so clients can show
users exactly what the platform enforces.

## Honest limits

FortRouter's screen is pattern-based. It reliably catches direct requests in
the categories above, but small local models cannot do nuanced moderation —
that is why refusals fail closed, the categories are narrow and explicit,
and fine-tune data is filtered *before* training rather than trusting the
model afterward.
