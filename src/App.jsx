import { useEffect, useMemo, useRef, useState } from 'react'

const CATEGORIES = ['All', 'News', 'Sports', 'Entertainment', 'Kids', 'Music', 'Documentary']

function IconPlay() {
  return (
    <svg viewBox="0 0 24 24" className="w-8 h-8 ml-1" fill="currentColor" aria-hidden="true">
      <path d="M8 5.5v13l11-6.5z" />
    </svg>
  )
}

function IconPause() {
  return (
    <svg viewBox="0 0 24 24" className="w-8 h-8" fill="currentColor" aria-hidden="true">
      <path d="M7 5h4v14H7zM13 5h4v14h-4z" />
    </svg>
  )
}

function IconVolume() {
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M11 5 6 9H3v6h3l5 4z" fill="currentColor" stroke="none" />
      <path d="M15.5 8.5a5 5 0 0 1 0 7M18.4 5.6a9 9 0 0 1 0 12.8" />
    </svg>
  )
}

function IconMuted() {
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M11 5 6 9H3v6h3l5 4z" fill="currentColor" stroke="none" />
      <path d="m16 9 6 6M22 9l-6 6" />
    </svg>
  )
}

function IconFullscreen() {
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
    </svg>
  )
}

function Player({ channel, sectionRef }) {
  const videoRef = useRef(null)
  const boxRef = useRef(null)
  const hlsRef = useRef(null)
  const hideTimer = useRef(null)

  const [error, setError] = useState(false)
  const [loading, setLoading] = useState(true)
  const [playing, setPlaying] = useState(false)
  const [muted, setMuted] = useState(false)
  const [replay, setReplay] = useState(false)
  const [controlsVisible, setControlsVisible] = useState(true)
  const [attempt, setAttempt] = useState(0)

  const pokeControls = () => {
    setControlsVisible(true)
    if (hideTimer.current) clearTimeout(hideTimer.current)
    hideTimer.current = setTimeout(() => {
      setControlsVisible((v) => v && !videoRef.current?.paused ? false : v)
    }, 2800)
  }

  useEffect(() => {
    setError(false)
    setLoading(true)
    setPlaying(false)
    setReplay(false)
    setControlsVisible(true)
    const video = videoRef.current
    if (!video || !channel) return

    const onError = () => { setError(true); setLoading(false) }

    if (window.Hls && window.Hls.isSupported()) {
      const hls = new window.Hls({ maxBufferLength: 30 })
      hlsRef.current = hls
      hls.on(window.Hls.Events.ERROR, (_e, data) => {
        if (data.fatal) onError()
      })
      hls.loadSource(channel.stream)
      hls.attachMedia(video)
      video.play().catch(() => { /* autoplay blocked: user taps play */ })
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      const errHandler = () => onError()
      video.addEventListener('error', errHandler)
      video.src = channel.stream
      video.play().catch(() => { /* autoplay blocked: user taps play */ })
      video._errHandler = errHandler
    } else {
      onError()
    }

    const onPlaying = () => { setLoading(false); setPlaying(true); pokeControls() }
    const onPause = () => { setPlaying(false); setControlsVisible(true) }
    const onWaiting = () => setLoading(true)
    const onMeta = () => {
      const d = video.duration
      setReplay(Number.isFinite(d) && d > 0)
    }
    video.addEventListener('playing', onPlaying)
    video.addEventListener('pause', onPause)
    video.addEventListener('waiting', onWaiting)
    video.addEventListener('loadedmetadata', onMeta)

    return () => {
      video.removeEventListener('playing', onPlaying)
      video.removeEventListener('pause', onPause)
      video.removeEventListener('waiting', onWaiting)
      video.removeEventListener('loadedmetadata', onMeta)
      if (video._errHandler) { video.removeEventListener('error', video._errHandler); video._errHandler = null }
      if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null }
      if (hideTimer.current) clearTimeout(hideTimer.current)
    }
  }, [channel && channel.id, attempt])

  const togglePlay = () => {
    const video = videoRef.current
    if (!video || error) return
    if (video.paused) video.play().catch(() => {})
    else video.pause()
    pokeControls()
  }

  const toggleMute = (e) => {
    e.stopPropagation()
    const video = videoRef.current
    if (!video) return
    video.muted = !video.muted
    setMuted(video.muted)
    pokeControls()
  }

  const toggleFullscreen = (e) => {
    e.stopPropagation()
    const box = boxRef.current
    if (!box) return
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
    else box.requestFullscreen?.().catch(() => {})
    pokeControls()
  }

  const retry = () => setAttempt((a) => a + 1)

  const showBigButton = !playing && !loading && !error && channel

  return (
    <div ref={sectionRef}>
      <div
        ref={boxRef}
        className="relative rounded-xl overflow-hidden bg-black aspect-video select-none"
        onMouseMove={pokeControls}
        onTouchStart={pokeControls}
      >
        {channel && (
          <video
            ref={videoRef}
            key={`${channel.id}-${attempt}`}
            className="w-full h-full"
            playsInline
            preload="auto"
            onClick={togglePlay}
            aria-label={`${replay ? 'Replay' : 'Live stream'}: ${channel.name}`}
          />
        )}

        {/* branded loading */}
        {loading && !error && channel && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-ink/60 pointer-events-none">
            <div className="w-12 h-12 rounded-full border-[3px] border-accent/25 border-t-accent animate-spin" aria-hidden="true" />
            <p className="text-cream text-sm font-semibold tracking-wide">Tuning in to {channel.name}…</p>
          </div>
        )}

        {/* error with retry */}
        {error && channel && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-ink/95 p-6 text-center">
            <p className="text-cream text-lg font-semibold">This stream is down right now</p>
            <p className="text-muted text-sm max-w-sm">The channel's feed stopped responding. Try again, or pick another channel below.</p>
            <button
              type="button"
              onClick={retry}
              className="mt-1 rounded-full bg-accent px-6 py-2.5 text-sm font-bold text-ink hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-cream"
            >
              Retry
            </button>
          </div>
        )}

        {/* idle */}
        {!channel && (
          <div className="absolute inset-0 flex items-center justify-center p-6 text-center">
            <p className="text-muted">Pick a channel below to start watching</p>
          </div>
        )}

        {/* top badge */}
        {channel && !error && (controlsVisible || !playing) && (
          <div className="absolute top-3 right-3 pointer-events-none">
            {replay ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-accent/15 text-accent text-xs font-bold px-2.5 py-1 uppercase tracking-wide">
                Replay
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-live/15 text-live text-xs font-bold px-2.5 py-1 uppercase tracking-wide">
                <span className="live-dot w-1.5 h-1.5 rounded-full bg-live" aria-hidden="true" />
                Live
              </span>
            )}
          </div>
        )}

        {/* big centered play/pause */}
        {showBigButton && (
          <button
            type="button"
            onClick={togglePlay}
            aria-label={playing ? `Pause ${channel.name}` : `Play ${channel.name}`}
            className="absolute inset-0 m-auto w-20 h-20 rounded-full bg-accent text-ink flex items-center justify-center shadow-2xl hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-cream"
          >
            <IconPlay />
          </button>
        )}

        {/* bottom control bar */}
        {channel && !error && controlsVisible && !loading && (
          <div className="absolute inset-x-0 bottom-0 flex items-center gap-2 px-3 pb-3 pt-10 bg-gradient-to-t from-black/80 to-transparent">
            <button
              type="button"
              onClick={togglePlay}
              aria-label={playing ? 'Pause' : 'Play'}
              className="w-9 h-9 rounded-full bg-white/10 text-cream flex items-center justify-center hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              {playing
                ? <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor" aria-hidden="true"><path d="M7 5h4v14H7zM13 5h4v14h-4z" /></svg>
                : <svg viewBox="0 0 24 24" className="w-5 h-5 ml-0.5" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13l11-6.5z" /></svg>}
            </button>
            <button
              type="button"
              onClick={toggleMute}
              aria-label={muted ? 'Unmute' : 'Mute'}
              className="w-9 h-9 rounded-full bg-white/10 text-cream flex items-center justify-center hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              {muted ? <IconMuted /> : <IconVolume />}
            </button>
            <div className="flex-1" />
            <button
              type="button"
              onClick={toggleFullscreen}
              aria-label="Fullscreen"
              className="w-9 h-9 rounded-full bg-white/10 text-cream flex items-center justify-center hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <IconFullscreen />
            </button>
          </div>
        )}
      </div>

      {channel && (
        <div className="mt-4">
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="text-2xl font-bold text-cream">{channel.name}</h2>
            {replay ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-accent/15 text-accent text-xs font-bold px-2.5 py-1 uppercase tracking-wide">
                Replay
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-live/15 text-live text-xs font-bold px-2.5 py-1 uppercase tracking-wide">
                <span className="live-dot w-1.5 h-1.5 rounded-full bg-live" aria-hidden="true" />
                Live
              </span>
            )}
          </div>
          <p className="text-muted text-sm mt-1">
            {channel.category}{channel.country ? ` · ${channel.country}` : ''}
          </p>
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
      aria-label={`Watch ${channel.name}`}
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
        {channel.country && <p className="text-muted text-xs mt-0.5">{channel.country}</p>}
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
  const playerSectionRef = useRef(null)

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}channels.json`)
      .then((r) => { if (!r.ok) throw new Error('bad'); return r.json() })
      .then((data) => { setChannels(data); setCurrent(data[0] || null) })
      .catch(() => setFailed(true))
  }, [])

  const selectChannel = (ch) => {
    setCurrent(ch)
    playerSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

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
        <section className="pt-6 scroll-mt-20" aria-label="Now playing">
          <Player channel={current} sectionRef={playerSectionRef} />
        </section>

        <section className="pt-8" aria-label="Browse channels">
          <h1 className="text-xl font-bold text-cream">Browse channels</h1>
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
                <ChannelCard key={ch.id} channel={ch} active={current && current.id === ch.id} onSelect={selectChannel} />
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

      <CookieBanner />
    </div>
  )
}

function CookieBanner() {
  const [visible, setVisible] = useState(() => {
    try {
      return !localStorage.getItem('airwave-cookie-ok')
    } catch {
      return true
    }
  })

  if (!visible) return null

  const accept = () => {
    try {
      localStorage.setItem('airwave-cookie-ok', '1')
    } catch {}
    setVisible(false)
  }

  return (
    <div
      role="dialog"
      aria-label="Cookie notice"
      className="fixed bottom-0 inset-x-0 z-30 px-4 pb-4 sm:pb-6 flex justify-center pointer-events-none"
    >
      <div className="pointer-events-auto w-full max-w-xl rounded-xl bg-panel border border-panel2 px-4 py-3 flex items-center gap-4 shadow-lg">
        <p className="text-sm text-muted flex-1">
          Airwave uses minimal cookies to remember your preferences. No tracking, no ads.
        </p>
        <button
          onClick={accept}
          className="shrink-0 rounded-lg bg-accent text-ink text-sm font-semibold px-4 py-2 hover:brightness-110 transition"
        >
          Accept
        </button>
      </div>
    </div>
  )
}
