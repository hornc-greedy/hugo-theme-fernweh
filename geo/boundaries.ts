// Administrative boundaries from OpenStreetMap, cut down the same way as the
// countries. Kept apart from boundary.ts so it can be tested without the network.
import { type Box, enclose, type Feature, type Outlines, type Part, parts } from './countries.ts'

/** one boundary in the file the map reads */
export interface Boundary {
    type: 'Feature'
    properties: {
        name: string
        /** the full name Nominatim gives the place it found */
        display_name: string
        osm: string
        box: Box
        boxes: Box[]
    }
    geometry: { type: 'MultiPolygon'; coordinates: Part[] }
}

/**
 * The first answer of a Nominatim search that is an administrative boundary
 * with an area, named the way it was asked for.
 */
export const pick = (answers: Feature[], name: string): Boundary | undefined => {
    const found = answers.find(
        (a) =>
            a.properties.category === 'boundary' &&
            a.properties.type === 'administrative' &&
            (a.geometry.type === 'Polygon' || a.geometry.type === 'MultiPolygon')
    )
    if (!found) {
        return undefined
    }
    const { coordinates, boxes } = parts(found.geometry)
    return {
        type: 'Feature',
        properties: {
            name,
            display_name: String(found.properties.display_name),
            osm: `${found.properties.osm_type}/${found.properties.osm_id}`,
            box: enclose(boxes),
            boxes
        },
        geometry: { type: 'MultiPolygon', coordinates }
    }
}

/** the file with this boundary in it, in place of one of the same name */
export const include = (file: Outlines, boundary: Boundary): Outlines => ({
    type: 'FeatureCollection',
    features: [
        ...file.features.filter(
            (f) => (f as Boundary).properties.name !== boundary.properties.name
        ),
        boundary
    ].sort((a, b) => (a as Boundary).properties.name.localeCompare((b as Boundary).properties.name))
})

/** whether a point lies within one of the parts of a boundary, outside its holes */
export const contains = (boundary: Boundary, lat: number, lon: number): boolean =>
    boundary.geometry.coordinates.some((part, i) => {
        const [south, west, north, east] = boundary.properties.boxes[i] as Box
        if (lat < south || lat > north || lon < west || lon > east) {
            return false
        }
        // ray casting over the outer ring and its holes, an odd number of crossings to the east means inside
        let inside = false
        for (const ring of part) {
            for (let j = 0, k = ring.length - 1; j < ring.length; k = j++) {
                const [xj, yj] = ring[j] as [number, number]
                const [xk, yk] = ring[k] as [number, number]
                if (yj > lat !== yk > lat && lon < ((xk - xj) * (lat - yj)) / (yk - yj) + xj) {
                    inside = !inside
                }
            }
        }
        return inside
    })
