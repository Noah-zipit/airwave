# Adding or removing channels on Airwave

The whole channel list lives in one file: `public/channels.json`.
Edit it, commit, push — Vercel redeploys automatically.

## Add a channel

1. Find a **free-to-air / publicly available** stream URL (an `.m3u8` link).
   Never add premium or subscription channels (no Star Sports, Sky Sports,
   HBO, etc.). If a stream looks like a pirated premium feed, leave it out —
   that is what gets sites taken down.
2. Test the URL first — it must pass ALL three checks (HTTP 200, a playlist
   starting with `#EXTM3U`, AND a CORS-open response). The CORS check is the
   important one: without `Access-Control-Allow-Origin: *` the stream loads
   fine for curl and VLC but the browser refuses to play it.
   ```bash
   curl -sL --compressed -m 15 -A "Mozilla/5.0" -D - -o /tmp/t.m3u8 "PASTE_URL_HERE"
   head -c 7 /tmp/t.m3u8   # must print #EXTM3U
   # the dumped headers must contain: access-control-allow-origin: *
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
   - `country`: full country name (e.g. `Germany`), or empty string for international.
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
