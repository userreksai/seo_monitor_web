import type { ApiError, CertificateSearchResponse, MetricsResponse, SearchResponse } from './types'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers)
  if (init?.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')

  const response = await fetch(path, { ...init, headers })
  if (!response.ok) {
    let detail: ApiError = {}
    try {
      detail = (await response.json()) as ApiError
    } catch {
      // Keep the HTTP status as fallback for non-JSON proxy errors.
    }
    throw new Error(detail.error || detail.message || `${response.status} ${response.statusText}`)
  }
  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

export function searchLatest(field: string, query: string, page: number, limit: number) {
  const params = new URLSearchParams({ field, q: query, page: String(page), limit: String(limit) })
  return request<SearchResponse>(`/api/v1/search?${params}`)
}

export function createDomain(domain: string, displayName: string) {
  return request('/api/v1/domains', {
    method: 'POST',
    body: JSON.stringify({ domain, display_name: displayName.trim() || null }),
  })
}

export function archiveDomain(id: string) {
  return request<void>(`/api/v1/domains/${id}`, { method: 'DELETE' })
}

export function collectDomain(id: string, force = false) {
  return request<{ queued: boolean; message?: string }>(`/api/v1/domains/${id}/collect`, {
    method: 'POST',
    body: JSON.stringify({ force }),
  })
}

export function collectAll() {
  return request<{ queued: number; snapshot_date: string }>('/api/v1/collect', { method: 'POST' })
}

export function getMetrics(id: string) {
  return request<MetricsResponse>(`/api/v1/domains/${id}/metrics`)
}

export function listCertificates(query: string, status: string, page: number, limit: number) {
  const params = new URLSearchParams({ q: query, status, page: String(page), limit: String(limit) })
  return request<CertificateSearchResponse>(`/api/v1/certificates?${params}`)
}

export function refreshCertificates() {
  return request<{ started: boolean; message: string }>('/api/v1/certificates/refresh', {
    method: 'POST',
  })
}
