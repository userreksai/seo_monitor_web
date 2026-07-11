import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs'
import { createServer, request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { extname, join, normalize, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('.', import.meta.url))
loadEnvironment(join(root, '.env'))

const host = process.env.HOST || '0.0.0.0'
const port = parsePort(process.env.PORT || '8889')
const backend = new URL(process.env.BACKEND_API_URL || 'http://127.0.0.1:10001')
const backendToken = process.env.BACKEND_API_TOKEN || ''
const webAuthEnabled = /^(1|true|yes|on)$/i.test(process.env.WEB_AUTH_ENABLED || '')
const webUsername = process.env.WEB_USERNAME || ''
const webPassword = process.env.WEB_PASSWORD || ''
const dist = resolve(root, 'dist')

if (!existsSync(join(dist, 'index.html'))) {
  console.error('dist/index.html 不存在，请先执行 npm run build')
  process.exit(1)
}
if (!backendToken) {
  console.error('BACKEND_API_TOKEN 未配置，拒绝启动不完整的 API 代理')
  process.exit(1)
}
if (webAuthEnabled && (!webUsername || !webPassword)) {
  console.error('WEB_USERNAME/WEB_PASSWORD 未配置，拒绝将管理页面无保护地暴露到网络')
  process.exit(1)
}

const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}

const server = createServer((request, response) => {
  response.setHeader('X-Content-Type-Options', 'nosniff')
  response.setHeader('X-Frame-Options', 'DENY')
  response.setHeader('Referrer-Policy', 'same-origin')
  response.setHeader('Content-Security-Policy', "default-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'")

  const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`)
  if (url.pathname === '/frontend-health') {
    return sendJSON(response, 200, { status: 'ok', port, backend: backend.origin })
  }
  if (webAuthEnabled && !authorized(request.headers.authorization)) {
    response.setHeader('WWW-Authenticate', 'Basic realm="SEO Monitor", charset="UTF-8"')
    return sendJSON(response, 401, { error: '需要登录' })
  }
  if (url.pathname === '/healthz' || url.pathname.startsWith('/api/')) {
    return proxyRequest(request, response)
  }
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return sendJSON(response, 405, { error: 'method not allowed' })
  }
  return serveStatic(url.pathname, request.method === 'HEAD', response)
})

server.on('clientError', (_error, socket) => socket.end('HTTP/1.1 400 Bad Request\r\n\r\n'))
server.listen(port, host, () => {
  console.log(`SEO Monitor Web listening on http://${host}:${port}`)
  console.log(`API proxy target: ${backend.origin}`)
  console.log(`Web authentication: ${webAuthEnabled ? 'enabled' : 'disabled'}`)
})

function authorized(header = '') {
  if (!header.startsWith('Basic ')) return false
  try {
    const value = Buffer.from(header.slice(6), 'base64').toString('utf8')
    const separator = value.indexOf(':')
    return separator >= 0 && value.slice(0, separator) === webUsername && value.slice(separator + 1) === webPassword
  } catch {
    return false
  }
}

function proxyRequest(incoming, outgoing) {
  const target = new URL(incoming.url || '/', backend)
  const requestImpl = target.protocol === 'https:' ? httpsRequest : httpRequest
  const headers = { ...incoming.headers, host: target.host, authorization: `Bearer ${backendToken}` }
  delete headers['content-length']
  delete headers['proxy-authorization']

  const proxied = requestImpl(target, { method: incoming.method, headers }, (backendResponse) => {
    outgoing.writeHead(backendResponse.statusCode || 502, backendResponse.headers)
    backendResponse.pipe(outgoing)
  })
  proxied.setTimeout(30_000, () => proxied.destroy(new Error('backend timeout')))
  proxied.on('error', (error) => {
    if (!outgoing.headersSent) sendJSON(outgoing, 502, { error: `后端服务不可用：${error.message}` })
    else outgoing.destroy(error)
  })
  incoming.pipe(proxied)
}

function serveStatic(pathname, headOnly, response) {
  let decoded
  try {
    decoded = decodeURIComponent(pathname)
  } catch {
    return sendJSON(response, 400, { error: 'invalid path' })
  }
  const relative = normalize(decoded).replace(/^([/\\])+/, '')
  let file = resolve(dist, relative)
  if (!file.startsWith(`${dist}\\`) && !file.startsWith(`${dist}/`) && file !== dist) {
    return sendJSON(response, 403, { error: 'forbidden' })
  }
  if (!existsSync(file) || !statSync(file).isFile()) file = join(dist, 'index.html')

  const extension = extname(file).toLowerCase()
  response.statusCode = 200
  response.setHeader('Content-Type', mimeTypes[extension] || 'application/octet-stream')
  response.setHeader('Cache-Control', extension === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable')
  if (headOnly) return response.end()
  createReadStream(file).on('error', () => sendJSON(response, 500, { error: 'read error' })).pipe(response)
}

function sendJSON(response, status, body) {
  if (response.headersSent) return response.end()
  response.statusCode = status
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.end(JSON.stringify(body))
}

function parsePort(value) {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) throw new Error(`无效端口：${value}`)
  return parsed
}

function loadEnvironment(file) {
  if (!existsSync(file)) return
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const separator = trimmed.indexOf('=')
    if (separator <= 0) continue
    const key = trimmed.slice(0, separator).trim()
    let value = trimmed.slice(separator + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1)
    if (!(key in process.env)) process.env[key] = value
  }
}
