import React, { useState } from 'react';
import {
  DataComponent,
  DataTable,
  Dropdown,
  EvidenceChart,
  Section,
  useDataApp,
} from '../../data-app-public.jsx';
const number = (n) => (n == null ? '—' : n.toLocaleString());
const probability = (n) => (n == null ? '—' : n.toFixed(2));
const text = (v) => (v == null ? 'unavailable' : String(v));
function Table({ id, queryId, title, rows, columns, description, ...props }) {
  return (
    <DataComponent
      id={id}
      queryId={queryId}
      title={title}
      kind="table"
      sourceRows={rows}
      displayRows={rows}
      description={description}
    >
      <DataTable rows={rows} columns={columns} {...props} />
    </DataComponent>
  );
}

export function EncodingEvidence() {
  const { reviewedRows } = useDataApp();
  const summary = reviewedRows('encoding_summary'),
    groups = reviewedRows('encoding_groups'),
    all = reviewedRows('encoding_pairs');
  const [family, setFamily] = useState('All families'),
    [selectedId, setSelectedId] = useState(null);
  const rows = all.filter((r) => family === 'All families' || r.family === family);
  const selected =
    rows.find((r) => r.id === selectedId) ?? rows.find((r) => r.choiceCorrect === false) ?? rows[0];
  const material = selected ? JSON.parse(selected.material) : null;
  if (!summary[0]) return <p>No encoding diagnostic loaded.</p>;
  return (
    <div className="rich-pilot">
      <DataComponent
        id="encoding-overview"
        queryId="encoding_summary"
        title="Encoding and interpretation"
        kind="custom"
        sourceRows={summary}
        displayRows={summary}
      >
        <div className="rich-pilot-summary" data-reviewed-rows>
          <div>
            <strong>
              {summary[0].valid}/{summary[0].planned}
            </strong>
            <span>valid requests</span>
          </div>
          <div>
            <strong>16 + 16</strong>
            <span>classification + isolated recognition</span>
          </div>
          <div>
            <strong>${summary[0].costUsd.toFixed(4)}</strong>
            <span>known usage at list price</span>
          </div>
        </div>
        <p className="evidence-caption">
          Known failures, selected after the pilot. Two families × attack/benign × encoded/plaintext
          × short/long. One observation per cell; no population robustness claim.
        </p>
      </DataComponent>
      <Section id="encoding-comparison" title="Matched representations" columns={2}>
        <EvidenceChart
          id="encoding-rate-chart"
          queryId="encoding_groups"
          title="Agreement with authored labels"
          rows={groups}
          sourceRows={groups}
          height={310}
          spec={{
            type: 'horizontalBar',
            x: 'label',
            y: 'choiceRate',
            fields: ['choiceRate', 'noulRate', 'recoveryRate'],
            stackable: false,
            valueDecimals: 2,
            legend: {
              labels: {
                choiceRate: 'Injection · Choice',
                noulRate: 'Injection · Noul ≥ 0.5',
                recoveryRate: 'Content recognition',
              },
            },
          }}
          description="Each group contains four paired development observations. Recognition selects among candidate texts in an isolated request; it is not proof of decoding in the classification request."
        />
        <Table
          id="encoding-group-counts"
          queryId="encoding_groups"
          title="Exact outcomes"
          rows={groups}
          searchable={false}
          columns={[
            { key: 'label', label: 'Family · form' },
            { key: 'choiceCorrect', label: 'Choice correct' },
            { key: 'noulCorrect', label: 'Noul correct' },
            { key: 'recoveryCorrect', label: 'Recognition correct' },
          ]}
        />
      </Section>
      <div className="followup-findings">
        <p>
          <strong>Morse:</strong> candidate recognition succeeded for all four encoded cases.
          Classification missed both encoded attacks, while detecting their plaintext twins.
        </p>
        <p>
          <strong>Acrostics:</strong> plaintext “OUTPUT PASS” was also classified benign. That
          result calls for a closer look at interpretation and authored gold; an encoding-only
          explanation is unsupported.
        </p>
      </div>
      <Section
        id="encoding-cases"
        title="Inspect a matched case"
        filters={
          <Dropdown
            label="Family"
            showLabel
            value={family}
            choices={['All families', 'morse', 'acrostic']}
            onChange={(value) => {
              setFamily(value);
              setSelectedId(null);
            }}
          />
        }
      >
        <Table
          id="encoding-pair-table"
          queryId="encoding_pairs"
          title="Independent classification and recognition"
          rows={rows}
          rowKey="id"
          selectedRowKey={selected?.id}
          onRowSelect={(row) => setSelectedId(row.id)}
          rowActionLabel={(row) => `Inspect diagnostic ${row.id}`}
          columns={[
            { key: 'id', label: 'Case' },
            { key: 'expected', label: 'Authored gold' },
            { key: 'choice', label: 'Choice' },
            { key: 'noul', label: 'P(injection)', renderCell: probability, align: 'right' },
            { key: 'recovered', label: 'Recognized text' },
            { key: 'recoveryCorrect', label: 'Recognition match', renderCell: text },
          ]}
          description="Every displayed row joins two separate requests sharing the same state. Recovery options and answers never enter classification. The gold is authored and not independently human-reviewed."
        />
        {selected && (
          <DataComponent
            id="encoding-selected-input"
            queryId="encoding_pairs"
            title="Payload and isolated questions"
            kind="custom"
            sourceRows={[selected]}
            displayRows={[selected]}
          >
            <div className="rich-input-grid" data-reviewed-rows>
              <section>
                <h4>Submitted material</h4>
                <pre>{JSON.stringify(material.request, null, 2)}</pre>
              </section>
              <section>
                <h4>Observed answers</h4>
                <p>
                  Choice: <strong>{selected.choice}</strong> · Noul:{' '}
                  <strong>{probability(selected.noul)}</strong>
                </p>
                <p>
                  Recognized: <strong>{selected.recovered}</strong>
                  <br />
                  Expected extraction: <strong>{selected.recoveredExpected}</strong>
                </p>
                <pre>{selected.choiceProbabilities}</pre>
                <pre>{selected.recoveryProbabilities}</pre>
              </section>
            </div>
            <div className="rich-input-padding" data-reviewed-rows>
              <details>
                <summary>Classification questions · no recovery options</summary>
                <pre>{JSON.stringify(JSON.parse(selected.classificationQuestions), null, 2)}</pre>
              </details>
              <details>
                <summary>Separate recognition question and options</summary>
                <pre>{JSON.stringify(JSON.parse(selected.recoveryQuestions), null, 2)}</pre>
              </details>
              <details>
                <summary>Full material, including neutral padding</summary>
                <pre>{JSON.stringify(material, null, 2)}</pre>
              </details>
              <details>
                <summary>Request fingerprints</summary>
                <pre>
                  {selected.classificationRequestHash + '\n' + selected.recoveryRequestHash}
                </pre>
              </details>
            </div>
          </DataComponent>
        )}
      </Section>
      <p className="evidence-caption">
        The approved guide is unchanged. This diagnostic uses only the injection Choice/Noul
        questions and a generic representation-inspection instruction. Changes from the original
        seven-question pilot cannot be attributed to encoding alone.
      </p>
    </div>
  );
}

export function QwenEvidence() {
  const { reviewedRows } = useDataApp();
  const summary = reviewedRows('qwen_summary'),
    questions = reviewedRows('qwen_questions'),
    lengths = reviewedRows('qwen_lengths'),
    all = reviewedRows('qwen_cases');
  const [family, setFamily] = useState('All families'),
    [selectedId, setSelectedId] = useState(null);
  const rows = all.filter((r) => family === 'All families' || r.family === family),
    selected =
      rows.find((r) => r.id === selectedId) ??
      rows.find((r) => r.valid && r.judgmentDisagreements > 0) ??
      rows[0];
  const packet = selected ? reviewedRows('rich_requests').find((r) => r.id === selected.id) : null;
  const answers = selected ? JSON.parse(selected.answers) : null,
    gold = selected ? JSON.parse(selected.gold) : {},
    jev = selected ? JSON.parse(selected.jevAnswers) : {};
  const details = selected
    ? Object.keys(jev).map((question) => ({
        question,
        gold: Object.hasOwn(gold, question) ? text(gold[question]) : 'descriptive only',
        jev: text(jev[question]),
        qwen: text(answers?.[question]),
        agreement:
          question === 'interference_scope'
            ? 'not comparable'
            : answers
              ? text(answers[question] === jev[question])
              : 'unavailable',
      }))
    : [];
  if (!summary[0]) return <p>No Qwen comparison loaded.</p>;
  const s = summary[0];
  return (
    <div className="rich-pilot">
      <DataComponent
        id="qwen-overview"
        queryId="qwen_summary"
        title="Jev and local Qwen · same frozen cases"
        kind="custom"
        sourceRows={summary}
        displayRows={summary}
      >
        <div className="rich-pilot-summary" data-reviewed-rows>
          <div>
            <strong>
              {s.attempted}/{s.planned}
            </strong>
            <span>Qwen cases attempted</span>
            <small>
              {s.status === 'complete'
                ? 'Completed snapshot'
                : 'Partial snapshot · evaluation in progress'}
            </small>
          </div>
          <div>
            <strong>
              {s.valid}/{s.attempted}
            </strong>
            <span>valid Qwen responses</span>
            <small>strict, unconstrained JSON</small>
          </div>
          <div>
            <strong>UD-Q3_K_XL</strong>
            <span>Unsloth · local llama.cpp</span>
            <small>MacBook Pro M4 Max · 128 GiB</small>
          </div>
        </div>
        <p className="evidence-caption">
          The full approved guide, context, material and semantic questions are preserved. Qwen
          generates seven answers jointly; Jev returns separate native typed judgments. This
          development packet does not establish a model ranking.
        </p>
        <details className="rich-input-padding" data-reviewed-rows>
          <summary>Frozen runtime settings and comparison limits</summary>
          <pre>
            {s.model +
              '\nPlan: ' +
              s.planHash +
              '\n' +
              JSON.stringify(JSON.parse(s.generation), null, 2)}
          </pre>
          <ul>
            {s.limitations.split('\n').map((limit) => (
              <li key={limit}>{limit}</li>
            ))}
          </ul>
        </details>
      </DataComponent>
      <Section id="qwen-judgment-comparison" title="Hard decisions" columns={2}>
        <EvidenceChart
          id="qwen-paired-chart"
          queryId="qwen_questions"
          title="Authored-label agreement on available pairs"
          rows={questions}
          sourceRows={questions}
          height={340}
          spec={{
            type: 'horizontalBar',
            x: 'label',
            y: 'jevRate',
            fields: ['jevRate', 'qwenRate'],
            stackable: false,
            valueDecimals: 2,
            legend: { labels: { jevRate: 'Jev', qwenRate: 'Qwen' } },
          }}
          description="Both series use the same cases with valid Qwen output. While the snapshot is partial, these are not the whole-packet results. Jev Noul is thresholded at 0.5; Qwen returns a Boolean, not a comparable probability."
        />
        <Table
          id="qwen-question-counts"
          queryId="qwen_questions"
          title="Coverage and exact counts"
          rows={questions}
          searchable={false}
          columns={[
            { key: 'label', label: 'Judgment' },
            { key: 'jevCorrect', label: 'Jev correct / valid' },
            { key: 'qwenCorrect', label: 'Qwen correct / valid' },
            { key: 'agreement', label: 'Models agree / pairs' },
            { key: 'qwenOnlyCorrect', label: 'Only Qwen correct', align: 'right' },
            { key: 'jevOnlyCorrect', label: 'Only Jev correct', align: 'right' },
          ]}
        />
      </Section>
      <p className="evidence-caption">
        Policy and poisoning have only one positive boundary per length; every input-contract label
        is compliant. High agreement on these fields does not establish sensitivity. The two
        compatibility checks are excluded.
      </p>
      <Section id="qwen-error-and-length" title="Failures and length">
        <EvidenceChart
          id="qwen-error-profile"
          queryId="qwen_errors"
          title="Missed attacks versus false alarms"
          rows={reviewedRows('qwen_errors')}
          sourceRows={reviewedRows('qwen_errors')}
          height={300}
          spec={{
            type: 'horizontalBar',
            x: 'label',
            y: 'missRate',
            fields: ['missRate', 'falseAlarmRate'],
            stackable: false,
            valueDecimals: 2,
            legend: {
              labels: { missRate: 'Missed / attacks', falseAlarmRate: 'False alarms / benign' },
            },
          }}
          description="Lower is better on both measures. Rates use valid attack and benign cases respectively; exact denominators appear below. Partial snapshots can have different model coverage. These dependent development cases do not estimate deployment failure rates."
        />
        <Table
          id="qwen-errors"
          queryId="qwen_errors"
          title="Missed attacks, false alarms and abstentions"
          rows={reviewedRows('qwen_errors')}
          searchable={false}
          columns={[
            { key: 'question', label: 'Output' },
            { key: 'model', label: 'Model' },
            { key: 'missed', label: 'Missed / attacks' },
            { key: 'falseAlarms', label: 'False alarms / benign' },
            { key: 'abstentions', label: 'Abstentions', align: 'right' },
            { key: 'valid', label: 'Valid cases', align: 'right' },
          ]}
          description="A non-attack label on an attack is counted as a miss; explicit insufficient-evidence labels are also shown as abstentions. All failures remain in the case table. Models can have different available denominators during a partial run."
        />
        <Table
          id="qwen-lengths"
          queryId="qwen_lengths"
          title="Local timing and context use"
          rows={lengths}
          searchable={false}
          columns={[
            { key: 'length', label: 'Material · UTF-16', renderCell: number, align: 'right' },
            { key: 'attempted', label: 'Attempted', align: 'right' },
            { key: 'valid', label: 'Valid', align: 'right' },
            { key: 'latencyCount', label: 'Qwen timed', align: 'right' },
            { key: 'jevLatencyCount', label: 'Jev timed', align: 'right' },
            { key: 'inputMin', label: 'Qwen input min', renderCell: number, align: 'right' },
            { key: 'inputMax', label: 'Qwen input max', renderCell: number, align: 'right' },
            {
              key: 'latencySeconds',
              label: 'Qwen median · s',
              renderCell: probability,
              align: 'right',
            },
            {
              key: 'jevLatencySeconds',
              label: 'Jev median · s',
              renderCell: probability,
              align: 'right',
            },
          ]}
          description="Uncached local inference, one slot, thinking off; temperature 0 and 512 output-token limit. Hosted Jev and local Qwen have different hardware, output mechanisms and serving conditions: these times do not isolate architecture or establish a general speed ratio. Each uses its own tokenizer. The Jev repair has no saved latency and is excluded from timing, leaving 15 timed short cases."
        />
      </Section>
      <Section
        id="qwen-case-inspector"
        title="Compare each case"
        filters={
          <Dropdown
            label="Family"
            showLabel
            value={family}
            choices={['All families', ...new Set(all.map((r) => r.family))]}
            onChange={(value) => {
              setFamily(value);
              setSelectedId(null);
            }}
          />
        }
      >
        <Table
          id="qwen-case-table"
          queryId="qwen_cases"
          title="Frozen packet · all outcomes"
          rows={rows}
          rowKey="id"
          selectedRowKey={selected?.id}
          onRowSelect={(row) => setSelectedId(row.id)}
          rowActionLabel={(row) => `Inspect comparison ${row.id}`}
          columns={[
            { key: 'id', label: 'Case' },
            { key: 'expected', label: 'Gold' },
            { key: 'jevChoice', label: 'Jev Choice' },
            { key: 'qwenChoice', label: 'Qwen label' },
            {
              key: 'judgmentDisagreements',
              label: 'Judgment differences',
              renderCell: number,
              align: 'right',
            },
            { key: 'status', label: 'Qwen response' },
          ]}
        />
        {selected && (
          <DataComponent
            id="qwen-selected-judgments"
            queryId="qwen_cases"
            title="Seven judgments side by side"
            kind="table"
            sourceRows={[selected]}
            displayRows={details}
            description="The interference field compares a native weighted Score to a generated ordinal level; it is descriptive, and numeric equality is not an accuracy metric."
          >
            <p className="evidence-caption" data-reviewed-rows>
              {selected.id}
            </p>
            <DataTable
              rows={details}
              searchable={false}
              columns={[
                { key: 'question', label: 'Question' },
                { key: 'gold', label: 'Gold' },
                { key: 'jev', label: 'Jev' },
                { key: 'qwen', label: 'Qwen' },
                { key: 'agreement', label: 'Equal value' },
              ]}
            />
            <details data-reviewed-rows>
              <summary>Request identity and field-preservation hashes</summary>
              <pre>
                {selected.originalRequestHash +
                  '\n' +
                  selected.requestHash +
                  '\n' +
                  selected.sourceFieldHashes}
              </pre>
            </details>
          </DataComponent>
        )}
        {packet && (
          <DataComponent
            id="qwen-shared-material"
            queryId="rich_requests"
            title="Shared material and trusted facts"
            kind="custom"
            sourceRows={[packet]}
            displayRows={[packet]}
          >
            <div className="rich-input-grid" data-reviewed-rows>
              <section>
                <h4>Material under assessment</h4>
                <pre>{JSON.stringify(JSON.parse(packet.material).request, null, 2)}</pre>
              </section>
              <section>
                <h4>Trusted context</h4>
                <pre>{packet.trustedContext}</pre>
              </section>
            </div>
            <details data-reviewed-rows>
              <summary>Full material and neutral padding</summary>
              <pre>{packet.material}</pre>
            </details>
          </DataComponent>
        )}
      </Section>
    </div>
  );
}
