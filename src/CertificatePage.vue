<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { listCertificates, refreshCertificates } from './api'
import type { LatestCertificate } from './types'

const items = ref<LatestCertificate[]>([])
const loading = ref(false)
const refreshing = ref(false)
const total = ref(0)
const page = ref(1)
const limit = ref(20)
const query = ref('')
const appliedQuery = ref('')
const notice = reactive({ text: '', error: false })

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / limit.value)))
const checkedCount = computed(() => items.value.filter((item) => item.certificate).length)
const expiringCount = computed(
  () =>
    items.value.filter((item) => {
      const days = daysRemaining(item.certificate?.expires_at)
      return days !== undefined && days >= 0 && days <= 30
    }).length,
)
const expiredCount = computed(
  () => items.value.filter((item) => (daysRemaining(item.certificate?.expires_at) ?? 0) < 0).length,
)

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
    const result = await listCertificates(appliedQuery.value, page.value, limit.value)
    items.value = result.items || []
    total.value = result.total
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

function daysRemaining(value?: string) {
  if (!value) return undefined
  const expires = new Date(value).getTime()
  if (Number.isNaN(expires)) return undefined
  return Math.ceil((expires - Date.now()) / 86_400_000)
}

function statusOf(item: LatestCertificate) {
  const certificate = item.certificate
  if (!certificate) return { label: '待检测', className: 'pending' }
  if (certificate.error_message) return { label: '检测失败', className: 'error' }
  if (!certificate.hostname_valid) return { label: '域名不匹配', className: 'warning' }
  const days = daysRemaining(certificate.expires_at)
  if (days === undefined) return { label: '信息不完整', className: 'pending' }
  if (days < 0) return { label: '已过期', className: 'error' }
  if (days <= 30) return { label: '即将到期', className: 'warning' }
  return { label: '有效', className: 'healthy' }
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
        <span>监控域名</span><strong>{{ total }}</strong><small>当前搜索结果</small>
      </article>
      <article class="summary-card">
        <span>当前页已检测</span><strong>{{ checkedCount }}</strong><small>共 {{ items.length }} 条</small>
      </article>
      <article class="summary-card warning-card">
        <span>30 天内到期</span><strong>{{ expiringCount }}</strong><small>当前页证书</small>
      </article>
      <article class="summary-card danger-card">
        <span>已过期</span><strong>{{ expiredCount }}</strong><small>当前页证书</small>
      </article>
    </section>

    <section class="panel certificate-toolbar">
      <div>
        <h2>SSL 证书信息</h2>
        <p>自动读取域名 443 端口的当前证书；服务启动时及每日定时更新。</p>
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
            <tr><th>域名</th><th>证书到期时间</th><th>剩余时间</th><th>状态</th><th>颁发机构</th><th>最近检测</th></tr>
          </thead>
          <tbody>
            <tr v-if="loading"><td colspan="6"><div class="empty-state"><span class="spinner"></span>正在读取证书信息…</div></td></tr>
            <tr v-else-if="!items.length"><td colspan="6"><div class="empty-state">没有符合条件的证书信息</div></td></tr>
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
            </tr>
          </tbody>
        </table>
      </div>

      <div class="pagination">
        <span>共 {{ total }} 条，第 {{ page }} / {{ totalPages }} 页</span>
        <div><button :disabled="page <= 1 || loading" @click="changePage(page - 1)">上一页</button><button :disabled="page >= totalPages || loading" @click="changePage(page + 1)">下一页</button></div>
      </div>
    </section>

    <Transition name="toast"><div v-if="notice.text" class="toast" :class="{ error: notice.error }">{{ notice.text }}</div></Transition>
  </main>
</template>

<style scoped>
.certificate-main { width: min(1680px, calc(100% - 56px)); margin: 24px auto 50px; }
.certificate-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 20px; padding: 19px 20px; margin-bottom: 18px; }
.certificate-toolbar h2 { margin: 0; font-size: 16px; }
.certificate-toolbar p { margin: 5px 0 0; color: var(--muted); font-size: 12px; }
.toolbar-actions { display: flex; gap: 9px; }
.certificate-search { display: grid; grid-template-columns: minmax(260px, 1fr) auto auto; align-items: end; gap: 12px; }
.certificate-table { min-width: 1080px; }
.certificate-table th:first-child { width: 260px; }
.certificate-table th:nth-child(2) { width: 190px; }
.certificate-table th:nth-child(3) { width: 130px; }
.certificate-table th:nth-child(4) { width: 130px; }
.certificate-table th:nth-child(6) { width: 180px; }
.certificate-domain strong, .issuer-cell strong { display: block; color: #172033; }
.certificate-domain span, .certificate-table td small { display: block; max-width: 320px; margin-top: 5px; color: var(--muted); font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.status-badge { display: inline-flex; align-items: center; padding: 4px 9px; border-radius: 999px; font-size: 11px; font-weight: 700; }
.status-badge.healthy { color: #08734d; background: #e7f8f0; }
.status-badge.warning { color: #9a5b07; background: #fff4d6; }
.status-badge.error { color: #b42318; background: #feeceb; }
.status-badge.pending { color: #64748b; background: #eef2f6; }
.warning-card { border-color: #f3d598; }
.danger-card { border-color: #f2c0bd; }
.warning-card strong { color: #a15c06; }
.danger-card strong { color: #b42318; }
@media (max-width: 980px) {
  .certificate-main { width: calc(100% - 30px); margin-top: 16px; }
}
@media (max-width: 640px) {
  .certificate-toolbar { align-items: flex-start; flex-direction: column; }
  .toolbar-actions { width: 100%; }
  .toolbar-actions .button { flex: 1; }
  .certificate-search { grid-template-columns: 1fr 1fr; }
  .certificate-search label { grid-column: 1 / -1; }
}
</style>
