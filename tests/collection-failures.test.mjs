import test from 'node:test';
import assert from 'node:assert/strict';
import { failedDomain, loadFailedDomains } from '../src/collection-failures.ts';

const date = '2026-09-18';
const job = (status, day = date) => ({ status, snapshot_date: `${day}T00:00:00Z`, error_message: 'timeout' });
const item = (id) => ({ domain: { id, domain: `${id}.example.com` }, collection: job('succeeded'), weight_collections: { aizhan: job('failed'), chinaz: job('succeeded') } });

test('source failures use task state even when aggregate or other source succeeds', () => {
  const domain = item('one');
  assert.equal(failedDomain(domain, 'aizhan', date).job.error_message, 'timeout');
  assert.equal(failedDomain(domain, 'chinaz', date), undefined);
  assert.equal(failedDomain(domain, 'legacy', date), undefined);
});

test('exclude yesterday, pending retries, canceled jobs and absent source jobs', () => {
  for (const candidate of [job('failed', '2026-09-17'), job('queued'), job('running'), job('canceled'), undefined]) {
    const domain = item('one');
    domain.weight_collections.aizhan = candidate;
    domain.collection = job('failed');
    domain.metric = { weight_snapshots: { aizhan: { valid: false, error_message: 'old failure' } } };
    assert.equal(failedDomain(domain, 'aizhan', date), undefined);
  }
  assert.equal(failedDomain(item('one'), 'aizhan', ''), undefined);
});

test('legacy card shows aggregate failures only for its snapshot day', () => {
  const domain = item('legacy');
  domain.collection = job('failed');
  assert.equal(failedDomain(domain, 'legacy', date).domain.id, 'legacy');
  assert.equal(failedDomain(domain, 'legacy', '2026-09-19'), undefined);
});

test('load all pages, including failures outside current table page; deduplicate domains', async () => {
  const called = [];
  const result = await loadFailedDomains('aizhan', date, async page => {
    called.push(page);
    return { total: 3, items: page === 1 ? [item('one'), item('one')] : [item('two')] };
  });
  assert.deepEqual(called, [1, 2]);
  assert.deepEqual(result.map(row => row.domain.id), ['one', 'two']);
});

test('failed or incomplete later pages reject instead of presenting a partial list', async () => {
  await assert.rejects(loadFailedDomains('aizhan', date, async page => {
    if (page === 2) throw new Error('offline');
    return { total: 2, items: [item('one')] };
  }), /offline/);
  await assert.rejects(loadFailedDomains('aizhan', date, async () => ({ total: 2, items: [] })), /未完整返回/);
});
