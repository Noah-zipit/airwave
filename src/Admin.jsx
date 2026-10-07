import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'

const CATEGORIES = ['News', 'Sports', 'Entertainment', 'Kids', 'Music', 'Documentary', 'Anime']

function authHeaders(token) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
}

/* ---------- browser-side stream probe (the truest test: real CORS + https) ---------- */
async function probeOne(ch, timeoutMs = 20000) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const r = await fetch(ch.stream, { mode: 'cors', signal: ctrl.signal })
    const text = await r.text()
    if (!r.ok || !text.startsWith('#EXTM3U')) {
      return { id: ch.id, ok: false, note: `playlist http ${r.status}` }
    }
    // resolve nested variant playlists (one level)
    let mediaText = text
    let base = ch.stream
    for (const line of text.split('\n')) {
      const t = line.trim()
      if (!t || t.startsWith('#')) continue
      if (t.includes('.m3u8')) {
        const sub = new URL(t, base).href
        const r2 = await fetch(sub, { mode: 'cors', signal: ctrl.signal })
        const t2 = await r2.text()
        if (!r2.ok || !t2.startsWith('#EXTM3U')) return { id: ch.id, ok: false, note: 'nested playlist failed' }
        mediaText = t2
        base = sub
      }
      break
    }
    let seg = null
    for (const line of mediaText.split('\n')) {
      const t = line.trim()
      if (!t || t.startsWith('#') || t.includes('.m3u8')) continue
      seg = new URL(t, base).href
      break
    }
    if (!seg) return { id: ch.id, ok: false, note: 'no segment found' }
    if (seg.startsWith('http://')) return { id: ch.id, ok: false, note: 'mixed content (http segment)' }
    // fetch first bytes of the segment, then cancel
    const r3 = await fetch(seg, { mode: 'cors', signal: ctrl.signal })
    if (!r3.ok || !r3.body) return { id: ch.id, ok: false, note: `segment http ${r3.status}` }
    const reader = r3.body.getReader()
    const { value } = await reader.read()
    reader.cancel().catch(() => {})
    if (!value || value.length < 500) return { id: ch.id, ok: false, note: 'segment empty' }
    return { id: ch.id, ok: true, note: 'ok' }
  } catch (e) {
    const msg = e?.name === 'AbortError' ? 'timed out' : 'unreachable / CORS blocked'
    return { id: ch.id, ok: false, note: msg }
  } finally {
    clearTimeout(timer)
  }
}

function HealthBadge({ health }) {
  if (!health || health.status === 'unknown' || !health.status) {
    return <span className="text-xs text-muted">not checked</span>
  }
  const ok = health.status === 'ok'
  return (
    <span
      title={health.note || ''}
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${
        ok ? 'bg-emerald-500/15 text-emerald-400' : 'bg-live/15 text-live'
      }`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${ok ? 'bg-emerald-400' : 'bg-live'}`} />
      {ok ? 'healthy' : 'down'}
    </span>
  )
}

const EMPTY_FORM = { name: '', stream: '', logo: '', category: 'News', country: '', tvg_id: '', enabled: true }

export default function Admin() {
  const [token, setToken] = useState(() => {
    try { return sessionStorage.getItem('airwave-admin') || '' } catch { return '' }
  })
  const [password, setPassword] = useState('')
  const [channels, setChannels] = useState([])
  const [source, setSource] = useState('')
  const [epgMeta, setEpgMeta] = useState(null)
  const [blobConfigured, setBlobConfigured] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [checking, setChecking] = useState(false)
  const [progress, setProgress] = useState(null)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [editingId, setEditingId] = useState(null)
  const [editForm, setEditForm] = useState(EMPTY_FORM)
  const [filter, setFilter] = useState('All')
  const checkingRef = useRef(false)

  const load = useCallback(async (tok) => {
    setLoading(true)
    setError('')
    try {
      const r = await fetch('/api/admin/channels', { headers: { Authorization: `Bearer ${tok}` } })
      if (r.status === 401) {
        try { sessionStorage.removeItem('airwave-admin') } catch {}
        setToken('')
        setError('Wrong password.')
        return
      }
      if (!r.ok) throw new Error(`server ${r.status}`)
      const d = await r.json()
      setChannels(d.channels || [])
      setSource(d.source || '')
      setEpgMeta(d.epgMeta || null)
      setBlobConfigured(d.blobConfigured !== false)
    } catch (e) {
      setError(`Could not load channels: ${e.message}`)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (token) load(token)
  }, [token, load])

  const login = (e) => {
    e.preventDefault()
    const t = password.trim()
    if (!t) return
    try { sessionStorage.setItem('airwave-admin', t) } catch {}
    setToken(t)
    setPassword('')
  }

  const logout = () => {
    try { sessionStorage.removeItem('airwave-admin') } catch {}
    setToken('')
    setChannels([])
  }

  const apiMutate = async (method, path, body) => {
    const r = await fetch(path, {
      method,
      headers: authHeaders(token),
      body: body ? JSON.stringify(body) : undefined,
    })
    if (r.status === 401) { logout(); throw new Error('session expired') }
    const d = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(d.error || `server ${r.status}`)
    return d
  }

  const saveAdd = async (e) => {
    e.preventDefault()
    setError('')
    try {
      const ch = await apiMutate('POST', '/api/admin/channels', form)
      setChannels((cs) => [...cs, ch])
      setForm(EMPTY_FORM)
      setShowAdd(false)
    } catch (err) { setError(err.message) }
  }

  const startEdit = (ch) => {
    setEditingId(ch.id)
    setEditForm({
      name: ch.name, stream: ch.stream, logo: ch.logo, category: ch.category,
      country: ch.country || '', tvg_id: ch.tvg_id || '', enabled: ch.enabled !== false,
    })
  }

  const saveEdit = async (id) => {
    setError('')
    try {
      const ch = await apiMutate('PUT', `/api/admin/channels/${id}`, editForm)
      setChannels((cs) => cs.map((c) => (Number(c.id) === Number(id) ? ch : c)))
      setEditingId(null)
    } catch (err) { setError(err.message) }
  }

  const toggleEnabled = async (ch) => {
    try {
      const upd = await apiMutate('PUT', `/api/admin/channels/${ch.id}`, { enabled: !(ch.enabled !== false) })
      setChannels((cs) => cs.map((c) => (Number(c.id) === Number(ch.id) ? upd : c)))
    } catch (err) { setError(err.message) }
  }

  const removeChannel = async (ch) => {
    if (!window.confirm(`Delete "${ch.name}"?`)) return
    try {
      await apiMutate('DELETE', `/api/admin/channels/${ch.id}`)
      setChannels((cs) => cs.filter((c) => Number(c.id) !== Number(ch.id)))
    } catch (err) { setError(err.message) }
  }

  const checkAll = async () => {
    if (checkingRef.current) return
    checkingRef.current = true
    setChecking(true)
    setError('')
    const list = channels.filter((c) => c.enabled !== false)
    const results = []
    let done = 0
    setProgress({ done: 0, total: list.length })
    // 6 concurrent workers over a shared index pointer
    let idx = 0
    const workers = Array.from({ length: 6 }, async () => {
      while (idx < list.length) {
        const ch = list[idx++]
        try {
          results.push(await probeOne(ch))
        } catch {
          results.push({ id: ch.id, ok: false, note: 'probe crashed' })
        }
        done++
        setProgress({ done, total: list.length })
      }
    })
    await Promise.all(workers)
    try {
      const saved = await apiMutate('POST', '/api/admin/health', {
        results: results.map((r) => ({ ...r, checked_at: new Date().toISOString() })),
      })
      setChannels((cs) => cs.map((c) => {
        const r = results.find((x) => Number(x.id) === Number(c.id))
        return r ? { ...c, health: { status: r.ok ? 'ok' : 'down', note: r.note, checked_at: saved.at } } : c
      }))
    } catch (err) {
      setError(`Probed ${results.filter((r) => r.ok).length}/${results.length} healthy, but saving failed: ${err.message}`)
    } finally {
      checkingRef.current = false
      setChecking(false)
      setProgress(null)
    }
  }

  const stats = useMemo(() => {
    const byCat = {}
    let healthy = 0, down = 0
    for (const c of channels) {
      byCat[c.category] = (byCat[c.category] || 0) + 1
      if (c.health?.status === 'ok') healthy++
      else if (c.health?.status === 'down') down++
    }
    return { total: channels.length, healthy, down, byCat }
  }, [channels])

  const visible = filter === 'All' ? channels : channels.filter((c) => c.category === filter)

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <form onSubmit={login} className="w-full max-w-sm rounded-2xl bg-panel border border-panel2 p-8">
          <div className="flex items-center gap-3 mb-6">
            <img src="/logo.webp" alt="Airwave logo" className="w-10 h-10 rounded-lg" />
            <div>
              <p className="text-cream font-extrabold tracking-widest">AIRWAVE</p>
              <p className="text-muted text-xs">Admin panel</p>
            </div>
          </div>
          {error && <p className="text-live text-sm mb-4">{error}</p>}
          <label htmlFor="pw" className="sr-only">Admin password</label>
          <input
            id="pw" type="password" value={password} onChange={(e) => setPassword(e.target.value)}
            placeholder="Admin password" autoComplete="current-password"
            className="w-full rounded-lg bg-ink border border-panel2 px-3 py-2.5 text-sm text-cream placeholder:text-muted focus:outline-none focus:border-accent mb-4"
          />
          <button type="submit" className="w-full rounded-lg bg-accent text-ink font-bold py-2.5 hover:brightness-110">
            Sign in
          </button>
        </form>
      </div>
    )
  }

  const inputCls = 'w-full rounded-lg bg-ink border border-panel2 px-3 py-2 text-sm text-cream placeholder:text-muted focus:outline-none focus:border-accent'

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 bg-ink/95 backdrop-blur border-b border-panel2">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-3">
          <img src="/logo.webp" alt="Airwave logo" className="w-9 h-9 rounded-lg" />
          <div>
            <p className="text-cream font-extrabold tracking-widest leading-none">AIRWAVE <span className="text-accent">ADMIN</span></p>
            <p className="text-muted text-[11px] mt-1">
              {stats.total} channels · {stats.healthy} healthy · {stats.down} down
              {source && <span> · source: {source}</span>}
            </p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <a href="/" className="text-xs text-muted hover:text-cream px-3 py-2">View site</a>
            <button onClick={logout} className="text-xs text-muted hover:text-cream border border-panel2 rounded-lg px-3 py-2">Sign out</button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 pb-16">
        {!blobConfigured && (
          <div className="mb-6 rounded-xl border border-live/40 bg-live/10 p-4 text-sm text-cream">
            <p className="font-bold mb-1">Storage not configured</p>
            <p className="text-muted">Set <code className="text-accent">BLOB_READ_WRITE_TOKEN</code> in the Vercel project environment variables, then redeploy. Until then, changes cannot be saved.</p>
          </div>
        )}

        {error && <p className="mb-4 text-sm text-live">{error}</p>}

        {/* actions */}
        <div className="flex flex-wrap items-center gap-3 mb-6">
          <button
            onClick={checkAll} disabled={checking || loading}
            className="rounded-lg bg-accent text-ink text-sm font-bold px-5 py-2.5 hover:brightness-110 disabled:opacity-50"
          >
            {checking ? `Checking… ${progress ? `${progress.done}/${progress.total}` : ''}` : 'Check all streams'}
          </button>
          <button
            onClick={() => setShowAdd((v) => !v)}
            className="rounded-lg border border-panel2 text-cream text-sm font-semibold px-5 py-2.5 hover:border-accent"
          >
            {showAdd ? 'Cancel' : '+ Add channel'}
          </button>
          <div className="ml-auto text-xs text-muted">
            {epgMeta ? (
              <span>EPG: {epgMeta.channels_with_data}/{epgMeta.channels_total} channels · refreshed {new Date(epgMeta.generated_at).toLocaleString()}</span>
            ) : (
              <span>EPG: no guide data baked yet</span>
            )}
          </div>
        </div>

        {checking && progress && (
          <div className="mb-6">
            <div className="h-2 rounded-full bg-panel overflow-hidden">
              <div className="h-full bg-accent transition-all" style={{ width: `${(progress.done / Math.max(1, progress.total)) * 100}%` }} />
            </div>
          </div>
        )}

        {/* add form */}
        {showAdd && (
          <form onSubmit={saveAdd} className="mb-8 rounded-xl bg-panel border border-panel2 p-5 grid sm:grid-cols-2 gap-4">
            <div><label className="text-xs text-muted block mb-1">Name *</label><input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputCls} placeholder="Channel name" /></div>
            <div><label className="text-xs text-muted block mb-1">Category *</label>
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className={inputCls}>
                {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div className="sm:col-span-2"><label className="text-xs text-muted block mb-1">Stream URL (m3u8) *</label><input required value={form.stream} onChange={(e) => setForm({ ...form, stream: e.target.value })} className={inputCls} placeholder="https://…" inputMode="url" /></div>
            <div className="sm:col-span-2"><label className="text-xs text-muted block mb-1">Logo URL *</label><input required value={form.logo} onChange={(e) => setForm({ ...form, logo: e.target.value })} className={inputCls} placeholder="https://…" inputMode="url" /></div>
            <div><label className="text-xs text-muted block mb-1">Country</label><input value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} className={inputCls} placeholder="United States" /></div>
            <div><label className="text-xs text-muted block mb-1">TVG ID (for program guide)</label><input value={form.tvg_id} onChange={(e) => setForm({ ...form, tvg_id: e.target.value })} className={inputCls} placeholder="ChannelId@Feed" /></div>
            <div className="sm:col-span-2 flex items-center gap-3">
              <button type="submit" className="rounded-lg bg-accent text-ink text-sm font-bold px-6 py-2.5 hover:brightness-110">Add channel</button>
              <p className="text-xs text-muted">Tip: run “Check all streams” after adding to verify it plays in a real browser.</p>
            </div>
          </form>
        )}

        {/* filter */}
        <div className="flex gap-2 overflow-x-auto pb-2 mb-4 nice-scroll">
          {['All', ...CATEGORIES].map((c) => (
            <button
              key={c} onClick={() => setFilter(c)}
              className={`shrink-0 rounded-full px-4 py-1.5 text-xs font-semibold border ${filter === c ? 'bg-accent text-ink border-accent' : 'bg-panel text-muted border-panel2 hover:text-cream'}`}
            >
              {c}{c !== 'All' && stats.byCat[c] ? ` · ${stats.byCat[c]}` : ''}
            </button>
          ))}
        </div>

        {/* table */}
        {loading ? (
          <p className="text-muted text-sm">Loading…</p>
        ) : (
          <div className="rounded-xl border border-panel2 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[760px]">
                <thead>
                  <tr className="text-left text-xs text-muted uppercase tracking-wide border-b border-panel2 bg-panel">
                    <th className="px-4 py-3 font-semibold">Channel</th>
                    <th className="px-4 py-3 font-semibold">Category</th>
                    <th className="px-4 py-3 font-semibold">Health</th>
                    <th className="px-4 py-3 font-semibold">Visible</th>
                    <th className="px-4 py-3 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((ch) => (
                    <Fragment key={ch.id}>
                      <tr className="border-b border-panel2/60 hover:bg-panel/60">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <img src={ch.logo} alt="" className="w-14 h-9 object-contain bg-black/40 rounded" onError={(e) => { e.currentTarget.style.visibility = 'hidden' }} />
                            <div>
                              <p className="text-cream font-semibold">{ch.name}</p>
                              <p className="text-muted text-xs">{ch.country || '—'}{ch.tvg_id ? ` · ${ch.tvg_id}` : ''}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-muted">{ch.category}</td>
                        <td className="px-4 py-3"><HealthBadge health={ch.health} /></td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => toggleEnabled(ch)} aria-label={`Toggle ${ch.name}`}
                            className={`relative w-11 h-6 rounded-full transition-colors ${ch.enabled !== false ? 'bg-accent' : 'bg-panel2'}`}
                          >
                            <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-cream transition-all ${ch.enabled !== false ? 'left-[22px]' : 'left-0.5'}`} />
                          </button>
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <button onClick={() => (editingId === ch.id ? setEditingId(null) : startEdit(ch))} className="text-xs text-accent hover:brightness-110 px-2 py-1">Edit</button>
                          <button onClick={() => removeChannel(ch)} className="text-xs text-live hover:brightness-110 px-2 py-1">Delete</button>
                        </td>
                      </tr>
                      {editingId === ch.id && (
                        <tr key={`${ch.id}-edit`} className="border-b border-panel2 bg-panel/40">
                          <td colSpan={5} className="px-4 py-4">
                            <div className="grid sm:grid-cols-2 gap-3">
                              <div><label className="text-xs text-muted block mb-1">Name</label><input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} className={inputCls} /></div>
                              <div><label className="text-xs text-muted block mb-1">Category</label>
                                <select value={editForm.category} onChange={(e) => setEditForm({ ...editForm, category: e.target.value })} className={inputCls}>
                                  {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                                </select>
                              </div>
                              <div className="sm:col-span-2"><label className="text-xs text-muted block mb-1">Stream URL</label><input value={editForm.stream} onChange={(e) => setEditForm({ ...editForm, stream: e.target.value })} className={inputCls} /></div>
                              <div className="sm:col-span-2"><label className="text-xs text-muted block mb-1">Logo URL</label><input value={editForm.logo} onChange={(e) => setEditForm({ ...editForm, logo: e.target.value })} className={inputCls} /></div>
                              <div><label className="text-xs text-muted block mb-1">Country</label><input value={editForm.country} onChange={(e) => setEditForm({ ...editForm, country: e.target.value })} className={inputCls} /></div>
                              <div><label className="text-xs text-muted block mb-1">TVG ID</label><input value={editForm.tvg_id} onChange={(e) => setEditForm({ ...editForm, tvg_id: e.target.value })} className={inputCls} /></div>
                            </div>
                            <div className="mt-4 flex gap-3">
                              <button onClick={() => saveEdit(ch.id)} className="rounded-lg bg-accent text-ink text-sm font-bold px-6 py-2 hover:brightness-110">Save</button>
                              <button onClick={() => setEditingId(null)} className="rounded-lg border border-panel2 text-sm text-muted px-6 py-2 hover:text-cream">Cancel</button>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        <p className="text-muted text-xs mt-6">
          Health checks run in this browser — the same CORS, HTTPS and segment rules the site's player faces.
          EPG data refreshes via <code className="text-accent">scripts/build-epg.py</code> (run manually, then push).
        </p>
      </main>
    </div>
  )
}
