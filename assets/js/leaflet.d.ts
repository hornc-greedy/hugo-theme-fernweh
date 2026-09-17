// Leaflet is vendored and loaded as a plain script, so it lives on the global
// object rather than being imported. The types come from @types/leaflet, which
// a project that type-checks this theme brings along.
import type * as Leaflet from 'leaflet'

declare global {
    const L: typeof Leaflet
}

// the map measures itself against its country again when the window changes; the
// method is added where the map is built
declare module 'leaflet' {
    interface Map {
        remeasure(bounds: LatLngBounds): void
        // null lifts the restriction again, which @types/leaflet leaves out
        setMaxBounds(bounds: LatLngBoundsExpression | null): this
    }
}
