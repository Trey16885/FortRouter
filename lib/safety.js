'use strict';

/**
 * FortRouter core safety guidelines.
 *
 * Every request to every Fort model passes through this layer before it
 * reaches a model, and every generation passes through it on the way out.
 * The guidelines below are served verbatim at GET /api/safety.
 */

const CORE_GUIDELINES = [
  'Be helpful and honest: answers come from the model\'s trained corpus and are labeled as machine-generated.',
  'Refuse assistance with violence, weapons, or instructions intended to physically harm people.',
  'Refuse assistance with self-harm; respond with care and point to real help instead.',
  'Refuse hate or harassment targeting people for who they are.',
  'Refuse help with clearly illegal activity, including malware, fraud, and theft.',
  'Refuse sexual content involving minors, without exception.',
  'Never claim to be a human, a doctor, a lawyer, or any credentialed professional.',
  'Protect privacy: do not attempt to reveal personal data about real, private individuals.',
  'Generated images and video must not be presented as real photographs or real footage.',
];

// Each rule: category, human-readable reason, and patterns that flag a prompt.
const RULES = [
  {
    category: 'violence',
    reason: 'requests help harming people or building weapons',
    patterns: [
      /\b(how|help|teach|show)\b.{0,40}\b(kill|murder|hurt|attack|assault)\b.{0,30}\b(someone|somebody|people|person|him|her|them)\b/i,
      /\b(build|make|assemble|construct)\b.{0,30}\b(bomb|explosive|pipe bomb|nerve agent|bioweapon)\b/i,
    ],
  },
  {
    category: 'self-harm',
    reason: 'concerns self-harm',
    patterns: [
      /\b(how|best way|ways?)\b.{0,40}\b(kill|hurt|harm)\b.{0,15}\b(myself|my self)\b/i,
      /\bcommit suicide\b/i,
    ],
  },
  {
    category: 'hate',
    reason: 'requests hateful or harassing content about a protected group',
    patterns: [
      /\b(write|make|generate)\b.{0,50}\b(racist|hateful|slur|dehumanizing)\b/i,
    ],
  },
  {
    category: 'illegal',
    reason: 'requests help with clearly illegal activity',
    patterns: [
      /\b(write|create|build|make)\b.{0,40}\b(malware|ransomware|keylogger|virus)\b/i,
      /\b(how|help)\b.{0,40}\b(steal|launder|counterfeit)\b.{0,30}\b(money|cards?|identit)/i,
      /\b(synthesize|cook|make)\b.{0,30}\b(meth|fentanyl|heroin)\b/i,
    ],
  },
  {
    category: 'minors',
    reason: 'requests sexual content involving minors',
    patterns: [
      /\b(sexual|explicit|nude)\b.{0,40}\b(child|children|minor|underage)\b/i,
      /\b(child|children|minor|underage)\b.{0,40}\b(sexual|explicit|nude)\b/i,
    ],
  },
];

const REFUSAL_TEMPLATE = (category) =>
  `FortRouter safety: this request was declined because it ${RULES.find(r => r.category === category)?.reason || 'conflicts with the core safety guidelines'}. ` +
  'All Fort models share the same core guidelines - see /api/safety. Happy to help with something else.';

const CRISIS_NOTE =
  'If you are struggling, you deserve real support from a real person. ' +
  'In the US you can call or text 988; elsewhere, https://findahelpline.com lists local services.';

/** Check a prompt. Returns { allowed: true } or { allowed: false, category, message }. */
function checkPrompt(prompt) {
  const text = String(prompt || '');
  for (const rule of RULES) {
    for (const pattern of rule.patterns) {
      if (pattern.test(text)) {
        let message = REFUSAL_TEMPLATE(rule.category);
        if (rule.category === 'self-harm') message += '\n\n' + CRISIS_NOTE;
        return { allowed: false, category: rule.category, message };
      }
    }
  }
  return { allowed: true };
}

/**
 * Check generated output. The n-gram models can only echo their corpus, but
 * fine-tuning accepts arbitrary text, so outputs get the same screen.
 */
function checkOutput(text) {
  const result = checkPrompt(text);
  if (result.allowed) return { allowed: true, text };
  return {
    allowed: false,
    category: result.category,
    text: '[output withheld by FortRouter safety layer]',
  };
}

/** Fine-tune corpus screening: reject uploads that would teach unsafe text. */
function checkFinetuneText(text) {
  return checkPrompt(text);
}

module.exports = { CORE_GUIDELINES, checkPrompt, checkOutput, checkFinetuneText };
