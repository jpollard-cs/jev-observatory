import test from 'node:test';
import assert from 'node:assert/strict';
import { createCredentialSession } from '../src/workspace/credential-session.mjs';

const KEY = 'SYNTHETIC_SESSION_KEY_NOT_A_CREDENTIAL';
function fixture() {
  let clock = 100,
    expire;
  const session = createCredentialSession({
    now: () => clock,
    ttlMs: 1000,
    schedule: (fn) => {
      expire = fn;
      return 1;
    },
    cancel: () => {
      expire = null;
    },
  });
  return {
    session,
    advance: (ms) => {
      clock += ms;
    },
    expire: () => expire?.(),
  };
}
test('one connection supplies successive explicitly requested operations without exposing the key in status', async () => {
  const { session } = fixture();
  let calls = 0;
  assert.throws(() => session.use(() => {}), /Add your Jev key/);
  const status = session.connect(KEY);
  assert.equal(status.ready, true);
  assert.equal(calls, 0);
  assert.ok(!JSON.stringify({ status, session }).includes(KEY));
  for (let i = 0; i < 2; i++)
    await session.use(async (key) => {
      assert.equal(key, KEY);
      calls++;
    });
  assert.equal(calls, 2);
  assert.equal(session.status().ready, true);
});
test('disconnect and expiration revoke later dispatch, including when browser timers are delayed', () => {
  const f = fixture(),
    updates = [];
  const unsubscribe = f.session.subscribe((x) => updates.push(x));
  f.session.connect(KEY);
  f.session.forget();
  assert.throws(() => f.session.use(() => assert.fail()), /Add your Jev key/);
  f.session.connect(KEY);
  f.advance(1001);
  assert.throws(() => f.session.use(() => assert.fail()), /Add your Jev key/);
  f.session.connect(KEY);
  f.expire();
  assert.equal(f.session.status().ready, false);
  assert.ok(updates.every((x) => !JSON.stringify(x).includes(KEY)));
  unsubscribe();
});
test('errors never include a rejected key and request failures do not silently retry', async () => {
  const { session } = fixture();
  assert.throws(
    () => session.connect('secret'),
    (error) => !error.message.includes('secret'),
  );
  session.connect(KEY);
  let calls = 0;
  await assert.rejects(
    session.use(async () => {
      calls++;
      throw Error('Network unavailable');
    }),
  );
  assert.equal(calls, 1);
  assert.equal(session.status().ready, true);
  session.forget();
});
