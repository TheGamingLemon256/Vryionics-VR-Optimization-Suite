/**
 * Vryionics VR Optimization Suite — GitHub Release Publisher
 *
 * Web dashboard that scans the dist/ folder for installer .exe files
 * and lets you push them as GitHub Releases with one click.
 *
 * Usage:
 *   node server.js
 *
 * First-time setup:
 *   1. Create a GitHub Personal Access Token (classic) with "repo" scope
 *   2. The dashboard will prompt you to enter it on first visit
 *   3. Token is saved to .gh-token in this directory
 *
 * Environment overrides:
 *   PORT       - Server port (default: 4600)
 *   DIST_DIR   - Directory to scan for builds (default: ../dist)
 *   GH_TOKEN   - GitHub token (overrides saved token)
 */

const http = require('http')
const https = require('https')
const fs = require('fs')
const path = require('path')
const { URL } = require('url')

const PORT = parseInt(process.env.PORT || '4600', 10)
const DIST_DIR = process.env.DIST_DIR || path.resolve('G:/Claude Projects/Vryionics VR Optimization Suite/dist')
const TOKEN_FILE = path.join(__dirname, '.gh-token')
const REPO_OWNER = 'TheGamingLemon256'
const REPO_NAME = 'Vryionics-VR-Optimization-Suite'
const PRODUCT_NAME = 'Vryionics VR Optimization Suite'

// Crash reports from clients land here (one JSON file per report)
const CRASH_DIR = path.resolve(__dirname, 'crashes')
try { fs.mkdirSync(CRASH_DIR, { recursive: true }) } catch { /* ignore */ }

// --- Token management ---

function getToken() {
  if (process.env.GH_TOKEN) return process.env.GH_TOKEN
  try { return fs.readFileSync(TOKEN_FILE, 'utf-8').trim() } catch { return '' }
}

function saveToken(token) {
  fs.writeFileSync(TOKEN_FILE, token.trim())
}

// --- GitHub API helpers ---

function githubRequest(method, apiPath, body, token) {
  return new Promise((resolve, reject) => {
    const url = new URL(apiPath, 'https://api.github.com')
    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method,
      headers: {
        'User-Agent': 'Vryionics-VROS-Publisher/1.0',
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      }
    }

    if (body && typeof body === 'object') {
      const data = JSON.stringify(body)
      options.headers['Content-Type'] = 'application/json'
      options.headers['Content-Length'] = Buffer.byteLength(data)
    }

    const req = https.request(options, (res) => {
      let data = ''
      res.on('data', (chunk) => { data += chunk })
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: data ? JSON.parse(data) : null, headers: res.headers })
        } catch {
          resolve({ status: res.statusCode, data, headers: res.headers })
        }
      })
    })

    req.on('error', reject)
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('Request timeout')) })

    if (body && typeof body === 'object') {
      req.write(JSON.stringify(body))
    }
    req.end()
  })
}

function uploadReleaseAsset(uploadUrl, filePath, fileName, token) {
  return new Promise((resolve, reject) => {
    const stat = fs.statSync(filePath)
    const cleanUrl = uploadUrl.replace(/\{[^}]*\}/g, '')
    const url = new URL(cleanUrl)
    url.searchParams.set('name', fileName)

    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'User-Agent': 'Vryionics-VROS-Publisher/1.0',
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/octet-stream',
        'Content-Length': stat.size,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28'
      }
    }

    const req = https.request(options, (res) => {
      let data = ''
      res.on('data', (chunk) => { data += chunk })
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) })
        } catch {
          resolve({ status: res.statusCode, data })
        }
      })
    })

    req.on('error', reject)
    req.setTimeout(600000, () => { req.destroy(); reject(new Error('Upload timeout')) })

    const stream = fs.createReadStream(filePath)
    stream.pipe(req)
    stream.on('error', (err) => { req.destroy(); reject(err) })
  })
}

// --- Build scanning ---

function scanBuilds() {
  try {
    return fs.readdirSync(DIST_DIR)
      .filter(f => f.endsWith('.exe') && !f.endsWith('.blockmap'))
      .map(f => {
        const stat = fs.statSync(path.join(DIST_DIR, f))
        const versionMatch = f.match(/(\d+\.\d+\.\d+)/)
        return {
          filename: f,
          version: versionMatch ? versionMatch[1] : 'unknown',
          size: stat.size,
          sizeMB: (stat.size / 1024 / 1024).toFixed(1),
          modified: stat.mtime.toISOString()
        }
      })
      .sort((a, b) => new Date(b.modified).getTime() - new Date(a.modified).getTime())
  } catch {
    return []
  }
}

async function getLatestRelease(token) {
  try {
    const res = await githubRequest('GET', `/repos/${REPO_OWNER}/${REPO_NAME}/releases/latest`, null, token)
    if (res.status === 200) return res.data
    return null
  } catch {
    return null
  }
}

// --- In-progress upload tracking ---
let uploadProgress = { active: false, filename: '', percent: 0, status: '', error: '' }

// --- HTML Dashboard ---

function escapeHtml(str) {
  if (!str) return ''
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function dashboardHTML(builds, latestRelease, hasToken) {
  const buildRows = builds.map(b => {
    const isLive = latestRelease && latestRelease.tag_name === `v${b.version}`
    return `
      <tr class="${isLive ? 'current' : ''}">
        <td class="filename">${escapeHtml(b.filename)}</td>
        <td>${b.version}</td>
        <td>${b.sizeMB} MB</td>
        <td>${new Date(b.modified).toLocaleString()}</td>
        <td>
          ${isLive
            ? '<span class="badge live">LIVE</span>'
            : `<button class="btn push-btn" onclick="pushUpdate('${escapeHtml(b.filename)}', '${escapeHtml(b.version)}')">Push to GitHub</button>`
          }
        </td>
      </tr>`
  }).join('')

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${PRODUCT_NAME} — GitHub Release Publisher</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', system-ui, sans-serif; background: #07070f; color: #e2e8f0; min-height: 100vh; }
    .container { max-width: 960px; margin: 0 auto; padding: 40px 24px; }
    h1 { color: #9b7aff; font-size: 28px; margin-bottom: 4px; }
    .subtitle { color: #64748b; font-size: 14px; margin-bottom: 32px; }
    .status-card { background: linear-gradient(135deg, rgba(155,122,255,0.08) 0%, rgba(15,15,30,0.6) 100%); border: 1px solid rgba(155,122,255,0.2); border-radius: 12px; padding: 24px; margin-bottom: 32px; }
    .status-card h2 { color: #9b7aff; font-size: 14px; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 12px; }
    .status-version { font-size: 36px; font-weight: 700; color: #22c55e; }
    .status-meta { color: #64748b; font-size: 13px; margin-top: 8px; }
    .status-none { color: #f59e0b; font-size: 18px; }
    .status-link { color: #60a5fa; text-decoration: none; font-size: 13px; }
    .status-link:hover { text-decoration: underline; }
    .token-card { background: linear-gradient(135deg, rgba(245,158,11,0.08) 0%, rgba(15,15,30,0.6) 100%); border: 1px solid rgba(245,158,11,0.2); border-radius: 12px; padding: 24px; margin-bottom: 32px; }
    .token-card h2 { color: #f59e0b; font-size: 14px; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 12px; }
    .token-card p { color: #94a3b8; font-size: 13px; margin-bottom: 12px; }
    .section-title { font-size: 16px; color: #94a3b8; margin-bottom: 12px; font-weight: 600; }
    table { width: 100%; border-collapse: collapse; }
    th { text-align: left; color: #64748b; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; padding: 8px 12px; border-bottom: 1px solid rgba(255,255,255,0.06); }
    td { padding: 12px; border-bottom: 1px solid rgba(255,255,255,0.04); font-size: 14px; }
    tr:hover { background: rgba(255,255,255,0.02); }
    tr.current { background: rgba(34,197,94,0.05); }
    .filename { font-family: 'Cascadia Code', monospace; color: #cbd5e1; font-size: 13px; }
    .badge { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 11px; font-weight: 700; letter-spacing: 0.5px; }
    .badge.live { background: rgba(34,197,94,0.15); color: #22c55e; border: 1px solid rgba(34,197,94,0.3); }
    .btn { background: rgba(155,122,255,0.15); color: #9b7aff; border: 1px solid rgba(155,122,255,0.3); padding: 6px 16px; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 600; transition: all 0.15s; }
    .btn:hover { background: rgba(155,122,255,0.25); }
    .btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .push-btn { background: rgba(59,130,246,0.15); color: #60a5fa; border-color: rgba(59,130,246,0.3); }
    .push-btn:hover { background: rgba(59,130,246,0.25); }
    .input { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); color: #e2e8f0; padding: 8px 12px; border-radius: 6px; font-size: 13px; width: 100%; outline: none; }
    .input:focus { border-color: rgba(155,122,255,0.4); }
    .empty-state { text-align: center; padding: 60px 20px; color: #475569; }
    .empty-state .icon { font-size: 48px; margin-bottom: 12px; }
    .empty-state code { display: inline-block; background: rgba(255,255,255,0.05); padding: 2px 8px; border-radius: 4px; font-size: 13px; color: #94a3b8; margin-top: 8px; }
    .modal-overlay { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.7); z-index: 100; align-items: center; justify-content: center; }
    .modal-overlay.active { display: flex; }
    .modal { background: #12121e; border: 1px solid rgba(155,122,255,0.2); border-radius: 12px; padding: 28px; width: 480px; max-width: 90vw; }
    .modal h3 { color: #e2e8f0; margin-bottom: 4px; }
    .modal .file-label { color: #64748b; font-size: 13px; margin-bottom: 16px; }
    .modal-actions { display: flex; gap: 12px; justify-content: flex-end; margin-top: 20px; }
    .btn-cancel { background: rgba(255,255,255,0.05); color: #94a3b8; border-color: rgba(255,255,255,0.1); }
    .btn-confirm { background: rgba(34,197,94,0.15); color: #22c55e; border-color: rgba(34,197,94,0.3); }
    .btn-confirm:hover { background: rgba(34,197,94,0.25); }
    .progress-bar { width: 100%; height: 6px; background: rgba(255,255,255,0.1); border-radius: 3px; overflow: hidden; margin: 12px 0; display: none; }
    .progress-bar .fill { height: 100%; background: #22c55e; border-radius: 3px; transition: width 0.3s; width: 0%; }
    .progress-text { color: #64748b; font-size: 12px; display: none; }
    .toast { position: fixed; bottom: 24px; right: 24px; background: #22c55e; color: #000; padding: 12px 20px; border-radius: 8px; font-weight: 600; font-size: 14px; transform: translateY(100px); opacity: 0; transition: all 0.3s ease; z-index: 200; }
    .toast.show { transform: translateY(0); opacity: 1; }
    .toast.error { background: #ef4444; color: #fff; }
  </style>
</head>
<body>
  <div class="container">
    <h1>${PRODUCT_NAME} — GitHub Release Publisher</h1>
    <p class="subtitle">Build installers, then push them as GitHub Releases from here.</p>

    ${!hasToken ? `
    <div class="token-card">
      <h2>GitHub Token Required</h2>
      <p>Enter a GitHub Personal Access Token (classic) with <strong>repo</strong> scope to enable publishing.</p>
      <p style="font-size: 12px;">Create one at: <a href="https://github.com/settings/tokens/new" target="_blank" class="status-link">github.com/settings/tokens/new</a></p>
      <div style="display: flex; gap: 8px; margin-top: 12px;">
        <input class="input" id="tokenInput" type="password" placeholder="ghp_xxxxxxxxxxxxxxxxxxxx" />
        <button class="btn btn-confirm" onclick="saveToken()">Save</button>
      </div>
    </div>` : ''}

    <div class="status-card">
      <h2>Latest GitHub Release</h2>
      ${latestRelease
        ? `<div class="status-version">v${escapeHtml(latestRelease.tag_name.replace(/^v/, ''))}</div>
           <div class="status-meta">Published: ${new Date(latestRelease.published_at).toLocaleString()}${latestRelease.body ? ' — ' + escapeHtml(latestRelease.body.substring(0, 100)) : ''}</div>
           <a href="${escapeHtml(latestRelease.html_url)}" target="_blank" class="status-link" style="display:inline-block;margin-top:8px;">View on GitHub →</a>`
        : `<div class="status-none">No releases published yet</div>`
      }
    </div>

    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
      <div class="section-title">Local Builds (dist/)</div>
      <div style="display: flex; gap: 8px;">
        <a href="/crashes" class="btn" style="text-decoration: none;">View Crash Reports →</a>
        <button class="btn" onclick="location.reload()">Refresh</button>
      </div>
    </div>

    ${builds.length > 0
      ? `<table>
          <thead><tr><th>Filename</th><th>Version</th><th>Size</th><th>Built</th><th></th></tr></thead>
          <tbody>${buildRows}</tbody>
        </table>`
      : `<div class="empty-state">
          <div class="icon">📂</div>
          <p>No installer files found. Run <code>npm run build:win</code> to create a build.</p>
          <code>${escapeHtml(DIST_DIR)}</code>
        </div>`
    }
  </div>

  <div class="modal-overlay" id="pushModal">
    <div class="modal">
      <h3>Push to GitHub Releases</h3>
      <div class="file-label" id="pushFilename"></div>
      <label style="color: #94a3b8; font-size: 13px; display: block; margin-bottom: 6px;">Release Notes</label>
      <textarea class="input" id="pushNotes" rows="3" placeholder="What's new in this version..."></textarea>
      <div class="progress-bar" id="progressBar"><div class="fill" id="progressFill"></div></div>
      <div class="progress-text" id="progressText"></div>
      <div class="modal-actions">
        <button class="btn btn-cancel" id="cancelBtn" onclick="closeModal()">Cancel</button>
        <button class="btn btn-confirm" id="confirmBtn" onclick="confirmPush()">Publish to GitHub</button>
      </div>
    </div>
  </div>

  <div class="toast" id="toast"></div>

  <script>
    let pendingFile = ''
    let pendingVersion = ''

    function pushUpdate(filename, version) {
      pendingFile = filename
      pendingVersion = version
      document.getElementById('pushFilename').textContent = filename + ' (v' + version + ')'
      document.getElementById('pushNotes').value = ''
      document.getElementById('progressBar').style.display = 'none'
      document.getElementById('progressText').style.display = 'none'
      document.getElementById('confirmBtn').disabled = false
      document.getElementById('confirmBtn').textContent = 'Publish to GitHub'
      document.getElementById('cancelBtn').disabled = false
      document.getElementById('pushModal').classList.add('active')
    }

    function closeModal() {
      document.getElementById('pushModal').classList.remove('active')
      pendingFile = ''; pendingVersion = ''
    }

    async function confirmPush() {
      const notes = document.getElementById('pushNotes').value
      const btn = document.getElementById('confirmBtn')
      const cancelBtn = document.getElementById('cancelBtn')
      const progressBar = document.getElementById('progressBar')
      const progressFill = document.getElementById('progressFill')
      const progressText = document.getElementById('progressText')

      btn.textContent = 'Creating release...'
      btn.disabled = true; cancelBtn.disabled = true
      progressBar.style.display = 'block'; progressText.style.display = 'block'
      progressFill.style.width = '10%'
      progressText.textContent = 'Creating GitHub release...'

      try {
        const res = await fetch('/api/publish', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filename: pendingFile, version: pendingVersion, notes })
        })
        const data = await res.json()
        if (data.error) {
          showToast(data.error, true)
          btn.textContent = 'Publish to GitHub'
          btn.disabled = false; cancelBtn.disabled = false
          progressBar.style.display = 'none'; progressText.style.display = 'none'
          return
        }

        progressFill.style.width = '20%'
        progressText.textContent = 'Uploading installer...'

        const pollProgress = setInterval(async () => {
          try {
            const pr = await fetch('/api/progress')
            const pd = await pr.json()
            if (pd.percent) {
              const pct = 20 + pd.percent * 0.8
              progressFill.style.width = pct + '%'
              progressText.textContent = pd.status || ('Uploading... ' + Math.round(pd.percent) + '%')
            }
            if (!pd.active) {
              clearInterval(pollProgress)
              if (pd.error) {
                showToast(pd.error, true)
                btn.textContent = 'Publish to GitHub'
                btn.disabled = false; cancelBtn.disabled = false
              } else {
                progressFill.style.width = '100%'
                progressText.textContent = 'Published successfully!'
                showToast('v' + pendingVersion + ' pushed to GitHub Releases!')
                setTimeout(() => location.reload(), 1500)
              }
            }
          } catch {}
        }, 1000)
      } catch (err) {
        showToast('Network error: ' + err.message, true)
        btn.textContent = 'Publish to GitHub'
        btn.disabled = false; cancelBtn.disabled = false
        progressBar.style.display = 'none'; progressText.style.display = 'none'
      }
    }

    async function saveToken() {
      const token = document.getElementById('tokenInput').value.trim()
      if (!token) return
      try {
        const res = await fetch('/api/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token })
        })
        const data = await res.json()
        if (data.success) {
          showToast('Token saved!')
          setTimeout(() => location.reload(), 1000)
        } else {
          showToast(data.error || 'Failed to save token', true)
        }
      } catch (err) {
        showToast('Error: ' + err.message, true)
      }
    }

    function showToast(msg, isError) {
      const el = document.getElementById('toast')
      el.textContent = msg
      el.className = 'toast show' + (isError ? ' error' : '')
      setTimeout(() => { el.className = 'toast' }, 4000)
    }
  </script>
</body>
</html>`
}

function crashesHTML() {
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>${PRODUCT_NAME} Crash Reports</title>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: 'Segoe UI', system-ui, sans-serif; background: #07070f; color: #e2e8f0; min-height: 100vh; padding: 40px 24px; }
.container { max-width: 1200px; margin: 0 auto; }
h1 { color: #ef4444; margin-bottom: 24px; }
.meta { color: #64748b; font-size: 13px; margin-bottom: 16px; }
.row { background: rgba(239,68,68,0.06); border: 1px solid rgba(239,68,68,0.2); border-radius: 10px; padding: 14px 16px; margin-bottom: 10px; cursor: pointer; }
.row:hover { background: rgba(239,68,68,0.1); }
.row h3 { font-size: 14px; color: #fca5a5; margin-bottom: 4px; font-family: 'Cascadia Code', monospace; }
.row p { font-size: 12px; color: #94a3b8; margin-bottom: 2px; }
.row .ts { font-size: 11px; color: #64748b; }
.empty { text-align: center; padding: 60px; color: #475569; }
pre { background: #000; padding: 20px; border-radius: 8px; overflow-x: auto; font-size: 12px; color: #cbd5e1; white-space: pre-wrap; max-height: 600px; overflow-y: auto; }
button { background: rgba(155,122,255,0.15); color: #9b7aff; border: 1px solid rgba(155,122,255,0.3); padding: 6px 14px; border-radius: 6px; cursor: pointer; font-size: 12px; margin-top: 8px; }
.modal { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.8); z-index: 100; align-items: center; justify-content: center; padding: 24px; }
.modal.active { display: flex; }
.modal-inner { background: #12121e; border: 1px solid rgba(239,68,68,0.3); border-radius: 12px; padding: 24px; max-width: 900px; width: 100%; max-height: 90vh; overflow: auto; }
.modal-inner h2 { margin-bottom: 12px; color: #fca5a5; }
</style></head><body>
<div class="container">
  <h1>Crash Reports</h1>
  <p class="meta">Reports posted by in-app reporters to <code>POST /crash</code>.</p>
  <button onclick="load()">Refresh</button>
  <div id="list" style="margin-top:16px;"></div>
</div>
<div class="modal" id="modal" onclick="if(event.target.id==='modal')close()">
  <div class="modal-inner"><h2 id="mTitle"></h2><pre id="mBody"></pre></div>
</div>
<script>
async function load() {
  const r = await fetch('/api/crashes')
  const rows = await r.json()
  const list = document.getElementById('list')
  if (!rows.length) { list.innerHTML = '<div class="empty">No crashes received yet.</div>'; return }
  list.innerHTML = rows.map(r => {
    const name = (r.name || '').replace(/[<>]/g,'')
    const msg = (r.message || '').replace(/[<>]/g,'')
    const v = (r.version || '').replace(/[<>]/g,'')
    const reason = (r.reason || '').replace(/[<>]/g,'')
    return \`<div class="row" onclick="view('\${r.filename}')">
      <h3>\${name}: \${msg}</h3>
      <p>reason: <b>\${reason}</b>  ·  version: <b>\${v}</b>  ·  ip: <b>\${r.ip||''}</b></p>
      <p class="ts">\${new Date(r.receivedAt||r.modified).toLocaleString()}  ·  \${r.filename}</p>
    </div>\`
  }).join('')
}
async function view(file) {
  const r = await fetch('/api/crash?file=' + encodeURIComponent(file))
  const data = await r.json()
  document.getElementById('mTitle').textContent = file
  document.getElementById('mBody').textContent = JSON.stringify(data, null, 2)
  document.getElementById('modal').classList.add('active')
}
function close() { document.getElementById('modal').classList.remove('active') }
load()
</script></body></html>`
}

// --- HTTP Server ---

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`)

  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end() }

  // POST /crash — accept crash reports
  if (req.method === 'POST' && url.pathname === '/crash') {
    let body = ''
    let byteCount = 0
    const MAX_CRASH_BYTES = 1024 * 1024
    req.on('data', (c) => {
      byteCount += c.length
      if (byteCount > MAX_CRASH_BYTES) { req.destroy(); return }
      body += c
    })
    req.on('end', () => {
      try {
        const payload = JSON.parse(body)
        const stamp = new Date().toISOString().replace(/[:.]/g, '-')
        const ip = (req.socket.remoteAddress || 'unknown').replace(/[^a-zA-Z0-9.:]/g, '_')
        const shortReason = String(payload.reason || 'crash').replace(/[^a-zA-Z0-9]/g, '_').slice(0, 24)
        const filename = `${stamp}__${shortReason}__${ip}.json`
        const out = {
          receivedAt: new Date().toISOString(),
          ip,
          userAgent: req.headers['user-agent'] || '',
          payload,
        }
        fs.writeFileSync(path.join(CRASH_DIR, filename), JSON.stringify(out, null, 2), 'utf-8')
        console.log(`[Crash] ${filename} — ${payload.name}: ${String(payload.message).slice(0, 80)}`)
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: true }))
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Invalid JSON', detail: err.message }))
      }
    })
    req.on('error', () => {
      try { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Request error' })) } catch {}
    })
    return
  }

  if (req.method === 'GET' && url.pathname === '/api/crashes') {
    try {
      const files = fs.readdirSync(CRASH_DIR)
        .filter(f => f.endsWith('.json'))
        .map(f => {
          const full = path.join(CRASH_DIR, f)
          const stat = fs.statSync(full)
          let preview = {}
          try {
            const data = JSON.parse(fs.readFileSync(full, 'utf-8'))
            preview = {
              name: data.payload?.name,
              message: String(data.payload?.message || '').slice(0, 200),
              version: data.payload?.version,
              reason: data.payload?.reason,
              receivedAt: data.receivedAt,
              ip: data.ip,
              userAgent: data.userAgent,
            }
          } catch {}
          return { filename: f, size: stat.size, modified: stat.mtime.toISOString(), ...preview }
        })
        .sort((a, b) => new Date(b.modified).getTime() - new Date(a.modified).getTime())
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(files.slice(0, 100)))
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: err.message }))
    }
    return
  }

  if (req.method === 'GET' && url.pathname === '/api/crash') {
    try {
      const fname = url.searchParams.get('file') || ''
      if (!fname || fname.includes('/') || fname.includes('\\') || fname.includes('..')) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        return res.end(JSON.stringify({ error: 'Invalid filename' }))
      }
      const p = path.join(CRASH_DIR, fname)
      if (!fs.existsSync(p)) {
        res.writeHead(404, { 'Content-Type': 'application/json' })
        return res.end(JSON.stringify({ error: 'Not found' }))
      }
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(fs.readFileSync(p, 'utf-8'))
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: err.message }))
    }
    return
  }

  if (req.method === 'GET' && url.pathname === '/crashes') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(crashesHTML())
    return
  }

  // POST /api/token — save token
  if (req.method === 'POST' && url.pathname === '/api/token') {
    let body = ''
    req.on('data', (c) => { body += c })
    req.on('end', async () => {
      try {
        const { token } = JSON.parse(body)
        const check = await githubRequest('GET', '/user', null, token)
        if (check.status !== 200) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          return res.end(JSON.stringify({ error: 'Invalid token — GitHub rejected it' }))
        }
        saveToken(token)
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ success: true, user: check.data.login }))
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: err.message }))
      }
    })
    return
  }

  // POST /api/publish — create release + upload installer
  if (req.method === 'POST' && url.pathname === '/api/publish') {
    let body = ''
    req.on('data', (c) => { body += c })
    req.on('end', async () => {
      try {
        const { filename, version, notes } = JSON.parse(body)
        const token = getToken()
        if (!token) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          return res.end(JSON.stringify({ error: 'No GitHub token configured' }))
        }

        const filePath = path.join(DIST_DIR, path.basename(filename))
        if (!fs.existsSync(filePath)) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          return res.end(JSON.stringify({ error: `File not found: ${filename}` }))
        }

        const tag = `v${version}`

        const existing = await githubRequest('GET', `/repos/${REPO_OWNER}/${REPO_NAME}/releases/tags/${tag}`, null, token)
        if (existing.status === 200) {
          console.log(`[Publish] Deleting existing release ${tag}...`)
          await githubRequest('DELETE', `/repos/${REPO_OWNER}/${REPO_NAME}/releases/${existing.data.id}`, null, token)
          await githubRequest('DELETE', `/repos/${REPO_OWNER}/${REPO_NAME}/git/refs/tags/${tag}`, null, token)
        }

        console.log(`[Publish] Creating release ${tag}...`)
        const releaseRes = await githubRequest('POST', `/repos/${REPO_OWNER}/${REPO_NAME}/releases`, {
          tag_name: tag,
          name: `${PRODUCT_NAME} ${tag}`,
          body: notes || `Release ${tag}`,
          draft: false,
          prerelease: false
        }, token)

        if (releaseRes.status !== 201) {
          console.error('[Publish] Create release failed:', releaseRes.data)
          res.writeHead(400, { 'Content-Type': 'application/json' })
          return res.end(JSON.stringify({ error: `Failed to create release: ${releaseRes.data?.message || 'Unknown error'}` }))
        }

        const release = releaseRes.data
        console.log(`[Publish] Release created: ${release.html_url}`)

        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ success: true, releaseUrl: release.html_url }))

        uploadProgress = { active: true, filename, percent: 0, status: 'Uploading installer...', error: '' }

        try {
          const stat = fs.statSync(filePath)
          const sizeMB = (stat.size / 1024 / 1024).toFixed(1)
          console.log(`[Publish] Uploading ${filename} (${sizeMB} MB)...`)

          let progressCounter = 0
          const progressTimer = setInterval(() => {
            progressCounter = Math.min(95, progressCounter + 2)
            uploadProgress.percent = progressCounter
            uploadProgress.status = `Uploading installer... (${sizeMB} MB)`
          }, 1000)

          const uploadRes = await uploadReleaseAsset(release.upload_url, filePath, path.basename(filename), token)
          clearInterval(progressTimer)

          if (uploadRes.status === 201) {
            console.log(`[Publish] Installer uploaded: ${uploadRes.data.browser_download_url}`)

            const ymlPath = path.join(DIST_DIR, 'latest.yml')
            if (fs.existsSync(ymlPath)) {
              console.log('[Publish] Uploading latest.yml...')
              uploadProgress.status = 'Uploading latest.yml...'
              const ymlRes = await uploadReleaseAsset(release.upload_url, ymlPath, 'latest.yml', token)
              if (ymlRes.status === 201) console.log('[Publish] latest.yml uploaded')
              else console.error('[Publish] latest.yml upload failed:', ymlRes.data)
            }

            const blockmapName = path.basename(filename) + '.blockmap'
            const blockmapPath = path.join(DIST_DIR, blockmapName)
            if (fs.existsSync(blockmapPath)) {
              console.log('[Publish] Uploading blockmap...')
              uploadProgress.status = 'Uploading blockmap...'
              const bmRes = await uploadReleaseAsset(release.upload_url, blockmapPath, blockmapName, token)
              if (bmRes.status === 201) console.log('[Publish] Blockmap uploaded')
              else console.error('[Publish] Blockmap upload failed:', bmRes.data)
            }

            try {
              const assetsRes = await githubRequest('GET', `/repos/${REPO_OWNER}/${REPO_NAME}/releases/${release.id}/assets`, null, token)
              if (assetsRes.status === 200 && Array.isArray(assetsRes.data)) {
                for (const asset of assetsRes.data) {
                  if ((asset.name.endsWith('.zip') || asset.name.endsWith('.tar.gz')) && !asset.name.includes('Setup')) {
                    console.log(`[Publish] Deleting source archive: ${asset.name}`)
                    await githubRequest('DELETE', `/repos/${REPO_OWNER}/${REPO_NAME}/releases/assets/${asset.id}`, null, token)
                  }
                }
              }
            } catch (e) { console.warn('[Publish] Could not clean source archives:', e.message) }

            uploadProgress = { active: false, filename, percent: 100, status: 'Published successfully!', error: '' }
          } else {
            console.error('[Publish] Upload failed:', uploadRes.data)
            uploadProgress = { active: false, filename, percent: 0, status: '', error: `Upload failed: ${JSON.stringify(uploadRes.data)}` }
          }
        } catch (err) {
          console.error('[Publish] Upload error:', err.message)
          uploadProgress = { active: false, filename, percent: 0, status: '', error: `Upload error: ${err.message}` }
        }
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: err.message }))
      }
    })
    return
  }

  if (req.method === 'GET' && url.pathname === '/api/progress') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(uploadProgress))
    return
  }

  if (req.method === 'GET' && url.pathname === '/') {
    try {
      const token = getToken()
      const builds = scanBuilds()
      const latestRelease = token ? await getLatestRelease(token) : null
      const html = dashboardHTML(builds, latestRelease, !!token)
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(html)
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain' })
      res.end('Dashboard error: ' + err.message)
    }
    return
  }

  res.writeHead(404, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ error: 'Not found' }))
})

server.listen(PORT, () => {
  console.log('')
  console.log(`  ${PRODUCT_NAME} — GitHub Release Publisher`)
  console.log('  ─────────────────────────────────────────')
  console.log(`  Dashboard:        http://localhost:${PORT}`)
  console.log(`  Crash reports:    http://localhost:${PORT}/crashes`)
  console.log(`  Crash POST URL:   http://localhost:${PORT}/crash`)
  console.log(`  Dist dir:         ${DIST_DIR}`)
  console.log(`  Crash dir:        ${CRASH_DIR}`)
  console.log(`  Repo:             ${REPO_OWNER}/${REPO_NAME}`)
  console.log(`  Token:            ${getToken() ? 'configured' : 'NOT SET — open dashboard to configure'}`)
  console.log('')
})
