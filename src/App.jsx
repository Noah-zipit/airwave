import { useEffect, useMemo, useRef, useState } from 'react'

const CATEGORIES = ['All', 'News', 'Sports', 'Entertainment', 'Kids', 'Music', 'Documentary']

function Player({ channel }) {
  const videoRef = useRef(null)
  const hlsRef = useRef(null)
  const [error, setError] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setError(false)
    setLoading(true)
    const video = videoRef.current
    if (!video || !channel) return

    const onError = () => { setError(true); setLoading(false) }

    if (window.Hls && window.Hls.isSupported()) {
      const hls = new window.Hls({ maxBufferLength: 30 })
      hlsRef.current = hls
      hls.on(window.Hls.Events.ERROR, (_e, data) => {
        if (data.fatal) { onError() }
      })
      hls.loadSource(channel.stream)
      hls.attachMedia(video)
      video.play().catch(() => {})
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = channel.stream
      video.addEventListener('error', onError)
      video.play().catch(() => {})
    } else {
      onError()
    }

    const onPlaying = () => setLoading(false)
    const onWaiting = () => setLoading(true)
    video.addEventListener('playing', onPlaying)
    video.addEventListener('waiting', onWaiting)

    return () => {
      video.removeEventListener('playing', onPlaying)
      video.removeEventListener('waiting', onWaiting)
      if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null }
    }
  }, [channel && channel.id])

  return (
    <div>
      <div className="relative rounded-xl overflow-hidden bg-black aspect-video">
        {channel ? (
          <video
            ref={videoRef}
            key={channel.id}
            className="w-full h-full"
            controls
            playsInline
            aria-label={`Live stream: ${channel.name}`}
          />
        ) : null}
        {loading && !error && channel && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-10 h-10 rounded-full border-2 border-accent border-t-transparent animate-spin" aria-hidden="true" />
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-ink/95 p-6 text-center">
            <p className="text-cream text-lg font-semibold">This stream is down right now</p>
            <p className="text-muted text-sm max-w-sm">The channel's feed stopped responding. Pick another channel below — the list is checked regularly.</p>
          </div>
        )}
        {!channel && (
          <div className="absolute inset-0 flex items-center justify-center p-6 text-center">
            <p className="text-muted">Pick a channel below to start watching</p>
          </div>
        )}
      </div>
      {channel && (
        <div className="mt-4 flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-bold text-cream">{channel.name}</h2>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-live/15 text-live text-xs font-bold px-2.5 py-1 uppercase tracking-wide">
                <span className="live-dot w-1.5 h-1.5 rounded-full bg-live" aria-hidden="true" />
                Live
              </span>
            </div>
            <p className="text-muted text-sm mt-1">{channel.category} · {channel.country}</p>
          </div>
        </div>
      )}
    </div>
  )
}

function ChannelCard({ channel, active, onSelect }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(channel)}
      aria-label={`Watch ${channel.name} live`}
      className={`group text-left rounded-xl bg-panel border transition-colors overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
        active ? 'border-accent' : 'border-transparent hover:border-panel2'
      }`}
    >
      <div className="card-logo aspect-video flex items-center justify-center p-4">
        <img
          src={channel.logo}
          alt={`${channel.name} logo`}
          loading="lazy"
          className="max-h-full max-w-full object-contain"
          onError={(e) => { e.currentTarget.style.display = 'none' }}
        />
      </div>
      <div className="p-3">
        <p className="text-cream text-sm font-semibold truncate">{channel.name}</p>
        <p className="text-muted text-xs mt-0.5">{channel.country}</p>
      </div>
    </button>
  )
}

export default function App() {
  const [channels, setChannels] = useState([])
  const [failed, setFailed] = useState(false)
  const [category, setCategory] = useState('All')
  const [query, setQuery] = useState('')
  const [current, setCurrent] = useState(null)

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}channels.json`)
      .then((r) => { if (!r.ok) throw new Error('bad'); return r.json() })
      .then((data) => { setChannels(data); setCurrent(data[0] || null) })
      .catch(() => setFailed(true))
  }, [])

  const counts = useMemo(() => {
    const c = { All: channels.length }
    for (const ch of channels) c[ch.category] = (c[ch.category] || 0) + 1
    return c
  }, [channels])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return channels.filter((ch) =>
      (category === 'All' || ch.category === category) &&
      (!q || ch.name.toLowerCase().includes(q))
    )
  }, [channels, category, query])

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 bg-ink/95 backdrop-blur border-b border-panel2">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-4">
          <a href="#" className="flex items-center gap-3 shrink-0" onClick={(e) => e.preventDefault()}>
            <img src={`${import.meta.env.BASE_URL}logo.webp`} alt="Airwave logo" className="w-10 h-10 rounded-lg" />
            <span>
              <span className="block text-cream font-extrabold tracking-widest text-lg leading-none">AIRWAVE</span>
              <span className="block text-muted text-[11px] mt-1">Every channel. One click.</span>
            </span>
          </a>
          <div className="ml-auto w-full max-w-xs">
            <label htmlFor="search" className="sr-only">Search channels</label>
            <input
              id="search"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search channels…"
              className="w-full rounded-lg bg-panel border border-panel2 px-3 py-2 text-sm text-cream placeholder:text-muted focus:outline-none focus:border-accent"
            />
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 pb-16">
        <section className="pt-6" aria-label="Now playing">
          <Player channel={current} />
        </section>

        <section className="pt-8" aria-label="Browse channels">
          <h2 className="text-xl font-bold text-cream">Browse channels</h2>
          <div className="nice-scroll mt-4 flex gap-2 overflow-x-auto pb-2" role="tablist" aria-label="Categories">
            {CATEGORIES.map((c) => (
              <button
                key={c}
                role="tab"
                aria-selected={category === c}
                onClick={() => setCategory(c)}
                className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold border transition-colors ${
                  category === c
                    ? 'bg-accent text-ink border-accent'
                    : 'bg-panel text-muted border-panel2 hover:text-cream hover:border-muted'
                }`}
              >
                {c} <span className="opacity-70">· {counts[c] || 0}</span>
              </button>
            ))}
          </div>

          {failed ? (
            <p className="text-muted mt-8">Could not load the channel list. Check your connection and reload.</p>
          ) : filtered.length === 0 ? (
            <p className="text-muted mt-8">No channels match{query ? ` “${query}”` : ''}. Try another search.</p>
          ) : (
            <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {filtered.map((ch) => (
                <ChannelCard key={ch.id} channel={ch} active={current && current.id === ch.id} onSelect={setCurrent} />
              ))}
            </div>
          )}
        </section>
      </main>

      <footer className="border-t border-panel2">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
          <p className="text-muted text-xs">Airwave · free-to-air streams only · every channel, one click</p>
          <p className="text-muted text-xs">{channels.length} channels · checked working</p>
        </div>
      </footer>
    </div>
  )
}
