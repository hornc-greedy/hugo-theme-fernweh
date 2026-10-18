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
    // the outer ring of every part becomes a hole, turned from the longitude
    // first of geojson to the latitude first of Leaflet
    const holes: Leaflet.LatLngTuple[][] = geometry.coordinates.map((part) =>
        (part[0] as GeoJSON.Position[]).map(([x, y]) => [y, x] as Leaflet.LatLngTuple)
    )
    const cover = L.polygon([world, ...holes], {
        fillColor: getComputedStyle(document.body).backgroundColor,
        fillOpacity: maskOpacity,
        stroke: false,
        interactive: false
    }).addTo(map)

    document.addEventListener('themechange', () => {
        cover.setStyle({ fillColor: getComputedStyle(document.body).backgroundColor })
    })

    const outline = L.geoJSON(geometry, {
        style: {
            color: getComputedStyle(document.documentElement).getPropertyValue('--outline'),
            weight: 1.5,
            fill: false
        }
    }).addTo(map)

    return (painted, outlined = painted) => {
        cover.setStyle({ fillOpacity: painted ? maskOpacity : 0 })
        outline.setStyle({ opacity: outlined ? 1 : 0 })
    }
}
