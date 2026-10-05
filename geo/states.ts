// The states and provinces of every country from Natural Earth, simplified to
// what the map of one of them can draw. Kept apart from fetch.ts so it can be
// tested without the network.
import {
    enclose,
    type Feature,
    type Outlines,
    type Part,
    parts,
    type Ring,
    simplify
} from './countries.ts'

/** about a kilometre, a pixel on the map of a state */
const tolerance = 0.01

/**
 * Natural Earth's states, each with the code of its country and a box per part
 * to compare a photo against. A ring that thins down to less than a triangle
 * is too small to draw and left out, and so is a state without a country.
 */
export const states = (source: { features: Feature[] }): Outlines => ({
    type: 'FeatureCollection',
    features: source.features.flatMap((feature) => {
        const country = String(feature.properties.iso_a2)
        const polygons =
            feature.geometry.type === 'Polygon'
                ? [feature.geometry.coordinates as Part]
                : (feature.geometry.coordinates as Part[])
        const coordinates = polygons.flatMap((part) => {
            const [outer, ...holes] = part.map((ring) => simplify(ring, tolerance))
            return (outer as Ring).length >= 4
                ? [[outer as Ring, ...holes.filter((hole) => hole.length >= 4)]]
                : []
        })
        if (country === '-1' || coordinates.length === 0) {
            return []
        }
        const outline = parts({ type: 'MultiPolygon', coordinates })
        return [
            {
                type: 'Feature',
                properties: {
                    name: feature.properties.name,
                    country,
                    box: enclose(outline.boxes),
                    boxes: outline.boxes
                },
                geometry: { type: 'MultiPolygon', coordinates: outline.coordinates }
            }
        ]
    })
})
