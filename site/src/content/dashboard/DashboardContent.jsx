import React, { useState, useEffect, useMemo } from 'react';
import {
  DataComponent,
  DataTable,
  Dropdown,
  Switch,
  Slider,
  SortableRegion,
  SortableItem,
  useDataApp,
  useDashboardTabs,
  ChartRenderer,
} from '../../data-app-public.jsx';
import './observatory.css';
import { CosmicBackdrop } from './CosmicBackdrop.jsx';
import { RichPilotEvidence } from './RichPilotEvidence.jsx';
import { EncodingEvidence, QwenEvidence } from './FollowupEvidence.jsx';
import {
  CampaignEvidence,
  CampaignPolicy,
  CampaignQueue,
  RepresentationEvidence,
} from './CampaignEvidence.jsx';

const tabs = [
  { id: 'rich-pilot', label: 'Rich-template pilot' },
  { id: 'comparison', label: 'Model comparison' },
  { id: 'encoding', label: 'Encoding diagnostic' },
  { id: 'atlas', label: 'Threat atlas' },
  { id: 'policy', label: 'Policy & trust' },
  { id: 'evidence', label: 'Evidence & uncertainty' },
  { id: 'ledger', label: 'Run ledger' },
];
const pct = (v) => (v == null ? '—' : `${(v * 100).toFixed(1)}%`);
const number = (v) => (v == null ? '—' : Number(v).toLocaleString());
const colors = ['#58d6ff', '#af98ff', '#f8b36b', '#77e8c6'];

function Orbit({ rows, selected, onSelect }) {
  const [angle, setAngle] = useState(0.58),
    [motion, setMotion] = useState(false),
    [tilt, setTilt] = useState(0.4);
  useEffect(() => {
    setMotion(!window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }, []);
  useEffect(() => {
    if (!motion) return;
    let id,
      then = 0;
    const tick = (t) => {
      if (t - then > 45) {
        setAngle((a) => a + 0.0019);
        then = t;
      }
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [motion]);
  const proj = (x, y, z) => {
    const xx = x * Math.cos(angle) - z * Math.sin(angle),
      zz = x * Math.sin(angle) + z * Math.cos(angle);
    const yy = y * Math.cos(tilt) - zz * Math.sin(tilt),
      depth = y * Math.sin(tilt) + zz * Math.cos(tilt);
    const s = 630 / (800 + depth);
    return { x: 430 + xx * s, y: 265 + yy * s, d: depth, s };
  };
  const ring = (y, r) =>
    Array.from({ length: 81 }, (_, i) => {
      const p = proj(Math.cos((i / 80) * Math.PI * 2) * r, y, Math.sin((i / 80) * Math.PI * 2) * r);
      return `${p.x},${p.y}`;
    }).join(' ');
  const points = rows
    .flatMap((r, i) =>
      [0, 1, 2].map((l) => {
        const a = (i / Math.max(1, rows.length)) * Math.PI * 2;
        return {
          ...proj(Math.cos(a) * 272, 125 - l * 129, Math.sin(a) * 272),
          row: r,
          level: l,
          i,
        };
      }),
    )
    .sort((a, b) => b.d - a.d);
  return (
    <div className="orbit-block">
      <div className="orbit-toolbar">
        <span>3D coverage map</span>
        <Switch label="Animate" checked={motion} onChange={setMotion} size="compact" />
      </div>
      <svg
        className="orbit"
        viewBox="0 0 860 510"
        role="img"
        aria-label="Three-dimensional design coverage map across three target UTF-16 code-unit lengths. Position and color indicate coverage, never measured performance."
      >
        <defs>
          <radialGradient id="orb-haze">
            <stop stopColor="#0876be" stopOpacity=".20" />
            <stop offset="1" stopColor="#0876be" stopOpacity="0" />
          </radialGradient>
          <filter id="orb-glow">
            <feGaussianBlur stdDeviation="3" />
          </filter>
        </defs>
        <ellipse cx="430" cy="262" rx="395" ry="235" fill="url(#orb-haze)" />
        {[0, 1, 2].map((l) => (
          <polyline
            key={l}
            points={ring(125 - l * 129, 272)}
            fill="none"
            stroke="#51859e"
            strokeWidth="1"
            strokeOpacity=".35"
          />
        ))}
        {[150, 210, 272].map((r, i) => (
          <polyline
            key={'floor' + i}
            points={ring(125, r)}
            fill="none"
            stroke="#51859e"
            strokeOpacity=".13"
          />
        ))}
        {rows.map((r, i) => {
          const a = (i / rows.length) * Math.PI * 2,
            p = proj(Math.cos(a) * 272, 125, Math.sin(a) * 272),
            q = proj(Math.cos(a) * 272, -133, Math.sin(a) * 272);
          return (
            <line
              key={r.family}
              x1={p.x}
              y1={p.y}
              x2={q.x}
              y2={q.y}
              stroke={r.family === selected ? '#a1eaff' : '#446e85'}
              strokeOpacity={r.family === selected ? 0.9 : 0.24}
            />
          );
        })}
        {points.map((p) => (
          <g
            key={p.row.family + p.level}
            onClick={() => onSelect(p.row.family)}
            className="orbit-node"
            tabIndex={p.level === 1 ? 0 : -1}
            role="button"
            aria-label={`${p.row.label}, target length ${[512, 4096, 16384][p.level]} UTF-16 code units; coverage node`}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelect(p.row.family);
              }
            }}
          >
            <title>
              {p.row.label} · {[512, 4096, 16384][p.level]} target UTF-16 units · coverage only;
              results in evidence panels
            </title>
            <circle cx={p.x} cy={p.y} r={12 * p.s} fill="transparent" />
            {p.row.family === selected && (
              <circle
                cx={p.x}
                cy={p.y}
                r={10 * p.s}
                fill={colors[p.level]}
                opacity=".45"
                filter="url(#orb-glow)"
              />
            )}
            <circle
              cx={p.x}
              cy={p.y}
              r={(p.row.family === selected ? 5 : 3) * p.s}
              fill={colors[p.level]}
              opacity={p.row.family === selected ? 1 : 0.58}
            />
          </g>
        ))}
        <text x="34" y="60" className="orbit-axis">
          LONG CONTEXT
        </text>
        <text x="34" y="462" className="orbit-axis">
          SHORT CONTEXT
        </text>
        <text x="630" y="462" className="orbit-axis">
          ATTACK FAMILY →
        </text>
      </svg>
      <div className="orbit-foot">
        <span>Each column = one family · height = 512 / 4,096 / 16,384 target UTF-16 units</span>
        <span>Color encodes length, never performance</span>
      </div>
      <div className="camera-controls">
        <Slider
          label="Rotate view"
          min={0}
          max={6.28}
          step={0.01}
          value={angle % 6.28}
          onChange={(v) => {
            setMotion(false);
            setAngle(v);
          }}
          formatValue={(v) => `${Math.round((v * 180) / Math.PI)}°`}
        />
        <Slider
          label="Tilt"
          min={0}
          max={0.8}
          step={0.01}
          value={tilt}
          onChange={setTilt}
          formatValue={(v) => `${Math.round((v * 180) / Math.PI)}°`}
        />
      </div>
    </div>
  );
}

function Empty({ title, children }) {
  return (
    <div className="empty-evidence">
      <span className="empty-symbol">∅</span>
      <div>
        <h3>{title}</h3>
        <p>{children}</p>
      </div>
    </div>
  );
}
function Stat({ value, label, note }) {
  return (
    <div className="jev-stat">
      <strong>{value}</strong>
      <span>{label}</span>
      {note && <small>{note}</small>}
    </div>
  );
}

export function DashboardContent() {
  const [cosmicMotion, setCosmicMotion] = useState(false);
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setCosmicMotion(!media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  const { snapshot, reviewedRows, chartProps } = useDataApp();
  const { activeTabId } = useDashboardTabs(tabs);
  const tab = tabs.some((t) => t.id === activeTabId) ? activeTabId : 'atlas';
  const report = snapshot.evaluation ?? {
    coverage: { attempted: 0, valid: 0 },
    metrics: [],
    models: [],
    status: 'not_run',
  };
  const campaignState = snapshot.campaign ?? null;
  const hasCampaign = Boolean(campaignState || snapshot.campaignEvaluation);
  const matrixReport = snapshot.campaignEvaluation;
  const historicalReport = snapshot.historicalPilot ?? report;
  const activeCoverage = hasCampaign
    ? (matrixReport?.coverage ?? { attempted: 0, valid: 0 })
    : report.coverage;
  const ledgerSnapshot = snapshot.costPlan?.observedRequests;
  const families = reviewedRows('families');
  const [selected, setSelected] = useState(''),
    [group, setGroup] = useState('All families');
  const visibleFamilies =
    group === 'All families' ? families : families.filter((r) => r.group === group);
  const chosen = visibleFamilies.find((r) => r.family === selected) ?? visibleFamilies[0];
  const rare = reviewedRows('rare_event');
  const protocol = reviewedRows('protocol');
  const results = reviewedRows('metrics');
  const [trials, setTrials] = useState(1000);
  const planning = rare.find((r) => r.trials === trials) ?? rare[0];
  const [policy, setPolicy] = useState('balanced');
  const policies = reviewedRows('policies');
  const currentPolicy = policies.find((p) => p.id === policy) ?? policies[0];
  const debug = reviewedRows('debugging'),
    controlRows = reviewedRows('controls'),
    template = reviewedRows('policy_template');
  const [pair, setPair] = useState('debug-expiry');
  const pairRows = debug.filter((r) => r.pair === pair);
  const expiryRows = reviewedRows('expiry_diagnostic');
  const [expiryContext, setExpiryContext] = useState('');
  const shownExpiryContext =
    expiryContext ||
    expiryRows.find((r) => r.context === 'at-boundary')?.context ||
    expiryRows[0]?.context;
  const expiryVisible = expiryRows.filter((r) => r.context === shownExpiryContext);
  const savePolicy = () => {
    const blob = new Blob([template[0]?.text ?? ''], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'jev-classifier-guide-v2.md';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <article className="jev-observatory">
      <CosmicBackdrop motion={cosmicMotion} />
      <div className="cosmic-control">
        <Switch
          label="Galaxy motion"
          checked={cosmicMotion}
          onChange={setCosmicMotion}
          size="compact"
        />
      </div>
      <div className="jev-status">
        <div>
          <span className="status-pill">
            {tab === 'comparison'
              ? 'LOCAL QWEN COMPARISON'
              : tab === 'encoding'
                ? 'ENCODING DEVELOPMENT DIAGNOSTIC'
                : tab === 'rich-pilot'
                  ? 'RICH-TEMPLATE DEVELOPMENT PILOT'
                  : hasCampaign
                    ? 'HISTORICAL GENERIC-PROMPT EXPERIMENTS'
                    : report.status === 'measured'
                      ? 'HISTORICAL DEVELOPMENT PILOT'
                      : 'PREPARING PILOT'}
          </span>
          <span className="status-copy">
            Precomputed evidence · correlated synthetic fixtures · no model ranking
          </span>
        </div>
        <span className="method-tag">MODEL ONLY / NO DETECTOR ASSISTANCE</span>
      </div>
      {!['rich-pilot', 'comparison', 'encoding'].includes(tab) && (
        <p className="evidence-caption">
          The generic-prompt campaign is stopped and retained for audit. Current observations appear
          in the Rich-template pilot tab. Policy &amp; trust includes the current model-facing
          guide; its earlier diagnostic panels retain their original prompts and budgets.
        </p>
      )}
      {tab === 'rich-pilot' && <RichPilotEvidence />}
      {tab === 'comparison' && <QwenEvidence />}
      {tab === 'encoding' && <EncodingEvidence />}
      {tab === 'atlas' && (
        <>
          <div className="atlas-top">
            <div>
              <h2>Where does the boundary break?</h2>
              <p>Explore the test space. Follow every conclusion back to a case.</p>
            </div>
            <Dropdown
              label="Attack surface"
              showLabel
              choices={['All families', ...new Set(families.map((f) => f.group))]}
              value={group}
              onChange={(v) => {
                setGroup(v);
                setSelected('');
              }}
            />
          </div>
          <div className="atlas-layout">
            <DataComponent
              id="threat-atlas"
              queryId="families"
              kind="custom"
              title="Test-space coverage"
              sourceRows={visibleFamilies}
              displayRows={visibleFamilies}
              description="This design map shows the prepared catalog. Family locations are categorical; vertical levels are target UTF-16 code-unit lengths. Color does not encode performance. Matrix observations and historical pilots are counted separately; native images, audio and real memory execution require separate adapters."
              className="atlas-component"
            >
              <Orbit rows={visibleFamilies} selected={chosen?.family} onSelect={setSelected} />
            </DataComponent>
            <aside className="family-inspector" aria-live="polite">
              <span className="section-index">FAMILY INSPECTOR</span>
              <h3>{chosen?.label ?? 'No matching families'}</h3>
              <p>{chosen?.description}</p>
              <div className="inspector-meta">
                <span>Design category</span>
                <b>{chosen?.group}</b>
                <span>Sent as</span>
                <b>{chosen?.serializedContainer}</b>
                <span>Full catalog cells</span>
                <b>{number(chosen?.cases)}</b>
                <span>Policy-v4 matrix calls</span>
                <b>{chosen?.matrixCalls ?? 0}</b>
                <span>Historical pilot calls</span>
                <b>{chosen?.pilotCalls ?? 0}</b>
              </div>
              <div className="inspector-rule">
                <h4>What would count as failure?</h4>
                <p>{chosen?.failure}</p>
              </div>
              <div className="paired-note">
                <span>↔</span>
                <p>
                  Each family has authored contrast cases. Related pairs do not count as independent
                  trials.
                </p>
              </div>
              <label className="family-picker">
                Select a family
                <select value={chosen?.family ?? ''} onChange={(e) => setSelected(e.target.value)}>
                  {visibleFamilies.map((f) => (
                    <option key={f.family} value={f.family}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </label>
            </aside>
          </div>
          <div className="stat-band">
            <Stat
              value={number(visibleFamilies.reduce((s, f) => s + f.cases, 0))}
              label="Full catalog cells"
              note="Design coverage, not results"
            />
            <Stat
              value={visibleFamilies.length}
              label="Attack families"
              note="Authored contrast cases"
            />
            <Stat
              value={number(activeCoverage?.attempted ?? 0)}
              label={hasCampaign ? 'Policy-v4 matrix attempts' : 'Historical main pilot calls'}
              note="Diagnostics and specialized panels separate"
            />
            <Stat
              value="—"
              label="Jev robustness"
              note="Synthetic cases do not establish robustness"
            />
          </div>
          <DataComponent
            id="family-ledger"
            queryId="families"
            kind="table"
            title="Coverage ledger"
            sourceRows={visibleFamilies}
            displayRows={visibleFamilies}
          >
            <DataTable
              rows={visibleFamilies}
              columns={[
                { field: 'label', label: 'Family' },
                { field: 'group', label: 'Design category' },
                { field: 'serializedContainer', label: 'Request container' },
                { field: 'cases', label: 'Full catalog cells' },
                { field: 'status', label: 'Evidence' },
              ]}
            />
          </DataComponent>
        </>
      )}
      {tab === 'policy' && (
        <>
          <div className="atlas-top">
            <div>
              <h2>Steer the policy. Preserve the boundary.</h2>
              <p>
                Trusted context can change the rules. Retrieved text cannot grant itself authority.
              </p>
            </div>
          </div>
          <div className="policy-layout">
            <DataComponent
              id="trust-flow"
              queryId="protocol"
              kind="custom"
              title="The classifier’s trust boundary"
              displayRows={protocol}
              sourceRows={protocol}
            >
              <div className="trust-diagram">
                <div className="trusted-layer">
                  <span>01 / TRUSTED CONFIGURATION</span>
                  <h3>Baseline + explicit policy override</h3>
                  <p>
                    Task, allowed operations, source provenance, resource trust and policy version.
                  </p>
                </div>
                <div className="boundary-line">
                  <span>↓ Scoped interpretation</span>
                </div>
                <div className="untrusted-layer">
                  <span>02 / CONTENT UNDER TEST</span>
                  <h3>Messages · resources · memory</h3>
                  <p>
                    Preserve roles, ordering and raw Unicode. Claims of authority stay inside the
                    evidence.
                  </p>
                  <div className="small-chips">
                    <span>Tool result</span>
                    <span>Prior assistant message</span>
                    <span>Retrieved document</span>
                  </div>
                </div>
                <div className="boundary-line">
                  <span>↓ Model-only inference</span>
                </div>
                <div className="output-layer">
                  <span>03 / STRUCTURED DECISION</span>
                  <h3>Verdict + probabilities + policy reasons</h3>
                  <p>
                    Schema validation and exact-label scoring run afterward. They do not help the
                    target classify.
                  </p>
                </div>
              </div>
            </DataComponent>
            <DataComponent
              id="policy-profiles"
              queryId="policies"
              title="Trusted policy profiles"
              kind="custom"
              displayRows={policies}
              sourceRows={policies}
              headerControls={
                <Dropdown
                  label="Policy"
                  value={policy}
                  choices={policies.map((p) => p.id)}
                  onChange={setPolicy}
                />
              }
            >
              <div className="policy-detail">
                <span className="section-index">
                  CONFIGURED POLICY · VERSION {currentPolicy?.version}
                </span>
                <h3>{currentPolicy?.label}</h3>
                <p>{currentPolicy?.description}</p>
                <dl>
                  <dt>Authorized procedure</dt>
                  <dd>{currentPolicy?.procedures}</dd>
                  <dt>Ambiguous content</dt>
                  <dd>{currentPolicy?.ambiguity}</dd>
                  <dt>Always retained</dt>
                  <dd>
                    Untrusted content cannot authorize unrelated actions or rewrite the classifier’s
                    instructions.
                  </dd>
                </dl>
                <div className="paired-note">
                  <span>↔</span>
                  <p>
                    Run the same case under each trusted profile, then embed the same override as
                    untrusted text. Only the first should change policy behavior.
                  </p>
                </div>
              </div>
            </DataComponent>
          </div>
          <RepresentationEvidence />
          <CampaignPolicy />
          <DataComponent
            id="debugging-context"
            queryId="debugging"
            title="Historical pilot · change one trusted fact"
            kind="custom"
            sourceRows={debug}
            displayRows={pairRows}
            description="Historical legacy-v2 observations, separate from policy-v4. Sixteen calls contain eleven unique requests and form eight matched pairs. Expected labels are synthetic and not independently adjudicated. Each changes exactly one trusted contextual field. Observed decisions are the actual precomputed native Jev outputs."
            headerControls={
              <Dropdown
                label="Context pair"
                value={debug.find((r) => r.pair === pair)?.title ?? ''}
                choices={[...new Set(debug.map((r) => r.title))]}
                onChange={(title) => setPair(debug.find((r) => r.title === title)?.pair ?? pair)}
              />
            }
          >
            <div className="debug-boundary">
              <p className="finding-qualification">
                These are independent native questions. Reason probabilities are not inputs to the
                disposition and are not a generated explanation. The original scores stay frozen
                while the diagnostic below tests our specification.
              </p>
              <p>{pairRows[0]?.rule}</p>
              {snapshot.specialPilot && (
                <div className="debug-summary">
                  <span>
                    <b>{snapshot.specialPilot.contextualDebugging.decisionCorrect}/16</b> decisions
                    matched
                  </span>
                  <span>
                    <b>{snapshot.specialPilot.contextualDebugging.auditCorrect}/16</b> audit flags
                    matched
                  </span>
                  <span>
                    <b>{snapshot.specialPilot.contextualDebugging.reasonSetCorrect}/16</b> exact
                    reason sets matched
                  </span>
                </div>
              )}
              <div className="debug-pair">
                {pairRows.map((r, i) => (
                  <div
                    key={r.id}
                    data-disagreement={r.decisionMatch === false || r.auditMatch === false}
                  >
                    <span className="section-index">CONTEXT {i + 1}</span>
                    <p>
                      <code>{r.changedValue}</code>
                    </p>
                    <span className="section-index">JEV OBSERVED</span>
                    <h3>{r.observed.replaceAll('_', ' ')}</h3>
                    <p>
                      Expected: <b>{r.expected.replaceAll('_', ' ')}</b>
                      <br />
                      Audit observed / expected:{' '}
                      <b>
                        {r.auditObserved} / {r.auditExpected}
                      </b>
                    </p>
                    <p className="reason-caption">Independent reason judgments</p>
                    <code>{r.reasonObserved}</code>
                    <details className="native-details">
                      <summary>Inspect probabilities and expected reasons</summary>
                      <p>Expected reasons: {r.reasonExpected}</p>
                      <pre>{r.probabilities}</pre>
                      <pre>{r.reasonProbabilities}</pre>
                    </details>
                  </div>
                ))}
              </div>
              <p className="context-path">
                One changed field: <code>{pairRows[0]?.changed}</code>
              </p>
            </div>
          </DataComponent>
          {expiryRows.length > 0 && (
            <DataComponent
              id="expiry-diagnostic"
              queryId="expiry_diagnostic"
              title="Historical expiry diagnostic · specification sensitivity"
              kind="custom"
              sourceRows={expiryRows}
              displayRows={expiryVisible}
              description="A fixed 48-call follow-up crosses representation, decision rubric and question packaging at three times. Two repeats per condition; one scenario lineage. Clarification was designed after seeing the mismatch, so this tests sensitivity—not general improvement."
              headerControls={
                <Dropdown
                  label="Diagnostic time"
                  value={shownExpiryContext}
                  choices={[...new Set(expiryRows.map((r) => r.context))]}
                  onChange={setExpiryContext}
                />
              }
            >
              <div className="expiry-diagnostic" data-reviewed-rows>
                <p>
                  Expected disposition: <b>{expiryVisible[0]?.expected.replaceAll('_', ' ')}</b>.
                  Values below are unchanged native probabilities. No reason-to-decision routing is
                  applied.
                </p>
                <div className="expiry-bars">
                  {expiryVisible.map((r) => (
                    <div key={r.id}>
                      <span>
                        {r.representation} · {r.rubric} · {r.questionScope}
                      </span>
                      <div className="expiry-track">
                        <i style={{ width: `${(r.blockMean ?? 0) * 100}%` }} />
                      </div>
                      <b>{r.blockRange}</b>
                    </div>
                  ))}
                </div>
                <p className="evidence-caption">
                  Bars show mean probability assigned to block; labels show the two-repeat range.
                  Higher is appropriate only for the at/after-expiry contexts.
                </p>
                <DataTable
                  rows={expiryVisible}
                  columns={[
                    { field: 'representation', label: 'Representation' },
                    { field: 'rubric', label: 'Decision rubric' },
                    { field: 'questionScope', label: 'Questions' },
                    { field: 'matches', label: 'Gold matches' },
                    { field: 'choices', label: 'Raw choices' },
                    { field: 'expiredRange', label: 'Expired-rule Noul' },
                  ]}
                />
                <p className="finding-qualification">
                  The explicit rubric clarifies evaluation time and every option’s precedence
                  together. Any change cannot identify which clause mattered. Lossless structured
                  wrapping is separate from the general advanced-v3 protocol. Independent questions
                  do not consume one another’s answers; repeats are not independent scenarios.
                  Clarification improved this disposition; it did not resolve every independent
                  reason judgment.
                </p>
              </div>
            </DataComponent>
          )}
          <DataComponent
            id="policy-template"
            queryId="policy_template"
            title="The exact classifier guide sent to Jev"
            kind="custom"
            displayRows={template}
            sourceRows={template}
          >
            <div className="policy-download">
              <p>
                This is the approved recognition guide and baseline policy used in every
                rich-template pilot request. It tells Jev what to look for, how to distinguish
                attacks from legitimate data, and how trusted context changes permission. Research
                notes and experiment instructions are excluded.
              </p>
              <button type="button" onClick={savePolicy}>
                Download the exact classifier guide ↓
              </button>
            </div>
            <p className="evidence-caption" data-reviewed-rows>
              {template[0]?.protocol} · {number(template[0]?.utf8Bytes)} UTF-8 bytes · supplied
              unchanged in {template[0]?.placement}
            </p>
            <details className="policy-source" data-reviewed-rows>
              <summary>Read the model-facing guide</summary>
              <pre>{template[0]?.text}</pre>
            </details>
            <details className="policy-source" data-reviewed-rows>
              <summary>See the exact shared policy configuration</summary>
              <pre>{template[0]?.policy}</pre>
            </details>
            <details className="policy-source" data-reviewed-rows>
              <summary>See the seven native questions sent with the guide</summary>
              <pre>{template[0]?.questions}</pre>
            </details>
            <p className="evidence-caption">
              Each request also supplies the case’s trusted facts and material to assess. The rich
              pilot activates the instruction-fields-only English contract with legitimate-data
              exceptions; it does not exercise every configurable policy override described in the
              guide.
            </p>
            <details className="policy-source" data-reviewed-rows>
              <summary>Verify the guide fingerprint</summary>
              <pre>{template[0]?.sha256}</pre>
            </details>
          </DataComponent>
          <DataComponent
            id="measurement-axes"
            queryId="protocol"
            title="Distinct questions, distinct measurements"
            kind="table"
            displayRows={protocol}
            sourceRows={protocol}
          >
            <DataTable
              rows={protocol}
              columns={[
                { field: 'question', label: 'Question' },
                { field: 'measure', label: 'Measurement' },
                { field: 'limit', label: 'What it does not prove' },
              ]}
            />
          </DataComponent>
        </>
      )}
      {tab === 'evidence' && (
        <>
          <div className="atlas-top">
            <div>
              <h2>Uncertainty stays in the picture.</h2>
              <p>
                A clean run is evidence about the sampled distribution—not a certificate of safety.
              </p>
            </div>
          </div>
          <CampaignEvidence />
          <SortableRegion id="evidence-panels" variant="freeform" className="evidence-grid">
            <SortableItem id="case-findings" label="Case-bound findings" kind="custom">
              <DataComponent
                id="case-findings"
                queryId="findings"
                title="Historical pilot disagreements"
                kind="custom"
                sourceRows={reviewedRows('findings')}
                displayRows={reviewedRows('findings')}
                description="Original scores and labels stay frozen. Attribution remains conditional on the question and fixture specification; scored mismatches do not by themselves prove a model defect or downstream exploitation."
              >
                <div className="finding-cards">
                  {reviewedRows('findings').map((f) => (
                    <details key={f.id}>
                      <summary>
                        {f.id === 'debug-expiry-b'
                          ? 'Expiry boundary: observed permission versus authored block label'
                          : f.id === 'debug-data-scope-b'
                            ? 'Blocked disclosure, missing audit'
                            : f.id.replaceAll('-', ' ')}
                      </summary>
                      <p>{f.interpretation}</p>
                      <p className="finding-qualification">{f.qualification}</p>
                      <code>Case: {f.caseId}</code>
                    </details>
                  ))}
                </div>
                <p className="evidence-caption">
                  Legacy-v2 observations. Gold is synthetic and unreviewed by independent human
                  annotators. The revised structured request format is a separate protocol.
                </p>
              </DataComponent>
            </SortableItem>
            <SortableItem id="rare-events" label="Rare-event planning" kind="custom">
              <DataComponent
                id="rare-events"
                queryId="rare_event"
                title="How much can zero failures tell us?"
                kind="custom"
                sourceRows={rare}
                displayRows={rare}
                description="Planning calculation under independent identical Bernoulli trials: upper bound = 1 − 0.05^(1/n). Detection probability for p=0.001 = 1 − 0.999^n. Correlated variants do not supply n independent trials."
              >
                <div className="rare-panel">
                  <span className="section-index">PLANNING SCENARIO · NOT JEV RESULTS</span>
                  <div className="rare-number">
                    {planning ? (planning.upper95 * 100).toFixed(3) : '—'}
                    <span>%</span>
                  </div>
                  <p>
                    One-sided 95% upper bound after <b>zero failures</b> in {number(trials)}{' '}
                    independent trials.
                  </p>
                  <Dropdown
                    label="Independent trials"
                    showLabel
                    choices={rare.map((r) => String(r.trials))}
                    value={String(trials)}
                    onChange={(v) => setTrials(Number(v))}
                  />
                  <div className="prob-bar">
                    <i style={{ width: `${(planning?.detectionProbability ?? 0) * 100}%` }} />
                  </div>
                  <p className="prob-text">
                    {pct(planning?.detectionProbability)} chance to observe at least one failure if
                    the true rate is 1 in 1,000.
                  </p>
                  <div className="rare-callout">
                    <b>2,995 trials</b>
                    <span>
                      For 95% detection probability at a 0.1% failure rate. Each separately claimed
                      population needs adequate evidence.
                    </span>
                  </div>
                </div>
              </DataComponent>
            </SortableItem>
            <SortableItem id="measured-metrics" label="Native Jev pilot" kind="custom">
              <DataComponent
                id="measured-metrics"
                queryId="metrics"
                title="Historical Jev · legacy-v2 integration pilot"
                kind="custom"
                displayRows={results}
                sourceRows={results}
              >
                {results.length ? (
                  <DataTable
                    rows={results}
                    columns={[
                      { field: 'arm', label: 'Prompt' },
                      { field: 'mode', label: 'Battery' },
                      { field: 'attempted', label: 'Calls' },
                      { field: 'valid', label: 'Valid' },
                      { field: 'falseNegative', label: 'Misses' },
                      { field: 'falsePositive', label: 'False alarms' },
                      { field: 'policyMatches', label: 'Policy matches' },
                    ]}
                  />
                ) : (
                  <Empty title="Pilot data is being prepared">
                    Native Choice, Noul and Score questions have different contracts from generated
                    chat JSON.
                  </Empty>
                )}
                <div className="judge-checks">
                  <div>
                    <b>01</b>
                    <span>Frozen synthetic cases with explicit programmatic labels.</span>
                  </div>
                  <div>
                    <b>02</b>
                    <span>Independent human label review still needed.</span>
                  </div>
                  <div>
                    <b>03</b>
                    <span>Initial adapter-validation failures retained separately.</span>
                  </div>
                  <div>
                    <b>04</b>
                    <span>Errors and abstentions remain visible.</span>
                  </div>
                </div>
              </DataComponent>
            </SortableItem>
            <SortableItem id="subagent-controls" label="Blinded subagent controls" kind="custom">
              <DataComponent
                id="subagent-controls"
                queryId="controls"
                title="Historical Luna + Terra · eight-case controls"
                kind="table"
                displayRows={controlRows}
                sourceRows={controlRows}
                description="Fresh Codex subagents; no inherited discussion or gold labels. Eight fixtures from one judge lineage. Runtime and sampling differ from native Jev, so these counts are not pooled or ranked."
              >
                <DataTable
                  rows={controlRows}
                  columns={[
                    { field: 'model', label: 'Control' },
                    { field: 'cases', label: 'Cases' },
                    { field: 'judgeCorrect', label: 'Correct judgments' },
                    { field: 'valid', label: 'Valid' },
                    { field: 'lineages', label: 'Template lineages' },
                  ]}
                />
              </DataComponent>
            </SortableItem>
            <SortableItem id="native-judge-panel" label="Native matched judge panel" kind="custom">
              <DataComponent
                id="native-judge-panel"
                queryId="matched_panel"
                title="Historical Jev · matched eight-case judge panel"
                kind="table"
                displayRows={reviewedRows('matched_panel')}
                sourceRows={reviewedRows('matched_panel')}
                description="The same eight underlying contexts and policy conditions, delivered as native TypeSafe questions. Correctness checks exact answers against reference values. Different transports remain separate."
              >
                <DataTable
                  rows={reviewedRows('matched_panel')}
                  columns={[
                    { field: 'model', label: 'Transport' },
                    { field: 'cases', label: 'Cases' },
                    { field: 'judgeCorrect', label: 'Correct judgments' },
                    { field: 'valid', label: 'Valid' },
                  ]}
                />
              </DataComponent>
            </SortableItem>
            <SortableItem id="length-evidence" label="Length scaling" kind="custom">
              <DataComponent
                id="length-evidence"
                queryId="length_scaling"
                title="Historical pilot · length coverage"
                description="These cells differ in policy, question battery and payload position. Their latencies and outcomes do not isolate the effect of input length."
                kind="custom"
                displayRows={reviewedRows('length_scaling')}
                sourceRows={reviewedRows('length_scaling')}
              >
                {reviewedRows('length_scaling').length ? (
                  <DataTable
                    rows={reviewedRows('length_scaling')}
                    columns={[
                      { field: 'contextChars', label: 'Target UTF-16 units' },
                      { field: 'arm', label: 'Prompt' },
                      { field: 'mode', label: 'Battery' },
                      { field: 'position', label: 'Position' },
                      { field: 'attempted', label: 'Calls' },
                      { field: 'valid', label: 'Valid' },
                      { field: 'meanMs', label: 'Mean ms' },
                    ]}
                  />
                ) : (
                  <Empty title="Length curves await measured runs">
                    Compare length × payload position × output format. Provider-reported tokens and
                    UTF-16 code-unit counts remain separate; truncation is an explicit outcome.
                  </Empty>
                )}
              </DataComponent>
            </SortableItem>
            <SortableItem id="calibration-evidence" label="Confidence calibration" kind="custom">
              <DataComponent
                id="calibration-evidence"
                queryId="calibration"
                title="Historical pilot · calibration availability"
                kind="custom"
                displayRows={reviewedRows('calibration')}
                sourceRows={reviewedRows('calibration')}
              >
                {reviewedRows('calibration').length ? (
                  <DataTable rows={reviewedRows('calibration')} />
                ) : (
                  <Empty title="No threshold established by the historical pilot">
                    Policy-v4 threshold analyses appear in the campaign panels above. A small
                    synthetic calibration set does not establish a deployment-safe confidence
                    threshold.
                  </Empty>
                )}
              </DataComponent>
            </SortableItem>
          </SortableRegion>
        </>
      )}
      {tab === 'ledger' && (
        <>
          <div className="atlas-top">
            <div>
              <h2>The evidence behind the experience.</h2>
              <p>
                Frozen inputs, explicit omissions, and a reproducible path from a response to a
                result.
              </p>
            </div>
          </div>
          <CampaignQueue />
          <div className="stat-band">
            <Stat
              value={number(campaignState?.dispatched ?? ledgerSnapshot?.recordedRequests ?? 0)}
              label={hasCampaign ? 'Campaign dispatches' : 'Cost-ledger recorded calls'}
              note={
                hasCampaign
                  ? 'All campaign phases; matrix is separate'
                  : 'As of the cost-report snapshot'
              }
            />
            <Stat
              value={number(activeCoverage?.valid ?? 0)}
              label={hasCampaign ? 'Matrix valid responses' : 'Historical main pilot valid'}
              note={`${number(activeCoverage?.attempted ?? 0)} attempted calls`}
            />
            <Stat
              value={number(historicalReport.coverage?.attempted ?? 0)}
              label="Historical main pilot calls"
              note="Legacy-v2; specialized panels separate"
            />
            <Stat
              value={number(
                campaignState?.unresolvedUsage ?? ledgerSnapshot?.requestsMissingUsage ?? 0,
              )}
              label={hasCampaign ? 'Campaign usage unresolved' : 'Cost-ledger calls missing usage'}
              note="Unknown cost is not zero cost"
            />
          </div>
          <DataComponent
            id="budget-plan"
            queryId="cost"
            title="Historical cost proposals · retained for audit"
            kind="table"
            sourceRows={reviewedRows('cost')}
            displayRows={reviewedRows('cost')}
            description="These pre-campaign estimates are superseded proposals, not the current budget or observed spend. The campaign panel above shows the authorized ceiling, known usage, held reservations and preserved queue. Each historical estimate retains its own protocol version."
          >
            <DataTable
              rows={reviewedRows('cost')}
              columns={[
                { field: 'stage', label: 'Historical proposal' },
                { field: 'requests', label: 'Requests' },
                { field: 'reservationUsd', label: 'Estimated reservation USD' },
                { field: 'protocol', label: 'Protocol' },
              ]}
            />
            <p className="evidence-caption">
              Cost-report snapshot: {snapshot.costPlan?.generatedAt ?? 'not available'}. It records{' '}
              {ledgerSnapshot?.requestsWithUsage ?? 0} calls with usage and{' '}
              {ledgerSnapshot?.requestsMissingUsage ?? 0} without usage, with $
              {(ledgerSnapshot?.knownUsageCostUsd ?? 0).toFixed(5)} known at public prices. This
              snapshot may precede the campaign; do not add its totals to campaign accounting
              without deduplication. Unknown usage is not zero cost.
            </p>
          </DataComponent>
          <div className="ledger-layout">
            <DataComponent
              id="run-provenance"
              queryId="runs"
              title="Versioned run provenance"
              kind="custom"
              displayRows={reviewedRows('runs')}
              sourceRows={reviewedRows('runs')}
            >
              <div className="run-note">
                <h3>
                  {hasCampaign
                    ? 'Current campaign and historical audit trail'
                    : 'Historical integration audit trail'}
                </h3>
                <p>
                  Early integration pilot — 12 cases, original prompt: 12 native Jev calls after an
                  adapter rounding correction. Specialized panels: 8 judge cases and 16
                  contextual-debugging calls. The initial 12-call integration run and one diagnostic
                  call remain in the audit trail; six initial responses lost usage metadata. Luna
                  and Terra each assessed eight blinded cases in separate Codex subagents. A
                  subsequent 48-call expiry diagnostic varies the request specification and is
                  reported separately from those frozen pilots.
                </p>
                {hasCampaign && (
                  <p>
                    Policy-v4 matrix: {number(activeCoverage?.attempted ?? 0)} attempted calls,{' '}
                    {number(activeCoverage?.valid ?? 0)} complete valid responses. Campaign smoke,
                    representation diagnostics and specialized extensions retain separate
                    populations. All-attempt rates preserve errors, malformed responses and
                    abstentions; native Score severity has no accuracy gold.
                  </p>
                )}
              </div>
              {reviewedRows('runs').length > 0 && <DataTable rows={reviewedRows('runs')} />}
              <div className="manifest-list">
                <span>Corpus & policy hashes</span>
                <span>Exact model identifiers</span>
                <span>Seed, split & randomization</span>
                <span>Latency, tokens & cost</span>
                <span>Judge identity & rubric</span>
                <span>Raw-output hashes</span>
              </div>
            </DataComponent>
            <DataComponent
              id="limits"
              queryId="limitations"
              title="Open gaps"
              kind="table"
              displayRows={reviewedRows('limitations')}
              sourceRows={reviewedRows('limitations')}
            >
              <ul className="limits-list">
                {reviewedRows('limitations').map((r, i) => (
                  <li key={i}>{r.limit}</li>
                ))}
              </ul>
            </DataComponent>
          </div>
          <DataComponent
            id="source-register"
            queryId="sources"
            title="Sources & reproducibility"
            kind="custom"
            sourceRows={reviewedRows('sources')}
            displayRows={reviewedRows('sources')}
          >
            <div className="source-links">
              {reviewedRows('sources').map((s, i) => (
                <a key={i} href={s.url} target="_blank" rel="noreferrer">
                  <span>{s.title}</span>
                  <span>↗</span>
                </a>
              ))}
            </div>
          </DataComponent>
        </>
      )}
      <footer className="jev-footer">
        <span>JEV / REDTEAM OBSERVATORY</span>
        <span>Precomputed evidence · Versioned methodology · No live inference</span>
      </footer>
    </article>
  );
}
