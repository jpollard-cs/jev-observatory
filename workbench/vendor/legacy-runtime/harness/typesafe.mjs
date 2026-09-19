/** Compatibility facade; the domain functions take their configuration explicitly. */
import { profiles, prospectiveProfiles, trustedContext } from './corpus.mjs';
import {
  buildNativeRequest,
  DEFAULT_NATIVE_REQUEST_VERSION,
  requestVersionOf,
} from './domain/native-questions.mjs';
import { normalizeNativeAnswers } from './domain/native-answers.mjs';
import { unwrap } from './domain/result.mjs';

export {
  nativeArm,
  NATIVE_REQUEST_VERSIONS,
  DEFAULT_NATIVE_REQUEST_VERSION,
} from './domain/native-questions.mjs';

export function buildTypeSafeRequest(caseItem, model = 'jev-latest', options = {}) {
  const version = options.version ?? DEFAULT_NATIVE_REQUEST_VERSION;
  return unwrap(
    buildNativeRequest({
      caseItem,
      model,
      version,
      profiles: Object.hasOwn(options, 'profiles')
        ? options.profiles
        : version === 'policy-v4'
          ? prospectiveProfiles
          : profiles,
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
      profiles: Object.hasOwn(options, 'profiles')
        ? options.profiles
        : requestVersionOf(request) === 'policy-v4'
          ? prospectiveProfiles
          : profiles,
    }),
  );
}
