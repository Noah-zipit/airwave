# AIRWAVE

Curated live-TV streaming in the browser. Open the site, pick a channel by category, one click plays live.

**Live:** https://watchairwave.vercel.app

## Features

- 54 channels across 7 categories: News, Sports, Entertainment, Kids, Music, Documentary, Anime
- hls.js playback with retry logic, LIVE/REPLAY badges, and a now/next program guide
- Password-protected `/admin` panel: add/edit/enable/disable channels plus browser-based stream-health checks (persisted with Vercel Blob)

## Stack

React 19, Vite, Tailwind CSS 4, hls.js, Vercel Blob. Hosted on Vercel.

## Run locally

```bash
npm install
npm run dev
```

## Stream requirements

A stream only plays in the browser when all of these hold:

1. Served over HTTPS (no mixed content)
2. Responds with HTTP 200
3. Body starts with `#EXTM3U` (a real HLS playlist)
4. Response includes `Access-Control-Allow-Origin: *`

`scripts/check-streams.sh` probes every channel against these rules.

## Legal

Free-to-air / public streams only. No premium channels.
