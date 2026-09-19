import { createCredentialSession } from './credential-session.mjs';
export const credentialSession = createCredentialSession();
let shell, connection, runHost, status, input, controls, next;

const node = (tag, text, className = '') => {
  const element = document.createElement(tag);
  if (text) element.textContent = text;
  element.className = className;
  return element;
};
function actionButton(label, fn) {
  const button = node('button', label, 'btn small');
  button.type = 'button';
  button.addEventListener('click', fn);
  return button;
}
function refresh() {
  const state = credentialSession.status();
  status.textContent = state.ready ? 'Jev key ready · this tab only' : 'Optional Jev guidance';
  controls.hidden = state.ready;
  next.hidden = !state.ready;
  if (state.ready) connection.open = false;
}
export function mountHostedAssistant(anchor) {
  if (!shell) {
    shell = node('section', '', 'content hosted-assistant');
    shell.id = 'hosted-assistant';
    shell.setAttribute('aria-label', 'Jev session and execution');
    connection = node('details', '', 'card hosted-session');
    connection.open = true;
    const summary = node('summary', '', 'card-body');
    status = node('strong');
    summary.append(status);
    const body = node('div', '', 'card-body');
    body.append(
      node(
        'p',
        'Use Jev to suggest policy settings and relevant tests, or build everything yourself. Each paid step shows its cost before you run it.',
        'fine',
      ),
    );
    controls = node('div');
    const label = node('label', '', 'field');
    input = node('input');
    input.type = 'password';
    input.autocomplete = 'off';
    input.maxLength = 4096;
    input.spellcheck = false;
    input.setAttribute('autocapitalize', 'off');
    label.append(node('span', 'Jev API key for this session'), input);
    const error = node('p', '', 'note warn');
    error.hidden = true;
    error.setAttribute('role', 'status');
    controls.append(label, error);
    const connect = () => {
      const value = input.value;
      input.value = '';
      try {
        credentialSession.connect(value);
        error.hidden = true;
      } catch (e) {
        error.textContent = e.message;
        error.hidden = false;
      }
    };
    controls.append(
      actionButton('Use key for this session', connect),
      actionButton('Continue without Jev', () => {
        input.value = '';
        connection.open = false;
      }),
    );
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        connect();
      }
    });
    next = node('div', '', 'actions');
    next.append(
      actionButton('Disconnect / forget key', () => {
        credentialSession.forget();
        connection.open = true;
      }),
    );
    body.append(
      controls,
      next,
      node(
        'p',
        'The key stays in this tab’s memory for up to 30 minutes. Reload or disconnect to forget it. Only authorized requests send it through this service to TypeSafe; it is never saved in browser or server storage.',
        'fine section-space',
      ),
    );
    connection.append(summary, body);
    runHost = node('div');
    runHost.id = 'hosted-run-inline';
    shell.append(connection, runHost);
    credentialSession.subscribe(refresh);
    window.addEventListener('pagehide', () => {
      input.value = '';
      credentialSession.forget();
    });
    refresh();
  }
  if (shell.parentElement !== anchor.parentElement || shell.nextElementSibling !== anchor)
    anchor.before(shell);
  return runHost;
}
export function hostedRunContainer() {
  if (!runHost) throw Error('Open the browser workspace before starting a hosted run.');
  return runHost;
}
export function showHostedConnection() {
  connection.open = true;
  connection.scrollIntoView({ block: 'center', behavior: 'smooth' });
  if (!credentialSession.status().ready) input.focus({ preventScroll: true });
}
