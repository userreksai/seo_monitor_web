<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'
import { getTitleHistory, getTitleProgress, listTitles, refreshTitles } from './api'
import type { DomainTitleChange, LatestDomainTitle, TaskProgress, TitleSummary } from './types'

type TitleStatusFilter = '' | 'checked' | 'changed' | 'failed'

const props = withDefaults(defineProps<{ readOnly?: boolean }>(), { readOnly: false })

const items = ref<LatestDomainTitle[]>([])
const loading = ref(false)
const refreshing = ref(false)
const exporting = ref(false)
const total = ref(0)
const page = ref(1)
const limit = ref(20)
const query = ref('')
const appliedQuery = ref('')
const statusFilter = ref<TitleStatusFilter>('')
const showProgress = ref(false)
const emptySummary = (): TitleSummary => ({ total: 0, checked: 0, changed: 0, failed: 0 })
const summary = reactive<TitleSummary>(emptySummary())
const progress = reactive<TaskProgress>({ running: false, total: 0, completed: 0, succeeded: 0, failed: 0 })
const notice = reactive({ text: '', error: false })
const history = reactive({ open: false, loading: false, domain: '', items: [] as DomainTitleChange[] })

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / limit.value)))
const refreshBusy = computed(() => refreshing.value || progress.running)
const exportBusy = computed(() => loading.value || exporting.value)
const progressPercent = computed(() => progress.total ? Math.min(100, Math.round(progress.completed / progress.total * 100)) : 0)
const statusFilterLabel = computed(() => {
	if (statusFilter.value === 'checked') return '已获取标题'
	if (statusFilter.value === 'changed') return '发生过变更'
	if (statusFilter.value === 'failed') return '最近检测失败'
	return ''
})

let noticeTimer = 0
let progressPollTimer = 0

function showNotice(text: string, error = false) {
	notice.text = text
	notice.error = error
	window.clearTimeout(noticeTimer)
	noticeTimer = window.setTimeout(() => (notice.text = ''), 4200)
}

async function load() {
	loading.value = true
	try {
		const result = await listTitles(appliedQuery.value, statusFilter.value, page.value, limit.value)
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

function toggleStatus(status: Exclude<TitleStatusFilter, ''>) {
	statusFilter.value = statusFilter.value === status ? '' : status
	page.value = 1
	void load()
}

function changePage(next: number) {
	if (next < 1 || next > totalPages.value || next === page.value) return
	page.value = next
	void load()
}

async function exportTitles() {
	if (exporting.value) return
	exporting.value = true
	try {
		const exportQuery = appliedQuery.value
		const exportStatus = statusFilter.value
		const exportItems: LatestDomainTitle[] = []
		let exportPage = 1
		let exportTotal = 0

		do {
			const result = await listTitles(exportQuery, exportStatus, exportPage, 100)
			const resultItems = result.items || []
			exportItems.push(...resultItems)
			exportTotal = result.total
			if (!resultItems.length) break
			exportPage += 1
		} while (exportItems.length < exportTotal)

		const rows = exportItems.map((item) => {
			const title = item.title
			return [
				item.domain.domain,
				item.domain.display_name || '',
				title?.title || '',
				statusOf(item).label,
				title?.final_url || '',
				title?.status_code || '',
				exportDateText(title?.checked_at),
				exportDateText(title?.last_attempt_at),
				exportDateText(title?.changed_at),
				title?.change_count || 0,
				title?.check_source || '',
				title?.content_type || '',
				title?.error_message || '',
			]
		})
		const headers = [
			'域名', '显示名称', '当前标题', '状态', '最终 URL', 'HTTP 状态码', '最近成功检测时间',
			'最近尝试时间', '最近变更时间', '变更次数', '检测来源', '内容类型', '错误信息',
		]
		const csv = [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n')
		downloadCsv(`域名标题-${exportFileLabel(exportQuery, exportStatus)}-${localDateStamp()}.csv`, csv)
		showNotice(`已导出 ${exportItems.length} 条标题数据`)
	} catch (error) {
		showNotice(`导出失败：${messageOf(error)}`, true)
	} finally {
		exporting.value = false
	}
}

function csvCell(value: unknown) {
	let text = value === undefined || value === null ? '' : String(value)
	if (/^[=+\-@]/.test(text)) text = `'${text}`
	return `"${text.replace(/"/g, '""')}"`
}

function downloadCsv(filename: string, csv: string) {
	const url = URL.createObjectURL(new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8' }))
	const link = document.createElement('a')
	link.href = url
	link.download = filename
	document.body.appendChild(link)
	link.click()
	link.remove()
	URL.revokeObjectURL(url)
}

function exportFileLabel(query: string, status: TitleStatusFilter) {
	if (query && status) return '当前筛选'
	if (query) return '搜索结果'
	if (status === 'checked') return '已获取标题'
	if (status === 'changed') return '标题变更'
	if (status === 'failed') return '检测失败'
	return '全部'
}

function localDateStamp() {
	const now = new Date()
	const year = now.getFullYear()
	const month = String(now.getMonth() + 1).padStart(2, '0')
	const day = String(now.getDate()).padStart(2, '0')
	return `${year}${month}${day}`
}

async function startRefresh() {
	refreshing.value = true
	try {
		const result = await refreshTitles()
		Object.assign(progress, result.progress)
		showProgress.value = true
		showNotice(result.message || (result.started ? '标题检测任务已启动' : '标题检测正在执行'))
		scheduleProgressPoll()
	} catch (error) {
		showNotice(messageOf(error), true)
	} finally {
		refreshing.value = false
	}
}

function scheduleProgressPoll(delay = 1000) {
	window.clearTimeout(progressPollTimer)
	progressPollTimer = window.setTimeout(pollProgress, delay)
}

async function pollProgress() {
	const wasRunning = progress.running
	try {
		const result = await getTitleProgress()
		Object.assign(progress, result)
		if (result.running) {
			showProgress.value = true
			scheduleProgressPoll()
		} else if (wasRunning) {
			showNotice(`标题检测完成：成功 ${result.succeeded}，失败 ${result.failed}`)
			await load()
		}
	} catch {
		if (wasRunning || showProgress.value) scheduleProgressPoll(3000)
	}
}

async function openHistory(item: LatestDomainTitle) {
	history.open = true
	history.loading = true
	history.domain = item.domain.domain
	history.items = []
	try {
		const result = await getTitleHistory(item.domain.id)
		history.items = result.items || []
	} catch (error) {
		showNotice(messageOf(error), true)
		history.open = false
	} finally {
		history.loading = false
	}
}

function statusOf(item: LatestDomainTitle) {
	if (item.title?.error_message) return { label: '检测失败', className: 'error' }
	if (item.title?.title) return { label: item.title.change_count > 0 ? '发生过变更' : '正常', className: item.title.change_count > 0 ? 'warning' : 'healthy' }
	return { label: '待检测', className: 'pending' }
}

function dateText(value?: string) {
	if (!value) return '—'
	const date = new Date(value)
	if (Number.isNaN(date.getTime())) return value
	return new Intl.DateTimeFormat('zh-CN', {
		year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
	}).format(date)
}

function exportDateText(value?: string) {
	return value ? dateText(value) : ''
}

function messageOf(error: unknown) {
	return error instanceof Error ? error.message : '请求失败，请稍后重试'
}

onMounted(() => {
	void load()
	void pollProgress()
})
onUnmounted(() => {
	window.clearTimeout(progressPollTimer)
	window.clearTimeout(noticeTimer)
})
</script>

<template>
	<main class="title-main">
		<section class="summary-grid title-summary" aria-label="标题监控概览">
			<article class="summary-card"><span>监控域名</span><strong>{{ summary.total }}</strong><small>当前搜索结果</small></article>
			<button class="summary-card summary-filter-card" :class="{ active: statusFilter === 'checked' }" type="button" @click="toggleStatus('checked')"><span>已获取标题</span><strong>{{ summary.checked }}</strong><small>点击筛选</small></button>
			<button class="summary-card summary-filter-card warning-card" :class="{ active: statusFilter === 'changed' }" type="button" @click="toggleStatus('changed')"><span>发生过变更</span><strong>{{ summary.changed }}</strong><small>点击查看变更域名</small></button>
			<button class="summary-card summary-filter-card failure-card" :class="{ active: statusFilter === 'failed' }" type="button" @click="toggleStatus('failed')"><span>最近检测失败</span><strong>{{ summary.failed }}</strong><small>点击查看失败域名</small></button>
		</section>

		<section class="panel title-toolbar">
			<div><h2>网页标题监控</h2><p>Master 并发下发任务到 8002 Agent，校验返回值后更新 MongoDB，并记录标题变化。</p></div>
			<div class="toolbar-actions">
				<button class="button ghost" :disabled="loading" @click="load">刷新数据</button>
				<button v-if="!props.readOnly" class="button primary" :disabled="refreshBusy" @click="startRefresh">{{ progress.running ? `检测中 ${progressPercent}%` : refreshing ? '正在提交…' : '检测全部标题' }}</button>
			</div>
		</section>

		<section v-if="showProgress && progress.total" class="panel task-progress" aria-live="polite">
			<div class="task-progress-heading"><div><strong>{{ progress.running ? '正在检测全部标题' : '本次标题检测已完成' }}</strong><span>{{ progress.completed }} / {{ progress.total }}（成功 {{ progress.succeeded }}，失败 {{ progress.failed }}）</span></div><b>{{ progressPercent }}%</b></div>
			<div class="progress-track" role="progressbar" :aria-valuenow="progress.completed" aria-valuemin="0" :aria-valuemax="progress.total"><span :style="{ width: `${progressPercent}%` }"></span></div>
		</section>

		<section class="panel search-panel">
			<form class="title-search" @submit.prevent="search">
				<label><span>域名、显示名称或标题</span><input v-model="query" type="search" placeholder="输入域名或标题关键词" /></label>
				<button class="button primary" type="submit">搜索</button><button class="button ghost" type="button" @click="resetSearch">重置</button>
			</form>
			<p v-if="statusFilter" class="filter-tip">当前显示：{{ statusFilterLabel }}，共 {{ total }} 条 <button type="button" @click="toggleStatus(statusFilter as Exclude<TitleStatusFilter, ''>)">清除筛选</button></p>
		</section>

		<section class="panel table-panel">
			<div class="table-heading">
				<div><h2>域名标题列表</h2><p>当前标题每次检测都会更新；只有标题内容变化时才新增变更记录</p></div>
				<div class="table-heading-actions">
					<button class="button ghost export-button" type="button" :disabled="exportBusy || total === 0" @click="exportTitles">
						{{ exporting ? '正在导出…' : appliedQuery || statusFilter ? '导出当前筛选' : '导出全部数据' }}
					</button>
					<label class="page-size">每页<select v-model.number="limit" @change="page = 1; load()"><option :value="10">10</option><option :value="20">20</option><option :value="50">50</option><option :value="100">100</option></select></label>
				</div>
			</div>
			<div class="table-wrap">
				<table class="title-table">
					<thead><tr><th>域名</th><th>当前标题</th><th>状态</th><th>检测时间</th><th>变更次数</th><th>检测来源</th><th>操作</th></tr></thead>
					<tbody>
						<tr v-if="loading"><td colspan="7"><div class="empty-state"><span class="spinner"></span>正在读取标题信息…</div></td></tr>
						<tr v-else-if="!items.length"><td colspan="7"><div class="empty-state">没有符合条件的标题信息</div></td></tr>
						<tr v-for="item in items" v-else :key="item.domain.id">
							<td class="title-domain"><strong>{{ item.domain.domain }}</strong><span>{{ item.domain.display_name || '未设置显示名称' }}</span></td>
							<td class="title-value"><strong :title="item.title?.title">{{ item.title?.title || '—' }}</strong><a v-if="item.title?.final_url" :href="item.title.final_url" target="_blank" rel="noopener noreferrer">{{ item.title.final_url }}</a><small v-if="item.title?.error_message" :title="item.title.error_message">{{ item.title.error_message }}</small></td>
							<td><span class="status-badge" :class="statusOf(item).className">{{ statusOf(item).label }}</span></td>
							<td><strong>{{ dateText(item.title?.checked_at) }}</strong><small>尝试：{{ dateText(item.title?.last_attempt_at) }}</small></td>
							<td><strong>{{ item.title?.change_count || 0 }}</strong><small>最近：{{ dateText(item.title?.changed_at) }}</small></td>
							<td>{{ item.title?.check_source || '—' }}</td>
							<td><button class="history-button" type="button" @click="openHistory(item)">变更记录</button></td>
						</tr>
					</tbody>
				</table>
			</div>
			<div class="pagination"><span>共 {{ total }} 条，第 {{ page }} / {{ totalPages }} 页</span><div><button :disabled="page <= 1 || loading" @click="changePage(page - 1)">上一页</button><button :disabled="page >= totalPages || loading" @click="changePage(page + 1)">下一页</button></div></div>
		</section>

		<div v-if="history.open" class="modal-backdrop" @click.self="history.open = false">
			<section class="modal title-history-modal" role="dialog" aria-modal="true" aria-labelledby="title-history-heading">
				<div class="modal-heading"><div><h2 id="title-history-heading">{{ history.domain }} 标题变更记录</h2><p>仅记录标题内容实际发生变化的检测</p></div><button class="close-button" type="button" @click="history.open = false">×</button></div>
				<div v-if="history.loading" class="chart-empty"><span class="spinner"></span>正在读取变更记录…</div>
				<div v-else-if="!history.items.length" class="chart-empty">标题尚未发生变化</div>
				<div v-else class="table-wrap title-history-wrap"><table class="title-history-table"><thead><tr><th>变更时间</th><th>原标题</th><th>新标题</th><th>检测来源</th></tr></thead><tbody><tr v-for="record in history.items" :key="record.id || `${record.changed_at}-${record.new_title}`"><td>{{ dateText(record.changed_at) }}</td><td>{{ record.old_title }}</td><td><strong>{{ record.new_title }}</strong><a v-if="record.final_url" :href="record.final_url" target="_blank" rel="noopener noreferrer">{{ record.final_url }}</a></td><td>{{ record.check_source || '—' }}</td></tr></tbody></table></div>
			</section>
		</div>

		<Transition name="toast"><div v-if="notice.text" class="toast" :class="{ error: notice.error }">{{ notice.text }}</div></Transition>
	</main>
</template>

<style scoped>
.title-main { width: min(1680px, calc(100% - 56px)); margin: 24px auto 50px; }
.title-summary { grid-template-columns: repeat(4, minmax(0, 1fr)); }
.title-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 20px; padding: 19px 20px; margin-bottom: 18px; }
.title-toolbar h2 { margin: 0; font-size: 16px; }
.title-toolbar p { margin: 5px 0 0; color: var(--muted); font-size: 12px; }
.toolbar-actions { display: flex; gap: 9px; }
.title-search { display: grid; grid-template-columns: minmax(260px, 1fr) auto auto; align-items: end; gap: 12px; }
.title-table { min-width: 1260px; }
.title-table th:first-child { width: 230px; }
.title-table th:nth-child(2) { width: 430px; }
.title-table th:nth-child(3) { width: 130px; }
.title-table th:nth-child(4) { width: 210px; }
.title-table th:nth-child(5) { width: 150px; }
.title-table th:nth-child(7) { width: 110px; }
.title-domain strong, .title-value strong { display: block; color: #172033; }
.title-domain span, .title-table td small { display: block; max-width: 400px; margin-top: 5px; color: var(--muted); font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.title-value strong { max-width: 430px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.title-value a, .title-history-table a { display: block; max-width: 430px; margin-top: 5px; color: var(--primary); font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.status-badge { display: inline-flex; align-items: center; padding: 4px 9px; border-radius: 999px; font-size: 11px; font-weight: 700; }
.status-badge.healthy { color: #08734d; background: #e7f8f0; }.status-badge.warning { color: #9a5b07; background: #fff4d6; }.status-badge.error { color: #b42318; background: #feeceb; }.status-badge.pending { color: #64748b; background: #eef2f6; }
.warning-card { border-color: #f3d598; }.warning-card strong { color: #a15c06; }.failure-card { border-color: #f4c5a2; }.failure-card strong { color: #c2410c; }
.summary-filter-card { width: 100%; text-align: left; }.summary-filter-card:hover { transform: translateY(-1px); box-shadow: 0 10px 30px rgba(28, 39, 60, .1); }.summary-filter-card.active { box-shadow: 0 0 0 2px var(--primary), var(--shadow); }
.history-button { padding: 5px 9px; color: var(--primary); background: #eef4ff; border: 1px solid #cddcff; border-radius: 6px; white-space: nowrap; }
.title-history-modal { width: min(1200px, calc(100% - 32px)); }.title-history-wrap { max-height: 62vh; overflow: auto; }.title-history-table { min-width: 980px; }.title-history-table th:first-child { width: 190px; }.title-history-table th:nth-child(2), .title-history-table th:nth-child(3) { width: 330px; }.title-history-table td { vertical-align: top; overflow-wrap: anywhere; }
@media (max-width: 980px) { .title-main { width: calc(100% - 30px); margin-top: 16px; }.title-summary { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 640px) { .title-toolbar { align-items: flex-start; flex-direction: column; }.toolbar-actions { width: 100%; }.toolbar-actions .button { flex: 1; }.title-search { grid-template-columns: 1fr 1fr; }.title-search label { grid-column: 1 / -1; } }
</style>
