export class AutomodHoldError extends Error {
  constructor(message, { reason = '', categories = [] } = {}) {
    super(message);
    this.name = 'AutomodHoldError';
    this.held = true;
    this.reason = reason;
    this.categories = categories;
  }
}

export const AUTOMOD_HOLD_MESSAGE = 'That was held for staff review and was not delivered.';

function compact(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[а]/gi, 'a')
    .replace(/[с]/gi, 'c')
    .replace(/[е]/gi, 'e')
    .replace(/[һ]/gi, 'h')
    .replace(/[іı]/gi, 'i')
    .replace(/[ј]/gi, 'j')
    .replace(/[к]/gi, 'k')
    .replace(/[оο]/gi, 'o')
    .replace(/[р]/gi, 'p')
    .replace(/[ѕ]/gi, 's')
    .replace(/[т]/gi, 't')
    .replace(/[х]/gi, 'x')
    .toLowerCase()
    .replace(/ph/g, 'f')
    .replace(/[@$0]/g, 'o')
    .replace(/[1!|]/g, 'i')
    .replace(/[3]/g, 'e')
    .replace(/[4]/g, 'a')
    .replace(/[5$]/g, 's')
    .replace(/[7]/g, 't')
    .replace(/v/g, 'u');
}

function foldedText(value) {
  return compact(value).replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function collapsedText(value) {
  return compact(value).replace(/[^a-z0-9]+/g, '');
}

function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hasWord(folded, term) {
  return new RegExp(`\\b${escapeRegex(term)}\\b`, 'i').test(folded);
}

function hasFuzzy(collapsed, term) {
  const letters = String(term || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (letters.length < 3) return false;
  const pattern = letters.split('').map((letter) => `${escapeRegex(letter)}+`).join('[^a-z0-9]*');
  return new RegExp(pattern).test(collapsed);
}

const fuzzyTerms = [
  { category: 'hate', reason: 'Possible hate speech', terms: ['nigger', 'nigga', 'faggot', 'fagot', 'kike', 'tranny', 'trannie', 'retard', 'wetback', 'chink', 'gook', 'spic', 'beaner', 'raghead', 'towelhead'] },
  { category: 'profanity', reason: 'Possible abusive or explicit language', terms: ['fuck', 'fuk', 'fck', 'fvck', 'phuck', 'fcuk', 'shit', 'bitch', 'pussy', 'whore', 'slut', 'dick', 'dildo', 'handjob', 'blowjob'] },
  { category: 'sexual', reason: 'Possible sexual harassment', terms: ['nudes'] },
];

const wordTerms = [
  { category: 'profanity', reason: 'Possible abusive or explicit language', terms: ['asshole', 'jackass', 'dumbass', 'dickhead', 'dipshit', 'bullshit', 'motherfucker', 'cunt', 'twat'] },
  { category: 'harassment', reason: 'Possible harassment', terms: ['stfu'] },
  { category: 'sexual', reason: 'Possible sexual harassment', terms: ['rape', 'rapist', 'incest'] },
];

const rules = [
  {
    category: 'child-safety',
    reason: 'Possible sexual content involving a minor',
    tests: [
      /\b(?:child|kid|kids|minor|underage|under\s*1[0-7]|loli|shota|cp)\b.{0,40}\b(?:sex|nude|nudes|porn|nsfw)\b/i,
      /\b(?:sex|nude|nudes|porn|nsfw)\b.{0,40}\b(?:child|kid|kids|minor|underage|loli|shota)\b/i,
    ],
  },
  {
    category: 'threats',
    reason: 'Possible violent threat or harassment',
    tests: [
      /\b(?:i(?:'| a)?m going to|i will|imma)\s+(?:kill|shoot|stab|bomb|rape)\b/i,
      /\b(?:kys|kill\s+your\s*self|unalive\s+yourself)\b/i,
      /\b(?:doxx?|swat)\s+(?:you|them|him|her)\b/i,
    ],
  },
  {
    category: 'hate',
    reason: 'Possible hate speech',
    tests: [
      /\b(?:nigg(?:a|er)s?|fag+ots?|kikes?|trann(?:y|ies)|retard(?:ed|s)?)\b/i,
    ],
    extra: (_raw, folded, collapsed) => /n+i+g{2,}(?:a|e+r?)s?/.test(collapsed || String(folded || '').replace(/\s+/g, '')),
  },
  {
    category: 'scam',
    reason: 'Possible scam, phishing, or stolen-account bait',
    tests: [
      /\b(?:free\s+(?:nitro|robux|vbucks)|steam\s+gift|click\s+this\s+link|verify\s+your\s+(?:account|nitro))\b/i,
      /\b(?:password|login|token|backup\s+code)s?\b.{0,24}\b(?:send|give|dm|drop)\b/i,
    ],
  },
  {
    category: 'doxxing',
    reason: 'Possible personal information',
    tests: [
      /\b(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}\b/,
      /\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/i,
      /\b(?:ssn|social security)\b.{0,12}\b\d{3}-?\d{2}-?\d{4}\b/i,
      /\b\d{1,5}\s+\w+\s+(?:street|st|avenue|ave|road|rd|drive|dr|lane|ln)\b/i,
    ],
  },
  {
    category: 'spam',
    reason: 'Spam, invite flooding, or repeated advertising',
    tests: [
      /(?:https?:\/\/|www\.)[^\s]{4,}/i,
      /discord\.gg\/[a-z0-9-]+/i,
    ],
    extra: (raw) => (raw.match(/https?:\/\//gi) || []).length >= 2 || (raw.match(/discord\.gg\//gi) || []).length >= 1,
  },
];

// Drop-location captions often look like street addresses ("12 Main St").
// Strip those lines before scanning so ER:LC pins are not held as doxxing.
export function stripLocationCaption(value) {
  return String(value || '')
    .split(/\r?\n/)
    .filter((line) => !/^\s*📍\s*/u.test(line) && !/^\s*location dropped from er:lc\b/i.test(line))
    .join('\n')
    .trim();
}

export function scanInternetContent(value) {
  const raw = stripLocationCaption(value);
  if (!raw.trim()) return null;
  const folded = foldedText(raw);
  const collapsed = collapsedText(raw);
  const categories = [];
  const reasons = [];
  const add = (category, reason) => {
    if (!categories.includes(category)) categories.push(category);
    if (reason && !reasons.includes(reason)) reasons.push(reason);
  };

  for (const group of fuzzyTerms) {
    if (group.terms.some((term) => hasFuzzy(collapsed, term) || hasWord(folded, term))) {
      add(group.category, group.reason);
    }
  }
  for (const group of wordTerms) {
    if (group.terms.some((term) => hasWord(folded, term))) add(group.category, group.reason);
  }

  for (const rule of rules) {
    const matched = rule.tests.some((pattern) => pattern.test(raw) || pattern.test(folded))
      || (typeof rule.extra === 'function' && rule.extra(raw, folded, collapsed));
    if (!matched) continue;
    if (rule.category === 'spam' && (raw.match(/https?:\/\//gi) || []).length < 2 && !/discord\.gg\//i.test(raw)) continue;
    add(rule.category, rule.reason);
  }

  if (/(.)\1{14,}/.test(raw) || raw.replace(/[^A-Z]/g, '').length > 40 && raw.replace(/[^A-Z]/g, '').length / Math.max(raw.replace(/\s/g, '').length, 1) > 0.72) {
    add('spam', 'Excessive spam formatting');
  }

  if (!categories.length) return null;
  return {
    categories: [...new Set(categories)],
    reason: reasons[0],
  };
}
