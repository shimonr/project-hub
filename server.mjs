// Zero-dependency Node server: serves the landing page from ./public and
// monitors every project environment listed in public/projects.json.
import { createServer } from 'node:http'
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises'
import { extname, join, normalize, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = dirname(fileURLToPath(import.meta.url))
const PUBLIC = join(ROOT, 'public')
const PORT = Number(process.env.PORT || 8080)
const DATA_DIR = process.env.DATA_DIR || join(ROOT, 'data')
const HISTORY_FILE = join(DATA_DIR, 'history.json')
const CHECK_MS = Number(process.env.CHECK_INTERVAL_SECONDS || 60) * 1000
const METRICS_MS = 10 * 60 * 1000
const GITHUB_MS = 60 * 60 * 1000
const KEEP_MS = 7 * 24 * 60 * 60 * 1000
const BUCKETS = 48
const BUCKET_MS = 30 * 60 * 1000

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
}

const SECURITY_HEADERS = {
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self' https:; frame-ancestors 'none'; base-uri 'self'; form-action 'none'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
}

// service id -> [{ t, ok, ms, code }]
let history = {}
// service id -> latest check details
const latest = {}
// project id -> { github, metrics }
const projectData = {}

async function loadConfig() {
  return JSON.parse(await readFile(join(PUBLIC, 'projects.json'), 'utf8'))
}

function services(config) {
  return config.projects.flatMap((p) =>
    p.environments.map((env) => ({
      id: `${p.id}:${env.name.toLowerCase()}`,
      projectId: p.id,
      project: p.name,
      env: env.name,
      url: env.url,
      health: env.health || env.url,
    })),
  )
}

async function timedFetch(url, timeoutMs = 10000, headers = {}) {
  const started = performance.now()
  const res = await fetch(url, {
    signal: AbortSignal.timeout(timeoutMs),
    headers: { 'user-agent': 'project-hub-monitor', ...headers },
    redirect: 'follow',
  })
  return { res, ms: Math.round(performance.now() - started) }
}

async function checkService(svc) {
  const t = Date.now()
  try {
    const { res, ms } = await timedFetch(svc.health)
    const body = await res.text()
    let info = {}
    try {
      info = JSON.parse(body)
    } catch {}
    const ok = res.ok && (info.status === undefined || info.status === 'ok')
    latest[svc.id] = { t, ok, ms, code: res.status, version: info.version, commit: info.commit }
  } catch (err) {
    latest[svc.id] = { t, ok: false, ms: null, code: null, error: err.name === 'TimeoutError' ? 'timeout' : 'unreachable' }
  }
  const { ok, ms, code } = latest[svc.id]
  ;(history[svc.id] ||= []).push({ t, ok, ms, code })
}

async function runChecks() {
  const config = await loadConfig()
  await Promise.all(services(config).map(checkService))
  const cutoff = Date.now() - KEEP_MS
  for (const id of Object.keys(history)) history[id] = history[id].filter((s) => s.t >= cutoff)
  try {
    await mkdir(DATA_DIR, { recursive: true })
    await writeFile(`${HISTORY_FILE}.tmp`, JSON.stringify(history))
    await rename(`${HISTORY_FILE}.tmp`, HISTORY_FILE)
  } catch (err) {
    console.error('could not persist history:', err.message)
  }
}

async function collectMetrics() {
  const config = await loadConfig()
  const cache = new Map()
  for (const p of config.projects) {
    for (const m of p.metrics || []) {
      try {
        if (!cache.has(m.url)) cache.set(m.url, timedFetch(m.url).then(({ res }) => res.json()))
        const rows = await cache.get(m.url)
        const value = m.op === 'unique' ? new Set(rows.map((r) => r[m.field])).size : rows.length
        ;((projectData[p.id] ||= {}).metrics ||= {})[m.key] = value
      } catch (err) {
        console.error(`metric ${p.id}/${m.key} failed:`, err.message)
      }
    }
  }
}

async function collectGithub() {
  const config = await loadConfig()
  const headers = { accept: 'application/vnd.github+json' }
  if (process.env.GITHUB_TOKEN) headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`
  for (const p of config.projects.filter((p) => p.repo)) {
    try {
      const api = `https://api.github.com/repos/${p.repo}`
      const [repo, langs, commits] = await Promise.all([
        timedFetch(api, 10000, headers).then(({ res }) => res.json()),
        timedFetch(`${api}/languages`, 10000, headers).then(({ res }) => res.json()),
        timedFetch(`${api}/commits?per_page=1`, 10000, headers).then(({ res }) => res),
      ])
      if (!repo.full_name) throw new Error(repo.message || 'unexpected response')
      const last = /page=(\d+)>; rel="last"/.exec(commits.headers.get('link') || '')
      const commitCount = last ? Number(last[1]) : (await commits.json()).length
      const total = Object.values(langs).reduce((a, b) => a + b, 0) || 1
      ;(projectData[p.id] ||= {}).github = {
        commits: commitCount,
        pushedAt: repo.pushed_at,
        createdAt: repo.created_at,
        stars: repo.stargazers_count,
        languages: Object.entries(langs)
          .slice(0, 4)
          .map(([name, bytes]) => ({ name, share: Math.round((bytes / total) * 1000) / 10 })),
      }
    } catch (err) {
      console.error(`github ${p.repo} failed:`, err.message)
    }
  }
}

function summarize(svc) {
  const samples = history[svc.id] || []
  const now = Date.now()
  const uptime = (windowMs) => {
    const s = samples.filter((x) => x.t >= now - windowMs)
    return s.length ? Math.round((s.filter((x) => x.ok).length / s.length) * 10000) / 100 : null
  }
  const buckets = []
  for (let i = BUCKETS - 1; i >= 0; i--) {
    const start = now - (i + 1) * BUCKET_MS
    const s = samples.filter((x) => x.t >= start && x.t < start + BUCKET_MS)
    buckets.push({
      start,
      checks: s.length,
      up: s.length ? s.filter((x) => x.ok).length / s.length : null,
    })
  }
  const okMs = samples.filter((x) => x.ok && x.ms != null)
  const recent = okMs.slice(-50)
  return {
    ...svc,
    ...(latest[svc.id] || {}),
    uptime24h: uptime(24 * 60 * 60 * 1000),
    uptime7d: uptime(KEEP_MS),
    avgMs: recent.length ? Math.round(recent.reduce((a, b) => a + b.ms, 0) / recent.length) : null,
    latency: samples.slice(-40).map((x) => x.ms),
    buckets,
    monitoredSince: samples[0]?.t ?? null,
  }
}

async function statusPayload() {
  const config = await loadConfig()
  return {
    generatedAt: Date.now(),
    intervalSeconds: CHECK_MS / 1000,
    services: services(config).map(summarize),
    projects: projectData,
  }
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, { ...SECURITY_HEADERS, ...headers })
  res.end(body)
}

const server = createServer((req, res) =>
  handle(req, res).catch((err) => {
    console.error(err)
    if (!res.headersSent) send(res, 400, 'Bad request')
  }),
)

async function handle(req, res) {
  const url = new URL(req.url, 'http://localhost')
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed')
  if (url.pathname === '/api/status') {
    return send(res, 200, JSON.stringify(await statusPayload()), {
      'Content-Type': MIME['.json'],
      'Cache-Control': 'no-store',
    })
  }
  if (url.pathname === '/healthz') return send(res, 200, 'ok', { 'Content-Type': MIME['.txt'] })

  const rel = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '')
  const file = join(PUBLIC, rel === '' ? 'index.html' : rel)
  if (!file.startsWith(PUBLIC)) return send(res, 403, 'Forbidden')
  try {
    const body = await readFile(file)
    const ext = extname(file)
    send(res, 200, req.method === 'HEAD' ? undefined : body, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': ['.webp', '.png', '.jpg', '.svg'].includes(ext) ? 'public, max-age=86400' : 'no-cache',
    })
  } catch {
    send(res, 404, 'Not found', { 'Content-Type': MIME['.txt'] })
  }
}

try {
  history = JSON.parse(await readFile(HISTORY_FILE, 'utf8'))
} catch {}

server.listen(PORT, () => console.log(`project hub listening on :${PORT}`))

const every = (fn, ms) => {
  const run = () => fn().catch((err) => console.error(err))
  run()
  setInterval(run, ms).unref()
}
every(runChecks, CHECK_MS)
every(collectMetrics, METRICS_MS)
every(collectGithub, GITHUB_MS)
