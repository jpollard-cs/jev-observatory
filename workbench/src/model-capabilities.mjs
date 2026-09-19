/** Versioned provider claims. Menu availability is not evaluation evidence. */
export const LANGUAGE_NAMES = Object.freeze({
  en: 'English', es: 'Spanish', fr: 'French', de: 'German', pt: 'Portuguese',
  it: 'Italian', ja: 'Japanese', ko: 'Korean', zh: 'Chinese', ar: 'Arabic',
  he: 'Hebrew', hi: 'Hindi', ru: 'Russian', bn: 'Bengali', cs: 'Czech',
  da: 'Danish', nl: 'Dutch', fi: 'Finnish', el: 'Greek', hu: 'Hungarian',
  id: 'Indonesian', ms: 'Malay', no: 'Norwegian', fa: 'Persian', pl: 'Polish',
  ro: 'Romanian', sw: 'Swahili', sv: 'Swedish', tl: 'Tagalog', ta: 'Tamil',
  te: 'Telugu', th: 'Thai', tr: 'Turkish', uk: 'Ukrainian', ur: 'Urdu', vi: 'Vietnamese',
});

export const MODEL_CAPABILITIES_VERSION = 'model-capabilities/1';
export const MODEL_CAPABILITIES = Object.freeze({
  'jev-1.13.0': Object.freeze({
    label: 'Jev 1.13.0',
    languages: Object.freeze({
      // An open claim must never be converted into an exhaustive supported list.
      kind: 'open_multilingual',
      primary: Object.freeze(['en']),
      offered: Object.freeze(Object.keys(LANGUAGE_NAMES)),
      statement: 'English is the primary training language and accuracy is best there. Other languages, including CJK scripts, are handled with uneven accuracy. TypeSafe does not publish an exhaustive language list.',
      source: 'https://docs.typesafe.ai/models#language-support',
      checkedAt: '2026-09-19',
    }),
  }),
});

/** Provider adapters may supply enumerated claims for future targets. Unknowns fail closed. */
export function languageOptionsForModel(model, registry = MODEL_CAPABILITIES) {
  const target = Object.hasOwn(registry, model) ? registry[model] : null;
  if (!target) return null;
  const claim = target.languages;
  const codes = claim.kind === 'enumerated' ? claim.supported : claim.offered;
  if (!Array.isArray(codes) || !['enumerated', 'open_multilingual'].includes(claim.kind)) return null;
  return {
    model, label: target.label, version: MODEL_CAPABILITIES_VERSION,
    kind: claim.kind, statement: claim.statement, source: claim.source, checkedAt: claim.checkedAt,
    options: [...new Set(codes)].map(code => ({
      code, label: LANGUAGE_NAMES[code] ?? code,
      claim: claim.primary?.includes(code) ? 'primary' : claim.kind === 'enumerated' ? 'listed' : 'exploratory',
    })),
  };
}

export function modelLanguageCatalog() {
  return Object.fromEntries(Object.keys(MODEL_CAPABILITIES).map(model => [model, languageOptionsForModel(model)]));
}
