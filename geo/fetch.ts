// Fetches the outlines the map is drawn from. Without arguments it refreshes the
// theme's own countries at 1:50 million. With a scale and a target it writes finer
// ones into a project of your own, where they win over the theme's. `states`
// writes the states and provinces of every country, which the theme leaves to a
// project, since they come to about 8 MB:
//   node themes/fernweh/geo/fetch.ts
//   node themes/fernweh/geo/fetch.ts 10 assets/geo/countries.json
//   node themes/fernweh/geo/fetch.ts states assets/geo/states.json
import { stat, writeFile } from 'node:fs/promises'
import { convert, type Feature } from './countries.ts'
import { states } from './states.ts'

const kind = process.argv[2] ?? '50'
const { what, file, cut } =
    kind === 'states'
        ? { what: 'states', file: 'ne_10m_admin_1_states_provinces', cut: states }
        : { what: 'countries', file: `ne_${kind}m_admin_0_countries`, cut: convert }
const target: string | URL =
    process.argv[3] ?? new URL(`../assets/geo/${what}.json`, import.meta.url)
const address = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson'

console.log(`fetching Natural Earth's ${file} …`)
const response = await fetch(`${address}/${file}.geojson`)
const source = (await response.json()) as { features: Feature[] }
const out = cut(source)
await writeFile(target, JSON.stringify(out))
const { size } = await stat(target)
console.log(`${out.features.length} ${what}, ${(size / 1e6).toFixed(1)} MB`)
