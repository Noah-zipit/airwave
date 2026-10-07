// GET /api/channels — public channel list for the site.
// Prefers the admin-managed Vercel Blob copy; falls back to baked channels.json.
import { readChannels } from './_lib.js'

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'method not allowed' })
    return
  }
  const { channels } = await readChannels(req.headers.host)
  res.setHeader('Cache-Control', 'public, max-age=300')
  res.status(200).json(channels)
}
