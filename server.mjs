import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs'
import { createServer, request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { extname, join, normalize, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('.', import.meta.url))
loadEnvironment(join(root, '.env'))

const host = process.env.HOST || '127.0.0.1'
const port = parsePort(process.env.PORT || '8889')
const backend = new URL(process.env.BACKEND_API_URL || 'http://127.0.0.1:10001')
const dist = resolve(root, 'dist')

if (!existsSync(join(dist, 'index.html'))) {
  console.error('dist/index.html 不存在，请先执行 npm run build')
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
	response.setHeader('X-XSS-Protection', '0')
	response.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
	response.setHeader('Cross-Origin-Opener-Policy', 'same-origin')
	response.setHeader('Cross-Origin-Resource-Policy', 'same-origin')
	response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()')
	response.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive')
	response.setHeader(
		'Content-Security-Policy',
		"default-src 'self'; base-uri 'none'; object-src 'none'; style-src 'self'; img-src 'self' data:; connect-src 'self'; form-action 'self'; frame-ancestors 'none'",
	)

  let url
  try {
    url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`)
  } catch {
    return sendJSON(response, 400, { error: 'invalid request target' })
  }
  if (url.pathname === '/frontend-health') {
		return sendJSON(response, 200, { status: 'ok' })
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
server.headersTimeout = 10_000
server.requestTimeout = 35_000
server.keepAliveTimeout = 10_000
server.maxRequestsPerSocket = 1_000
server.listen(port, host, () => {
  console.log(`SEO Monitor Web listening on http://${host}:${port}`)
  console.log(`API proxy target: ${backend.origin}`)
})

function proxyRequest(incoming, outgoing) {
	const incomingURL = new URL(incoming.url || '/', 'http://local.invalid')
	const target = new URL(backend)
	target.pathname = incomingURL.pathname
	target.search = incomingURL.search
  const requestImpl = target.protocol === 'https:' ? httpsRequest : httpRequest
  const headers = { ...incoming.headers, host: target.host }
  delete headers['proxy-authorization']
	delete headers['proxy-connection']
	delete headers['forwarded']
	delete headers['x-forwarded-host']

  const proxied = requestImpl(target, { method: incoming.method, headers }, (backendResponse) => {
    outgoing.writeHead(backendResponse.statusCode || 502, backendResponse.headers)
    backendResponse.pipe(outgoing)
  })
  proxied.setTimeout(30_000, () => proxied.destroy(new Error('backend timeout')))
  proxied.on('error', (error) => {
    console.error('Backend proxy request failed:', error.message)
    if (!outgoing.headersSent) sendJSON(outgoing, 502, { error: '后端服务暂不可用' })
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
  if (relative.split(/[/\\]/).some((part) => part.startsWith('.'))) {
    return sendJSON(response, 404, { error: 'not found' })
  }
  let file = resolve(dist, relative)
  if (!file.startsWith(`${dist}\\`) && !file.startsWith(`${dist}/`) && file !== dist) {
    return sendJSON(response, 403, { error: 'forbidden' })
  }
  if (!existsSync(file) || !statSync(file).isFile()) {
    if (extname(relative)) return sendJSON(response, 404, { error: 'not found' })
    file = join(dist, 'index.html')
  }

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
