// Natural Earth's outlines, cut down to what the map needs. Kept apart from
// fetch.ts so it can be tested without reaching for the network.
/** longitude, latitude, and whatever else a position carries */
export type Position = number[]
/** a closed line of positions */
export type Ring = Position[]
/** one polygon: the outer ring first, holes after it */
export type Part = Ring[]
/** south, west, north, east — the order the templates compare in */
export type Box = [number, number, number, number]

/** one country as Natural Earth hands it over */
export interface Feature {
    type: string
    properties: Record<string, unknown>
    geometry: { type: string; coordinates: Part[] | Part }
}

/** four decimals are about ten metres, which is finer than the map can draw */
export const shorten = (part: Part): Part =>
    part.map((ring) => ring.map((point) => point.map((n) => Number(n.toFixed(4)))))

/** the box around a ring; geojson counts longitude first, the templates latitude */
export const bbox = (ring: Ring): Box => {
    let south = Number.POSITIVE_INFINITY
    let west = Number.POSITIVE_INFINITY
    let north = Number.NEGATIVE_INFINITY
    let east = Number.NEGATIVE_INFINITY
    for (const point of ring) {
        const [x, y] = point as [number, number]
        south = Math.min(south, y)
        west = Math.min(west, x)
        north = Math.max(north, y)
        east = Math.max(east, x)
    }
    return [south, west, north, east]
}

/** the box that holds all of them */
export const enclose = (boxes: Box[]): Box =>
    boxes.reduce<Box>(
        (all, b) => [
            Math.min(all[0], b[0]),
            Math.min(all[1], b[1]),
            Math.max(all[2], b[2]),
            Math.max(all[3], b[3])
        ],
        [
            Number.POSITIVE_INFINITY,
            Number.POSITIVE_INFINITY,
            Number.NEGATIVE_INFINITY,
            Number.NEGATIVE_INFINITY
        ]
    )

/** the file the map reads: one feature per country */
export interface Outlines {
    type: 'FeatureCollection'
    features: object[]
}

/**
 * Natural Earth's features, reduced to what the map needs: the country code,
 * the outline, and a box per part to compare a photo against.
 */
export const convert = (source: { features: Feature[] }): Outlines => ({
    type: 'FeatureCollection',
    features: source.features.flatMap((feature) => {
        // Natural Earth leaves ISO_A2 at -99 for France, Norway and a handful of
        // disputed areas; ISO_A2_EH carries the code for the ones that have one
        const iso = [feature.properties.ISO_A2_EH, feature.properties.ISO_A2].find(
            (code) => code && code !== '-99'
        )
        if (!iso) {
            return []
        }
        const coordinates: Part[] =
            feature.geometry.type === 'Polygon'
                ? [shorten(feature.geometry.coordinates as Part)]
                : (feature.geometry.coordinates as Part[]).map(shorten)
        // a box per part, not only per country: the map only has to draw the parts
        // that hold a photo, and an island is ruled out by four comparisons
        const boxes = coordinates.map((part) => bbox(part[0] as Ring))
        return [
            {
                type: 'Feature',
                properties: { ISO_A2: iso, box: enclose(boxes), boxes },
                geometry: { type: 'MultiPolygon', coordinates }
            }
        ]
    })
})
