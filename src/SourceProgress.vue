<script setup lang="ts">
import { computed, ref } from 'vue'
import type { CollectionProgress } from './types'
import { weightSources, progressPercent, progressLabel } from './metric-source'

import FailedDomainsDialog from './FailedDomainsDialog.vue'
import type { FailureSource } from './collection-failures'

const selectedFailure = ref<{ source: FailureSource; label: string; date: string }>()
const props = defineProps<{ progress: CollectionProgress }>()
const separate = computed(() => !!props.progress.sources && weightSources.some(site => props.progress.sources?.[site.source]))
const cards = computed(() => separate.value
  ? weightSources.map(site => ({ ...site, progress: props.progress.sources?.[site.source] }))
  : [{ source: 'legacy' as const, label: '权重采集', host: '当前接口返回汇总进度', progress: props.progress }])
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
          <dl class="source-progress-counts"><div><dt>成功</dt><dd>{{ card.progress.succeeded }}</dd></div><div :class="{ 'has-failures': card.progress.failed }"><dt>失败</dt><dd><button v-if="card.progress.failed" class="failure-count-button" type="button" :aria-label="`查看${card.label}失败的 ${card.progress.failed} 个域名`" @click="selectedFailure = { source: card.source, label: card.label, date: card.progress.snapshot_date || progress.snapshot_date }">{{ card.progress.failed }}</button><template v-else>{{ card.progress.failed }}</template></dd></div><div><dt>执行中</dt><dd>{{ card.progress.running }}</dd></div><div><dt>排队 / 待重试</dt><dd>{{ card.progress.queued }}</dd></div><div><dt>待入队</dt><dd>{{ card.progress.pending }}</dd></div><div><dt>已取消</dt><dd>{{ card.progress.canceled }}</dd></div></dl>
        </template>
        <p v-else class="source-empty-note">接口尚未返回该来源的进度，不计为完成。</p>
      </article>
    </div>
    <p v-if="progress.supplement" class="source-supplement">站长资料补充：{{ progressLabel(progress.supplement) }} · {{ progress.supplement.completed }} / {{ progress.supplement.total }}（成功 {{ progress.supplement.succeeded }}，失败 {{ progress.supplement.failed }}）<span>排名、分类及注册资料单独统计</span></p>
  </section>
  <FailedDomainsDialog v-if="selectedFailure" v-bind="selectedFailure" @close="selectedFailure = undefined" />
</template>

<style scoped>
.failure-count-button { padding: 2px 6px; margin: -2px -6px; border: 0; border-radius: 4px; background: transparent; color: inherit; font: inherit; cursor: pointer; text-decoration: underline; text-underline-offset: 3px; }
.failure-count-button:hover { background: #fee4e2; }
.failure-count-button:focus-visible { outline: 2px solid #b42318; outline-offset: 2px; }
</style>
