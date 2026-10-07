# Adding or removing channels on Airwave

The whole channel list lives in one file: `public/channels.json`.
Edit it, commit, push — Vercel redeploys automatically.

## Add a channel

1. Find a **free-to-air / publicly available** stream URL (an `.m3u8` link).
   Never add premium or subscription channels (no Star Sports, Sky Sports,
   HBO, etc.). If a stream looks like a pirated premium feed, leave it out —
   that is what gets sites taken down.
2. Test the URL first — it must return HTTP 200 and a playlist starting
   with `#EXTM3U`:
   ```bash
   curl -sL -m 15 -A "Mozilla/5.0" "PASTE_URL_HERE" | head -c 100
   ```
3. Find a logo image URL for the channel (a direct `.png`/`.jpg` link works).
4. Add one entry to `public/channels.json`:
   ```json
   {
     "id": 35,
     "name": "Channel Name",
     "logo": "https://example.com/logo.png",
     "stream": "https://example.com/stream.m3u8",
     "category": "Sports",
     "country": "PK"
   }
   ```
   - `id`: next free number (must be unique).
   - `category`: one of `News`, `Sports`, `Entertainment`, `Kids`, `Music`, `Documentary`.
   - `country`: 2-letter code, or `INT` for international.
5. Commit and push:
   ```bash
   git add public/channels.json
   git commit -m "Add <Channel Name>"
   git push
   ```

## Remove a channel

Delete its entry from `public/channels.json`, commit, push.

## If a channel goes dead

The player shows a friendly "stream is down" message, so one dead channel
never breaks the site. Remove the entry or replace the `stream` URL with a
working one.
