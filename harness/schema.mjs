export const LABELS = ['attack', 'benign', 'abstain'];
export const REASONS = ['untrusted_instruction', 'context_poisoning', 'restricted_content', 'sensitive_identifier'];
export const structuredSchema = {
  type: 'object', additionalProperties: false,
  required: ['label','attack_probability','poison_probability','uncertainty','decision','violations','judge_verdict'],
  properties: {
    label: { type:'string', enum:LABELS },
    attack_probability: { type:'number', minimum:0, maximum:1 },
    poison_probability: { type:'number', minimum:0, maximum:1 },
    uncertainty: { type:'number', minimum:0, maximum:1 },
    decision: { type:'string', enum:['allow','allow_with_audit','block','review'] },
    audit_required: { type:['boolean','null'] },
    violations: { type:'array', items: { type:'object', additionalProperties:false, required:['policy_id','reason'], properties:{ policy_id:{ type:'string', enum:['P001','P002','P003','P004'] }, reason:{ type:'string', enum:REASONS } } } },
    judge_verdict: { anyOf:[{ type:'string', enum:['pass','fail','abstain'] },{ type:'null' }] }
  }
};
export const scoresSchema = { type:'object', additionalProperties:false, required:['label','attack_probability','poison_probability','uncertainty'], properties:Object.fromEntries(Object.entries(structuredSchema.properties).filter(([key]) => ['label','attack_probability','poison_probability','uncertainty'].includes(key))) };
// Exact schema checks occur AFTER inference. They never repair, filter, or classify an input.
export function parseOutput(raw, mode) {
  if (typeof raw !== 'string') return { valid:false, error:'non_string_output' };
  if (mode === 'binary') return LABELS.includes(raw.trim()) ? { valid:true, value:{ label:raw.trim() } } : { valid:false, error:'invalid_label' };
  let value;
  try { value = JSON.parse(raw); } catch { return { valid:false, error:'invalid_json' }; }
  if (!value || Array.isArray(value) || typeof value !== 'object') return { valid:false, error:'invalid_object' };
  const schema = mode === 'structured' ? structuredSchema : scoresSchema;
  if (Object.keys(value).some(k => !Object.hasOwn(schema.properties,k)) || schema.required.some(k => !Object.hasOwn(value,k))) return { valid:false, error:'schema_keys' };
  if (!LABELS.includes(value.label)) return { valid:false, error:'invalid_label' };
  for (const k of ['attack_probability','poison_probability','uncertainty']) if (!Number.isFinite(value[k]) || value[k] < 0 || value[k] > 1) return { valid:false, error:'invalid_probability' };
  if (mode === 'structured') {
    if (!['allow','allow_with_audit','block','review'].includes(value.decision) || ![null,'pass','fail','abstain'].includes(value.judge_verdict) || !Array.isArray(value.violations) || (Object.hasOwn(value,'audit_required') && value.audit_required!==null && typeof value.audit_required!=='boolean')) return { valid:false, error:'invalid_structured_field' };
    const ids = [];
    for (const violation of value.violations) {
      if (!violation || Object.keys(violation).sort().join(',') !== 'policy_id,reason' || !['P001','P002','P003','P004'].includes(violation.policy_id) || !REASONS.includes(violation.reason)) return { valid:false, error:'invalid_violation' };
      if (ids.includes(violation.policy_id)) return { valid:false, error:'duplicate_policy_id' };
      ids.push(violation.policy_id);
    }
  }
  return { valid:true, value };
}
