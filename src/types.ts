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

export interface CertificateInfo {
  id?: string
  domain_id: string
  domain: string
  issuer?: string
  subject?: string
  serial_number?: string
  dns_names?: string[]
  valid_from?: string
  expires_at?: string
  check_date?: string
  checked_at: string
  hostname_valid: boolean
  check_source?: string
  resolved_address?: string
  error_message?: string
}

export interface LatestCertificate {
  domain: Domain
  certificate?: CertificateInfo
}

export interface CertificateSearchResponse {
  items: LatestCertificate[]
  count: number
  total: number
  page: number
  limit: number
  q: string
  status: string
  summary: CertificateSummary
}

export interface CertificateHistoryResponse {
  items: CertificateInfo[]
  count: number
}

export interface CertificateSummary {
  total: number
  checked: number
  expiring_soon: number
  expired: number
  failed: number
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
