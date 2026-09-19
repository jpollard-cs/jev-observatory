import React, { useState } from 'react';
import { DataComponent, DataTable, Dropdown, EvidenceChart, Section, useDataApp } from '../../data-app-public.jsx';

const count = (n) => n == null ? '—' : n.toLocaleString();
const probability = (n) => n == null ? '—' : n.toFixed(2);
const text = (value) => value == null ? 'unavailable' : String(value);

function Table({ id, queryId, title, rows, columns, description, ...props }) {
  return <DataComponent id={id} queryId={queryId} title={title} kind="table"
    sourceRows={rows} displayRows={rows} description={description}>
    <DataTable rows={rows} columns={columns} {...props} />
  </DataComponent>;
}

export function RichPilotEvidence() {
  const { reviewedRows } = useDataApp();
  const repair = reviewedRows('rich_repair');
  const [view, setView] = useState('Completed cases');
  const completed = view === 'Completed cases' && repair.length > 0;
  const queryId = (name) => `rich_${completed ? 'completed_' : ''}${name}`;
  const summary = reviewedRows(queryId('summary'));
  const [family, setFamily] = useState('All families');
  const [selection, setSelection] = useState(null);
  const allCases = reviewedRows(queryId('cases'));
  const cases = allCases.filter((row) => family === 'All families' || row.family === family);
  const selected = cases.find((row) => row.id === selection) ?? cases.find((row) => row.errorOrMismatch) ?? cases[0];
  const siblings = selected ? cases.filter((row) => row.fixture === selected.fixture).sort((a,b) => a.length - b.length) : [];
  const errors = reviewedRows(queryId('detection_errors'));
  const packet = reviewedRows('rich_requests').find((row) => row.id === selected?.id);
  const material = packet ? JSON.parse(packet.material) : null;
  const details = selected ? Object.entries(JSON.parse(selected.questions)).map(([question, value]) => ({
    question, expected: value.scored ? text(value.expected) : 'descriptive only',
    observed: text(value.prediction), probability: value.type === 'noul' ? probability(value.value) : '—',
    distribution: value.probabilities ? JSON.stringify(value.probabilities) : '—',
    result: !value.valid ? value.status : !value.scored ? 'unscored' : value.correct ? 'match' : 'mismatch',
  })) : [];
  const s = summary[0];
  if (!s) return <p>No rich-template observations loaded.</p>;

  return <div className="rich-pilot">
    {repair.length > 0 && <DataComponent id="rich-pilot-repair-status" queryId="rich_repair" title="Transport repair completed"
      kind="custom" sourceRows={repair} displayRows={repair}>
      <p data-reviewed-rows><strong>{repair[0].availableCases}/{repair[0].caseCount} cases now have valid responses</strong>, across {repair[0].totalAttempts} recorded attempts. No cases remain unresolved. One original request failed before a response because of a sandbox DNS error; its successful replacement used the same input and model.</p>
      <p className="evidence-caption">Completed cases include that replacement. Choose Original attempts to inspect the unchanged first run, including its one failed request and seven missing answers. All-attempt accounting below still includes all 49 requests.</p>
    </DataComponent>}
    <Section id="rich-pilot-overview" title="Rich-template pilot" spacing="content" filters={repair.length > 0 &&
      <Dropdown label="Results view" showLabel value={view} choices={['Completed cases', 'Original attempts']}
        onChange={(value) => { setView(value); setSelection(null); }} />
    }>
      <DataComponent id="rich-pilot-summary" queryId={queryId('summary')} title={completed ? "Completed cases · after transport repair" : "Original attempts · before transport repair"}
        kind="custom" sourceRows={summary} displayRows={summary}
        description="Versioned separately from historical generic-prompt results. Full approved guide supplied once per request. No few-shot demonstration set, external decoder, detector, or verdict repair.">
        <div data-reviewed-rows className="rich-pilot-summary">
          <div><strong>{s.valid}/{s.attempted}</strong><span>{completed ? "cases with valid responses" : "valid responses"}</span><small>{completed ? "0 unresolved · 49 total attempts" : `${s.transportErrors} original transport failure retained`}</small></div>
          <div><strong>{count(s.minInputTokens)}–{count(s.maxInputTokens)}</strong><span>provider input tokens</span><small>guide + state + questions</small></div>
          <div><strong>${s.knownCostUsd.toFixed(4)}</strong><span>known usage at list price</span><small>{s.unknownUsage} original attempt with unknown usage{completed ? " · repair included" : ""}</small></div>
        </div>
        <p className="evidence-caption" data-reviewed-rows>{s.model} · {s.scenarios} authored scenarios in {s.lineages} paired lineages · three repeated material lengths. Development evidence; no population robustness or model ranking established.</p>
      </DataComponent>
    </Section>
    <Section id="rich-pilot-errors" title="Missed attacks and false alarms" columns={2} spacing="after-metrics">
      <EvidenceChart id="rich-pilot-error-rates" queryId={queryId('detection_errors')} title="Detection errors among valid answers"
        rows={errors} sourceRows={errors} height={260}
        spec={{ type: 'horizontalBar', x: 'label', y: 'missRate', fields: ['missRate', 'falseAlarmRate'],
          stackable: false, valueDecimals: 3,
          legend: { labels: { missRate: 'Attack miss rate', falseAlarmRate: 'Benign false-alarm rate' } } }}
        description={completed ? "Completed-case view: misses / 24 attack cases; false alarms / 24 benign cases. Only the failed request uses its verified replacement. Native outputs are separate; no composite verdict." : "Original attempts: misses / valid attack cases; false alarms / valid benign cases. The missing benign answer is excluded here and retained in all-attempt metrics. Native outputs are separate; no composite verdict."} />
      <Table id="rich-pilot-confusion" queryId={queryId('detection_errors')} title="Exact error counts" rows={errors}
        searchable={false} columns={[
          { key: 'label', label: 'Output' }, { key: 'missed', label: 'Missed / attacks' },
          { key: 'falseAlarms', label: 'False alarms / benign' }, { key: 'unavailable', label: completed ? 'Unresolved' : 'Originally unavailable', align: 'right' },
        ]} description="Choice misses Morse and acrostic attacks at every length. Noul misses all Morse attacks and the short acrostic attack; it flags the medium and long benign acrostics. Repeated variants are dependent observations." />
    </Section>
    <p className="evidence-caption">Choice misses the Morse and acrostic attacks at all three lengths. The Noul answer recovers the longer acrostic attacks, but also flags the longer benign acrostics. These outputs are preserved separately.</p>
    <Section id="rich-pilot-scaling" title="Length and output coverage">
      <Table id="rich-pilot-length-table" queryId={queryId('lengths')} title="Same scenarios, longer material"
        rows={reviewedRows(queryId('lengths'))} searchable={false} columns={[
          { key: 'length', label: 'Material · UTF-16 units', align: 'right', renderCell: count },
          { key: 'inputRange', label: 'Full input · tokens' }, { key: 'valid', label: completed ? 'Valid / cases' : 'Valid / attempted' },
          { key: 'choice', label: 'Choice correct / valid' }, { key: 'noul', label: 'Noul correct / valid' },
          { key: 'medianLatencyMs', label: 'Median response · ms', align: 'right', renderCell: (n) => n == null ? '—' : n.toFixed(1) },
          { key: 'latencyCount', label: 'Timed responses', align: 'right' },
        ]} description={completed ? "Lengths are UTF-16 units of serialized material, excluding the guide and questions. Provider tokens include them. Each length has 16 completed cases. Latency includes only recorded successful-response timings; timing coverage is shown separately. The repair report does not include replacement latency." : "Original attempts: lengths are UTF-16 units of material; provider tokens include guide and questions. Latency includes only the 15 / 16 / 16 successful responses. Short-length availability differs because of the original transport failure."} />
      <Table id="rich-pilot-question-table" queryId={queryId('questions')} title={completed ? "Each scored output · completed cases" : "Each scored output · original attempts"}
        rows={reviewedRows(queryId('questions'))} searchable={false} columns={[
          { key: 'label', label: 'Judgment' }, { key: 'correctAmongValid', label: 'Correct / valid' },
          { key: 'correctAllAttempts', label: completed ? 'Correct / cases' : 'Correct / original attempts' }, { key: 'unavailable', label: completed ? 'Unresolved' : 'Originally unavailable', align: 'right' },
        ]} description="An unavailable response is not counted as a correct prediction. Score interference is descriptive and excluded from accuracy. Gold is imbalanced: 15 allow and one block per length, one poisoned scenario per length, and all input-contract cases compliant." />
    </Section>
    <p className="evidence-caption">Policy, poisoning and input-contract results have narrow coverage: only one block and one poisoned scenario per length, and no contract-violation case. Perfect agreement here does not establish general sensitivity.</p>
    {repair.length > 0 && <Section id="rich-repair-results" title="Supplemental repair · separate accounting">
      <Table id="rich-repair-table" queryId="rich_repair_questions" title="Recovered case and updated denominators"
        rows={reviewedRows('rich_repair_questions')} searchable={false} columns={[
          {key:'id',label:'Judgment'}, {key:'expected',label:'Repaired-case gold'}, {key:'observed',label:'Replacement answer'},
          {key:'result',label:'Result'}, {key:'original',label:'Correct / original attempts'},
          {key:'allAttempts',label:'Correct / all 49 attempts'}, {key:'completedCases',label:'Correct / 48 completed cases'},
        ]} description="Recovered rich-direct-quotation:benign-length-1024. All 49 attempts include the original failure. Completed-case figures select the replacement only for that failed case; original valid responses are unchanged. Full native replacement answers remain in source inspection." />
    </Section>}
    <Section id="rich-pilot-case-section" title="Inspect a case across lengths" filters={
      <Dropdown label="Family" showLabel value={family} choices={['All families', ...new Set(allCases.map((row) => row.family))]}
        onChange={(value) => { setFamily(value); setSelection(null); }} />
    }>
      <Table id="rich-pilot-case-table" queryId={queryId('cases')} title={completed ? "Completed cases and native answers" : "Original attempts and native answers"} rows={cases}
        selectedRowKey={selected?.id} rowKey="id" onRowSelect={(row) => setSelection(row.id)} rowActionLabel={(row) => `Inspect ${row.id}`}
        columns={[
          { key: 'fixture', label: 'Case' }, { key: 'length', label: 'Length', align: 'right', renderCell: count },
          { key: 'expected', label: 'Gold' }, { key: 'choice', label: 'Choice' },
          { key: 'noulProbability', label: 'Noul P(injection)', align: 'right', renderCell: probability },
          { key: 'status', label: 'Request', renderCell: (value, row) => row?.repaired ? 'Recovered · attempt 2' : value },
          ...(!completed ? [{ key: 'requestFailure', label: 'Original failure' }] : []),
        ]} description="Select a row for all seven native judgments and the same scenario at each length. The fixed Noul threshold is 0.5. Gold is authored, not inferred from observed model output." />
      {selected && <>
        {packet && <DataComponent id="rich-pilot-submitted-input" queryId="rich_requests" title="What Jev actually received"
          kind="custom" sourceRows={[packet]} displayRows={[packet]}
          description="These input values reconstruct the recorded request hash together with the shared guide, policy and questions in Policy & trust. Gold labels and model answers were never sent to Jev.">
          <div className="rich-input-meta" data-reviewed-rows><span>{selected.fixture}</span><span>{count(packet.requestBytes)} request bytes</span><span>{count(selected.inputTokens)} provider input tokens</span></div>
          <div className="rich-input-grid" data-reviewed-rows>
            <section><h4>Trusted context</h4><p className="evidence-caption">Application-supplied facts, task and permissions</p><pre>{packet.trustedContext}</pre></section>
            <section><h4>Material under assessment</h4><p className="evidence-caption">Exact submitted request content; treated as data</p><pre>{JSON.stringify(material.request, null, 2)}</pre></section>
          </div>
          <div className="rich-input-padding" data-reviewed-rows>
            <details><summary>Preceding context · {count(material.contextBefore.length)} UTF-16 units</summary><pre>{material.contextBefore}</pre></details>
            <details><summary>Following context · {count(material.contextAfter.length)} UTF-16 units</summary><pre>{material.contextAfter}</pre></details>
            <details><summary>Submitted request fingerprint</summary><pre>{packet.requestHash}</pre></details>
          </div>
          <p className="evidence-caption">The same approved recognition guide, shared policy configuration and seven native questions accompanied this input. Their exact text is in Policy &amp; trust.</p>
        </DataComponent>}
        <Table id="rich-pilot-selected-lengths" queryId={queryId('cases')} title="Selected scenario at every length"
          rows={siblings} searchable={false} columns={[
            { key: 'fixture', label: 'Case' }, { key: 'length', label: 'Length', align: 'right', renderCell: count },
            { key: 'choice', label: 'Choice' }, { key: 'noulProbability', label: 'Noul P(injection)', align: 'right', renderCell: probability },
            { key: 'integrity', label: 'Integrity' }, { key: 'policy', label: 'Policy' },
          ]} description="Paired length variants of one authored scenario, not independent trials." />
        <DataComponent id="rich-pilot-native-detail" queryId={queryId('cases')} title="Selected request · seven native judgments"
          kind="table" sourceRows={[selected]} displayRows={details}
          description="Choice concentration confidence is not correctness probability. Native distributions remain unnormalized. Policy allow can coexist with injection present when the authorized task is to inspect that injection.">
          <p className="evidence-caption" data-reviewed-rows>{selected.id}{selected.repaired ? " · recovered on attempt 2; original DNS failure retained in Original attempts" : ""}</p>
          <DataTable rows={details} searchable={false} columns={[
            { key: 'question', label: 'Question' }, { key: 'expected', label: 'Gold' },
            { key: 'observed', label: 'Observed' }, { key: 'probability', label: 'Noul probability', align: 'right' },
            { key: 'result', label: 'Result' }, { key: 'distribution', label: 'Native probability distribution' },
          ]} />
        </DataComponent>
      </>}
    </Section>
  </div>;
}
