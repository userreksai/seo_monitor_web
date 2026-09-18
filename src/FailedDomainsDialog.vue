<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { searchLatest } from './api'
import { loadFailedDomains } from './collection-failures'
import type { FailedDomain, FailureSource } from './collection-failures'

const props = defineProps<{ source: FailureSource; label: string; date: string }>()
const emit = defineEmits<{ close: [] }>()
const dialog = ref<HTMLDialogElement>()
const loading = ref(false)
const error = ref('')
const failures = ref<FailedDomain[]>([])
let disposed = false

async function load() {
  loading.value = true
  error.value = ''
  failures.value = []
  try {
    const result = await loadFailedDomains(props.source, props.date, (page) => {
      if (disposed) throw new Error('窗口已关闭')
      // Fetch all domains: another source's successful job may be the aggregate latest job.
      return searchLatest('domain', '', page, 100)
    })
    if (!disposed) failures.value = result
  } catch (cause) {
    if (!disposed) error.value = cause instanceof Error ? cause.message : '读取失败域名失败'
  } finally {
    if (!disposed) loading.value = false
  }
}

onMounted(() => { dialog.value?.showModal(); void load() })
onUnmounted(() => { disposed = true; dialog.value?.close() })
</script>

<template>
  <dialog ref="dialog" class="modal failed-domains-dialog" aria-labelledby="failed-domains-title" @cancel.prevent="emit('close')" @click="event => { if (event.target === dialog) emit('close') }">
    <div class="modal-heading">
      <div><h2 id="failed-domains-title">{{ label }} · 失败域名</h2><p>{{ date.slice(0, 10) }}<template v-if="!loading && !error"> · 共 {{ failures.length }} 个</template></p></div>
      <button class="button ghost" type="button" autofocus @click="emit('close')">关闭</button>
    </div>
    <p v-if="loading" role="status">正在读取失败域名…</p>
    <p v-else-if="error" class="progress-error" role="alert">{{ error }}</p>
    <template v-else>
      <p v-if="!failures.length" role="status">该来源当天暂无失败域名，任务状态可能已更新。</p>
      <div v-else class="table-wrap">
        <table>
          <thead><tr><th>域名</th><th>失败原因</th></tr></thead>
          <tbody><tr v-for="item in failures" :key="item.domain.id"><td>{{ item.domain.domain }}<small v-if="item.domain.display_name" class="failure-domain-name">{{ item.domain.display_name }}</small></td><td class="failure-reason">{{ item.job.error_message || '未返回失败原因' }}</td></tr></tbody>
        </table>
      </div>
    </template>
    <div class="modal-actions"><button class="button secondary" type="button" :disabled="loading" @click="load">刷新列表</button></div>
  </dialog>
</template>

<style scoped>
.failed-domains-dialog { border: 0; color: #18202f; }
.failed-domains-dialog::backdrop { background: rgba(10, 18, 32, .58); backdrop-filter: blur(2px); }
table { min-width: 0; table-layout: fixed; }
th:first-child { width: 35%; }
td { overflow-wrap: anywhere; }
.failure-domain-name { display: block; margin-top: 4px; color: var(--muted); }
.failure-reason { white-space: normal; overflow-wrap: anywhere; min-width: 180px; }
.modal-actions { margin-top: 18px; }
</style>
