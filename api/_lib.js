// Shared helpers for Airwave API routes.
import crypto from 'crypto'

export function getToken() {
  return process.env.BLOB_READ_WRITE_TOKEN || ''
}

export function getAdminPassword() {
  return process.env.ADMIN_PASSWORD || ''
}

export function isAuthed(req) {
  const pw = getAdminPassword()
  if (!pw) return false
  const hdr = req.headers.authorization || ''
  const m = /^Bearer (.+)$/.exec(hdr)
  if (!m) return false
  const a = Buffer.from(m[1])
  const b = Buffer.from(pw)
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

export function unauthorized(res) {
  res.status(401).json({ error: 'unauthorized' })
}

export async function readChannels(host) {
  // Prefer the admin-managed copy in Vercel Blob; fall back to the baked
  // channels.json served as a static file on the same deployment.
  const token = getToken()
  if (token) {
    try {
      const { list } = await import('@vercel/blob')
      const { blobs } = await list({ prefix: 'channels.json', token })
      const hit = blobs.find((b) => b.pathname === 'channels.json') || blobs[0]
      if (hit) {
        const r = await fetch(hit.url)
        if (r.ok) {
          const data = await r.json()
          if (Array.isArray(data)) return { channels: data, source: 'blob' }
        }
      }
    } catch { /* fall through to baked file */ }
  }
  try {
    const proto = process.env.VERCEL ? 'https' : 'http'
    const r = await fetch(`${proto}://${host}/channels.json`)
    if (r.ok) {
      const data = await r.json()
      if (Array.isArray(data)) return { channels: data, source: 'baked' }
    }
  } catch { /* no fallback available */ }
  return { channels: [], source: 'none' }
}

export async function writeChannels(channels) {
  const token = getToken()
  if (!token) {
    const e = new Error('BLOB_READ_WRITE_TOKEN is not configured')
    e.code = 'NO_BLOB'
    throw e
  }
  const { put } = await import('@vercel/blob')
  await put('channels.json', JSON.stringify(channels, null, 1), {
    access: 'public',
    addRandomSuffix: false,
    contentType: 'application/json',
    token,
  })
  return true
}

export function nextId(channels) {
  return channels.reduce((m, c) => Math.max(m, Number(c.id) || 0), 0) + 1
}
