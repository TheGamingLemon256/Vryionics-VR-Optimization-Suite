/**
 * CLI: Publish a build to GitHub Releases
 *
 * Usage:
 *   node publish.js [--notes "Release notes"]
 *
 * Reads dist/latest.yml to determine version, finds the matching .exe,
 * creates a GitHub Release, and uploads installer + latest.yml + blockmap.
 *
 * Requires: .gh-token file or GH_TOKEN environment variable
 */

const https = require('https')
const fs = require('fs')
const path = require('path')

const DIST_DIR = path.resolve('G:/Claude Projects/Vryionics VR Optimization Suite/dist')
const TOKEN_FILE = path.join(__dirname, '.gh-token')
const REPO_OWNER = 'TheGamingLemon256'
const REPO_NAME = 'Vryionics-VR-Optimization-Suite'
const PRODUCT_NAME = 'Vryionics VR Optimization Suite'

function getToken() {
  if (process.env.GH_TOKEN) return process.env.GH_TOKEN
  try { return fs.readFileSync(TOKEN_FILE, 'utf-8').trim() } catch { return '' }
}

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
      res.on('data', (c) => { data += c })
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: data ? JSON.parse(data) : null }) }
        catch { resolve({ status: res.statusCode, data }) }
      })
    })
    req.on('error', reject)
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('Timeout')) })
    if (body && typeof body === 'object') req.write(JSON.stringify(body))
    req.end()
  })
}

function uploadAsset(uploadUrl, filePath, fileName, token) {
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
        'Accept': 'application/vnd.github+json'
      }
    }

    const req = https.request(options, (res) => {
      let data = ''
      res.on('data', (c) => { data += c })
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(data) }) }
        catch { resolve({ status: res.statusCode, data }) }
      })
    })
    req.on('error', reject)
    req.setTimeout(600000, () => { req.destroy(); reject(new Error('Upload timeout')) })

    const stream = fs.createReadStream(filePath)
    let uploaded = 0
    stream.on('data', (chunk) => {
      uploaded += chunk.length
      const pct = Math.round((uploaded / stat.size) * 100)
      process.stdout.write(`\r  Uploading: ${pct}% (${(uploaded / 1024 / 1024).toFixed(1)} / ${(stat.size / 1024 / 1024).toFixed(1)} MB)`)
    })
    stream.pipe(req)
    stream.on('error', (err) => { req.destroy(); reject(err) })
  })
}

async function main() {
  const args = process.argv.slice(2)
  let notes = ''
  const notesIdx = args.indexOf('--notes')
  if (notesIdx >= 0 && args[notesIdx + 1]) notes = args[notesIdx + 1]

  const token = getToken()
  if (!token) {
    console.error('Error: No GitHub token found. Set GH_TOKEN or save to .gh-token')
    process.exit(1)
  }

  const ymlPath = path.join(DIST_DIR, 'latest.yml')
  if (!fs.existsSync(ymlPath)) {
    console.error('Error: dist/latest.yml not found. Run "npm run build:win" first.')
    process.exit(1)
  }

  const yml = fs.readFileSync(ymlPath, 'utf-8')
  const version = yml.match(/^version:\s*(.+)$/m)?.[1]?.trim()
  const exeFile = yml.match(/^path:\s*(.+)$/m)?.[1]?.trim()

  if (!version || !exeFile) {
    console.error('Error: Could not parse version/path from latest.yml')
    process.exit(1)
  }

  let exePath = path.join(DIST_DIR, exeFile)
  if (!fs.existsSync(exePath)) {
    const files = fs.readdirSync(DIST_DIR).filter(f => f.endsWith('.exe') && f.includes(version))
    if (files.length > 0) {
      exePath = path.join(DIST_DIR, files[0])
    } else {
      console.error(`Error: Installer not found for v${version}`)
      process.exit(1)
    }
  }

  const sizeMB = (fs.statSync(exePath).size / 1024 / 1024).toFixed(1)
  const tag = `v${version}`

  console.log('')
  console.log(`  ${PRODUCT_NAME} — GitHub Release Publisher`)
  console.log('  ─────────────────────────────────────────')
  console.log(`  Version:    ${tag}`)
  console.log(`  Installer:  ${path.basename(exePath)} (${sizeMB} MB)`)
  console.log(`  Notes:      ${notes || '(none)'}`)
  console.log('')

  const existing = await githubRequest('GET', `/repos/${REPO_OWNER}/${REPO_NAME}/releases/tags/${tag}`, null, token)
  if (existing.status === 200) {
    console.log(`  Deleting existing release ${tag}...`)
    await githubRequest('DELETE', `/repos/${REPO_OWNER}/${REPO_NAME}/releases/${existing.data.id}`, null, token)
    await githubRequest('DELETE', `/repos/${REPO_OWNER}/${REPO_NAME}/git/refs/tags/${tag}`, null, token)
  }

  console.log('  Creating release...')
  const releaseRes = await githubRequest('POST', `/repos/${REPO_OWNER}/${REPO_NAME}/releases`, {
    tag_name: tag,
    name: `${PRODUCT_NAME} ${tag}`,
    body: notes || `Release ${tag}`,
    draft: false,
    prerelease: false
  }, token)

  if (releaseRes.status !== 201) {
    console.error('  Failed:', releaseRes.data?.message || releaseRes.data)
    process.exit(1)
  }

  console.log(`  Release created: ${releaseRes.data.html_url}`)

  console.log('')
  console.log('  Uploading installer...')
  await uploadAsset(releaseRes.data.upload_url, exePath, path.basename(exePath), token)
  console.log('')

  console.log('  Uploading latest.yml...')
  await uploadAsset(releaseRes.data.upload_url, ymlPath, 'latest.yml', token)
  console.log('')

  const blockmapFile = path.basename(exePath) + '.blockmap'
  const blockmapPath = path.join(DIST_DIR, blockmapFile)
  if (fs.existsSync(blockmapPath)) {
    console.log('  Uploading blockmap...')
    await uploadAsset(releaseRes.data.upload_url, blockmapPath, blockmapFile, token)
    console.log('')
  }

  const assetsRes = await githubRequest('GET', `/repos/${REPO_OWNER}/${REPO_NAME}/releases/${releaseRes.data.id}/assets`, null, token)
  if (assetsRes.status === 200 && Array.isArray(assetsRes.data)) {
    for (const asset of assetsRes.data) {
      if ((asset.name.endsWith('.zip') || asset.name.endsWith('.tar.gz')) && !asset.name.includes('Setup')) {
        console.log(`  Deleting source archive: ${asset.name}`)
        await githubRequest('DELETE', `/repos/${REPO_OWNER}/${REPO_NAME}/releases/assets/${asset.id}`, null, token)
      }
    }
  }

  console.log('')
  console.log(`  Published v${version} to GitHub Releases!`)
  console.log(`  ${releaseRes.data.html_url}`)
  console.log('')
}

main().catch((err) => {
  console.error('Fatal error:', err.message)
  process.exit(1)
})
