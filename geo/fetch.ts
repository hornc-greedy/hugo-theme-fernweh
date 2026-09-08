// Fetches the country outlines the map is drawn from. Without arguments it
// refreshes the theme's own file at 1:50 million; with a scale and a target it
// writes a finer one into a project of your own, where it wins over the theme's:
//   node themes/fernweh/geo/fetch.ts
//   node themes/fernweh/geo/fetch.ts 10 assets/geo/countries.json
import { stat, writeFile } from 'node:fs/promises'
import { convert, type Feature } from './countries.ts'

const scale = process.argv[2] ?? '50'
const target: string | URL =
    process.argv[3] ?? new URL('../assets/geo/countries.json', import.meta.url)
const address = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson'

console.log(`fetching Natural Earth at 1:${scale} million …`)
const response = await fetch(`${address}/ne_${scale}m_admin_0_countries.geojson`)
const source = (await response.json()) as { features: Feature[] }
const out = convert(source)
await writeFile(target, JSON.stringify(out))
const { size } = await stat(target)
console.log(`${out.features.length} countries, ${(size / 1e6).toFixed(1)} MB`)
