import type {
  ApiError,
  AuthUser,
  CertificateHistoryResponse,
  CertificateSearchResponse,
  CollectionProgress,
  LoginResponse,
  MetricsResponse,
  SearchResponse,
  TaskProgress,
	TitleHistoryResponse,
	TitleSearchResponse,
} from './types'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers)
  if (init?.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
	const method = (init?.method || 'GET').toUpperCase()
	if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) headers.set('X-CSRF-Protection', '1')

	const response = await fetch(path, { ...init, headers, credentials: 'same-origin' })
  if (!response.ok) {
    let detail: ApiError = {}
    try {
      detail = (await response.json()) as ApiError
    } catch {
      // Keep the HTTP status as fallback for non-JSON proxy errors.
    }
    const message = detail.error || detail.message || `${response.status} ${response.statusText}`
    if (response.status === 401 && path !== '/api/v1/auth/login') {
      window.dispatchEvent(new CustomEvent('auth:unauthorized', { detail: message }))
    }
    throw new Error(message)
  }
  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

export function login(username: string, password: string) {
  return request<LoginResponse>('/api/v1/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  })
}

export function getCurrentUser() {
  return request<{ user: AuthUser }>('/api/v1/auth/me')
}

export function logout() {
  return request<void>('/api/v1/auth/logout', { method: 'POST' })
}

export function changePassword(currentPassword: string, newPassword: string) {
	return request<void>('/api/v1/auth/password', {
		method: 'POST',
		body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
	})
}

export function searchLatest(
  field: string,
  query: string,
  page: number,
  limit: number,
  status = '',
  sortBy = '',
  sortOrder = '',
) {
  const params = new URLSearchParams({
    field,
    q: query,
    page: String(page),
    limit: String(limit),
    status,
    sort_by: sortBy,
    sort_order: sortOrder,
  })
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

export function getCollectionProgress() {
  return request<CollectionProgress>('/api/v1/collect/progress')
}

export function getMetrics(id: string) {
  return request<MetricsResponse>(`/api/v1/domains/${id}/metrics`)
}

export function listCertificates(query: string, status: string, page: number, limit: number) {
  const params = new URLSearchParams({ q: query, status, page: String(page), limit: String(limit) })
  return request<CertificateSearchResponse>(`/api/v1/certificates?${params}`)
}

export function refreshCertificates() {
  return request<{ started: boolean; message: string; progress: TaskProgress }>('/api/v1/certificates/refresh', {
    method: 'POST',
  })
}

export function getCertificateProgress() {
  return request<TaskProgress>('/api/v1/certificates/progress')
}

export function getCertificateHistory(id: string) {
  return request<CertificateHistoryResponse>(`/api/v1/certificates/${id}/history`)
}

export function listTitles(query: string, status: string, page: number, limit: number) {
	const params = new URLSearchParams({ q: query, status, page: String(page), limit: String(limit) })
	return request<TitleSearchResponse>(`/api/v1/titles?${params}`)
}

export function refreshTitles() {
	return request<{ started: boolean; message: string; progress: TaskProgress }>('/api/v1/titles/refresh', {
		method: 'POST',
	})
}

export function getTitleProgress() {
	return request<TaskProgress>('/api/v1/titles/progress')
}

export function getTitleHistory(id: string) {
	return request<TitleHistoryResponse>(`/api/v1/titles/${id}/history`)
}
