import { callJev } from './provider.mjs';
const key = 'synthetic-runtime-test-key';
const check = (condition, message) => {
  if (!condition) throw Error(message);
};
export default {
  async test() {
    // Reproduce the original production failure without contacting any provider.
    let rejected = false;
    try {
      new Request('https://api.typesafe.ai/v1/systemone', { redirect: 'error' });
    } catch (error) {
      rejected = error.message.includes('Invalid redirect value');
    }
    check(rejected, 'Runtime must expose the original incompatible redirect option');
    const success = await callJev({ scenario: 'success' }, key);
    check(success.response.status === 'ok', 'Real Worker fetch failed: ' + success.response.error);
    check(success.reportedProviderModel === 'jev-1.13.0', 'Model identity lost');
    check(success.response.usage.inputTokens === 17, 'Usage lost');
    for (const [scenario, code] of [
      ['redirect', 'redirect_blocked'],
      ['json', 'invalid_provider_json'],
      ['echo', 'credential_echo_rejected'],
      ['http', 'http_429'],
    ]) {
      const result = await callJev({ scenario }, key);
      check(result.response.error === code, scenario + ': ' + result.response.error);
      check(result.response.usage === null, 'Failed transport fabricated billable usage');
      check(!JSON.stringify(result).includes(key), 'Credential reached evidence');
    }
  },
};
