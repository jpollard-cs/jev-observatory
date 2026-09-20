const $ = (selector) => document.querySelector(selector);
const element = (tag, text, cls) => {
  const e = document.createElement(tag);
  if (text !== undefined) e.textContent = text;
  if (cls) e.className = cls;
  return e;
};
const link = (text, href, cls = 'text-link') => {
  const a = element('a', text, cls);
  a.href = href;
  return a;
};
const button = (text, action, cls = 'link-button') => {
  const b = element('button', text, cls);
  b.type = 'button';
  b.addEventListener('click', action);
  return b;
};
let signedIn = false,
  mine = false,
  nextOffset = null;
async function request(path, options = {}) {
  const response = await fetch('/api/community/' + path, {
    ...options,
    headers: {
      ...(options.method
        ? { 'Content-Type': 'application/json', 'X-Observatory-Intent': 'write' }
        : {}),
      ...options.headers,
    },
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message ?? 'This item could not be loaded.');
  return data;
}
function toast(text) {
  $('#toast').textContent = text;
  setTimeout(() => ($('#toast').textContent = ''), 6000);
}
function detail(title, nodes) {
  const target = $('#detail-body');
  target.replaceChildren(element('h2', title), ...nodes);
  $('#detail').showModal();
}
$('#close-detail').onclick = () => $('#detail').close();
$('#detail').addEventListener('click', (event) => {
  if (event.target === $('#detail')) {
    const r = event.target.getBoundingClientRect();
    if (
      event.clientX < r.left ||
      event.clientX > r.right ||
      event.clientY < r.top ||
      event.clientY > r.bottom
    )
      event.target.close();
  }
});
function download(name, value) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2) + '\n'], { type: 'application/json' }),
  );
  const a = link('', url);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function facts(entries) {
  const dl = element('dl');
  for (const [k, v] of entries) dl.append(element('dt', k), element('dd', String(v)));
  return dl;
}
function renderCatalog(catalog) {
  $('#profiles').replaceChildren(
    ...catalog.profiles.map((p, index) => {
      const card = element('article', undefined, 'card');
      card.append(
        element('div', 'PROFILE / 0' + (index + 1), 'card-number'),
        element('h3', p.name),
        element('p', p.description),
      );
      const chips = element('div', undefined, 'chips');
      for (const id of p.components) chips.append(element('span', id, 'chip'));
      card.append(chips);
      const actions = element('div', undefined, 'card-actions');
      actions.append(
        button('Inspect policy ↗', () => {
          const controls = element('div', undefined, 'detail-actions');
          controls.append(
            button(
              'Download JSON ↓',
              () => download(p.id + '.policy.json', p.document),
              'button subtle',
            ),
            link(
              'Propose a change on GitHub ↗',
              catalog.repository + '/blob/main/' + p.sourcePath,
            ),
          );
          detail(p.name, [
            element('p', p.description, 'muted'),
            facts([
              ['Content SHA-256', p.hash],
              ['Source', p.sourcePath],
            ]),
            controls,
            element('pre', JSON.stringify(p.document, null, 2)),
          ]);
        }),
        link('GitHub ↗', catalog.repository + '/blob/main/' + p.sourcePath),
      );
      card.append(actions);
      return card;
    }),
  );
  $('#components').replaceChildren(
    ...catalog.components.map((c) => {
      const card = element('article', undefined, 'component');
      card.append(
        element('h3', c.title),
        element('p', c.why),
        element('p', 'Tradeoff: ' + c.tradeoff),
        element('span', c.mandatory ? 'Shared safeguard' : 'Profile setting', 'chip'),
      );
      return card;
    }),
  );
}
function empty(title, message) {
  const box = element('div', undefined, 'empty');
  box.append(element('div', '◌', 'symbol'), element('h3', title), element('p', message));
  return box;
}
async function inspectResult(row) {
  try {
    const bundle = await request('results/' + row.id + '/download');
    const counts = facts([
      [
        'Evidence',
        row.evidenceStatus === 'host-observed'
          ? 'Host-observed · not a safety certification'
          : 'Legacy upload · ineligible for public sharing',
      ],
      ['Model', row.model],
      ['Valid answers', `${row.completed} / ${row.total} planned requests`],
      ['Missing or invalid answers', row.incomplete],
      ['Policy SHA-256', row.policyHash],
      ['Suite SHA-256', row.suiteHash],
      ['Bundle SHA-256', row.bundleHash],
      ['Evaluator source fingerprint', row.sourceRevision],
    ]);
    if (bundle.version === 2) {
      const manifest = bundle.provenance.settings.manifest;
      counts.append(
        element('dt', 'Run scope'),
        element(
          'dd',
          `${manifest.counts.selectedCases} / ${manifest.counts.catalogCases} catalog cases; ${bundle.provenance.settings.report.status}`,
        ),
      );
      counts.append(
        element('dt', 'Coverage gaps'),
        element(
          'dd',
          (manifest.coverage?.gaps ?? []).join(' ') ||
            'No gaps declared by this planner. This is not a core-suite regression certificate.',
        ),
      );
    }
    const actions = element('div', undefined, 'detail-actions');
    actions.append(
      link(
        'Download full bundle ↓',
        '/api/community/results/' + row.id + '/download',
        'button subtle',
      ),
    );
    if (bundle.provenance.pullRequest)
      actions.append(link('Review pull request ↗', bundle.provenance.pullRequest));
    const view = element('details');
    view.append(
      element('summary', 'Inspect the complete saved evidence'),
      element('pre', JSON.stringify(bundle, null, 2)),
    );
    const caseList = element('div');
    const expected = new Map(bundle.suite.definition.cases.map((x) => [x.id, x]));
    for (const observation of bundle.observations.slice(0, 100)) {
      const item = element('details');
      item.append(
        element('summary', observation.id + ' · ' + observation.status),
        element(
          'pre',
          JSON.stringify({ case: expected.get(observation.id), observation }, null, 2),
        ),
      );
      caseList.append(item);
    }
    if (bundle.observations.length > 100)
      caseList.append(
        element(
          'p',
          'Showing the first 100 cases. Download the complete bundle for all cases.',
          'muted',
        ),
      );
    detail(row.title, [counts, actions, element('h3', 'Case-by-case evidence'), caseList, view]);
  } catch (cause) {
    toast(cause.message);
  }
}
function resultCard(row) {
  const card = element('article', undefined, 'result'),
    main = element('div');
  main.append(
    element(
      'span',
      (row.evidenceStatus === 'host-observed' ? 'Host-observed' : 'Legacy upload · private only') +
        ' · ' +
        row.visibility,
      'badge',
    ),
    element('h3', row.title),
    element('p', row.policyName + ' · ' + row.model + ' · ' + row.author),
  );
  const links = element('div', undefined, 'links');
  links.append(
    button('Inspect evidence ↗', () => inspectResult(row)),
    link('Download ↓', '/api/community/results/' + row.id + '/download'),
  );
  if (row.owned) {
    if (row.evidenceStatus === 'host-observed' || row.visibility === 'public')
      links.append(
        button(row.visibility === 'public' ? 'Make private' : 'Share with community', async () => {
          try {
            await request('results/' + row.id, {
              method: 'PATCH',
              body: JSON.stringify({
                visibility: row.visibility === 'public' ? 'private' : 'public',
              }),
            });
            await loadResults();
            toast(
              row.visibility === 'public'
                ? 'Contribution is private.'
                : 'Contribution is shared with everyone who can access the site.',
            );
          } catch (e) {
            toast(e.message);
          }
        }),
      );
    links.append(
      button('Delete', async () => {
        if (
          !confirm(
            'Delete this uploaded contribution? Download a copy first if you need to keep it.',
          )
        )
          return;
        try {
          await request('results/' + row.id, { method: 'DELETE' });
          await loadResults();
        } catch (e) {
          toast(e.message);
        }
      }),
    );
  }
  main.append(links);
  const aside = element('aside', `${row.completed} / ${row.total}`);
  aside.append(
    element('small', 'requests with valid answers'),
    element('small', `${row.incomplete} missing or invalid`),
  );
  card.append(main, aside);
  return card;
}
async function loadResults(append = false) {
  try {
    const data = await request(
      'results?mine=' + (mine ? '1' : '0') + '&offset=' + (append ? nextOffset : 0),
    );
    if (!append) $('#results').replaceChildren();
    if (!data.items.length && !append)
      $('#results').append(
        empty(
          mine ? 'Your evidence starts here.' : 'No shared contributions yet.',
          mine
            ? 'Choose a saved hosted run below. Its contribution stays private until you share it.'
            : 'Explore the original research in the workspace. Shared hosted runs will appear here.',
        ),
      );
    for (const row of data.items) $('#results').append(resultCard(row));
    nextOffset = data.nextOffset;
    $('#more').hidden = nextOffset === null;
  } catch (e) {
    $('#results').replaceChildren(empty('Evidence is unavailable.', e.message));
    $('#more').hidden = true;
  }
}
function switchScope(value) {
  mine = value;
  $('#shared-tab').setAttribute('aria-pressed', !mine);
  $('#mine-tab').setAttribute('aria-pressed', mine);
  loadResults();
}
$('#shared-tab').onclick = () => switchScope(false);
$('#mine-tab').onclick = () => switchScope(true);
$('#more').onclick = () => loadResults(true);
$('#upload').addEventListener('submit', async (event) => {
  event.preventDefault();
  const status = $('#upload-status'),
    submit = $('#upload-button');
  if (!signedIn) {
    status.textContent =
      'Sign in to share a saved hosted run. External results can be reviewed through a GitHub PR.';
    return;
  }
  try {
    submit.disabled = true;
    status.textContent = 'Checking your saved run and assembling its complete evidence…';
    const form = new FormData(event.target);
    await request('results', {
      method: 'POST',
      body: JSON.stringify({
        author: form.get('author'),
        reviewedForSharing: form.get('reviewed') === 'on',
        runId: form.get('runId'),
      }),
    });
    status.textContent = 'Saved privately. Open My contributions to inspect and share it.';
    switchScope(true);
    document.querySelector('#evidence').scrollIntoView({ behavior: 'smooth' });
  } catch (e) {
    status.textContent = e.message;
  } finally {
    submit.disabled = false;
  }
});
const [catalog, session] = await Promise.allSettled([request('catalog'), request('session')]);
if (catalog.status === 'fulfilled') renderCatalog(catalog.value);
else $('#profiles').replaceChildren(empty('Library unavailable.', catalog.reason.message));
if (session.status === 'fulfilled') {
  signedIn = session.value.signedIn;
  if (signedIn) {
    const available = await request('runs').catch((error) => {
      $('#upload-status').textContent = error.message;
      return { runs: [] };
    });
    const select = $('#hosted-runs');
    select.replaceChildren(
      element(
        'option',
        available.runs.length ? 'Choose a saved run' : 'No eligible hosted policy evaluations yet',
      ),
    );
    select.firstChild.value = '';
    for (const run of available.runs) {
      const option = element(
        'option',
        `${run.policyName} · ${run.status} · ${run.completed}/${run.requests} recorded · ${new Date(run.createdAt).toLocaleString()}`,
      );
      option.value = run.id;
      select.append(option);
    }
    $('#account').textContent = 'My contributions';
    $('#account').href = '#evidence';
    $('#account').removeAttribute('target');
    $('#account').onclick = () => switchScope(true);
  } else
    $('#upload-status').textContent =
      'Sign in to select a saved hosted run. Browsing and downloads do not require an account.';
}
await loadResults();
