import type { Metric, WeightSource, CollectionProgress } from './types'

export function weightSource(metric?: Metric): 'aizhan' | 'chinaz' | 'unknown' {
  if (metric?.weight_source === 'aizhan' || metric?.weight_source === 'chinaz') return metric.weight_source
  return 'unknown'
}

export function weightSourceLabel(metric?: Metric): string {
  return { aizhan: '爱站', chinaz: '站长之家', unknown: '来源未确认' }[weightSource(metric)] || '来源未确认'
}

export function weightUsable(metric?: Metric): boolean {
  return metric?.weight_valid === true && weightSource(metric) !== 'unknown'
    && [metric.baidu_pc_weight, metric.baidu_mobile_weight].every(value => typeof value === 'number' && value >= 0 && value <= 10)
}

export function weightStatus(metric?: Metric): string {
  if (!metric) return '未取得该源数据'
  if (metric.weight_valid === false) return metric.baidu_pc_weight == null && metric.baidu_mobile_weight == null ? '本次获取失败' : '本次未获取，保留旧值'
  if (metric.baidu_pc_weight == null && metric.baidu_mobile_weight == null) return '尚未取得权重'
  if (!weightUsable(metric)) return '历史数据未校验，不参与通知'
  return '采集有效'
}

export function canConnectWeights(previous?: Metric, current?: Metric): boolean {
  if (!weightUsable(previous) || !weightUsable(current)) return false
  if (weightSource(previous) !== weightSource(current)) return false
  return Date.parse(current!.snapshot_date.slice(0, 10)) - Date.parse(previous!.snapshot_date.slice(0, 10)) === 86400000
}

export const weightSources = [
  { source: 'aizhan', label: '爱站', host: 'www.aizhan.com' },
  { source: 'chinaz', label: '站长之家', host: 'seo.chinaz.com' },
] as const

// A source's missing fields must never be filled from the selected top-level
// result: that result may belong to the other provider.
export function sourceMetric(metric: Metric | undefined, source: WeightSource): Metric | undefined {
  if (!metric) return undefined
  const snapshot = metric.weight_snapshots?.[source]
  if (snapshot) {
    return {
      collected_at: '', source_url: '', ...snapshot.metric,
      domain: metric.domain, domain_id: metric.domain_id, snapshot_date: metric.snapshot_date,
      weight_source: source, weight_valid: snapshot.valid,
    }
  }
  return metric.weight_source === source ? metric : undefined
}

export function progressPercent(progress?: CollectionProgress): number {
  if (!progress?.total) return 0
  const percent = Math.max(0, Math.min(100, Math.round(progress.completed / progress.total * 100)))
  return progress.completed < progress.total ? Math.min(99, percent) : percent
}

export function progressLabel(progress: CollectionProgress): string {
  if (progress.running > 0) return '采集中'
  if (progress.queued > 0) return '排队 / 等待重试'
  if (progress.pending > 0) return '等待入队'
  if (!progress.total) return '暂无任务'
  if (progress.completed < progress.total || progress.in_progress) return '等待状态更新'
  return progress.failed > 0 ? '已结束 · 有失败' : progress.canceled > 0 ? '已结束 · 有取消' : '已完成'
}

// Use calendar spacing, including days without a response. Index spacing of
// the returned records would hide missing days and visually bridge gaps.
export function historyDays(items: Metric[], from?: string, to?: string): string[] {
  const dates = items.map(item => item.snapshot_date.slice(0, 10)).sort()
  const first = (from || dates[0] || '').slice(0, 10)
  const last = (to || dates.at(-1) || '').slice(0, 10)
  const start = Date.parse(first), end = Date.parse(last)
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return []
  const result: string[] = []
  for (let day = Math.max(start, end - 365 * 86400000); day <= end; day += 86400000) {
    result.push(new Date(day).toISOString().slice(0, 10))
  }
  return result
}

export function sourceTrend(items: Metric[], source: WeightSource, field: keyof Metric, days: string[]) {
  const byDate = new Map(items.map(item => [item.snapshot_date.slice(0, 10), sourceMetric(item, source)]))
  const values = days.flatMap((day, index) => {
    const metric = byDate.get(day), value = metric?.[field]
    return weightUsable(metric) && typeof value === 'number' && Number.isFinite(value)
      ? [{ day, index, value }] : []
  })
  const segments: typeof values[] = []
  for (const point of values) {
    const segment = segments.at(-1), previous = segment?.at(-1)
    if (previous && point.index === previous.index + 1) segment!.push(point)
    else segments.push([point])
  }
  return { byDate, values, segments }
}
