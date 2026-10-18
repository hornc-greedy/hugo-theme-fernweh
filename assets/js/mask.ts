import type * as Leaflet from 'leaflet'

/** how far the mask covers the land around a country in the overview */
const maskOpacity = 0.7

/**
 * Paints everything outside a country over in the page colour and draws the
 * country's outline. Hands back what shows or hides the paint and the outline,
 * the outline with the paint unless told otherwise.
 */
export const mask = (
    map: Leaflet.Map,
    geometry: GeoJSON.MultiPolygon
): ((painted: boolean, outlined?: boolean) => void) => {
    // the mask is an even-odd polygon, the world with the country as its holes
    const world: Leaflet.LatLngTuple[] = [
        [-85, -180],
        [-85, 180],
        [85, 180],
        [85, -180]
    ]
    // every ring of every part, so a country inside another, such as Lesotho,
    // is painted over
    const holes = L.GeoJSON.coordsToLatLngs(geometry.coordinates, 2).flat()
    const cover = L.polygon([world, ...holes], {
        className: 'mask',
        fillOpacity: maskOpacity,
        stroke: false,
        interactive: false
    }).addTo(map)

    const outline = L.geoJSON(geometry, {
        style: {
            className: 'outline',
            fill: false
        }
    }).addTo(map)

    return (painted, outlined = painted) => {
        cover.setStyle({ fillOpacity: painted ? maskOpacity : 0 })
        outline.setStyle({ opacity: outlined ? 1 : 0 })
    }
}
