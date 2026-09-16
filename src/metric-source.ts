import type { Metric } from './types'

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
  if (!metric || (metric.baidu_pc_weight == null && metric.baidu_mobile_weight == null)) return '尚未取得权重'
  if (metric.weight_valid === false) return '本次未获取，保留旧值'
  if (!weightUsable(metric)) return '历史数据未校验，不参与通知'
  return '采集有效'
}

export function canConnectWeights(previous?: Metric, current?: Metric): boolean {
  if (!weightUsable(previous) || !weightUsable(current)) return false
  if (weightSource(previous) !== weightSource(current)) return false
  return Date.parse(current!.snapshot_date.slice(0, 10)) - Date.parse(previous!.snapshot_date.slice(0, 10)) === 86400000
}
