// Failed advice is inspectable evidence, never an input to policy selection.
export function canReviewAdvice(report) {
  return (
    report?.protocol === 'catalog-advisor-report/1' &&
    ['complete', 'partial'].includes(report.status) &&
    Array.isArray(report.rows) &&
    report.rows.some((row) => row?.valid === true)
  );
}
export function failureDescription(code) {
  const descriptions = {
    transport_or_invalid_response:
      'This older run did not record a specific transport failure. No usable provider answer was saved.',
    request_setup_failed: 'The request could not be prepared by the server.',
    transport_error: 'The connection failed before a response was available.',
    timeout: 'The provider request timed out. It may still have been billed.',
    redirect_blocked: 'The provider returned a redirect. It was blocked to protect your key.',
    invalid_provider_json: 'The response was not valid JSON.',
    invalid_provider_shape: 'The response did not contain a JSON object.',
    empty_provider_response: 'The provider returned an empty response.',
    response_read_failed: 'The response could not be read completely.',
    provider_response_too_large: 'The response exceeded the safe size limit.',
    credential_echo_rejected: 'A response containing the API key was rejected and not saved.',
  };
  return (
    descriptions[code] ??
    'The request did not produce a usable result. Inspect the recorded evidence below.'
  );
}
