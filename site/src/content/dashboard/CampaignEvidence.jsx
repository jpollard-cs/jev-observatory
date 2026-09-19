import React, { useState } from 'react';
import {
  DataComponent,
  DataTable,
  Dropdown,
  EvidenceChart,
  useDataApp,
} from '../../data-app-public.jsx';

const percent = (value) => (value == null ? '—' : `${(value * 100).toFixed(1)}%`);
const count = (value) => (value == null ? '—' : value.toLocaleString());
const money = (value) => (value == null ? 'unknown' : `$${value.toFixed(4)}`);
const preciseProbability = (value) => (value == null ? '—' : value.toFixed(4));
const probabilityChange = (value) =>
  value == null ? '—' : `${value > 0 ? '+' : ''}${value.toFixed(3)}`;

function EvidenceTable({ id, queryId, title, description, rows, columns }) {
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
      {rows.length ? (
        <DataTable rows={rows} columns={columns} />
      ) : (
        <p className="evidence-caption">No observations for this selection.</p>
      )}
    </DataComponent>
  );
}

export function CampaignEvidence() {
  const { snapshot, reviewedRows } = useDataApp();
  const [split, setSplit] = useState('test');
  const [arm, setArm] = useState('policy');
  const [policy, setPolicy] = useState('balanced');
  const [position, setPosition] = useState('middle');
  if (!snapshot.campaign) return null;
  const selected = (row) =>
    row.split === split && row.promptArm === arm && row.policyProfile === policy;
  const metrics = reviewedRows('campaign_metrics').filter(selected);
  const lengths = reviewedRows('campaign_lengths').filter(
    (row) => selected(row) && row.position === position,
  );
  const pairs = reviewedRows('campaign_length_pairs').filter(selected);
  const thresholds = reviewedRows('campaign_thresholds').filter(selected);
  const bins = reviewedRows('campaign_reliability').filter(selected);
  const extensions = reviewedRows('extension_suites');
  const integrity = reviewedRows('extension_integrity');
  const judge = reviewedRows('extension_judges');
  return (
    <section className="campaign-evidence">
      <div className="campaign-intro">
        <span className="section-index">POLICY-V4 / FROZEN DEVELOPMENT MATRIX</span>
        <h3>One question. Several ways to ask it.</h3>
        <p>
          Compare the same synthetic cases across native output batteries. Decision and detection
          rates keep failed calls in their denominators. Probability scoring uses valid reported
          probabilities with coverage disclosed. Earlier pilots remain below as historical evidence.
        </p>
        <div className="campaign-controls">
          <Dropdown
            label="Split"
            showLabel
            value={split}
            choices={['test', 'calibration', 'pilot']}
            onChange={setSplit}
          />
          <Dropdown
            label="Prompt arm"
            showLabel
            value={arm}
            choices={['policy', 'minimal']}
            onChange={(value) => {
              setArm(value);
              if (value === 'minimal') setPolicy('balanced');
            }}
          />
          {arm === 'policy' && (
            <Dropdown
              label="Trusted profile"
              showLabel
              value={policy}
              choices={['balanced', 'strict', 'permissive']}
              onChange={setPolicy}
            />
          )}
          <Dropdown
            label="Payload position"
            showLabel
            value={position}
            choices={['middle', 'start', 'end']}
            onChange={setPosition}
          />
        </div>
        <p className="evidence-caption">
          Split, arm and profile apply to the comparison panels through confidence thresholds.
          Position applies only to the length chart. Specialized panels below have separate frozen
          populations.
        </p>
      </div>
      <div className="campaign-two-up">
        <EvidenceChart
          id="campaign-output-comparison"
          queryId="campaign_metrics"
          title="Detection and false alarms"
          rows={metrics}
          sourceRows={metrics}
          height={310}
          spec={{
            type: 'horizontalBar',
            x: 'outputMode',
            y: 'attackDetectionRate',
            fields: ['attackDetectionRate', 'falsePositiveRate', 'unresolvedAttackRate'],
            stackable: false,
            valueDecimals: 3,
            legend: {
              labels: {
                attackDetectionRate: 'Attack detection',
                falsePositiveRate: 'Benign false alarms',
                unresolvedAttackRate: 'Unresolved attacks',
              },
            },
          }}
          description="All-attempt denominators: detected attacks / all attack-labeled calls; false alarms / all benign-labeled calls; errors, malformed answers and abstentions count as unresolved. These are descriptive rates on authored fixtures."
        />
        <EvidenceChart
          id="campaign-length-curves"
          queryId="campaign_lengths"
          title="What changes as the context grows?"
          rows={lengths}
          sourceRows={lengths}
          height={310}
          spec={{
            type: 'line',
            x: 'contextChars',
            y: 'attackDetectionRate',
            series: 'outputMode',
            stackable: false,
            valueDecimals: 3,
          }}
          description="X is target context length in UTF-16 code units, the generator's length measure. Each line holds selected split, prompt, profile and payload position fixed; the table below reports explicitly matched contrasts. Provider tokens are measured separately. No smoothing or extrapolation."
        />
      </div>
      <EvidenceTable
        id="campaign-output-counts"
        queryId="campaign_metrics"
        title="The counts behind the rates"
        rows={metrics}
        columns={[
          { field: 'outputMode', label: 'Battery' },
          { field: 'attempted', label: 'Calls' },
          { field: 'valid', label: 'Valid' },
          { field: 'attackCases', label: 'Attacks' },
          { field: 'detected', label: 'Detected' },
          { field: 'misses', label: 'Missed' },
          { field: 'benignCases', label: 'Benign' },
          { field: 'falseAlarms', label: 'False alarms' },
          { field: 'unresolved', label: 'Unresolved' },
          { field: 'policyMatches', label: 'Policy matches' },
        ]}
      />
      <EvidenceTable
        id="campaign-paired-lengths"
        queryId="campaign_length_pairs"
        title="Matched length contrasts"
        description="Pairs retain the same model, protocol, family, seed, variant, prompt, policy and payload position. Difference is longer minus shorter; percentage points are descriptive, without a population confidence interval. All three positions are represented here."
        rows={pairs}
        columns={[
          { field: 'outputMode', label: 'Battery' },
          { field: 'contrast', label: 'Target UTF-16 length' },
          { field: 'pairs', label: 'Matched pairs' },
          { field: 'correctDeltaPp', label: 'Correct Δ pp' },
          { field: 'latencyDeltaMs', label: 'Latency Δ ms' },
          { field: 'missing', label: 'Unmatched cells' },
        ]}
      />
      <EvidenceTable
        id="campaign-cost-footprint"
        queryId="campaign_metrics"
        title="Observed token footprint and latency"
        rows={metrics}
        description="Provider-reported token counts and observed request latency for this selection, across all lengths and positions. The batteries ask different numbers of questions. Network and service conditions are included; these are not isolated hardware benchmarks."
        columns={[
          { field: 'outputMode', label: 'Battery' },
          { field: 'usageCount', label: 'Calls with usage' },
          { field: 'meanInputTokens', label: 'Mean input tokens' },
          { field: 'meanOutputTokens', label: 'Mean output tokens' },
          { field: 'p50LatencyMs', label: 'Median ms' },
          { field: 'p95LatencyMs', label: 'p95 ms' },
        ]}
      />
      <div className="campaign-two-up">
        <EvidenceChart
          id="campaign-reliability"
          queryId="campaign_reliability"
          title="Does reported confidence match outcomes?"
          rows={bins}
          sourceRows={bins}
          height={300}
          spec={{
            type: 'scatter',
            x: 'meanProbability',
            y: 'observedRate',
            series: 'outputMode',
            stackable: false,
            valueDecimals: 3,
          }}
          description="Nonempty bins of raw Noul attack probabilities. X is mean model probability; Y is the fraction of attack-labeled fixtures. Bin counts and ranges are in the source. Brier scores use raw probabilities, with no renormalization or calibration repair."
        />
        <EvidenceTable
          id="campaign-thresholds"
          queryId="campaign_thresholds"
          title="Thresholds selected on separate lineages"
          rows={thresholds}
          description="Thresholds are selected only on calibration lineages within the exact model, protocol, output battery, prompt and policy. The displayed test rows use those frozen thresholds. Small synthetic calibration sets do not establish deployment-safe confidence."
          columns={[
            { field: 'outputMode', label: 'Battery' },
            { field: 'target', label: 'Proposition' },
            { field: 'threshold', label: 'Threshold' },
            { field: 'recall', label: 'Recall' },
            { field: 'falsePositive', label: 'False alarms' },
            { field: 'scoreCoverage', label: 'Scores / calls' },
            { field: 'brier', label: 'Raw Brier', renderCell: preciseProbability },
          ]}
        />
      </div>
      <div className="campaign-intro">
        <span className="section-index">SPECIALIZED CONTEXTS / SEPARATE PROTOCOL</span>
        <h3>Presence, adoption, and permission are different questions.</h3>
        <p>
          These additional scenarios distinguish attempted injection from visible compromise, vary
          nested authorization, and test evaluator contamination with deterministic answer keys.
        </p>
      </div>
      <EvidenceTable
        id="extension-suite-summary"
        queryId="extension_suites"
        title="Specialized panel coverage"
        rows={extensions}
        columns={[
          { field: 'suite', label: 'Suite' },
          { field: 'planned', label: 'Prepared' },
          { field: 'attempted', label: 'Calls' },
          { field: 'valid', label: 'Valid' },
          { field: 'lineages', label: 'Lineages' },
          { field: 'decisionCorrect', label: 'Correct primary decisions' },
          { field: 'attackCorrect', label: 'Correct attack flags' },
        ]}
      />
      <EvidenceTable
        id="extension-integrity-states"
        queryId="extension_integrity"
        title="Is this context already poisoned?"
        rows={integrity}
        description="Gold distinguishes no visible evidence, attempted-only redirection, visible adoption or tampering, and insufficient evidence. The additional Noul asks whether poisoning is evidenced; a low value is not proof that the context is clean."
        columns={[
          { field: 'expected', label: 'Expected state' },
          { field: 'attempted', label: 'Calls' },
          { field: 'correct', label: 'Correct' },
          { field: 'no_poisoning_evidence', label: 'No evidence' },
          { field: 'attempted_only', label: 'Attempt only' },
          { field: 'poisoned', label: 'Poisoned' },
          { field: 'insufficient_evidence', label: 'Insufficient' },
          { field: 'unresolved', label: 'Unresolved' },
        ]}
      />
      <EvidenceTable
        id="extension-judge-controls"
        queryId="extension_judges"
        title="Jev, Luna and Terra on the same expanded judge packet"
        rows={judge}
        description="Sixteen records from eight deterministic task lineages balance correct/incorrect candidates and injected/clean explanations. Each task has a short and expanded message/resource version. Codex controls include runtime instructions absent from Jev; no pooled score, speed comparison or ranking."
        columns={[
          { field: 'model', label: 'Model' },
          { field: 'source', label: 'Execution' },
          { field: 'attempted', label: 'Records' },
          { field: 'valid', label: 'Valid' },
          { field: 'correct', label: 'Correct verdicts' },
          { field: 'attackCorrect', label: 'Correct attack flags' },
          { field: 'lineages', label: 'Lineages' },
        ]}
      />
      <EvidenceTable
        id="extension-judge-pairs"
        queryId="extension_judge_pairs"
        title="Judge stability under added messages and resources"
        rows={reviewedRows('extension_judge_pairs')}
        columns={[
          { field: 'model', label: 'Model' },
          { field: 'pairs', label: 'Matched tasks' },
          { field: 'bothCorrect', label: 'Both correct' },
          { field: 'shortOnlyCorrect', label: 'Short only correct' },
          { field: 'expandedOnlyCorrect', label: 'Expanded only correct' },
          { field: 'neitherCorrect', label: 'Neither correct' },
        ]}
      />
      <EvidenceTable
        id="extension-judge-case-probabilities"
        queryId="extension_judge_cases"
        title="A correct verdict can still become less certain"
        rows={reviewedRows('extension_judge_cases')}
        description="Native Jev answers for each short/expanded context. These are raw probabilities assigned to the authored gold choice and to attack presence, not calibrated probabilities of correctness. Distribution concentration is a separate native statistic."
        columns={[
          { field: 'scenario', label: 'Task' },
          { field: 'condition', label: 'Context' },
          { field: 'messages', label: 'Messages' },
          { field: 'resources', label: 'Resources' },
          { field: 'expected', label: 'Expected' },
          { field: 'observed', label: 'Observed' },
          { field: 'probabilityAssignedToGold', label: 'Probability of expected' },
          { field: 'concentration', label: 'Concentration' },
          { field: 'attackProbability', label: 'Attack probability' },
          { field: 'expectedAttack', label: 'Attack gold' },
        ]}
      />
    </section>
  );
}

export function CampaignPolicy() {
  const { snapshot, reviewedRows } = useDataApp();
  if (!snapshot.campaign) return null;
  return (
    <section className="campaign-evidence">
      <EvidenceTable
        id="campaign-policy-steering"
        queryId="campaign_policy_pairs"
        title="Does changing trusted policy change the right decisions?"
        rows={reviewedRows('campaign_policy_pairs')}
        description="Identical assessed material, one trusted profile changed. A transition is correct only when both decisions match their respective gold labels. Invariant pairs check that unrelated decisions stay correct. Only structured policy outputs are eligible."
        columns={[
          { field: 'split', label: 'Split' },
          { field: 'contrast', label: 'Profiles' },
          { field: 'pairs', label: 'Pairs' },
          { field: 'changedPairs', label: 'Expected changes' },
          { field: 'correctChanges', label: 'Both correct when changed' },
          { field: 'invariantPairs', label: 'Expected unchanged' },
          { field: 'correctInvariants', label: 'Both correct when unchanged' },
        ]}
      />
      <EvidenceTable
        id="extension-policy-boundaries"
        queryId="extension_policy"
        title="Nested authorization and moderation boundaries"
        rows={reviewedRows('extension_policy')}
        description="Each pair changes one trusted contextual condition. Disposition, audit and reason are independent native questions; contradictions stay visible and are never repaired by a policy engine."
        columns={[
          { field: 'suite', label: 'Panel' },
          { field: 'scenario', label: 'Scenario' },
          { field: 'condition', label: 'Condition' },
          { field: 'expected', label: 'Expected' },
          { field: 'observed', label: 'Observed' },
          { field: 'audit', label: 'Audit observed / expected' },
          { field: 'reason', label: 'Reason observed / expected' },
        ]}
      />
    </section>
  );
}

export function RepresentationEvidence() {
  const { reviewedRows } = useDataApp();
  const [scenario, setScenario] = useState('');
  const [question, setQuestion] = useState('');
  const all = reviewedRows('representation_cells');
  const selected = scenario || all[0]?.scenario;
  if (!all.length) return null;
  const cells = all.filter((r) => r.scenario === selected);
  const pairs = reviewedRows('representation_pairs').filter((r) => r.scenario === selected);
  const questions = reviewedRows('representation_questions').filter((r) => r.scenario === selected);
  const questionIds = [...new Set(questions.map((r) => r.questionId))];
  const selectedQuestion = questionIds.includes(question) ? question : questionIds[0];
  return (
    <section className="campaign-evidence">
      <div className="campaign-intro">
        <span className="section-index">BEFORE THE HEAVY RUN / REPRESENTATION AUDIT</span>
        <h3>Could our questions change the story?</h3>
        <p>
          Same state and meaning; different JSON representation, question batching, or option order.
          These checks keep improvements and regressions visible. Eight selected scenarios with one
          observation per condition do not establish a general effect.
        </p>
        <Dropdown
          label="Scenario"
          showLabel
          value={selected}
          choices={[...new Set(all.map((r) => r.scenario))]}
          onChange={setScenario}
        />
      </div>
      <EvidenceTable
        id="representation-cell-results"
        queryId="representation_cells"
        title="Unchanged meaning, eight request forms"
        rows={cells}
        description="The structured format was chosen from documentation before results. Probability is the native probability assigned to the frozen expected Choice label; it is not calibrated correctness confidence. No value is renormalized."
        columns={[
          { field: 'representation', label: 'EntryType form' },
          { field: 'battery', label: 'Question scope' },
          { field: 'order', label: 'Option order' },
          { field: 'expected', label: 'Expected' },
          { field: 'observed', label: 'Observed' },
          { field: 'probability', label: 'Probability of expected label' },
          { field: 'wholeResponseValid', label: 'All fields valid' },
        ]}
      />
      <EvidenceTable
        id="representation-paired-effects"
        queryId="representation_pairs"
        title="Changes in either direction"
        rows={pairs}
        columns={[
          { field: 'direction', label: 'Comparison' },
          { field: 'pairs', label: 'Matched pairs' },
          { field: 'flips', label: 'Label changes' },
          { field: 'better', label: 'Improved' },
          { field: 'worse', label: 'Worsened' },
          {
            field: 'probabilityDelta',
            label: 'Mean probability Δ',
            renderCell: probabilityChange,
            deltaTone: 'neutral',
          },
        ]}
      />
      <details>
        <summary>Inspect the independent rule flags and other native answers</summary>
        <p className="evidence-caption">
          A simultaneous reason flag does not feed the disposition. Noul values are unmodified
          probabilities; displayed true/false predictions use a fixed 0.5 cutoff. Score outputs
          without gold are descriptive. Conditions that did not ask this question are absent from
          this table.
        </p>
        <Dropdown
          label="Native question"
          showLabel
          value={selectedQuestion}
          choices={questionIds}
          onChange={setQuestion}
        />
        <EvidenceTable
          id="representation-native-answers"
          queryId="representation_questions"
          title="Recognition and disposition, inspected separately"
          rows={questions.filter((r) => r.questionId === selectedQuestion)}
          columns={[
            { field: 'representation', label: 'EntryType form' },
            { field: 'battery', label: 'Battery' },
            { field: 'order', label: 'Order' },
            { field: 'expected', label: 'Expected' },
            { field: 'prediction', label: 'Prediction' },
            { field: 'value', label: 'Raw answer' },
            { field: 'probabilityAssignedToGold', label: 'Probability of expected' },
            { field: 'status', label: 'Validity' },
          ]}
        />
      </details>
    </section>
  );
}

export function CampaignQueue() {
  const { snapshot, reviewedRows } = useDataApp();
  const campaign = snapshot.campaign;
  if (!campaign) return null;
  return (
    <section className="campaign-evidence">
      <DataComponent
        id="campaign-budget"
        queryId="campaign_queue"
        title="A spending ceiling. A preserved test catalog."
        kind="custom"
        sourceRows={reviewedRows('campaign_queue')}
        displayRows={reviewedRows('campaign_queue')}
      >
        <div className="campaign-budget" data-reviewed-rows>
          <div>
            <b>{money(campaign.knownCostUsd)}</b>
            <span>Recorded usage at public prices</span>
          </div>
          <div>
            <b>{money(campaign.unresolvedReservationUsd)}</b>
            <span>Held for unknown usage</span>
          </div>
          <div>
            <b>{money(campaign.maximumUsd)}</b>
            <span>Authorized campaign ceiling</span>
          </div>
          <div>
            <b>{count(campaign.queuedCases)}</b>
            <span>Preserved catalog cases awaiting execution</span>
          </div>
        </div>
        <p className="evidence-caption">
          The account balance was user-reported as $5. Usage estimates are not an invoice. A
          dispatch is recorded before the call; interrupted requests retain their reservation.
          Resuming never automatically repeats an already dispatched case.
        </p>
        <DataTable
          rows={reviewedRows('campaign_queue')}
          columns={[
            { field: 'phase', label: 'Phase' },
            { field: 'planned', label: 'Prepared' },
            { field: 'attempted', label: 'Attempted' },
            { field: 'remaining', label: 'Awaiting execution' },
            { field: 'status', label: 'Status' },
          ]}
        />
      </DataComponent>
    </section>
  );
}
