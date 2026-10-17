#!/usr/bin/env python3
"""
build_data.py  (Regions module, data v2.2.0)

Rebuilds regionsData.js's data from the @boolean.mv/geo-data npm package. Run it
when the registry is updated, or after editing the business rules in section 2
(which region an atoll belongs to, who the GM is, what counts as industrial) —
a one-off correction to a single island is faster done by hand in the JS.

Usage:
    npm pack @boolean.mv/geo-data@0.4.0 && mkdir pkg && tar xzf boolean.mv-geo-data-0.4.0.tgz -C pkg
    python3 -I build_data.py pkg/package data.json
Then fold data.json into ../data/regionsData.js, keeping that file's header:
    REGIONS <- data.json "regions",  UNITS <- data.json "units" (one unit per line).
It prints per-unit counts; the totals should still read W 54 / S 42 / D 55 / Y 36
plus 2 outside the regions.
Requires: python3, shapely (pip install shapely).
"""
import glob, json, sys
from shapely.geometry import MultiPoint

pkg, out_path = sys.argv[1], sys.argv[2]

# ---- 1. load every zone file (they are `export const MV_ZONE = {...};` JS modules) --------
Z = {}
for f in sorted(glob.glob(f'{pkg}/dist/maldives-zones/*.js')):
    s = open(f, encoding='utf-8').read()
    z = json.loads(s[s.index('{'):s.rindex('}') + 1])
    Z[z['code']] = z

# ---- 2. the business rules (edit here) ----------------------------------------------------
REGIONS = {
    'W': dict(name='North Regional Department', gm='Abdul Malik Thoufeeg', color='#3b82f6'),
    'S': dict(name='North Central Regional Department', gm='Ahmed Shafeeu', color='#10b9a0'),
    'D': dict(name='South Central Regional Department', gm='Mohamed Yasir', color='#f59e0b'),
    'Y': dict(name='South Regional Department', gm='Ahmed Sharneez', color='#a855f7'),
}
# unit id, display code, name, natural atoll / note, region (None = outside), capital, source zone codes
UNITS = [
    ('HA', 'HA', 'Haa Alif', 'Thiladhunmathi Uthuruburi', 'W', 'Dhidhdhoo', ['HA']),
    ('HDh', 'HDh', 'Haa Dhaalu', 'Thiladhunmathi Dhekunuburi', 'W', None, ['HDh']),
    ('KC', 'KC', 'Kulhudhuffushi City', 'Thiladhunmathi Dhekunuburi', 'W', 'Kulhudhuffushi', ['Kulhudhuffushi City']),
    ('Sh', 'Sh', 'Shaviyani', 'Miladhunmadulu Uthuruburi', 'W', 'Funadhoo', ['Sh']),
    ('N', 'N', 'Noonu', 'Miladhunmadulu Dhekunuburi', 'W', 'Manadhoo', ['N']),
    ('R', 'R', 'Raa', 'Maalhosmadulu Uthuruburi', 'S', 'Ungoofaaru', ['R']),
    ('B', 'B', 'Baa', 'Maalhosmadulu Dhekunuburi', 'S', 'Eydhafushi', ['B']),
    ('Lh', 'Lh', 'Lhaviyani', 'Faadhippolhu', 'S', 'Naifaru', ['Lh']),
    ('K', 'K', 'Kaafu', 'Malé Atholhu', 'S', 'Thulusdhoo', ['K']),
    ('VM', 'VM', 'Vilimalé', 'Malé City ward, Region S per circular', 'S', 'Vilimalé', []),
    ('AA', 'AA', 'Alif Alif', 'Ari Atholhu Uthuruburi', 'D', 'Rasdhoo', ['AA']),
    ('ADh', 'ADh', 'Alif Dhaalu', 'Ari Atholhu Dhekunuburi', 'D', 'Mahibadhoo', ['ADh']),
    ('V', 'V', 'Vaavu', 'Felidhe Atholhu', 'D', 'Felidhoo', ['V']),
    ('M', 'M', 'Meemu', 'Mulaku Atholhu', 'D', 'Muli', ['M']),
    ('F', 'F', 'Faafu', 'Nilandhe Atholhu Uthuruburi', 'D', 'Nilandhoo', ['F']),
    ('Dh', 'Dh', 'Dhaalu', 'Nilandhe Atholhu Dhekunuburi', 'D', 'Kudahuvadhoo', ['Dh']),
    ('Th', 'Th', 'Thaa', 'Kolhumadulu', 'D', 'Veymandoo', ['Th']),
    ('L', 'L', 'Laamu', 'Hadhdhunmathi', 'Y', 'Fonadhoo', ['L']),
    ('GA', 'GA', 'Gaafu Alif', 'Huvadhu Atholhu Uthuruburi', 'Y', 'Vilingili', ['GA']),
    ('GDh', 'GDh', 'Gaafu Dhaalu', 'Huvadhu Atholhu Dhekunuburi', 'Y', 'Thinadhoo', ['GDh']),
    ('Gn', 'Gn', 'Fuvahmulah City', 'Gnaviyani', 'Y', 'Fuvahmulah', []),
    ('S', 'S', 'Addu City', 'Seenu · Addu Atholhu', 'Y', 'Hithadhoo', ['S', 'Addu City']),
    ('MC', 'MC', 'Outside the regional departments', 'Malé, Hulhumalé, Hulhulé', None, 'Malé', []),
]

# Registry has no coordinates for these, so they are placed by hand. t: inh / ind
HULHULE_DV = next(l.get('nameDv', '') for l in Z['K']['locations'] if l['name'] == "Hulhule'")
MANUAL = {
    'VM': [dict(n='Vilimalé', dv='ވިލިމާލެ', lat=4.1726, lon=73.4853, t='inh')],
    'Gn': [dict(n='Fuvahmulah', dv='ފުވައްމުލައް', lat=-0.2986, lon=73.4237, t='inh')],
    'MC': [
        dict(n='Malé', dv='މާލެ', lat=4.1755, lon=73.5093, t='inh', owner='Malé Power Generation Department'),
        dict(n='Hulhumalé', dv='ހުޅުމާލެ', lat=4.2167, lon=73.5417, t='inh', owner='Hulhumalé Power Generation Department'),
        # same registry point as before, moved out of Kaafu: Velana airport is run internally by MACL
        dict(n='Hulhulé', dv=HULHULE_DV, lat=4.1952, lon=73.5318, t='ind',
             owner='MACL (Maldives Airports Company Ltd.), managed internally, not STELCO'),
    ],
}
# Registry rows left out: Hulhule' (moved to MC above) and rows whose coordinates point at a
# same-named island in a different atoll.
SKIP = {('K', "Hulhule'"), ('L', 'Kudahuraa'), ('S', "Thun'bafushi"), ('Th', 'Madhiriguraidhoo'),
        ('HDh', 'Kandinmaahuraa'), ('HDh', 'Kudafaru'), ('F', 'Rangaleefinolhu')}
RECLASS = {('K', 'Thilafushi'): 'ind'}   # industrial island that the registry lists as uninhabited
# Only inhabited + industrial/airport islands are kept in the output. Resorts and uninhabited are dropped.
KEEP = {'inhabited': 'inh', 'industrial': 'ind'}

# ---- 3. build ----------------------------------------------------------------------------
units = []
for uid, code, name, geo, reg, cap, zones in UNITS:
    isl, pts = [], []
    for zk in zones:
        for l in Z[zk]['locations']:
            c = l.get('coordinates')
            if not c or (zk, l['name']) in SKIP:
                continue
            pts.append((c['longitude'], c['latitude']))      # every located island (incl. resorts) shapes the atoll outline
            t = RECLASS.get((zk, l['name'])) or KEEP.get(l['status'])
            if t is None:
                continue                                      # ...but only inhabited/industrial ones are kept as markers
            isl.append(dict(n=l['aliases'][0] if l['aliases'] else l['name'], dv=l.get('nameDv', ''),
                            lat=round(c['latitude'], 5), lon=round(c['longitude'], 5), t=t))
    isl += MANUAL.get(uid, [])
    pts += [(i['lon'], i['lat']) for i in MANUAL.get(uid, [])]
    seen, uniq = set(), []
    for i in isl:                      # Addu: zones S and Addu City overlap
        if i['n'] not in seen:
            seen.add(i['n']); uniq.append(i)
    isl = sorted(uniq, key=lambda i: (i['t'] != 'inh', i['n'] != cap, i['n']))
    hull = None
    if uid not in ('KC', 'VM', 'MC') and pts:
        mp = MultiPoint(pts)
        g = mp.convex_hull   # simple convex outline around the islands (coverage area, not a legal boundary)
        g = g.buffer(0.03 if len(pts) > 1 else 0.045, quad_segs=6).simplify(0.004)
        hull = [[round(y, 4), round(x, 4)] for x, y in g.exterior.coords]
        cen = g.centroid if g.centroid.within(g) else g.representative_point()
        center = [round(cen.y, 4), round(cen.x, 4)]
    else:
        center = [round(sum(p[1] for p in pts) / len(pts), 4), round(sum(p[0] for p in pts) / len(pts), 4)]
    units.append(dict(id=uid, code=code, name=name, geo=geo, reg=reg, cap=cap, hull=hull, center=center, isl=isl))

json.dump(dict(regions=REGIONS, units=units), open(out_path, 'w', encoding='utf-8'),
          ensure_ascii=False, separators=(',', ':'))
for u in units:
    print(f"{(u['reg'] or '-'):2} {u['id']:4} inhabited={sum(i['t']=='inh' for i in u['isl']):2} "
          f"industrial={sum(i['t']=='ind' for i in u['isl'])}")
print('inhabited total', sum(i['t'] == 'inh' for u in units for i in u['isl']))
