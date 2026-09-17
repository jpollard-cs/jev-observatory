import { err, ok } from '../domain/result.mjs';
import {
  DEFAULT_NATIVE_REQUEST_VERSION,
  NATIVE_REQUEST_VERSIONS,
} from '../domain/native-questions.mjs';

export function resolveEndpoint(name, environment) {
  const prefix = typeof name === 'string' ? name.toUpperCase() : '';
  if (!['JEV', 'LUNA', 'TERRA'].includes(prefix)) return err('unsupported_model_alias');
  const value = (suffix) => environment[`${prefix}_${suffix}`];
  const native = prefix === 'JEV';
  const base = native ? value('BASE_URL') || 'https://api.typesafe.ai/v1/' : value('BASE_URL');
  const model = native ? value('MODEL') || 'jev-latest' : value('MODEL');
  const apiKey = native ? environment.TYPESAFE_API_KEY || value('API_KEY') : value('API_KEY');
  if (!base || !model || !apiKey)
    return err('missing_endpoint_configuration', { context: { alias: name } });

  let url;
  try {
    url = new URL(base.endsWith('/') ? base : `${base}/`);
  } catch {
    return err('invalid_endpoint_url');
  }
  const localHttp =
    url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !localHttp) return err('insecure_endpoint_protocol');
  if (url.username || url.password || url.search || url.hash)
    return err('endpoint_contains_embedded_metadata');

  const tokenLimitField = value('TOKEN_LIMIT_FIELD') || 'max_tokens';
  if (!['max_tokens', 'max_completion_tokens'].includes(tokenLimitField))
    return err('unsupported_token_limit_field');
  const prices = {};
  for (const direction of ['INPUT', 'OUTPUT']) {
    const raw = value(`${direction}_USD_PER_MILLION`);
    if (raw === undefined || raw === '' || !Number.isFinite(Number(raw)) || Number(raw) < 0) {
      return err('missing_or_invalid_price', {
        context: { field: `${prefix}_${direction}_USD_PER_MILLION` },
      });
    }
    prices[direction] = Number(raw);
  }
  const nativeRequestVersion = native
    ? value('REQUEST_VERSION') || DEFAULT_NATIVE_REQUEST_VERSION
    : null;
  if (native && !NATIVE_REQUEST_VERSIONS.includes(nativeRequestVersion))
    return err('unsupported_native_request_version');

  return ok({
    alias: name,
    transport: native ? 'typesafe_systemone' : 'openai_chat',
    url: new URL(native ? 'systemone' : 'chat/completions', url).href,
    model,
    apiKey,
    inputPrice: prices.INPUT,
    outputPrice: prices.OUTPUT,
    tokenLimitField,
    constrainedOutput: native || value('JSON_SCHEMA') === 'true',
    nativeRequestVersion,
  });
}
