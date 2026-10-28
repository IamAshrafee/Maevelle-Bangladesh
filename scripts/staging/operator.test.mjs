import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseOptions, sshRequest, workflow } from './operator.mjs';

const sha = 'a'.repeat(40);
const options = { action: 'deploy', sha, host: 'maevelle-staging', engine: 'docker' };
const plan = {
  targetCommit: sha,
  changedImages: ['api'],
  selectedServices: ['api', 'admin', 'storefront', 'worker'],
  appliedMigrations: 51,
  pendingMigrations: [],
  blockedByMigration: false,
  restartOrder: [
    'stop worker',
    'restart api',
    'restart admin',
    'restart storefront',
    'start worker',
  ],
};

function mock(overrides = {}) {
  const calls = [];
  const dependencies = {
    fetchRelease: async (commit) => {
      calls.push('fetch');
      assert.equal(commit, sha);
      return {
        ref: `ghcr.io/iamashrafee/maevelle-release@sha256:${'b'.repeat(64)}`,
        path: '/tmp/synthetic.json',
      };
    },
    transfer: () => calls.push('transfer'),
    remoteJson: (_host, request) => {
      calls.push(request.action);
      if (request.action === 'plan') return plan;
      if (request.action === 'apply' || request.action === 'verify')
        return {
          outcome: 'verified',
          checks: { verifiedServices: ['api', 'worker', 'admin', 'storefront'] },
        };
      return { recordedCommit: sha, appliedMigrations: 51, targetPlan: plan };
    },
    approval: async () => {
      calls.push('approval');
      return true;
    },
    log: () => {},
    ...overrides,
  };
  return { calls, dependencies };
}

test('deploy plans, requires approval, then applies and verifies', async () => {
  const { calls, dependencies } = mock();
  const result = await workflow(options, dependencies);
  assert.equal(result.status.recordedCommit, sha);
  assert.deepEqual(calls, ['fetch', 'transfer', 'plan', 'approval', 'apply', 'status']);
});

test('pending migrations block before approval and apply', async () => {
  const { calls, dependencies } = mock({
    remoteJson: (_host, request) => {
      calls.push('plan');
      assert.equal(request.action, 'plan');
      return { ...plan, pendingMigrations: ['5100_next'], blockedByMigration: true };
    },
  });
  await assert.rejects(workflow(options, dependencies), /Pending migrations block/);
  assert.deepEqual(calls, ['fetch', 'transfer', 'plan']);
});

test('declined approval leaves running release untouched', async () => {
  const { calls, dependencies } = mock({
    approval: async () => {
      calls.push('approval');
      return false;
    },
  });
  await assert.rejects(workflow(options, dependencies), /not approved/);
  assert.deepEqual(calls, ['fetch', 'transfer', 'plan', 'approval']);
});

test('unavailable release and bad manifest stop before transfer', async () => {
  for (const message of [
    'No published GHCR release',
    'Release manifest has missing or unexpected fields',
  ]) {
    const { calls, dependencies } = mock({
      fetchRelease: async () => {
        calls.push('fetch');
        throw new Error(message);
      },
    });
    await assert.rejects(workflow(options, dependencies), new RegExp(message));
    assert.deepEqual(calls, ['fetch']);
  }
});

test('failed apply reports remote attempt and permits a new attempt', async () => {
  let attempts = 0;
  const { calls, dependencies } = mock({
    remoteJson: (_host, request) => {
      if (request.action === 'plan') {
        calls.push('plan');
        return plan;
      }
      if (request.action === 'apply') {
        calls.push('apply');
        if (++attempts === 1) throw new Error('service restart/readiness failed');
        return { outcome: 'verified', checks: { verifiedServices: ['api'] } };
      }
      calls.push('status');
      return {
        recordedCommit: attempts === 1 ? 'c'.repeat(40) : sha,
        appliedMigrations: 51,
        lastAttempt: {
          outcome: attempts === 1 ? 'failed' : 'verified',
          failedStep: 'service restart/readiness',
        },
        targetPlan: plan,
      };
    },
  });
  await assert.rejects(workflow(options, dependencies), /service restart\/readiness failed/);
  assert.equal((await workflow(options, dependencies)).status.recordedCommit, sha);
  assert.equal(calls.filter((call) => call === 'apply').length, 2);
});

test('independent verify does not plan or apply', async () => {
  const { calls, dependencies } = mock();
  await workflow({ ...options, action: 'verify' }, dependencies);
  assert.deepEqual(calls, ['fetch', 'transfer', 'verify', 'status']);
});

test('rejects incomplete commit and unsafe SSH host', () => {
  assert.throws(() => parseOptions(['deploy', '--sha', 'abc']), /full 40-character/);
  assert.throws(
    () => parseOptions(['deploy', '--sha', sha, '--host', '-oProxyCommand=evil']),
    /SSH host/,
  );
});

test('help is successful without SSH or GHCR access', async () => {
  const lines = [];
  assert.deepEqual(parseOptions(['--help']), { action: 'help' });
  await workflow({ action: 'help' }, { log: (line) => lines.push(line) });
  assert.match(lines[0], /Usage: pnpm staging/);
});

test('SSH transport uses fixed no-argument gateway after successful key connection', () => {
  let captured;
  const output = sshRequest('maevelle-staging', { action: 'status' }, (command, args, input) => {
    captured = { command, args, input };
    return '{"recordedCommit":null}';
  });
  assert.equal(output, '{"recordedCommit":null}');
  assert.equal(captured.command, 'ssh');
  assert.equal(captured.args.at(-2), 'maevelle-staging');
  assert.equal(captured.args.at(-1), 'sudo -n /usr/local/libexec/maevelle-staging-operator');
  assert.equal(JSON.parse(captured.input).action, 'status');
  assert.throws(() => sshRequest('-oProxyCommand=id', { action: 'status' }, () => {}), /SSH host/);
});
