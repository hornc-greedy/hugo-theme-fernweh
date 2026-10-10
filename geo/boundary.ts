// Fetches an administrative boundary from OpenStreetMap and adds it to the file
// the map reads, in a project of your own. Once per boundary, the build needs no
// network:
//   node themes/fernweh/geo/boundary.ts Wien assets/geo/boundaries.json
// Nominatim asks for one request a second and a name to reach you by.
import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { setTimeout } from 'node:timers/promises'
import { include, pick } from './boundaries.ts'
import type { Feature, Outlines } from './countries.ts'

const [name, target] = process.argv.slice(2)
if (!name || !target) {
    throw new Error('usage: node themes/fernweh/geo/boundary.ts <name> <file>')
}

const nominatim = async (endpoint: string, query: Record<string, string>): Promise<Feature[]> => {
    const parameters = new URLSearchParams({ format: 'geojson', polygon_geojson: '1', ...query })
    const response = await fetch(`https://nominatim.openstreetmap.org/${endpoint}?${parameters}`, {
        headers: {
            'User-Agent': 'hugo-theme-fernweh (github.com/hornc-greedy/hugo-theme-fernweh)'
        }
    })
    return ((await response.json()) as { features: Feature[] }).features
}

// a coarse outline is enough to tell which place it is and how large
const found = pick(
    await nominatim('search', { q: name, polygon_threshold: '0.01', limit: '5' }),
    name
)
if (!found) {
    throw new Error(`OpenStreetMap knows no boundary for ${name}`)
}
// the outline itself to a thousandth of its extent, half a pixel on a map 500
// pixels wide, which keeps a state as light as a city
const [south, west, north, east] = found.properties.box
const extent = Math.max(
    north - south,
    (east - west) * Math.cos((((north + south) / 2) * Math.PI) / 180)
)
const osm = found.properties.osm
await setTimeout(1000)
const boundary = pick(
    await nominatim('lookup', {
        osm_ids: osm.charAt(0).toUpperCase() + osm.slice(osm.indexOf('/') + 1),
        polygon_threshold: String(extent / 1000)
    }),
    name
)
if (!boundary) {
    throw new Error(`OpenStreetMap gives no outline for ${osm}`)
}
// the first boundary starts the file
const file: Outlines = existsSync(target)
    ? JSON.parse(await readFile(target, 'utf8'))
    : { type: 'FeatureCollection', features: [] }
await writeFile(target, JSON.stringify(include(file, boundary)))
// the full name shows a search that landed on another place, a village for a region
console.log(
    `${name}: ${boundary.properties.display_name} (${osm}), ` +
        `${boundary.geometry.coordinates.flat(2).length} points`
)
