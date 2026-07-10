export interface Domain {
  id: string
  domain: string
  display_name?: string
  active: boolean
  created_at: string
  updated_at: string
}

export interface Metric {
  id?: string
  domain_id: string
  domain: string
  snapshot_date: string
  collected_at: string
  traffic_text?: string
  traffic_min?: number
  traffic_max?: number
  baidu_pc_weight?: number
  baidu_mobile_weight?: number
  sogou_weight?: number
  bing_weight?: number
  so_360_weight?: number
  shenma_weight?: number
  pr_weight?: number
  apppc_pc_rank?: number
  site_category?: string
  backlink_count?: number
  registrant_name?: string
  registrant_email?: string
  domain_age_text?: string
  domain_age_days?: number
  expires_on?: string
  source_url: string
}

export interface LatestMetric {
  domain: Domain
  metric?: Metric
}

export interface SearchResponse {
  items: LatestMetric[]
  count: number
  total: number
  page: number
  limit: number
  field: string
  q: string
}

export interface MetricsResponse {
  items: Metric[]
  count: number
  from: string
  to: string
}

export interface ApiError {
  error?: string
  message?: string
}
