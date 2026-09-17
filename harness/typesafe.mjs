/** Compatibility facade; the domain functions take their configuration explicitly. */
import { profiles, trustedContext } from './corpus.mjs';
import { buildNativeRequest } from './domain/native-questions.mjs';
import { normalizeNativeAnswers } from './domain/native-answers.mjs';
import { unwrap } from './domain/result.mjs';

export {
  nativeArm,
  NATIVE_REQUEST_VERSIONS,
  DEFAULT_NATIVE_REQUEST_VERSION,
} from './domain/native-questions.mjs';

export function buildTypeSafeRequest(caseItem, model = 'jev-latest', options = {}) {
  return unwrap(
    buildNativeRequest({
      caseItem,
      model,
      version: options.version,
      profiles: options.profiles || profiles,
      trustedContext: options.trustedContext || trustedContext,
    }),
  );
}

export function normalizeTypeSafeResponse(data, caseItem, request, options = {}) {
  return unwrap(
    normalizeNativeAnswers({
      data,
      caseItem,
      request,
      profiles: options.profiles || profiles,
    }),
  );
}
