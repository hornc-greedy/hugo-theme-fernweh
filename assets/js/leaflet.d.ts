// Leaflet is vendored and loaded as a plain script, so it lives on the global
// object rather than being imported. The types come from @types/leaflet, which
// a project that type-checks this theme brings along.
import type * as Leaflet from 'leaflet'

declare global {
    const L: typeof Leaflet
}
