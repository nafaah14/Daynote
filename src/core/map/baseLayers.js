/**
 * The basemap catalogue — one list, shared by every module that draws a
 * Leaflet map.
 *
 * It started inside MV Network's renderer. Regions needs the same tiles (the
 * terrain layer is what makes an atoll readable when zoomed out, and the
 * satellite layer is what makes an island readable when zoomed in), and the
 * Jawg access token must not be pasted into a second file — change it once,
 * every map follows. Modules import from core, core imports nothing from
 * modules, so this is the right place for it.
 *
 * Keys are stored in device-local view prefs, so renaming one silently
 * resets that pref to the default. Add; don't rename.
 */
import L from 'leaflet';

const JAWG_TOKEN = 'fatQ0vSHHxR9bLXTZTY8ObuyLa719Y8OeHuHDdY1yUA0HEKqXBxdT4jcH1ZOlLZv';

export const BASE_LAYERS = {
  jawgterrain: {
    name: 'Jawg Terrain', short: 'Terrain',
    url: `https://tile.jawg.io/jawg-terrain/{z}/{x}/{y}{r}.png?access-token=${JAWG_TOKEN}`,
    opts: { maxZoom: 22, attribution: '© <b>Jawg</b>Maps | © OpenStreetMap', subdomains: 'abcd' },
  },
  jawglight: {
    name: 'Jawg Light', short: 'Light',
    url: `https://tile.jawg.io/jawg-light/{z}/{x}/{y}{r}.png?access-token=${JAWG_TOKEN}`,
    opts: { maxZoom: 22, attribution: '© <b>Jawg</b>Maps | © OpenStreetMap', subdomains: 'abcd' },
  },
  satellite: {
    name: 'Satellite', short: 'Satellite',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    opts: { maxZoom: 19, maxNativeZoom: 17, attribution: 'Imagery © Esri, Maxar, Earthstar Geographics' },
  },
  humanitarian: {
    name: 'Humanitarian', short: 'HOT',
    url: 'https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png',
    opts: { maxZoom: 19, attribution: '© OSM HOT' },
  },
};

export const BASE_LAYER_IDS = Object.keys(BASE_LAYERS);

export const DEFAULT_BASE_LAYER = 'jawgterrain';

const layerOf = (key) => BASE_LAYERS[key] || BASE_LAYERS[DEFAULT_BASE_LAYER];

export const baseLayerName = (key) => layerOf(key).name;

/** The same layer named for a cramped control (a toolbar segment, not a list row). */
export const baseLayerShortName = (key) => layerOf(key).short;

/** Photographic tiles — overlays have to back off their fill over imagery. */
export const isImagery = (key) => key === 'satellite';

/**
 * Swap the basemap on `map`, returning the tile layer now in place.
 * Pass the layer it replaces (or null on first call); an unknown key falls
 * back to the default rather than leaving the map blank.
 */
export function setBaseLayer(map, key, current) {
  if (current) map.removeLayer(current);
  const b = BASE_LAYERS[key] || BASE_LAYERS[DEFAULT_BASE_LAYER];
  const layer = L.tileLayer(b.url, b.opts).addTo(map);
  layer.setZIndex(0);
  return layer;
}
