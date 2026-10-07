// Admin channel collection.
// GET  /api/admin/channels — full list (incl. disabled) + source + epg meta
// POST /api/admin/channels — add a channel {name, stream, logo, category, country, tvg_id?}
import { isAuthed, unauthorized, readChannels, writeChannels, nextId } from '../_lib.js'

const CATEGORIES = ['News', 'Sports', 'Entertainment', 'Kids', 'Music', 'Documentary', 'Anime']

export default async function handler(req, res) {
  if (!isAuthed(req)) {
    unauthorized(res)
    return
  }
  if (req.method === 'GET') {
    const { channels, source } = await readChannels(req.headers.host)
    let epgMeta = null
    try {
      const r = await fetch(new URL('/epg-meta.json', `https://${req.headers.host}`))
      if (r.ok) epgMeta = await r.json()
    } catch { /* optional */ }
    res.status(200).json({ channels, source, epgMeta, blobConfigured: !!process.env.BLOB_READ_WRITE_TOKEN })
    return
  }
  if (req.method === 'POST') {
    const b = req.body || {}
    if (!b.name || !b.stream || !b.logo || !b.category) {
      res.status(400).json({ error: 'name, stream, logo and category are required' })
      return
    }
    if (!CATEGORIES.includes(b.category)) {
      res.status(400).json({ error: `category must be one of: ${CATEGORIES.join(', ')}` })
      return
    }
    try {
      const { channels } = await readChannels(req.headers.host)
      const ch = {
        id: nextId(channels),
        name: String(b.name).slice(0, 80),
        logo: String(b.logo).slice(0, 500),
        stream: String(b.stream).slice(0, 500),
        category: b.category,
        country: String(b.country || '').slice(0, 60),
        tvg_id: String(b.tvg_id || '').slice(0, 120),
        enabled: b.enabled !== false,
        health: { status: 'unknown', checked_at: null },
      }
      channels.push(ch)
      await writeChannels(channels)
      res.status(201).json(ch)
    } catch (e) {
      res.status(e.code === 'NO_BLOB' ? 503 : 500).json({ error: e.message })
    }
    return
  }
  res.status(405).json({ error: 'method not allowed' })
}
