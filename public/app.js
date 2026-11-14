const $ = (sel, root = document) => root.querySelector(sel)
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)]
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches
const LANG_COLORS = { TypeScript: '#3178c6', Python: '#f7c948', JavaScript: '#f1e05a', Luau: '#00a2ff', Shell: '#89e051', CSS: '#663399', PowerShell: '#4b74c9', HTML: '#e34c26', Dockerfile: '#384d54' }
const TECH = ['React', 'TypeScript', 'Python', 'FastAPI', 'PostgreSQL', 'SQLAlchemy', 'Docker', 'Caddy', 'Oracle Cloud', 'Tailwind CSS', 'Vite', 'GitHub Actions', 'Alembic', 'Luau', 'Roblox', 'PWA', 'Let\'s Encrypt']
const TECH_COLORS = ['#a78bfa', '#22d3ee', '#f472b6', '#34d399', '#fbbf24', '#60a5fa']

let config
let status = null
let lastFetch = 0
let intervalMs = 60000

// ---------- helpers ----------
function timeAgo(ts) {
  const s = Math.max(0, Math.round((Date.now() - new Date(ts).getTime()) / 1000))
  if (s < 60) return `${s}s ago`
  const m = Math.round(s / 60)
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  if (h < 48) return `${h}h ago`
  const d = Math.round(h / 24)
  if (d < 60) return `${d} days ago`
  return `${Math.round(d / 30)} months ago`
}
// Host plus path, since several apps share shimonr.com under different paths.
function host(url) {
  const u = new URL(url)
  return (u.host + u.pathname).replace(/\/$/, '')
}
function toast(msg) {
  const t = $('#toast')
  t.textContent = msg
  t.classList.add('show')
  clearTimeout(toast.timer)
  toast.timer = setTimeout(() => t.classList.remove('show'), 2600)
}
function animateNumber(el, to, { prefix = '', suffix = '', decimals = 0 } = {}) {
  const from = Number(el.dataset.current || 0)
  el.dataset.current = to
  if (reduceMotion || from === to) {
    el.textContent = prefix + to.toFixed(decimals) + suffix
    return
  }
  const start = performance.now()
  const dur = 1400
  const step = (now) => {
    const p = Math.min(1, (now - start) / dur)
    const eased = 1 - Math.pow(1 - p, 4)
    el.textContent = prefix + (from + (to - from) * eased).toFixed(decimals) + suffix
    if (p < 1) requestAnimationFrame(step)
  }
  requestAnimationFrame(step)
}

// ---------- rendering ----------
function statValue(project, stat) {
  if (stat.value != null) return stat.value
  const live = status?.projects?.[project.id]?.metrics?.[stat.metric]
  if (live != null) return live
  return project.metrics?.find((m) => m.key === stat.metric)?.fallback ?? 0
}

function statsHtml(project) {
  if (!project.stats.length) return ''
  return `<div class="stats">${project.stats
    .map(
      (s) => `<div class="stat"><b data-project="${project.id}" data-label="${esc(s.label)}" data-prefix="${esc(s.prefix || '')}" data-suffix="${esc(s.suffix || '')}" data-target="${statValue(project, s)}">${esc(s.prefix || '')}0${esc(s.suffix || '')}</b><span>${esc(s.label)}</span></div>`,
    )
    .join('')}</div>`
}

function linksHtml(project) {
  return project.links
    .map((l) => {
      const icon = l.label === 'Source'
        ? '<svg viewBox="0 0 24 24" class="gh" aria-hidden="true"><path d="M12 .5a12 12 0 0 0-3.8 23.4c.6.1.8-.3.8-.6v-2.2c-3.3.7-4-1.4-4-1.4-.6-1.4-1.4-1.8-1.4-1.8-1.1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1.1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.8-1.6-2.7-.3-5.5-1.3-5.5-5.9 0-1.3.5-2.4 1.2-3.2-.1-.3-.5-1.5.1-3.2 0 0 1-.3 3.3 1.2a11.5 11.5 0 0 1 6 0C17 4.7 18 5 18 5c.7 1.7.3 2.9.1 3.2.8.8 1.2 1.9 1.2 3.2 0 4.6-2.8 5.6-5.5 5.9.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6A12 12 0 0 0 12 .5Z"/></svg>'
        : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17 17 7M8 7h9v9"/></svg>'
      return `<a class="btn ${l.primary ? 'btn-primary' : 'btn-ghost'} magnetic" href="${esc(l.url)}" target="_blank" rel="noopener"><span>${esc(l.label)}</span>${icon}</a>`
    })
    .join('')
}

function accentStyle(p) {
  return `--a1:${p.accent[0]};--a2:${p.accent[1]}`
}

function renderFeatured() {
  const live = config.projects.filter((p) => p.stage === config.stages.length - 1)
  $('#featured').innerHTML = live
    .map(
      (p, i) => `
    <article class="project reveal ${i % 2 ? 'flip' : ''}" id="p-${p.id}" style="${accentStyle(p)}">
      <div class="project-body">
        <div class="project-top">
          <div class="project-icon">${p.emoji}</div>
          <div><h3>${esc(p.name)}</h3><div class="project-sub">${esc(p.subtitle)}</div></div>
          <span class="live-chip" data-chip="${p.id}"><i class="dot"></i><span>checking…</span></span>
        </div>
        <p class="tagline">${esc(p.tagline)}</p>
        <p class="desc">${esc(p.description)}</p>
        <ul class="features">${p.features.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>
        ${statsHtml(p)}
        <div class="chips">${p.stack.map((s) => `<span class="chip">${esc(s)}</span>`).join('')}</div>
        <div class="actions">${linksHtml(p)}</div>
        <div data-repo="${p.id}"></div>
      </div>
      <div class="project-visual">
        <a class="browser" href="${esc(p.links.find((l) => l.primary)?.url || '#')}" target="_blank" rel="noopener" aria-label="Open ${esc(p.name)}">
          <div class="browser-bar"><i></i><i></i><i></i><span class="browser-url"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>${esc(host(p.environments[0].url))}</span></div>
          <img src="${esc(p.screenshot)}" alt="${esc(p.name)} screenshot" loading="lazy" width="1280" height="800" />
          <span class="shine"></span>
        </a>
        <div class="env-row">${p.environments
          .map((e) => `<a class="env" href="${esc(e.url)}" target="_blank" rel="noopener" data-env="${p.id}:${e.name.toLowerCase()}"><i class="dot"></i><strong>${esc(e.name)}</strong><small>—</small></a>`)
          .join('')}</div>
      </div>
    </article>`,
    )
    .join('')
}

function renderPipeline() {
  const n = config.stages.length
  const rows = [...config.projects].sort((a, b) => b.stage - a.stage)
  $('#pipelineBoard').innerHTML = `<div class="pipe-grid" style="--stages:${n}">
    <div class="pipe-stage first">Project</div>
    ${config.stages.map((s) => `<div class="pipe-stage">${esc(s)}</div>`).join('')}
    ${rows
      .map(
        (p) => `
      <div class="pipe-name"><span>${p.emoji}</span><div>${esc(p.name)}<small>${esc(config.stages[p.stage])}</small></div></div>
      <div class="pipe-track" style="${accentStyle(p)}">
        <div class="pipe-dots">${config.stages.map((_, i) => `<i class="${i <= p.stage ? 'done' : ''}"></i>`).join('')}</div>
        <div class="pipe-fill ${p.stage === 0 ? 'zero' : ''}" data-emoji="${p.emoji}" data-width="${(p.stage / (n - 1)) * 100}"></div>
      </div>`,
      )
      .join('')}
  </div>`
}

function renderUpcoming() {
  const n = config.stages.length
  const soon = config.projects.filter((p) => p.stage < n - 1)
  $('#upcoming').innerHTML =
    soon
      .map(
        (p) => `
    <article class="soon reveal" id="p-${p.id}" style="${accentStyle(p)}">
      <span class="stage-badge">${esc(config.stages[p.stage])}</span>
      <div class="project-icon">${p.emoji}</div>
      <h3>${esc(p.name)}</h3>
      <div class="project-sub">${esc(p.subtitle)}</div>
      <p class="tagline">${esc(p.tagline)}</p>
      <p class="desc">${esc(p.description)}</p>
      <ul class="features">${p.features.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>
      ${statsHtml(p)}
      <div class="stage-progress"><div><span>Stage ${p.stage + 1} of ${n}</span><span>next: ${esc(config.stages[p.stage + 1])}</span></div><span class="bar"><i data-width="${((p.stage + 1) / n) * 100}"></i></span></div>
      <div data-repo="${p.id}"></div>
      <div class="actions" style="margin-top:18px">${p.links.length ? linksHtml(p) : '<span class="btn btn-ghost" aria-disabled="true"><span>Link arrives at launch</span></span>'}</div>
    </article>`,
      )
      .join('') +
    `<article class="soon placeholder reveal"><div class="plus">+</div><h3>Your next big idea</h3><p>Every new project lands here first, then climbs the pipeline to production.</p></article>`
}

function renderMarquee() {
  const items = TECH.map((t, i) => `<span><i style="background:${TECH_COLORS[i % TECH_COLORS.length]}"></i>${esc(t)}</span>`).join('')
  $('#marquee').innerHTML = items + items
}

function renderRepoMeta() {
  let commits = 0
  for (const p of config.projects) {
    const gh = status?.projects?.[p.id]?.github
    const el = $(`[data-repo="${p.id}"]`)
    if (!gh || !el) continue
    commits += gh.commits
    el.innerHTML = `<div class="repo-meta"><span><b>${gh.commits}</b> commit${gh.commits === 1 ? '' : 's'}</span><span>last push <b>${timeAgo(gh.pushedAt)}</b></span>${gh.languages
      .slice(0, 3)
      .map((l) => `<span>${esc(l.name)} <b>${l.share}%</b></span>`)
      .join('')}</div><div class="lang-bar">${gh.languages.map((l) => `<i title="${esc(l.name)} ${l.share}%" style="width:${l.share}%;background:${LANG_COLORS[l.name] || '#888'}"></i>`).join('')}</div>`
  }
  if (commits) animateNumber($('#cCommits'), commits)
}

// ---------- status ----------
function bucketClass(b) {
  if (b.up == null) return ''
  if (b.up === 1) return 'ok'
  return b.up >= 0.5 ? 'partial' : 'bad'
}

function sparkline(values, color) {
  const pts = values.map((v, i) => [i, v]).filter(([, v]) => v != null)
  if (pts.length < 2) return '<svg class="spark" viewBox="0 0 100 40"></svg>'
  const max = Math.max(...pts.map(([, v]) => v)) * 1.15
  const min = Math.min(...pts.map(([, v]) => v)) * 0.85
  const n = values.length - 1 || 1
  const xy = pts.map(([i, v]) => [(i / n) * 100, 38 - ((v - min) / (max - min || 1)) * 34])
  const line = xy.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(2)},${y.toFixed(2)}`).join(' ')
  const id = `g${Math.random().toString(36).slice(2, 8)}`
  return `<svg class="spark" viewBox="0 0 100 40" preserveAspectRatio="none" aria-label="Response time trend">
    <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${color}" stop-opacity=".35"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs>
    <path class="area" d="${line} L${xy.at(-1)[0]},40 L${xy[0][0]},40 Z" fill="url(#${id})"/>
    <path class="line" d="${line}" stroke="${color}" vector-effect="non-scaling-stroke"/></svg>`
}

function renderServices() {
  const project = (id) => config.projects.find((p) => p.id === id)
  $('#services').innerHTML = status.services
    .map((s) => {
      const p = project(s.projectId)
      const state = s.ok == null ? 'unknown' : s.ok ? 'up' : 'down'
      const label = state === 'up' ? 'Operational' : state === 'down' ? (s.error || `HTTP ${s.code}`) : 'Pending'
      return `<div class="service" style="${accentStyle(p)}">
        <div class="service-head"><i class="dot ${state}"></i><div class="service-name">${p.emoji} ${esc(s.project)} · ${esc(s.env)}<small>${esc(host(s.url))}</small></div><span class="badge ${state}">${esc(label)}</span></div>
        <div class="metrics">
          <div>Response<b>${s.ms != null ? `${s.ms} ms` : '—'}</b></div>
          <div>Uptime 24h<b>${s.uptime24h != null ? `${s.uptime24h}%` : '—'}</b></div>
          <div>Avg<b>${s.avgMs != null ? `${s.avgMs} ms` : '—'}</b></div>
          <div>Version<b>${s.version ? `v${esc(s.version)}` : '—'}</b></div>
        </div>
        ${s.buckets
          ? `<div class="bars">${s.buckets
              .map((b) => `<i class="${bucketClass(b)}" data-tip="${new Date(b.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · ${b.up == null ? 'no data' : `${Math.round(b.up * 100)}% up · ${b.checks} checks`}"></i>`)
              .join('')}</div><div class="bars-legend"><span>24h ago</span><span>${s.monitoredSince ? `monitoring since ${new Date(s.monitoredSince).toLocaleDateString()}` : ''}</span><span>now</span></div>`
          : ''}
        ${s.latency ? sparkline(s.latency, p.accent[0]) : ''}
      </div>`
    })
    .join('')
}

function updateIndicators() {
  const svcs = status.services
  const known = svcs.filter((s) => s.ok != null)
  const up = known.filter((s) => s.ok).length
  const allUp = known.length > 0 && up === known.length
  const state = !known.length ? '' : allUp ? 'up' : up === 0 ? 'down' : 'degraded'
  const headline = !known.length ? 'Checking…' : allUp ? 'All systems operational' : up === 0 ? 'Major outage' : 'Partial outage'

  $('#sysPill').innerHTML = `<i class="dot ${state}"></i><span>${up}/${svcs.length} services up</span>`
  $('#overall').innerHTML = `<i class="dot ${state}"></i><div><strong>${headline}</strong><span>${up} of ${svcs.length} environments healthy${status.fallback ? ' · browser probe mode' : ''}</span></div>`
  document.title = `${allUp ? '●' : '▲'} ${up}/${svcs.length} up · Shimon · Project Hub`
  setFavicon(state)

  const uptimes = svcs.map((s) => s.uptime24h).filter((u) => u != null)
  if (uptimes.length) animateNumber($('#cUptime'), uptimes.reduce((a, b) => a + b, 0) / uptimes.length, { suffix: '%', decimals: uptimes.every((u) => u === 100) ? 0 : 2 })

  for (const s of svcs) {
    const env = $(`[data-env="${s.id}"]`)
    if (env) {
      env.querySelector('.dot').className = `dot ${s.ok == null ? '' : s.ok ? 'up' : 'down'}`
      env.querySelector('small').textContent = s.ok ? `${s.ms} ms` : s.ok === false ? 'down' : '—'
    }
  }
  for (const p of config.projects) {
    const chip = $(`[data-chip="${p.id}"]`)
    const prod = svcs.find((s) => s.projectId === p.id)
    if (!chip || !prod) continue
    chip.innerHTML = prod.ok
      ? `<i class="dot up"></i><span>live${prod.version ? ` · <b>v${esc(prod.version)}</b>` : ''} · <b>${prod.ms}ms</b></span>`
      : `<i class="dot ${prod.ok === false ? 'down' : ''}"></i><span>${prod.ok === false ? 'unreachable' : 'checking…'}</span>`
  }
  // live metric values (e.g. asana counts) may have changed
  for (const el of $$('.stat b[data-project]')) {
    const p = config.projects.find((x) => x.id === el.dataset.project)
    const s = p.stats.find((x) => x.label === el.dataset.label)
    const v = statValue(p, s)
    el.dataset.target = v
    if (el.dataset.shown) animateNumber(el, v, { prefix: el.dataset.prefix, suffix: el.dataset.suffix })
  }
}

function setFavicon(state) {
  const color = { up: '#34d399', down: '#f87171', degraded: '#fbbf24' }[state]
  if (!color) return
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#a78bfa"/><stop offset=".5" stop-color="#22d3ee"/><stop offset="1" stop-color="#f472b6"/></linearGradient></defs><rect width="32" height="32" rx="9" fill="#0b0c14"/><path d="M10 20.5c1.2 1.4 3.2 2.2 5.6 2.2 3 0 5-1.5 5-3.8 0-2.3-1.8-3.2-4.8-3.8-2.6-.5-3.7-1-3.7-2.2 0-1.1 1.1-1.9 2.9-1.9 1.6 0 2.9.6 3.8 1.6" fill="none" stroke="url(#g)" stroke-width="2.6" stroke-linecap="round"/><circle cx="25" cy="7" r="5.5" fill="${color}" stroke="#0b0c14" stroke-width="2"/></svg>`
  $('#favicon').href = `data:image/svg+xml,${encodeURIComponent(svg)}`
}

// Without the hub server (e.g. static hosting) fall back to opaque browser probes:
// they prove reachability and give a rough latency, but cannot read versions.
async function probeFallback() {
  const services = await Promise.all(
    config.projects.flatMap((p) =>
      p.environments.map(async (e) => {
        const started = performance.now()
        let ok = false
        try {
          await fetch(e.url, { mode: 'no-cors', cache: 'no-store', signal: AbortSignal.timeout(10000) })
          ok = true
        } catch {}
        return { id: `${p.id}:${e.name.toLowerCase()}`, projectId: p.id, project: p.name, env: e.name, url: e.url, ok, ms: ok ? Math.round(performance.now() - started) : null }
      }),
    ),
  )
  return { generatedAt: Date.now(), intervalSeconds: 60, services, projects: {}, fallback: true }
}

async function refresh(manual = false) {
  const btn = $('#refreshNow')
  btn.classList.add('spin')
  try {
    const res = await fetch('/api/status', { cache: 'no-store' })
    if (!res.ok) throw new Error(res.status)
    status = await res.json()
  } catch {
    status = await probeFallback()
  }
  intervalMs = status.intervalSeconds * 1000
  lastFetch = Date.now()
  btn.classList.remove('spin')
  renderServices()
  updateIndicators()
  renderRepoMeta()
  if (manual) toast(`Status refreshed · ${status.services.filter((s) => s.ok).length}/${status.services.length} up`)
}

function tickStatusClock() {
  if (lastFetch) {
    const elapsed = Date.now() - lastFetch
    $('#lastChecked').textContent = `updated ${timeAgo(status.generatedAt)}`
    $('#ring').style.strokeDashoffset = String(94.25 * (1 - Math.min(1, elapsed / intervalMs)))
    if (elapsed >= intervalMs && !document.hidden) refresh()
  }
  $('#heroClock').textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

// ---------- effects ----------
function starfield() {
  const canvas = $('#stars')
  const ctx = canvas.getContext('2d')
  let w, h, pts
  const mouse = { x: -9999, y: -9999 }
  const resize = () => {
    const dpr = Math.min(devicePixelRatio || 1, 2)
    w = canvas.width = innerWidth * dpr
    h = canvas.height = innerHeight * dpr
    const count = Math.min(140, Math.round((innerWidth * innerHeight) / 11000))
    pts = Array.from({ length: count }, () => ({ x: Math.random() * w, y: Math.random() * h, vx: (Math.random() - 0.5) * 0.25 * dpr, vy: (Math.random() - 0.5) * 0.25 * dpr, r: (Math.random() * 1.4 + 0.4) * dpr }))
    canvas.dpr = dpr
  }
  resize()
  addEventListener('resize', resize)
  addEventListener('pointermove', (e) => {
    mouse.x = e.clientX * canvas.dpr
    mouse.y = e.clientY * canvas.dpr
  })
  const link = 130 * canvas.dpr
  const draw = () => {
    ctx.clearRect(0, 0, w, h)
    const fade = Math.max(0, 1 - scrollY / (innerHeight * 1.4))
    if (fade > 0) {
      for (const p of pts) {
        p.x = (p.x + p.vx + w) % w
        p.y = (p.y + p.vy + h) % h
        const dx = p.x - mouse.x
        const dy = p.y - mouse.y
        const d = Math.hypot(dx, dy)
        if (d < 160 * canvas.dpr) {
          p.x += (dx / d) * 0.6
          p.y += (dy / d) * 0.6
        }
      }
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i]
        for (let j = i + 1; j < pts.length; j++) {
          const b = pts[j]
          const d = Math.hypot(a.x - b.x, a.y - b.y)
          if (d < link) {
            ctx.strokeStyle = `rgba(167,139,250,${(1 - d / link) * 0.22 * fade})`
            ctx.lineWidth = canvas.dpr * 0.6
            ctx.beginPath()
            ctx.moveTo(a.x, a.y)
            ctx.lineTo(b.x, b.y)
            ctx.stroke()
          }
        }
        ctx.fillStyle = `rgba(226,232,255,${0.75 * fade})`
        ctx.beginPath()
        ctx.arc(a.x, a.y, a.r, 0, Math.PI * 2)
        ctx.fill()
      }
    }
    if (!reduceMotion) requestAnimationFrame(draw)
  }
  draw()
}

function rotator() {
  const words = ['love', 'trust', 'rely on', 'enjoy', 'remember']
  const word = $('#rotator span')
  let i = 0
  // One element: slide the word out, swap it while invisible, slide the next one in.
  setInterval(() => {
    if (document.hidden) return
    word.classList.add('out')
    setTimeout(() => {
      i = (i + 1) % words.length
      word.textContent = words[i]
      word.classList.replace('out', 'in')
      void word.offsetWidth
      word.classList.remove('in')
    }, 450)
  }, 2800)
}

function observeReveals() {
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue
        const el = e.target
        el.classList.add('visible')
        for (const n of $$('[data-count]', el)) animateNumber(n, Number(n.dataset.count))
        for (const n of $$('.stat b[data-target]', el)) {
          n.dataset.shown = '1'
          animateNumber(n, Number(n.dataset.target), { prefix: n.dataset.prefix, suffix: n.dataset.suffix })
        }
        for (const n of $$('[data-width]', el)) n.style.width = `${n.dataset.width}%`
        io.unobserve(el)
      }
    },
    { threshold: 0.12 },
  )
  $$('.reveal').forEach((el) => io.observe(el))
}

function pointerEffects() {
  const glow = $('.cursor-glow')
  addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return
    glow.style.opacity = '1'
    glow.style.transform = `translate(${e.clientX - 260}px, ${e.clientY - 260}px)`
    const card = e.target.closest?.('.project, .soon')
    if (card) {
      const r = card.getBoundingClientRect()
      card.style.setProperty('--mx', `${e.clientX - r.left}px`)
      card.style.setProperty('--my', `${e.clientY - r.top}px`)
      if (card.classList.contains('soon') && !reduceMotion) {
        const rx = ((e.clientY - r.top) / r.height - 0.5) * -6
        const ry = ((e.clientX - r.left) / r.width - 0.5) * 6
        card.style.transform = `perspective(900px) rotateX(${rx}deg) rotateY(${ry}deg) translateY(-4px)`
      }
    }
  })
  document.addEventListener('pointerout', (e) => {
    const card = e.target.closest?.('.soon')
    if (card && !card.contains(e.relatedTarget)) card.style.transform = ''
  })
  // magnetic buttons
  document.addEventListener('pointermove', (e) => {
    const btn = e.target.closest?.('.magnetic')
    $$('.magnetic.pulling').forEach((b) => {
      if (b !== btn) {
        b.classList.remove('pulling')
        b.style.transform = ''
      }
    })
    if (!btn || reduceMotion || e.pointerType !== 'mouse') return
    const r = btn.getBoundingClientRect()
    btn.classList.add('pulling')
    btn.style.transform = `translate(${(e.clientX - r.left - r.width / 2) * 0.18}px, ${(e.clientY - r.top - r.height / 2) * 0.28}px)`
  })
  // bar tooltips
  const tip = $('#tooltip')
  document.addEventListener('pointerover', (e) => {
    const t = e.target.closest?.('[data-tip]')
    if (!t) return tip.classList.remove('show')
    const r = t.getBoundingClientRect()
    tip.textContent = t.dataset.tip
    tip.style.left = `${r.left + r.width / 2}px`
    tip.style.top = `${r.top}px`
    tip.classList.add('show')
  })
  addEventListener('scroll', () => tip.classList.remove('show'), { passive: true })
}

function scrollEffects() {
  const bar = $('.progress span')
  const nav = $('.nav')
  const links = $$('.nav-links a')
  const sections = links.map((a) => $(a.getAttribute('href')))
  const onScroll = () => {
    const max = document.documentElement.scrollHeight - innerHeight
    bar.style.transform = `scaleX(${max > 0 ? scrollY / max : 0})`
    nav.classList.toggle('scrolled', scrollY > 30)
    let active = -1
    sections.forEach((s, i) => {
      if (s && s.getBoundingClientRect().top < innerHeight * 0.4) active = i
    })
    links.forEach((a, i) => a.classList.toggle('active', i === active))
  }
  addEventListener('scroll', onScroll, { passive: true })
  onScroll()
}

// ---------- command palette ----------
function palette() {
  const root = $('#palette')
  const input = $('#paletteInput')
  const list = $('#paletteList')
  const items = [
    ...config.projects.map((p) => ({ icon: p.emoji, label: p.name, hint: config.stages[p.stage], go: () => $(`#p-${p.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }) })),
    ...config.projects.flatMap((p) => p.links.map((l) => ({ icon: '↗', label: `${p.name}: ${l.label}`, hint: host(l.url), go: () => open(l.url, '_blank', 'noopener') }))),
    { icon: '📡', label: 'Live status', hint: 'section', go: () => $('#status').scrollIntoView({ behavior: 'smooth' }) },
    { icon: '🛤️', label: 'Launch pipeline', hint: 'section', go: () => $('#pipeline').scrollIntoView({ behavior: 'smooth' }) },
    { icon: 'in', label: 'LinkedIn profile', hint: 'linkedin.com', go: () => open(config.owner.linkedin, '_blank', 'noopener') },
    { icon: '🐙', label: 'GitHub profile', hint: 'github.com', go: () => open(config.owner.github, '_blank', 'noopener') },
    { icon: '🔄', label: 'Refresh status now', hint: 'action', go: () => refresh(true) },
    { icon: '🚀', label: 'Launch a rocket', hint: 'easter egg', go: launchRocket },
  ]
  let filtered = items
  let sel = 0
  const draw = () => {
    list.innerHTML = filtered.length
      ? filtered.map((it, i) => `<li role="option" aria-selected="${i === sel}" data-i="${i}"><span class="ic">${it.icon}</span>${esc(it.label)}<small>${esc(it.hint)}</small></li>`).join('')
      : '<li class="empty">No matches</li>'
    list.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' })
  }
  const show = () => {
    root.hidden = false
    input.value = ''
    filtered = items
    sel = 0
    draw()
    input.focus()
  }
  const hide = () => (root.hidden = true)
  const run = (it) => {
    hide()
    it?.go()
  }
  $('#openPalette').addEventListener('click', show)
  root.addEventListener('click', (e) => {
    if (e.target === root) hide()
    const li = e.target.closest('li[data-i]')
    if (li) run(filtered[Number(li.dataset.i)])
  })
  input.addEventListener('input', () => {
    const q = input.value.toLowerCase().trim()
    filtered = items.filter((it) => `${it.label} ${it.hint}`.toLowerCase().includes(q))
    sel = 0
    draw()
  })
  addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault()
      root.hidden ? show() : hide()
      return
    }
    if (root.hidden) return
    if (e.key === 'Escape') hide()
    if (e.key === 'ArrowDown') sel = Math.min(filtered.length - 1, sel + 1)
    if (e.key === 'ArrowUp') sel = Math.max(0, sel - 1)
    if (e.key === 'Enter') run(filtered[sel])
    if (e.key.startsWith('Arrow')) {
      e.preventDefault()
      draw()
    }
  })
}

// ---------- easter egg ----------
function launchRocket() {
  const r = document.createElement('div')
  r.className = 'launch-rocket'
  r.textContent = '🚀'
  document.body.append(r)
  setTimeout(() => r.remove(), 2700)
  confetti()
  toast('🚀 Liftoff! Rocket Builder Tycoon is on its way.')
}

function confetti() {
  if (reduceMotion) return
  const c = document.createElement('canvas')
  c.className = 'confetti'
  c.width = innerWidth
  c.height = innerHeight
  document.body.append(c)
  const ctx = c.getContext('2d')
  const colors = ['#a78bfa', '#22d3ee', '#f472b6', '#34d399', '#fbbf24']
  const bits = Array.from({ length: 160 }, () => ({ x: innerWidth / 2, y: innerHeight, vx: (Math.random() - 0.5) * 16, vy: -Math.random() * 18 - 8, s: Math.random() * 6 + 4, c: colors[(Math.random() * colors.length) | 0], r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.3 }))
  const start = performance.now()
  const step = (now) => {
    ctx.clearRect(0, 0, c.width, c.height)
    for (const b of bits) {
      b.vy += 0.38
      b.x += b.vx
      b.y += b.vy
      b.r += b.vr
      ctx.save()
      ctx.translate(b.x, b.y)
      ctx.rotate(b.r)
      ctx.fillStyle = b.c
      ctx.fillRect(-b.s / 2, -b.s / 4, b.s, b.s / 2)
      ctx.restore()
    }
    if (now - start < 3200) requestAnimationFrame(step)
    else c.remove()
  }
  requestAnimationFrame(step)
}

function konami() {
  const code = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a']
  let pos = 0
  addEventListener('keydown', (e) => {
    pos = e.key === code[pos] ? pos + 1 : e.key === code[0] ? 1 : 0
    if (pos === code.length) {
      pos = 0
      launchRocket()
    }
  })
}

// ---------- boot ----------
async function boot() {
  config = await (await fetch('projects.json', { cache: 'no-cache' })).json()
  $('#year').textContent = new Date().getFullYear()
  $('#githubCta').href = config.owner.github
  const n = config.stages.length
  $('#cLive').dataset.count = config.projects.filter((p) => p.stage === n - 1).length
  $('#cNext').dataset.count = config.projects.filter((p) => p.stage < n - 1).length
  $('#cTests').dataset.count = config.projects.flatMap((p) => p.stats).filter((s) => s.label === 'Automated tests').reduce((sum, s) => sum + s.value, 0)
  renderMarquee()
  renderFeatured()
  renderPipeline()
  renderUpcoming()
  observeReveals()
  scrollEffects()
  palette()
  konami()
  pointerEffects()
  starfield()
  if (!reduceMotion) rotator()
  $('#refreshNow').addEventListener('click', () => refresh(true))
  await refresh()
  setInterval(tickStatusClock, 1000)
  tickStatusClock()
}

boot()
