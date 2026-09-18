import type { CollectionJob, LatestMetric, SearchResponse, WeightSource } from './types'

export type FailureSource = WeightSource | 'legacy'
export interface FailedDomain {
  domain: LatestMetric['domain']
  job: CollectionJob
}

export function failedDomain(item: LatestMetric, source: FailureSource, date: string): FailedDomain | undefined {
  // Use the actual task state: invalid snapshots can also belong to jobs waiting for retry.
  const job = source === 'legacy' ? item.collection : item.weight_collections?.[source]
  if (!job || job.status !== 'failed' || !date || job.snapshot_date.slice(0, 10) !== date.slice(0, 10)) return
  return { domain: item.domain, job }
}

export async function loadFailedDomains(
  source: FailureSource,
  date: string,
  fetchPage: (page: number) => Promise<SearchResponse>,
): Promise<FailedDomain[]> {
  const failures = new Map<string, FailedDomain>()
  let loaded = 0
  for (let page = 1; ; page++) {
    const result = await fetchPage(page)
    for (const item of result.items || []) {
      const failure = failedDomain(item, source, date)
      if (failure) failures.set(item.domain.id, failure)
    }
    loaded += result.items?.length || 0
    if (loaded >= result.total) break
    if (!result.items?.length) throw new Error('域名数据未完整返回，请刷新重试')
  }
  return [...failures.values()]
}
