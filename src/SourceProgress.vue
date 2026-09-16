<script setup lang="ts">
import { computed } from 'vue'
import type { CollectionProgress } from './types'
import { weightSources, progressPercent, progressLabel } from './metric-source'

const props = defineProps<{ progress: CollectionProgress }>()
const separate = computed(() => !!props.progress.sources && weightSources.some(site => props.progress.sources?.[site.source]))
const cards = computed(() => separate.value
  ? weightSources.map(site => ({ ...site, progress: props.progress.sources?.[site.source] }))
  : [{ source: 'legacy', label: '权重采集', host: '当前接口返回汇总进度', progress: props.progress }])
</script>

<template>
  <section class="panel source-progress" aria-label="每日分源采集进度">
    <div class="source-section-heading"><div><h2>今日采集进度</h2><p>{{ progress.snapshot_date.slice(0, 10).replaceAll('-', '/') }} · {{ separate ? '两站独立执行，各自统计域名进度' : '暂未返回分源进度' }}</p></div></div>
    <div class="source-progress-grid">
      <article v-for="card in cards" :key="card.source" class="source-progress-card" :class="card.source" :aria-label="`${card.label}采集进度`">
        <div class="source-card-heading"><div><strong><i class="source-color-dot"></i>{{ card.label }}</strong><small>{{ card.host }}</small></div><span class="source-state" :class="{ warning: card.progress?.failed }">{{ card.progress ? progressLabel(card.progress) : '暂无进度信息' }}</span></div>
        <template v-if="card.progress">
          <div class="source-progress-number"><span><b>{{ card.progress.completed }}</b> / {{ card.progress.total }} <small>个域名已结束</small></span><strong>{{ progressPercent(card.progress) }}%</strong></div>
          <div class="progress-track" role="progressbar" :aria-label="`${card.label}已结束任务比例`" :aria-valuenow="card.progress.completed" aria-valuemin="0" :aria-valuemax="card.progress.total || 1"><span :style="{ width: `${progressPercent(card.progress)}%` }"></span></div>
          <dl class="source-progress-counts"><div><dt>成功</dt><dd>{{ card.progress.succeeded }}</dd></div><div :class="{ 'has-failures': card.progress.failed }"><dt>失败</dt><dd>{{ card.progress.failed }}</dd></div><div><dt>执行中</dt><dd>{{ card.progress.running }}</dd></div><div><dt>排队 / 待重试</dt><dd>{{ card.progress.queued }}</dd></div><div><dt>待入队</dt><dd>{{ card.progress.pending }}</dd></div><div><dt>已取消</dt><dd>{{ card.progress.canceled }}</dd></div></dl>
        </template>
        <p v-else class="source-empty-note">接口尚未返回该来源的进度，不计为完成。</p>
      </article>
    </div>
    <p v-if="progress.supplement" class="source-supplement">站长资料补充：{{ progressLabel(progress.supplement) }} · {{ progress.supplement.completed }} / {{ progress.supplement.total }}（成功 {{ progress.supplement.succeeded }}，失败 {{ progress.supplement.failed }}）<span>排名、分类及注册资料单独统计</span></p>
  </section>
</template>
