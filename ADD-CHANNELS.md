# Adding or removing channels on Airwave

Two ways to manage channels:

**A. Admin panel (recommended):** open `/admin` on the live site, sign in with
the admin password, and use the web UI — add / edit / delete / enable-disable,
plus a one-click "Check all streams" health probe that runs in your browser.

**B. By hand:** the baked channel list lives in `public/channels.json`.
Edit it, commit, push — Vercel redeploys automatically. (Note: once the admin
panel has saved changes to Vercel Blob, the Blob copy takes precedence over
this file. To go back to the file, delete the `channels.json` blob.)

## Admin panel setup (one-time)

In the Vercel dashboard → project → Settings → Environment Variables, add:

| Variable | Value |
|---|---|
| `ADMIN_PASSWORD` | a strong password (this gates `/admin` and `/api/admin/*`) |
| `BLOB_READ_WRITE_TOKEN` | token from a Vercel Blob store (Storage tab → create store → copy token) |

Then redeploy. Without `BLOB_READ_WRITE_TOKEN`, the panel shows a warning and
changes cannot be saved; the site keeps serving the baked `channels.json`.

## Program guide (EPG)

`public/epg.json` holds baked now/next data (built by `scripts/build-epg.py`,
source: i.mjh.nz community EPG). Refresh it manually when it goes stale:

```bash
python3 scripts/build-epg.py   # downloads feeds, matches channels, bakes epg.json
git add public/epg.json public/epg-meta.json
git commit -m "Refresh EPG"
git push
```

The `/admin` header shows when the guide was last refreshed and its coverage.

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

## Stream requirements

A stream only plays in the browser when **all** of these hold:

1. Served over **HTTPS** (no mixed content)
2. Responds with **HTTP 200**
3. Body starts with `#EXTM3U` (a real HLS playlist)
4. Response includes `Access-Control-Allow-Origin: *`

Run `scripts/check-streams.sh` to probe every channel against these rules before adding it.
