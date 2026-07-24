<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { getCertificateHistory, listCertificates, refreshCertificates } from './api'
import type { CertificateInfo, CertificateSummary, LatestCertificate } from './types'

type CertificateStatusFilter = '' | 'checked' | 'expiring' | 'expired' | 'failed'

const items = ref<LatestCertificate[]>([])
const loading = ref(false)
const refreshing = ref(false)
const total = ref(0)
const page = ref(1)
const limit = ref(20)
const query = ref('')
const appliedQuery = ref('')
const statusFilter = ref<CertificateStatusFilter>('')
const emptySummary = (): CertificateSummary => ({ total: 0, checked: 0, expiring_soon: 0, expired: 0, failed: 0 })
const summary = reactive<CertificateSummary>(emptySummary())
const notice = reactive({ text: '', error: false })
const history = reactive({
  open: false,
  loading: false,
  domain: '',
  items: [] as CertificateInfo[],
})

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / limit.value)))
const statusFilterLabel = computed(() => {
  if (statusFilter.value === 'checked') return '全部已检测'
  if (statusFilter.value === 'expiring') return '30 天内到期'
  if (statusFilter.value === 'expired') return '已过期'
  if (statusFilter.value === 'failed') return '检测失败'
  return ''
})

let noticeTimer = 0
function showNotice(text: string, error = false) {
  notice.text = text
  notice.error = error
  window.clearTimeout(noticeTimer)
  noticeTimer = window.setTimeout(() => (notice.text = ''), 4200)
}

async function load() {
  loading.value = true
  try {
    const result = await listCertificates(appliedQuery.value, statusFilter.value, page.value, limit.value)
    items.value = result.items || []
    total.value = result.total
    Object.assign(summary, result.summary || emptySummary())
    if (page.value > totalPages.value) {
      page.value = totalPages.value
      await load()
    }
  } catch (error) {
    showNotice(messageOf(error), true)
  } finally {
    loading.value = false
  }
}

function search() {
  appliedQuery.value = query.value.trim()
  page.value = 1
  void load()
}

function resetSearch() {
  query.value = ''
  appliedQuery.value = ''
  statusFilter.value = ''
  page.value = 1
  void load()
}

function toggleStatus(status: Exclude<CertificateStatusFilter, ''>) {
  statusFilter.value = statusFilter.value === status ? '' : status
  page.value = 1
  void load()
}

function clearStatus() {
  statusFilter.value = ''
  page.value = 1
  void load()
}

function changePage(next: number) {
  if (next < 1 || next > totalPages.value || next === page.value) return
  page.value = next
  void load()
}

async function startRefresh() {
  refreshing.value = true
  try {
    const result = await refreshCertificates()
    showNotice(result.message || (result.started ? '证书检测任务已启动' : '证书检测任务正在执行'))
  } catch (error) {
    showNotice(messageOf(error), true)
  } finally {
    refreshing.value = false
  }
}

async function openHistory(item: LatestCertificate) {
  history.open = true
  history.loading = true
  history.domain = item.domain.domain
  history.items = []
  try {
    const result = await getCertificateHistory(item.domain.id)
    history.items = result.items || []
  } catch (error) {
    showNotice(messageOf(error), true)
    history.open = false
  } finally {
    history.loading = false
  }
}

function daysRemaining(value?: string) {
  if (!value) return undefined
  const expires = new Date(value).getTime()
  if (Number.isNaN(expires)) return undefined
  const difference = expires - Date.now()
  return difference < 0 ? Math.floor(difference / 86_400_000) : Math.ceil(difference / 86_400_000)
}

function certificateStatus(certificate?: CertificateInfo) {
  if (!certificate) return { label: '待检测', className: 'pending' }
  if (certificate.error_message) return { label: '检测失败', className: 'error' }
  if (!certificate.hostname_valid) return { label: '域名不匹配', className: 'warning' }
  const days = daysRemaining(certificate.expires_at)
  if (days === undefined) return { label: '信息不完整', className: 'pending' }
  if (days < 0) return { label: '已过期', className: 'error' }
  if (days <= 30) return { label: '即将到期', className: 'warning' }
  return { label: '有效', className: 'healthy' }
}

function statusOf(item: LatestCertificate) {
  return certificateStatus(item.certificate)
}

function remainingText(value?: string) {
  const days = daysRemaining(value)
  if (days === undefined) return '—'
  if (days < 0) return `已过期 ${Math.abs(days)} 天`
  if (days === 0) return '今天到期'
  return `${days} 天`
}

function dateText(value?: string, withTime = false) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  }).format(date)
}

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : '请求失败，请稍后重试'
}

onMounted(load)
</script>

<template>
  <main class="certificate-main">
    <section class="summary-grid" aria-label="证书概览">
      <article class="summary-card">
        <span>监控域名</span><strong>{{ summary.total }}</strong><small>当前搜索结果</small>
      </article>
      <article class="summary-card">
        <span>全部已检测</span><strong>{{ summary.checked }}</strong><small>全部检测数据</small>
      </article>
      <button class="summary-card summary-filter-card warning-card" :class="{ active: statusFilter === 'expiring' }" type="button" :aria-pressed="statusFilter === 'expiring'" @click="toggleStatus('expiring')">
        <span>30 天内到期</span><strong>{{ summary.expiring_soon }}</strong><small>{{ statusFilter === 'expiring' ? '再次点击取消筛选' : '点击查看全部' }}</small>
      </button>
      <button class="summary-card summary-filter-card danger-card" :class="{ active: statusFilter === 'expired' }" type="button" :aria-pressed="statusFilter === 'expired'" @click="toggleStatus('expired')">
        <span>已过期</span><strong>{{ summary.expired }}</strong><small>{{ statusFilter === 'expired' ? '再次点击取消筛选' : '点击查看全部' }}</small>
      </button>
      <button class="summary-card summary-filter-card failure-card" :class="{ active: statusFilter === 'failed' }" type="button" :aria-pressed="statusFilter === 'failed'" @click="toggleStatus('failed')">
        <span>检测失败</span><strong>{{ summary.failed }}</strong><small>{{ statusFilter === 'failed' ? '再次点击取消筛选' : '点击查看全部' }}</small>
      </button>
    </section>

    <section class="panel certificate-toolbar">
      <div>
        <h2>SSL 证书信息</h2>
        <p>自动读取域名 443 端口的当前证书；每日轮询记录保留一周，连续失败时额外保留上一周有效数据。</p>
      </div>
      <div class="toolbar-actions">
        <button class="button ghost" :disabled="loading" @click="load">刷新数据</button>
        <button class="button primary" :disabled="refreshing" @click="startRefresh">
          {{ refreshing ? '正在提交…' : '检测全部证书' }}
        </button>
      </div>
    </section>

    <section class="panel search-panel">
      <form class="certificate-search" @submit.prevent="search">
        <label>
          <span>域名或显示名称</span>
          <input v-model="query" type="search" placeholder="输入域名关键词" />
        </label>
        <button class="button primary" type="submit">搜索</button>
        <button class="button ghost" type="button" @click="resetSearch">重置</button>
      </form>
      <p v-if="statusFilter" class="certificate-filter-tip">
        当前显示：{{ statusFilterLabel }}，共 {{ total }} 条
        <button type="button" @click="clearStatus">清除筛选</button>
      </p>
    </section>

    <section class="panel table-panel">
      <div class="table-heading">
        <div><h2>域名证书列表</h2><p>即将到期按 30 天以内计算</p></div>
        <label class="page-size">每页
          <select v-model.number="limit" @change="page = 1; load()">
            <option :value="10">10</option><option :value="20">20</option><option :value="50">50</option><option :value="100">100</option>
          </select>
        </label>
      </div>

      <div class="table-wrap">
        <table class="certificate-table">
          <thead>
            <tr><th>域名</th><th>证书到期时间</th><th>剩余时间</th><th>状态</th><th>颁发机构</th><th>最近检测</th><th>操作</th></tr>
          </thead>
          <tbody>
            <tr v-if="loading"><td colspan="7"><div class="empty-state"><span class="spinner"></span>正在读取证书信息…</div></td></tr>
            <tr v-else-if="!items.length"><td colspan="7"><div class="empty-state">没有符合条件的证书信息</div></td></tr>
            <tr v-for="item in items" v-else :key="item.domain.id">
              <td class="certificate-domain">
                <strong>{{ item.domain.domain }}</strong>
                <span>{{ item.domain.display_name || '未设置显示名称' }}</span>
              </td>
              <td><strong>{{ dateText(item.certificate?.expires_at) }}</strong><small v-if="item.certificate?.valid_from">生效：{{ dateText(item.certificate.valid_from) }}</small></td>
              <td><strong>{{ remainingText(item.certificate?.expires_at) }}</strong></td>
              <td><span class="status-badge" :class="statusOf(item).className">{{ statusOf(item).label }}</span></td>
              <td class="issuer-cell"><strong>{{ item.certificate?.issuer || '—' }}</strong><small v-if="item.certificate?.error_message" :title="item.certificate.error_message">{{ item.certificate.error_message }}</small></td>
              <td>{{ dateText(item.certificate?.checked_at, true) }}</td>
              <td><button class="history-button" type="button" @click="openHistory(item)">轮询记录</button></td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="pagination">
        <span>共 {{ total }} 条，第 {{ page }} / {{ totalPages }} 页</span>
        <div><button :disabled="page <= 1 || loading" @click="changePage(page - 1)">上一页</button><button :disabled="page >= totalPages || loading" @click="changePage(page + 1)">下一页</button></div>
      </div>
    </section>

    <div v-if="history.open" class="modal-backdrop" @click.self="history.open = false">
      <section class="modal history-modal" role="dialog" aria-modal="true" aria-labelledby="history-title">
        <div class="modal-heading">
          <div>
            <h2 id="history-title">{{ history.domain }} 轮询记录</h2>
            <p>最近一周记录；连续失败时同时保留最近一次成功检测向前一周的数据</p>
          </div>
          <button class="close-button" type="button" @click="history.open = false">×</button>
        </div>
        <div v-if="history.loading" class="chart-empty"><span class="spinner"></span>正在读取轮询记录…</div>
        <div v-else-if="!history.items.length" class="chart-empty">暂无轮询记录</div>
        <div v-else class="table-wrap history-table-wrap">
          <table class="history-table">
            <thead>
              <tr><th>检测日期</th><th>状态</th><th>证书到期</th><th>检测来源</th><th>结果详情</th></tr>
            </thead>
            <tbody>
              <tr v-for="record in history.items" :key="`${record.check_date || record.checked_at}-${record.checked_at}`">
                <td><strong>{{ dateText(record.check_date || record.checked_at) }}</strong><small>{{ dateText(record.checked_at, true) }}</small></td>
                <td><span class="status-badge" :class="certificateStatus(record).className">{{ certificateStatus(record).label }}</span></td>
                <td>{{ dateText(record.expires_at) }}</td>
                <td><strong>{{ record.check_source || 'master' }}</strong><small v-if="record.resolved_address">{{ record.resolved_address }}</small></td>
                <td class="history-detail">{{ record.error_message || record.issuer || '检测成功' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>

    <Transition name="toast"><div v-if="notice.text" class="toast" :class="{ error: notice.error }">{{ notice.text }}</div></Transition>
  </main>
</template>

<style scoped>
.certificate-main { width: min(1680px, calc(100% - 56px)); margin: 24px auto 50px; }
.certificate-main .summary-grid { grid-template-columns: repeat(5, minmax(0, 1fr)); }
.certificate-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 20px; padding: 19px 20px; margin-bottom: 18px; }
.certificate-toolbar h2 { margin: 0; font-size: 16px; }
.certificate-toolbar p { margin: 5px 0 0; color: var(--muted); font-size: 12px; }
.toolbar-actions { display: flex; gap: 9px; }
.certificate-search { display: grid; grid-template-columns: minmax(260px, 1fr) auto auto; align-items: end; gap: 12px; }
.certificate-filter-tip { margin: 12px 0 0; color: var(--primary); font-size: 12px; }
.certificate-filter-tip button { padding: 0; color: inherit; background: transparent; border: 0; text-decoration: underline; }
.certificate-table { min-width: 1080px; }
.certificate-table th:first-child { width: 260px; }
.certificate-table th:nth-child(2) { width: 190px; }
.certificate-table th:nth-child(3) { width: 130px; }
.certificate-table th:nth-child(4) { width: 130px; }
.certificate-table th:nth-child(6) { width: 180px; }
.certificate-table th:nth-child(7) { width: 100px; }
.certificate-domain strong, .issuer-cell strong { display: block; color: #172033; }
.certificate-domain span, .certificate-table td small { display: block; max-width: 320px; margin-top: 5px; color: var(--muted); font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.status-badge { display: inline-flex; align-items: center; padding: 4px 9px; border-radius: 999px; font-size: 11px; font-weight: 700; }
.status-badge.healthy { color: #08734d; background: #e7f8f0; }
.status-badge.warning { color: #9a5b07; background: #fff4d6; }
.status-badge.error { color: #b42318; background: #feeceb; }
.status-badge.pending { color: #64748b; background: #eef2f6; }
.warning-card { border-color: #f3d598; }
.danger-card { border-color: #f2c0bd; }
.failure-card { border-color: #f4c5a2; }
.warning-card strong { color: #a15c06; }
.danger-card strong { color: #b42318; }
.failure-card strong { color: #c2410c; }
.summary-filter-card { width: 100%; text-align: left; }
.summary-filter-card:hover { transform: translateY(-1px); box-shadow: 0 10px 30px rgba(28, 39, 60, .1); }
.summary-filter-card.active { box-shadow: 0 0 0 2px var(--primary), var(--shadow); }
.history-button { padding: 5px 9px; color: var(--primary); background: #eef4ff; border: 1px solid #cddcff; border-radius: 6px; white-space: nowrap; }
.history-modal { width: min(1040px, calc(100% - 32px)); }
.history-table-wrap { max-height: 62vh; overflow: auto; }
.history-table { min-width: 820px; }
.history-table th:first-child { width: 180px; }
.history-table th:nth-child(2) { width: 110px; }
.history-table th:nth-child(3) { width: 150px; }
.history-table th:nth-child(4) { width: 210px; }
.history-table td small { display: block; margin-top: 4px; color: var(--muted); font-size: 11px; }
.history-detail { max-width: 340px; overflow-wrap: anywhere; }
@media (max-width: 980px) {
  .certificate-main { width: calc(100% - 30px); margin-top: 16px; }
  .certificate-main .summary-grid { grid-template-columns: repeat(2, 1fr); }
}
@media (max-width: 640px) {
  .certificate-toolbar { align-items: flex-start; flex-direction: column; }
  .toolbar-actions { width: 100%; }
  .toolbar-actions .button { flex: 1; }
  .certificate-search { grid-template-columns: 1fr 1fr; }
  .certificate-search label { grid-column: 1 / -1; }
}
</style>
