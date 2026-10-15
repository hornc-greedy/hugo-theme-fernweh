// Natural Earth's outlines, cut down to what the map needs. Kept apart from
// fetch.ts so it can be tested without reaching for the network.
/** longitude, latitude, and whatever else a position carries */
export type Position = number[]
/** a closed line of positions */
export type Ring = Position[]
/** one polygon: the outer ring first, holes after it */
export type Part = Ring[]
/** south, west, north, east, which is the order the templates compare in */
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

/** the points of a line that stray further than `tolerance` from it, Douglas-Peucker */
const thin = (line: Ring, tolerance: number): Ring => {
    const kept = new Set([0, line.length - 1])
    const spans: [number, number][] = [[0, line.length - 1]]
    for (let span = spans.pop(); span; span = spans.pop()) {
        const [a, b] = span
        const [x1, y1] = line[a] as [number, number]
        const [x2, y2] = line[b] as [number, number]
        const length = Math.hypot(x2 - x1, y2 - y1)
        let far = -1
        let distance = tolerance
        for (let i = a + 1; i < b; i++) {
            const [x, y] = line[i] as [number, number]
            const d = Math.abs((y2 - y1) * x - (x2 - x1) * y + x2 * y1 - y2 * x1) / length
            if (d > distance) {
                far = i
                distance = d
            }
        }
        if (far > 0) {
            kept.add(far)
            spans.push([a, far], [far, b])
        }
    }
    return line.filter((_, i) => kept.has(i))
}

/**
 * A ring with the points left out that stray less than `tolerance` degrees from
 * the line through their neighbours. A closed ring ends where it starts, so it
 * is split at the point furthest from its start and both halves are thinned.
 */
export const simplify = (ring: Ring, tolerance: number): Ring => {
    const [x0, y0] = ring[0] as [number, number]
    const away = (i: number): number => {
        const [x, y] = ring[i] as [number, number]
        return Math.hypot(x - x0, y - y0)
    }
    let far = 0
    for (let i = 1; i < ring.length; i++) {
        if (away(i) > away(far)) {
            far = i
        }
    }
    return [
        ...thin(ring.slice(0, far + 1), tolerance).slice(0, -1),
        ...thin(ring.slice(far), tolerance)
    ]
}

/** the box around a ring. GeoJSON counts longitude first, the templates latitude */
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

/** the parts of a polygon or a multipolygon, a polygon being one part */
export const polygons = (geometry: Feature['geometry']): Part[] =>
    geometry.type === 'Polygon' ? [geometry.coordinates as Part] : (geometry.coordinates as Part[])

/** the parts of a polygon or a multipolygon, shortened, with the box of each */
export const parts = (geometry: Feature['geometry']): { coordinates: Part[]; boxes: Box[] } => {
    const coordinates = polygons(geometry).map(shorten)
    return { coordinates, boxes: coordinates.map((part) => bbox(part[0] as Ring)) }
}

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
        // disputed areas. ISO_A2_EH carries the code for the ones that have one
        const iso = [feature.properties.ISO_A2_EH, feature.properties.ISO_A2].find(
            (code) => code && code !== '-99'
        )
        if (!iso) {
            return []
        }
        // a box per part, not only per country: the map only has to draw the parts
        // that hold a photo, and an island is ruled out by four comparisons
        const { coordinates, boxes } = parts(feature.geometry)
        return [
            {
                type: 'Feature',
                properties: { ISO_A2: iso, box: enclose(boxes), boxes },
                geometry: { type: 'MultiPolygon', coordinates }
            }
        ]
    })
})
