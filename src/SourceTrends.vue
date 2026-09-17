<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Metric } from './types'
import { weightSources, weightUsable, weightStatus, historyDays, sourceTrend } from './metric-source'

const props = defineProps<{ items: Metric[]; field: keyof Metric; fieldLabel: string; from: string; to: string }>()
const focusedDay = ref('')
const range = ref(90)
const days = computed(() => historyDays(props.items, props.from, props.to).slice(-range.value))
const series = computed(() => weightSources.map(site => ({ ...site, ...sourceTrend(props.items, site.source, props.field, days.value) })))
const max = computed(() => props.field.endsWith('_weight') ? 10 : Math.max(1, ...series.value.flatMap(site => site.values.map(point => point.value))))
const x = (index: number) => 52 + index / Math.max(days.value.length - 1, 1) * 402
const y = (value: number) => 190 - value / max.value * 150
const dateText = (day?: string) => day ? day.slice(0, 10).replaceAll('-', '/') : '—'
const numberText = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 1 }).format(value) : '—'
const pointLabel = (day: string, label: string, value: number) => `${dateText(day)} · ${label} · ${props.fieldLabel}：${numberText(value)}`
const inspectedDay = computed(() => focusedDay.value || days.value.at(-1) || '')
const originals = computed(() => new Map(props.items.map(item => [item.snapshot_date.slice(0, 10), item])))
const unknownCount = computed(() => props.items.filter(item => !item.weight_source && !item.weight_snapshots).length)
const reversedDays = computed(() => [...days.value].reverse())
function indicatorStatus(metric?: Metric) {
  if (weightUsable(metric) && typeof metric?.[props.field] !== 'number') return '该指标未返回'
  return weightStatus(metric)
}
</script>

<template>
  <div class="dual-source-trends">
    <div class="trend-range" role="group" aria-label="趋势时间范围"><button v-for="count in [7, 30, 90]" :key="count" type="button" :aria-pressed="range === count" :class="{ active: range === count }" @click="range = count; focusedDay = ''">最近 {{ count }} 天</button><span>{{ dateText(days[0]) }} — {{ dateText(days.at(-1)) }}</span></div>
    <p class="trend-explanation">两站分别展示，使用相同日期与刻度。仅连接同一来源相邻日期的有效数据；缺失或失败日期断开，0 为真实值。</p>
    <p v-if="unknownCount" class="source-legacy-note">另有 {{ unknownCount }} 天旧记录来源未确认，未归入任一站点。</p>
    <div class="source-trend-grid">
      <article v-for="site in series" :key="site.source" class="source-trend-card" :class="site.source">
        <div class="source-card-heading"><div><strong><i class="source-color-dot"></i>{{ site.label }}</strong><small>{{ site.host }}</small></div><span class="source-state">{{ site.values.length }} / {{ days.length }} 天有有效指标</span></div>
        <div class="source-trend-current"><div><span>{{ focusedDay ? '查看日期' : '区间最后一天' }} · {{ dateText(inspectedDay) }}</span><strong>{{ weightUsable(site.byDate.get(inspectedDay)) ? numberText(site.byDate.get(inspectedDay)?.[field]) : '—' }}</strong><small>{{ fieldLabel }}</small></div><p>{{ indicatorStatus(site.byDate.get(inspectedDay)) }}</p></div>
        <svg v-if="site.values.length" viewBox="0 0 480 225" class="source-chart" role="img" :aria-label="`${site.label} ${fieldLabel} 趋势图`">
          <g v-for="fraction in [0, 0.5, 1]" :key="fraction"><line x1="52" :y1="y(max * fraction)" x2="454" :y2="y(max * fraction)" class="grid-line"/><text x="44" :y="y(max * fraction) + 4" text-anchor="end">{{ numberText(max * fraction) }}</text></g>
          <polyline v-for="(segment, index) in site.segments" :key="index" :points="segment.map(point => `${x(point.index)},${y(point.value)}`).join(' ')" class="source-trend-line"/>
          <line v-if="focusedDay && days.includes(focusedDay)" :x1="x(days.indexOf(focusedDay))" y1="35" :x2="x(days.indexOf(focusedDay))" y2="190" class="chart-cursor"/>
          <circle v-for="point in site.values" :key="point.day" :cx="x(point.index)" :cy="y(point.value)" r="3.5" class="source-trend-dot" tabindex="0" :aria-label="pointLabel(point.day, site.label, point.value)" @mouseenter="focusedDay = point.day" @mouseleave="focusedDay = ''" @focus="focusedDay = point.day" @blur="focusedDay = ''"><title>{{ pointLabel(point.day, site.label, point.value) }}</title></circle>
          <text x="52" y="216">{{ dateText(days[0]) }}</text><text x="454" y="216" text-anchor="end">{{ dateText(days.at(-1)) }}</text>
        </svg>
        <div v-else class="source-chart-empty">本时段暂无有效的{{ site.label }}{{ fieldLabel }}数据</div>
      </article>
    </div>
    <div class="source-history-heading"><h3>每日数据明细</h3><span>同一天并排查看两站结果 · 最近日期在前</span></div>
    <div class="source-history-scroll">
      <table class="source-history-table" aria-label="爱站与站长每日数据对照">
        <thead><tr><th rowspan="2" scope="col">快照日期</th><th v-for="site in series" :key="site.source" colspan="3" scope="colgroup" :class="site.source"><span class="weight-source" :class="site.source">{{ site.label }}</span></th></tr><tr><template v-for="site in series" :key="site.source"><th scope="col" :class="site.source">{{ fieldLabel }}</th><th scope="col" :class="site.source">百度 PC / 移动</th><th scope="col" :class="site.source">状态</th></template></tr></thead>
        <tbody><tr v-for="day in reversedDays" :key="day"><th scope="row">{{ dateText(day) }}</th><template v-for="site in series" :key="site.source"><td :class="[site.source, { 'retained-value': !weightUsable(site.byDate.get(day)) }]">{{ numberText(site.byDate.get(day)?.[field]) }}</td><td :class="{ 'retained-value': !weightUsable(site.byDate.get(day)) }">{{ numberText(site.byDate.get(day)?.baidu_pc_weight) }} / {{ numberText(site.byDate.get(day)?.baidu_mobile_weight) }}</td><td class="source-history-status" :class="{ 'retained-value': !weightUsable(site.byDate.get(day)) }"><span>{{ weightStatus(site.byDate.get(day)) }}</span><small v-if="originals.get(day)?.weight_snapshots?.[site.source]?.error_message" :title="originals.get(day)?.weight_snapshots?.[site.source]?.error_message">{{ originals.get(day)?.weight_snapshots?.[site.source]?.error_message }}</small></td></template></tr></tbody>
      </table>
      <p v-if="!days.length" class="source-empty-note">本时段暂无每日快照</p>
    </div>
    <p class="trend-explanation">灰色旧值仅供查阅，不参与曲线。此处展示两站采集记录，通知规则保持不变。</p>
  </div>
</template>
