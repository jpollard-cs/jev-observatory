// UI adapter. The credential exists only in this dialog's closure during a run.
// Never put it in app state, storage, URLs, messages, reports or error text.
import { canReviewAdvice, failureDescription } from './hosted-evidence.js';
const usd = (n) => '$' + Number(n ?? 0).toFixed(5);
function el(tag, text, props = {}) {
  const n = document.createElement(tag);
  if (text !== null) n.textContent = text;
  Object.assign(n, props);
  return n;
}
function button(text, run, cls = 'btn') {
  const b = el('button', text, { className: cls, type: 'button' });
  b.addEventListener('click', run);
  return b;
}
async function remote(path, data) {
  const r = await fetch('/api/execution/' + path, {
    method: data ? 'POST' : 'GET',
    headers: data ? { 'Content-Type': 'application/json', 'x-observatory-intent': 'write' } : {},
    body: data ? JSON.stringify(data) : undefined,
  });
  const v = await r.json();
  if (!r.ok) throw Error(v.message ?? 'Hosted execution could not be confirmed');
  return v;
}
function download(value, name) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2) + '\n'], { type: 'application/json' }),
  );
  const a = el('a', null, { href: url, download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function hostedRun({ spec = null, onReport = async () => {} } = {}) {
  const dialog = el('dialog', null, { className: 'hosted-dialog' }),
    head = el('header', null, { className: 'modal-head' }),
    body = el('div', null, { className: 'modal-body' }),
    title = el('h2', 'Hosted execution'),
    alert = el('p', null, { className: 'note warn' });
  alert.setAttribute('role', 'status');
  alert.hidden = true;
  let key = '',
    active = null,
    busy = false,
    stop = false;
  const forget = () => {
    key = '';
    stop = true;
  };
  const fail = (e) => {
    key = '';
    busy = false;
    alert.textContent = e.message;
    alert.hidden = false;
  };
  const close = button('Close', () => {
    if (busy) {
      alert.textContent =
        'Stop after the current request before closing. Closing the tab prevents later dispatch; a request already sent can still be billed.';
      alert.hidden = false;
      return;
    }
    forget();
    dialog.close();
    dialog.remove();
  });
  head.append(title, close);
  dialog.append(head, alert, body);
  document.body.append(dialog);
  dialog.showModal();
  dialog.addEventListener('cancel', (e) => {
    e.preventDefault();
    close.click();
  });
  const safe = (fn) => async () => {
    alert.hidden = true;
    try {
      await fn();
    } catch (e) {
      fail(e);
    }
  };
  async function finished(run) {
    busy = false;
    key = '';
    body.replaceChildren();
    title.textContent =
      run.status === 'complete' ? 'Run saved. Follow the evidence.' : 'Run paused or stopped.';
    body.append(
      el(
        'p',
        `${run.completed} / ${run.requests} requests recorded · ${usd(run.knownUsd)} known usage · ${usd(run.heldUsd)} held`,
      ),
    );
    if (run.reason || run.inflight !== null)
      body.append(
        el(
          'p',
          run.reason ??
            'An unresolved request is still in flight. It will not be retried automatically.',
          { className: 'note warn' },
        ),
      );
    if (run.heldUsd > 0)
      body.append(
        el(
          'p',
          'Held is a local budget reservation, not a confirmed provider charge. It remains reserved until billing is reconciled. No automatic retry will occur.',
          { className: 'fine' },
        ),
      );
    body.append(
      el(
        'p',
        'Requests and evidence are private to your signed-in account. Sharing is a separate action.',
      ),
    );
    const full = await remote('runs/' + run.id + '?report=1');
    body.append(
      button('Download report', () => download(full.report, 'jev-hosted-' + run.id + '.json')),
    );
    const advice = full.report?.protocol === 'catalog-advisor-report/1';
    const inspect = () => {
      title.textContent = 'Run evidence';
      body.replaceChildren();
      body.append(
        el(
          'p',
          advice
            ? 'Read-only inspection. Failed advice does not change your policy or test selection.'
            : 'Read-only inspection of the recorded run.',
        ),
      );
      if (run.reason)
        body.append(el('p', failureDescription(run.reason), { className: 'note warn' }));
      for (const failure of full.report.failures ?? []) {
        const record = el('section', null, { className: 'note' });
        record.append(el('h3', failure.error ?? 'Unusable response'));
        const fields = el('dl');
        for (const [name, value] of [
          ['Request', failure.jobId],
          ['Request hash', failure.requestHash],
          [
            'Latency (ms)',
            Number.isFinite(failure.evidence?.response?.latencyMs)
              ? failure.evidence.response.latencyMs.toFixed(2)
              : null,
          ],
          ['Failure stage', failure.evidence?.response?.diagnostics?.phase],
          ['HTTP status', failure.evidence?.response?.diagnostics?.httpStatus],
        ])
          if (value !== null && value !== undefined) {
            fields.append(el('dt', name), el('dd', String(value), { className: 'hash' }));
          }
        record.append(fields);
        body.append(record);
      }
      const raw = el('details');
      raw.append(
        el('summary', 'Complete recorded report'),
        el('pre', JSON.stringify(full.report, null, 2), { className: 'code dark' }),
      );
      body.append(
        raw,
        button('Download report', () => download(full.report, 'jev-hosted-' + run.id + '.json')),
        button(
          'Back to run',
          safe(() => finished(run)),
        ),
      );
    };
    body.append(
      button(
        'Inspect recorded evidence',
        inspect,
        advice && !canReviewAdvice(full.report) ? 'btn primary' : 'btn',
      ),
    );
    if (!advice || canReviewAdvice(full.report))
      body.append(
        button(
          advice ? 'Review suggestions in workspace' : 'Inspect in workspace',
          safe(async () => {
            await onReport(full.report);
            dialog.close();
            dialog.remove();
          }),
          'btn primary',
        ),
      );
    if (run.status === 'running' && run.inflight === null)
      body.append(
        button(
          'Review continuation',
          safe(() => review(run)),
        ),
      );
    body.append(
      el(
        'p',
        'A hosted observation is not a provider-signed attestation or a no-regression certificate.',
        { className: 'fine section-space' },
      ),
    );
  }
  async function review(q) {
    q = { ...q, ...(await remote('runs/' + q.id)) };
    if (!['ready', 'running'].includes(q.status) || q.inflight !== null) return finished(q);
    active = q;
    body.replaceChildren();
    title.textContent = 'Review before spending.';
    body.append(
      el(
        'p',
        q.disclosure ??
          'This service sends the frozen requests to TypeSafe using your key, and saves requests and results privately. Expected answers stay out of model requests.',
      ),
    );
    const stats = el('div', null, { className: 'stats' });
    for (const [label, value] of [
      ['Requests', q.requests],
      ['This run’s reservation', usd(q.reservationUsd)],
      ['Known usage', usd(q.knownUsd)],
      ['Held', usd(q.heldUsd)],
    ]) {
      const cell = el('div', null, { className: 'stat' });
      cell.append(el('strong', String(value)), el('small', label));
      stats.append(cell);
    }
    body.append(stats);
    if (q.account)
      body.append(
        el(
          'p',
          `${usd(q.account.availableUsd)} unallocated of ${usd(q.account.maximumUsd)} total allowance · ${usd(q.account.carriedPriorUsd)} carried prior usage. This is a ledger, not your provider balance.`,
          { className: 'note' },
        ),
      );
    body.append(
      el('p', [q.providerLabel, q.model, q.endpoint].filter(Boolean).join(' · '), {
        className: 'fine',
      }),
    );
    if (q.estimatedUsd !== undefined)
      body.append(
        el(
          'p',
          'Estimated input cost: ' +
            usd(q.estimatedUsd) +
            '. Planning allowance is a UTF-8 byte heuristic, not a provider invoice guarantee.',
          { className: 'fine' },
        ),
      );
    body.append(el('p', 'Plan ' + q.planHash, { className: 'hash' }));
    if (q.policyHash) body.append(el('p', 'Policy ' + q.policyHash, { className: 'hash' }));
    const disclosure = el('details'),
      summary = el('summary', 'Inspect exact requests and separate expectations'),
      select = el('select'),
      code = el('pre', null, { className: 'code dark' });
    select.setAttribute('aria-label', 'Request to inspect');
    for (let i = 0; i < q.requests; i++)
      select.append(el('option', 'Request ' + (i + 1), { value: String(i) }));
    const inspect = safe(async () => {
      const v = await remote('runs/' + q.id + '/request?index=' + select.value);
      code.textContent = JSON.stringify(v, null, 2);
    });
    select.addEventListener('change', inspect);
    disclosure.addEventListener('toggle', () => {
      if (disclosure.open && !code.textContent) inspect();
    });
    disclosure.append(summary, select, code);
    body.append(disclosure);
    const label = el('label', null, { className: 'field section-space' }),
      input = el('input', null, {
        type: 'password',
        autocomplete: 'off',
        maxLength: 4096,
        placeholder: (q.providerLabel ?? 'Provider') + ' API key',
      });
    input.setAttribute('autocapitalize', 'off');
    input.spellcheck = false;
    label.append(
      el('span', 'Key for this run only'),
      input,
      el(
        'small',
        'Kept in this tab’s memory during execution; forgotten on stop, completion, error, or reload. The site operator handles it transiently to call TypeSafe. No key is saved in browser or server storage.',
      ),
    );
    body.append(label);
    const check = el('input', null, { type: 'checkbox' }),
      agreement = el('label', null, { className: 'check section-space' });
    agreement.append(
      check,
      el(
        'span',
        `I authorize these requests against my ${q.providerLabel ?? 'provider'} account and have reviewed the material being sent.`,
      ),
    );
    body.append(agreement);
    const progress = el('p', 'No requests sent.', { className: 'note section-space' });
    progress.setAttribute('role', 'status');
    const begin = button(
      q.status === 'running' ? 'Continue reviewed run' : 'Authorize and run',
      safe(async () => {
        if (busy) return;
        if (!check.checked) throw Error('Review and check the spending authorization first.');
        key = input.value.trim();
        input.value = '';
        if (key.length < 8) throw Error('Enter your provider API key.');
        stop = false;
        busy = true;
        begin.disabled = true;
        check.disabled = true;
        const expires = Date.now() + 30 * 60 * 1000;
        try {
          let run = await remote('runs/' + q.id + '/start', {
            planHash: q.planHash,
            confirmPaid: true,
          });
          while (run.status === 'running' && run.inflight === null && !stop) {
            if (Date.now() > expires) {
              forget();
              break;
            }
            progress.textContent = `${run.completed} / ${run.requests} recorded. Sending request ${run.completed + 1}. Keep this tab open.`;
            run = await remote('runs/' + q.id + '/step', { index: run.completed, apiKey: key });
            active = run;
          }
          key = '';
          if (stop) run = await remote('runs/' + q.id + '/stop', {});
          await finished(run);
        } catch (e) {
          forget();
          fail(e);
          progress.textContent =
            'No automatic retry. Open saved runs to inspect the durable status before continuing.';
          begin.disabled = true;
        }
      }),
      'btn primary',
    );
    const stopButton = button(
      'Stop / forget key',
      safe(async () => {
        forget();
        if (active) {
          const r = await remote('runs/' + q.id + '/stop', {});
          progress.textContent =
            'Stopped. Any request already sent may still finish and be billed.';
          if (!busy) await finished(r);
        }
      }),
    );
    body.append(el('div', null, { className: 'actions section-space' }));
    body.lastChild.append(begin, stopButton);
    body.append(progress);
  }
  async function home() {
    const session = await remote('session');
    body.replaceChildren();
    if (!session.signedIn) {
      title.textContent = 'Sign in to save and run.';
      body.append(
        el(
          'p',
          'The hosted runner needs an account to isolate your spending ledger and private results. Browsing and offline planning do not require sign-in.',
        ),
        el('a', 'Sign in with ChatGPT', {
          href: '/signin-with-chatgpt?return_to=%2Fworkspace',
          className: 'btn primary',
        }),
      );
      return;
    }
    if (!session.account) {
      title.textContent = 'Set a local spending cap.';
      body.append(
        el(
          'p',
          'This limit is a local safety override shared across your runs on this site. Each run also has its own approved budget. We do not currently read your provider balance. Changing keys or reloading does not reset this ledger.',
        ),
      );
      const max = el('input', null, {
          type: 'number',
          min: '.01',
          max: '3',
          step: '.01',
          value: '3',
        }),
        prior = el('input', null, {
          type: 'number',
          min: '0',
          max: '3',
          step: 'any',
          value: '0',
        });
      for (const [label, input] of [
        ['Local total spending cap across runs ($)', max],
        ['Already spent from this budget elsewhere ($)', prior],
      ]) {
        const f = el('label', null, { className: 'field' });
        f.append(el('span', label), input);
        body.append(f);
      }
      body.append(
        el(
          'p',
          'A new budget starts with $0 prior usage. If continuing an existing research budget, enter its actual spending above. This initial release requires a local cap of up to $3; it is not a provider credit balance.',
          { className: 'fine' },
        ),
      );
      body.append(
        button(
          'Save local cap — no model call',
          safe(async () => {
            await remote('account', {
              maximumUsd: Number(max.value),
              carriedPriorUsd: Number(prior.value),
            });
            await home();
          }),
          'btn primary',
        ),
      );
      return;
    }
    if (spec) {
      const q = await remote('prepare', spec);
      spec = null;
      await review(q);
      return;
    }
    title.textContent = 'Your private runs.';
    body.append(
      el(
        'p',
        `${usd(session.account.availableUsd)} available of ${usd(session.account.maximumUsd)} · ${usd(session.account.carriedPriorUsd)} carried prior usage · ${usd(session.account.heldUsd)} held`,
      ),
    );
    body.append(
      el(
        'p',
        'Choose a saved plan in the workspace to start a new run. A refresh never restarts a provider request. Uncertain requests need reconciliation.',
        { className: 'fine' },
      ),
    );
    if (!session.runs.length)
      body.append(
        el('p', 'No hosted runs yet. Prepare a policy, advisor request, or original suite first.'),
      );
    for (const r of session.runs) {
      const item = el('div', null, { className: 'note section-space' });
      item.append(
        el('strong', `${r.status} · ${r.completed}/${r.requests} requests`),
        el('p', `${r.planHash.slice(0, 16)}… · ${r.createdAt}`, { className: 'fine' }),
      );
      item.append(
        button(
          r.status === 'ready' || (r.status === 'running' && r.inflight === null)
            ? 'Review / continue'
            : 'Inspect / export',
          safe(async () =>
            r.status === 'ready' || (r.status === 'running' && r.inflight === null)
              ? review(r)
              : finished(r),
          ),
        ),
      );
      if (r.status === 'running')
        item.append(
          button(
            'Stop this run',
            safe(async () => {
              await remote('runs/' + r.id + '/stop', {});
              await home();
            }),
          ),
        );
      body.append(item);
    }
  }
  try {
    await home();
  } catch (e) {
    fail(e);
  }
}
