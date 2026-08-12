<script setup lang="ts">
import { ref } from 'vue'

defineProps<{ loading: boolean; error: string }>()
const emit = defineEmits<{ submit: [payload: { username: string; password: string }] }>()

const username = ref('')
const password = ref('')

function submit() {
  if (!username.value.trim() || !password.value) return
  emit('submit', { username: username.value.trim(), password: password.value })
}
</script>

<template>
  <main class="login-shell">
    <section class="login-card" aria-labelledby="login-title">
      <div class="login-brand">
        <div class="brand-mark">S</div>
        <div>
          <h1 id="login-title">SEO 域名监控</h1>
          <p>每日权重、流量与域名信息快照</p>
        </div>
      </div>

      <div class="login-heading">
        <span class="login-eyebrow">管理后台</span>
        <h2>登录您的账号</h2>
        <p>请输入账号与密码继续访问。</p>
      </div>

      <form class="login-form" @submit.prevent="submit">
        <label>
          <span>账号</span>
          <input v-model="username" name="username" autocomplete="username" required autofocus placeholder="请输入账号" />
        </label>
        <label>
          <span>密码</span>
          <input v-model="password" name="password" type="password" autocomplete="current-password" required placeholder="请输入密码" />
        </label>
        <p v-if="error" class="login-error" role="alert">{{ error }}</p>
        <button class="button primary login-button" :disabled="loading" type="submit">
          <span v-if="loading" class="spinner login-spinner"></span>
          {{ loading ? '正在登录…' : '登录' }}
        </button>
      </form>

      <p class="login-footnote">登录会话受安全令牌保护，过期后需要重新登录。</p>
    </section>
  </main>
</template>
