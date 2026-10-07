// PUT    /api/admin/channels/[id] — edit fields / toggle enabled
// DELETE /api/admin/channels/[id] — remove a channel
import { isAuthed, unauthorized, readChannels, writeChannels } from '../../_lib.js'

const CATEGORIES = ['News', 'Sports', 'Entertainment', 'Kids', 'Music', 'Documentary', 'Anime']
const EDITABLE = ['name', 'logo', 'stream', 'category', 'country', 'tvg_id', 'enabled']

export default async function handler(req, res) {
  if (!isAuthed(req)) {
    unauthorized(res)
    return
  }
  const id = Number(req.query.id)
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: 'bad id' })
    return
  }
  try {
    const { channels } = await readChannels(req.headers.host)
    const idx = channels.findIndex((c) => Number(c.id) === id)
    if (idx === -1) {
      res.status(404).json({ error: 'channel not found' })
      return
    }
    if (req.method === 'PUT') {
      const b = req.body || {}
      const ch = channels[idx]
      for (const k of EDITABLE) {
        if (b[k] === undefined) continue
        if (k === 'category' && !CATEGORIES.includes(b[k])) {
          res.status(400).json({ error: `category must be one of: ${CATEGORIES.join(', ')}` })
          return
        }
        ch[k] = k === 'enabled' ? b[k] !== false : String(b[k]).slice(0, 500)
      }
      await writeChannels(channels)
      res.status(200).json(ch)
      return
    }
    if (req.method === 'DELETE') {
      const [gone] = channels.splice(idx, 1)
      await writeChannels(channels)
      res.status(200).json({ deleted: gone.id })
      return
    }
    res.status(405).json({ error: 'method not allowed' })
  } catch (e) {
    res.status(e.code === 'NO_BLOB' ? 503 : 500).json({ error: e.message })
  }
}
