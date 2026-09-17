import test from 'node:test';
import assert from 'node:assert/strict';
import { sourceMetric, sourceTrend, historyDays, progressLabel, progressPercent, weightStatus } from '../src/metric-source.ts';

const metric = (day, source = 'aizhan', weight = 2) => ({ domain: 'example.com', domain_id: 'id', snapshot_date: day + 'T00:00:00Z', weight_source: source, weight_valid: true, baidu_pc_weight: weight, baidu_mobile_weight: weight, traffic_max: 50 });

test('nested snapshots take precedence and never inherit another source field', () => {
  const daily = metric('2026-09-16');
  daily.weight_snapshots = {
    aizhan: { valid: false, metric: metric('2026-09-16'), error_message: 'timeout' },
    chinaz: { valid: true, metric: { baidu_pc_weight: 0, baidu_mobile_weight: 0 } },
  };
  assert.equal(sourceMetric(daily, 'aizhan').weight_valid, false);
  assert.equal(sourceMetric(daily, 'chinaz').baidu_pc_weight, 0);
  assert.equal(sourceMetric(daily, 'chinaz').traffic_max, undefined);
  assert.equal(sourceMetric(daily, 'chinaz').snapshot_date, daily.snapshot_date);
  daily.weight_snapshots.chinaz = { valid: false, error_message: 'empty body' };
  assert.equal(sourceMetric(daily, 'chinaz').baidu_pc_weight, undefined);
  assert.equal(weightStatus(sourceMetric(daily, 'chinaz')), '本次获取失败');
});

test('legacy data belongs only to its known source', () => {
  const daily = metric('2026-09-15', 'chinaz', 0);
  assert.equal(sourceMetric(daily, 'chinaz').baidu_pc_weight, 0);
  assert.equal(sourceMetric(daily, 'aizhan'), undefined);
  delete daily.weight_source;
  assert.equal(sourceMetric(daily, 'chinaz'), undefined);
});

test('calendar gaps, failed source snapshots and missing indicators break a source line', () => {
  const items = [metric('2026-09-11'), metric('2026-09-12'), metric('2026-09-14'), metric('2026-09-15'), metric('2026-09-16', 'aizhan', 0)];
  items[3].weight_snapshots = { aizhan: { valid: false, metric: items[3] } };
  const days = historyDays(items, '2026-09-10', '2026-09-16');
  assert.equal(days.length, 7);
  const result = sourceTrend(items, 'aizhan', 'baidu_pc_weight', days);
  assert.deepEqual(result.values.map(p => [p.index, p.value]), [[1, 2], [2, 2], [4, 2], [6, 0]]);
  assert.deepEqual(result.segments.map(s => s.length), [2, 1, 1]);
  assert.equal(sourceTrend(items, 'chinaz', 'baidu_pc_weight', days).values.length, 0);
  assert.equal(sourceTrend(items, 'aizhan', 'backlink_count', days).values.length, 0);
});

test('same-day two-source values are independently available, including valid zero', () => {
  const daily = metric('2026-09-16');
  daily.weight_snapshots = { aizhan: { valid: true, metric: metric('2026-09-16') }, chinaz: { valid: true, metric: metric('2026-09-16', 'chinaz', 0) } };
  const days = historyDays([daily]);
  assert.equal(sourceTrend([daily], 'aizhan', 'baidu_pc_weight', days).values[0].value, 2);
  assert.equal(sourceTrend([daily], 'chinaz', 'baidu_pc_weight', days).values[0].value, 0);
});

test('unfinished queued tasks are not labeled complete and failures still count as ended', () => {
  const p = { total: 498, completed: 486, succeeded: 486, failed: 0, running: 0, queued: 12, pending: 0, canceled: 0, in_progress: true };
  assert.equal(progressPercent(p), 98);
  assert.equal(progressPercent({ ...p, completed: 497 }), 99);
  assert.equal(progressPercent({ ...p, completed: 498 }), 100);
  assert.equal(progressLabel(p), '排队 / 等待重试');
  assert.equal(progressLabel({ ...p, completed: 498, queued: 0, failed: 12, in_progress: false }), '已结束 · 有失败');
  assert.equal(progressLabel({ ...p, completed: 0, queued: 0, pending: 498, in_progress: false }), '等待入队');
  assert.equal(progressLabel({ ...p, running: 1 }), '采集中');
});
