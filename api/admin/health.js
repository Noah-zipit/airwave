// POST /api/admin/health — persist browser-side probe results.
// Body: { results: [{ id, ok, note?, checked_at }] }
// Merges health status into each channel record in Blob.
import { isAuthed, unauthorized, readChannels, writeChannels } from '../_lib.js'

export default async function handler(req, res) {
  if (!isAuthed(req)) {
    unauthorized(res)
    return
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method not allowed' })
    return
  }
  const results = (req.body && req.body.results) || []
  if (!Array.isArray(results)) {
    res.status(400).json({ error: 'results must be an array' })
    return
  }
  try {
    const { channels } = await readChannels(req.headers.host)
    const byId = new Map(channels.map((c) => [Number(c.id), c]))
    let updated = 0
    const at = new Date().toISOString()
    for (const r of results) {
      const ch = byId.get(Number(r.id))
      if (!ch) continue
      ch.health = {
        status: r.ok ? 'ok' : 'down',
        note: String(r.note || '').slice(0, 200),
        checked_at: r.checked_at || at,
      }
      updated += 1
    }
    await writeChannels(channels)
    res.status(200).json({ updated, at })
  } catch (e) {
    res.status(e.code === 'NO_BLOB' ? 503 : 500).json({ error: e.message })
  }
}
