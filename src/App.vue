<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import {
  archiveDomain,
  collectAll,
  collectDomain,
  createDomain,
  getMetrics,
  searchLatest,
} from './api'
import type { LatestMetric, Metric } from './types'

const fields = [
  { value: 'domain', label: '域名' },
  { value: 'display_name', label: '显示名称' },
  { value: 'site_category', label: '网站分类' },
  { value: 'registrant_name', label: '注册人/机构' },
  { value: 'registrant_email', label: '注册人邮箱' },
  { value: 'baidu_pc_weight', label: '百度 PC 权重' },
  { value: 'baidu_mobile_weight', label: '百度移动权重' },
  { value: 'sogou_weight', label: '搜狗权重' },
  { value: 'bing_weight', label: '必应权重' },
  { value: 'so_360_weight', label: '360 权重' },
  { value: 'shenma_weight', label: '神马权重' },
  { value: 'pr_weight', label: 'PR 权重' },
  { value: 'apppc_pc_rank', label: 'APPPC 排名' },
  { value: 'backlink_count', label: '反向链接数' },
  { value: 'traffic_min', label: '流量下限' },
  { value: 'traffic_max', label: '流量上限' },
  { value: 'domain_age_days', label: '域名年龄（天）' },
]

const trendFields = [
  { value: 'traffic_max', label: '全网流量上限' },
  { value: 'baidu_pc_weight', label: '百度 PC 权重' },
  { value: 'baidu_mobile_weight', label: '百度移动权重' },
  { value: 'sogou_weight', label: '搜狗权重' },
  { value: 'bing_weight', label: '必应权重' },
  { value: 'so_360_weight', label: '360 权重' },
  { value: 'shenma_weight', label: '神马权重' },
  { value: 'pr_weight', label: 'PR 权重' },
  { value: 'backlink_count', label: '反向链接数' },
] as const

type TrendField = (typeof trendFields)[number]['value']

const items = ref<LatestMetric[]>([])
const loading = ref(false)
const total = ref(0)
const page = ref(1)
const limit = ref(20)
const selectedField = ref('domain')
const query = ref('')
const appliedField = ref('domain')
const appliedQuery = ref('')
const notice = reactive({ text: '', error: false })
const busyId = ref('')

const addDialog = reactive({ open: false, domain: '', displayName: '', saving: false })
const trend = reactive({
  open: false,
  loading: false,
  domainId: '',
  domain: '',
  field: 'traffic_max' as TrendField,
  items: [] as Metric[],
})

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / limit.value)))
const collectedCount = computed(() => items.value.filter((item) => item.metric).length)
const trafficTotal = computed(() =>
  items.value.reduce((sum, item) => sum + (item.metric?.traffic_max || 0), 0),
)
const freshToday = computed(() => {
  const today = localDate(new Date())
  return items.value.filter((item) => item.metric?.snapshot_date.slice(0, 10) === today).length
})

const trendPoints = computed(() => {
  const values = trend.items
    .map((metric, index) => ({ index, value: metric[trend.field] as number | undefined }))
    .filter((point): point is { index: number; value: number } => typeof point.value === 'number')
  if (!values.length) return { points: '', min: 0, max: 0, values: [] as typeof values }
  const min = Math.min(...values.map((point) => point.value))
  const max = Math.max(...values.map((point) => point.value))
  const span = max - min || 1
  const divisor = Math.max(trend.items.length - 1, 1)
  const points = values
    .map((point) => `${40 + (point.index / divisor) * 700},${225 - ((point.value - min) / span) * 170}`)
    .join(' ')
  return { points, min, max, values }
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
    const result = await searchLatest(appliedField.value, appliedQuery.value, page.value, limit.value)
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
  appliedField.value = selectedField.value
  appliedQuery.value = query.value.trim()
  page.value = 1
  void load()
}

function resetSearch() {
  selectedField.value = 'domain'
  query.value = ''
  appliedField.value = 'domain'
  appliedQuery.value = ''
  page.value = 1
  void load()
}

function changePage(next: number) {
  if (next < 1 || next > totalPages.value || next === page.value) return
  page.value = next
  void load()
}

async function saveDomain() {
  if (!addDialog.domain.trim()) return
  addDialog.saving = true
  try {
    await createDomain(addDialog.domain, addDialog.displayName)
    showNotice(`已添加 ${addDialog.domain.trim()}`)
    addDialog.open = false
    addDialog.domain = ''
    addDialog.displayName = ''
    resetSearch()
  } catch (error) {
    showNotice(messageOf(error), true)
  } finally {
    addDialog.saving = false
  }
}

async function queueOne(item: LatestMetric) {
  busyId.value = item.domain.id
  try {
    const result = await collectDomain(item.domain.id)
    showNotice(result.queued ? `${item.domain.domain} 已加入采集队列` : result.message || '今日已采集')
  } catch (error) {
    showNotice(messageOf(error), true)
  } finally {
    busyId.value = ''
  }
}

async function queueAll() {
  if (!window.confirm('确认将全部启用域名加入今日采集队列？')) return
  busyId.value = 'all'
  try {
    const result = await collectAll()
    showNotice(`已加入队列：${result.queued} 个域名`)
  } catch (error) {
    showNotice(messageOf(error), true)
  } finally {
    busyId.value = ''
  }
}

async function remove(item: LatestMetric) {
  if (!window.confirm(`确认归档 ${item.domain.domain}？历史趋势数据会保留。`)) return
  busyId.value = item.domain.id
  try {
    await archiveDomain(item.domain.id)
    showNotice(`${item.domain.domain} 已归档`)
    await load()
  } catch (error) {
    showNotice(messageOf(error), true)
  } finally {
    busyId.value = ''
  }
}

async function openTrend(item: LatestMetric) {
  trend.open = true
  trend.loading = true
  trend.domainId = item.domain.id
  trend.domain = item.domain.domain
  trend.items = []
  try {
    const result = await getMetrics(item.domain.id)
    trend.items = result.items || []
  } catch (error) {
    showNotice(messageOf(error), true)
    trend.open = false
  } finally {
    trend.loading = false
  }
}

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : '请求失败，请稍后重试'
}

function localDate(date: Date) {
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 10)
}

function dateText(value?: string) {
  if (!value) return '—'
  const date = value.slice(0, 10)
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  return match ? `${match[1]}/${match[2]}/${match[3]}` : value
}

function numberText(value?: number) {
  return typeof value === 'number' ? new Intl.NumberFormat('zh-CN').format(value) : '—'
}

function metricValue(metric: Metric | undefined, field: TrendField) {
  const value = metric?.[field]
  return typeof value === 'number' ? numberText(value) : '—'
}

onMounted(load)
</script>

<template>
  <div class="app-shell">
    <header class="topbar">
      <div class="brand">
        <div class="brand-mark">S</div>
        <div>
          <h1>SEO 域名监控</h1>
          <p>每日权重、流量与域名信息快照</p>
        </div>
      </div>
      <div class="header-actions">
        <button class="button secondary" :disabled="loading" @click="load">刷新数据</button>
        <button class="button secondary" :disabled="busyId === 'all'" @click="queueAll">
          {{ busyId === 'all' ? '正在排队…' : '采集全部' }}
        </button>
        <button class="button primary" @click="addDialog.open = true">添加域名</button>
      </div>
    </header>

    <main>
      <section class="summary-grid" aria-label="数据概览">
        <article class="summary-card">
          <span>域名总数</span><strong>{{ numberText(total) }}</strong><small>当前搜索结果</small>
        </article>
        <article class="summary-card">
          <span>当前页已采集</span><strong>{{ collectedCount }}</strong><small>共 {{ items.length }} 条</small>
        </article>
        <article class="summary-card">
          <span>今日新快照</span><strong>{{ freshToday }}</strong><small>当前页数据</small>
        </article>
        <article class="summary-card accent-card">
          <span>当前页流量上限合计</span><strong>{{ numberText(trafficTotal) }}</strong><small>全网流量估算</small>
        </article>
      </section>

      <section class="panel search-panel">
        <form class="search-form" @submit.prevent="search">
          <label>
            <span>查询字段</span>
            <select v-model="selectedField">
              <option v-for="field in fields" :key="field.value" :value="field.value">{{ field.label }}</option>
            </select>
          </label>
          <label class="query-field">
            <span>查询内容</span>
            <input v-model="query" type="search" placeholder="输入关键词；权重、排名、流量等数字字段须精确匹配" />
          </label>
          <button class="button primary search-button" type="submit">搜索</button>
          <button class="button ghost search-button" type="button" @click="resetSearch">重置</button>
        </form>
        <p v-if="appliedQuery" class="filter-tip">
          正在按“{{ fields.find((item) => item.value === appliedField)?.label }}”查询：{{ appliedQuery }}
        </p>
      </section>

      <section class="panel table-panel">
        <div class="table-heading">
          <div><h2>最新域名数据</h2><p>每个域名展示最近一次采集快照</p></div>
          <label class="page-size">每页
            <select v-model.number="limit" @change="page = 1; load()">
              <option :value="10">10</option><option :value="20">20</option><option :value="50">50</option><option :value="100">100</option>
            </select>
          </label>
        </div>

        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th class="sticky-column">域名 / 快照</th><th>全网流量</th><th>综合权重</th><th>排名 / 分类</th>
                <th>反向链接</th><th>注册信息</th><th>域名年龄</th><th class="actions-column">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="loading"><td colspan="8"><div class="empty-state"><span class="spinner"></span>正在读取最新数据…</div></td></tr>
              <tr v-else-if="!items.length"><td colspan="8"><div class="empty-state">没有符合条件的数据</div></td></tr>
              <tr v-for="item in items" v-else :key="item.domain.id">
                <td class="sticky-column domain-cell">
                  <strong>{{ item.domain.domain }}</strong>
                  <span>{{ item.domain.display_name || '未设置显示名称' }}</span>
                  <small>{{ item.metric ? dateText(item.metric.snapshot_date) : '尚未采集' }}</small>
                </td>
                <td><strong class="traffic">{{ item.metric?.traffic_text || numberText(item.metric?.traffic_max) }}</strong><small class="cell-sub">{{ item.metric ? `${numberText(item.metric.traffic_min)} ～ ${numberText(item.metric.traffic_max)}` : '—' }}</small></td>
                <td>
                  <div class="weights">
                    <span class="weight baidu" title="百度 PC">PC {{ metricValue(item.metric, 'baidu_pc_weight') }}</span>
                    <span class="weight baidu-mobile" title="百度移动">M {{ metricValue(item.metric, 'baidu_mobile_weight') }}</span>
                    <span class="weight sogou" title="搜狗">搜 {{ metricValue(item.metric, 'sogou_weight') }}</span>
                    <span class="weight bing" title="必应">必 {{ metricValue(item.metric, 'bing_weight') }}</span>
                    <span class="weight so360" title="360">360 {{ metricValue(item.metric, 'so_360_weight') }}</span>
                    <span class="weight shenma" title="神马">神 {{ metricValue(item.metric, 'shenma_weight') }}</span>
                    <span class="weight pr" title="PR">PR {{ metricValue(item.metric, 'pr_weight') }}</span>
                  </div>
                </td>
                <td><strong>{{ numberText(item.metric?.apppc_pc_rank) }}</strong><small class="cell-sub">{{ item.metric?.site_category || '未分类' }}</small></td>
                <td><strong>{{ numberText(item.metric?.backlink_count) }}</strong></td>
                <td class="detail-cell"><strong>{{ item.metric?.registrant_name || '—' }}</strong><span>{{ item.metric?.registrant_email || '未公开邮箱' }}</span></td>
                <td class="detail-cell"><strong>{{ item.metric?.domain_age_text || (item.metric?.domain_age_days ? `${item.metric.domain_age_days} 天` : '—') }}</strong><span>到期：{{ dateText(item.metric?.expires_on) }}</span></td>
                <td class="actions-column"><div class="row-actions">
                  <button title="查看 90 天趋势" @click="openTrend(item)">趋势</button>
                  <button :disabled="busyId === item.domain.id" @click="queueOne(item)">采集</button>
                  <button class="danger-link" :disabled="busyId === item.domain.id" @click="remove(item)">归档</button>
                </div></td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="pagination">
          <span>共 {{ numberText(total) }} 条，第 {{ page }} / {{ totalPages }} 页</span>
          <div><button :disabled="page <= 1 || loading" @click="changePage(page - 1)">上一页</button><button :disabled="page >= totalPages || loading" @click="changePage(page + 1)">下一页</button></div>
        </div>
      </section>
    </main>

    <div v-if="addDialog.open" class="modal-backdrop" @click.self="addDialog.open = false">
      <section class="modal small-modal" role="dialog" aria-modal="true" aria-labelledby="add-title">
        <div class="modal-heading"><div><h2 id="add-title">添加监控域名</h2><p>添加后可立即手动采集</p></div><button class="close-button" @click="addDialog.open = false">×</button></div>
        <form class="modal-form" @submit.prevent="saveDomain">
          <label><span>域名</span><input v-model="addDialog.domain" required placeholder="example.com" autocomplete="off" /></label>
          <label><span>显示名称（可选）</span><input v-model="addDialog.displayName" placeholder="我的网站" /></label>
          <div class="modal-actions"><button class="button ghost" type="button" @click="addDialog.open = false">取消</button><button class="button primary" :disabled="addDialog.saving">{{ addDialog.saving ? '保存中…' : '保存域名' }}</button></div>
        </form>
      </section>
    </div>

    <div v-if="trend.open" class="modal-backdrop" @click.self="trend.open = false">
      <section class="modal trend-modal" role="dialog" aria-modal="true" aria-labelledby="trend-title">
        <div class="modal-heading"><div><h2 id="trend-title">{{ trend.domain }} 趋势</h2><p>最近 90 天每日快照</p></div><button class="close-button" @click="trend.open = false">×</button></div>
        <label class="trend-select"><span>指标</span><select v-model="trend.field"><option v-for="field in trendFields" :key="field.value" :value="field.value">{{ field.label }}</option></select></label>
        <div v-if="trend.loading" class="chart-empty"><span class="spinner"></span>正在读取趋势…</div>
        <div v-else-if="!trendPoints.values.length" class="chart-empty">该指标暂无趋势数据</div>
        <div v-else class="chart-wrap">
          <svg viewBox="0 0 780 270" role="img" :aria-label="`${trend.domain} ${trend.field} 趋势图`">
            <line x1="40" y1="55" x2="740" y2="55" class="grid-line"/><line x1="40" y1="140" x2="740" y2="140" class="grid-line"/><line x1="40" y1="225" x2="740" y2="225" class="grid-line"/>
            <polyline :points="trendPoints.points" class="trend-line"/>
            <circle v-for="point in trendPoints.values" :key="point.index" :cx="40 + (point.index / Math.max(trend.items.length - 1, 1)) * 700" :cy="225 - ((point.value - trendPoints.min) / (trendPoints.max - trendPoints.min || 1)) * 170" r="4" class="trend-dot"><title>{{ dateText(trend.items[point.index]?.snapshot_date) }}：{{ numberText(point.value) }}</title></circle>
            <text x="34" y="59" text-anchor="end">{{ numberText(trendPoints.max) }}</text><text x="34" y="229" text-anchor="end">{{ numberText(trendPoints.min) }}</text>
            <text x="40" y="254">{{ dateText(trend.items[0]?.snapshot_date) }}</text><text x="740" y="254" text-anchor="end">{{ dateText(trend.items[trend.items.length - 1]?.snapshot_date) }}</text>
          </svg>
        </div>
      </section>
    </div>

    <Transition name="toast"><div v-if="notice.text" class="toast" :class="{ error: notice.error }">{{ notice.text }}</div></Transition>
  </div>
</template>
