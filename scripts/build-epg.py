#!/usr/bin/env python3
"""Build Airwave's program guide: download provider EPG feeds, match our
channels by exact normalized display name (+ small alias map), extract
now/next programmes, bake public/epg.json + public/epg-meta.json.
Run manually (not on every build): python3 scripts/build-epg.py
"""
import json, re, os, glob, urllib.request
from xml.etree import ElementTree as ET
from datetime import datetime, timezone

FEEDS = [
    'https://i.mjh.nz/Plex/us.xml',
    'https://i.mjh.nz/PlutoTV/us.xml',
    'https://i.mjh.nz/SamsungTVPlus/us.xml',
    'https://i.mjh.nz/Plex/gb.xml',
    'https://i.mjh.nz/Plex/ca.xml',
]
WORK = '/tmp/airwave-epg'
AIRWAVE = '/home/hatch/workspace/airwave'
UA = {'User-Agent': 'airwave-epg-builder/1.0'}

# airwave channel name -> provider display-name (only where exact norm differs)
ALIASES = {
    'France 24 English': 'FRANCE 24',
    'Ninja Kidz TV': 'Ninja Kidz',
    'Mr Bean Animated': 'Mr. Bean Animated',
    'ToonGoggles': 'Toon Goggles',
}

def norm(s):
    s = s.lower()
    s = re.sub(r"['\u2019]", '', s)
    s = re.sub(r'[^a-z0-9]+', ' ', s)
    return re.sub(r'\s+', ' ', s).strip()

def parse_xmltv_time(s):
    # "20261007120000 +0000"
    from datetime import timedelta
    m = re.match(r'(\d{14})(?:\s*([+-]\d{4}))?', s.strip())
    if not m:
        return None
    dt = datetime.strptime(m.group(1), '%Y%m%d%H%M%S')
    tz = m.group(2)
    if tz:
        off = int(tz[1:3]) * 60 + int(tz[3:5])
        if tz[0] == '-':
            off = -off
        dt = dt - timedelta(minutes=off)
    return dt.replace(tzinfo=timezone.utc)

def main():
    os.makedirs(WORK, exist_ok=True)
    chs = json.load(open(f'{AIRWAVE}/public/channels.json'))
    chs = chs if isinstance(chs, list) else chs['channels']

    # 1. download feeds
    files = []
    for url in FEEDS:
        dest = os.path.join(WORK, url.split('/')[3] + '_' + os.path.basename(url))
        if not os.path.exists(dest) or os.path.getsize(dest) < 1000:
            print('downloading', url, flush=True)
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=180) as r, open(dest, 'wb') as f:
                f.write(r.read())
        files.append(dest)
        print('feed ok:', dest, os.path.getsize(dest))

    # 2. index provider channels: norm name -> (provider id, file)
    prov = {}
    for f in files:
        try:
            for ev, el in ET.iterparse(f, events=('end',)):
                if el.tag == 'channel':
                    cid = el.get('id')
                    dn = (el.findtext('display-name') or '').strip()
                    if cid and dn and norm(dn) not in prov:
                        prov[norm(dn)] = (cid, f)
                    el.clear()
        except ET.ParseError as e:
            print('parse warn', f, e)

    # 3. match our channels
    matched = {}
    for c in chs:
        target = ALIASES.get(c['name'], c['name'])
        hit = prov.get(norm(target))
        if hit:
            matched[c['id']] = (c['name'], hit[0], hit[1])
    print(f'{len(matched)}/{len(chs)} matched')

    # 4. extract now/next per matched provider channel
    now = datetime.now(timezone.utc)
    epg = {}
    # group by file for single pass
    by_file = {}
    for aid, (name, pcid, f) in matched.items():
        by_file.setdefault(f, {})[pcid] = aid
    for f, pcids in by_file.items():
        try:
            for ev, el in ET.iterparse(f, events=('end',)):
                if el.tag == 'programme':
                    cid = el.get('channel')
                    if cid in pcids:
                        aid = pcids[cid]
                        start = parse_xmltv_time(el.get('start', ''))
                        end = parse_xmltv_time(el.get('stop', el.get('end', '')))
                        title = (el.findtext('title') or '').strip()
                        if start and end and title:
                            epg.setdefault(aid, []).append({
                                'title': title, 'start': start.isoformat(), 'end': end.isoformat(),
                                '_s': start.timestamp(), '_e': end.timestamp(),
                            })
                    el.clear()
        except ET.ParseError as e:
            print('parse warn', f, e)

    out = {}
    for aid, progs in epg.items():
        t = now.timestamp()
        progs.sort(key=lambda p: p['_s'])
        cur = next((p for p in progs if p['_s'] <= t < p['_e']), None)
        nxt = next((p for p in progs if p['_s'] >= (cur['_e'] if cur else t)), None)
        if cur or nxt:
            out[str(aid)] = {
                'now': {k: cur[k] for k in ('title', 'start', 'end')} if cur else None,
                'next': {k: nxt[k] for k in ('title', 'start', 'end')} if nxt else None,
            }
    json.dump(out, open(f'{AIRWAVE}/public/epg.json', 'w'), indent=1)
    json.dump({
        'generated_at': now.isoformat(),
        'channels_with_data': len(out),
        'channels_total': len(chs),
        'source': 'i.mjh.nz (Matt Huisman community EPG)',
    }, open(f'{AIRWAVE}/public/epg-meta.json', 'w'), indent=1)
    print(f'baked epg.json: {len(out)} channels with now/next data')

if __name__ == '__main__':
    main()
