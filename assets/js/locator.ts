import type * as Leaflet from 'leaflet'

const namespace = 'http://www.w3.org/2000/svg'

/** the country around a boundary, small, with a dot amid the photos of the map */
const drawing = (geometry: GeoJSON.MultiPolygon, centre: Leaflet.LatLngTuple): SVGSVGElement => {
    // the same projection as the map, turned so that north points up in the drawing
    const project = ([lng, lat]: GeoJSON.Position): [number, number] => {
        const p = L.CRS.EPSG3857.project(L.latLng(lat as number, lng as number))
        return [p.x, -p.y]
    }
    // the outer ring of every part, geojson counting longitude first
    const rings = geometry.coordinates.map((part) => (part[0] as GeoJSON.Position[]).map(project))
    const box = L.geoJSON(geometry).getBounds()
    const [west, north] = project([box.getWest(), box.getNorth()])
    const [east, south] = project([box.getEast(), box.getSouth()])
    const r = Math.max(east - west, south - north) / 18
    const [cx, cy] = project([centre[1], centre[0]])
    // the drawing reaches as far as the country and the dot, which sticks out on a
    // boundary at the edge of the country
    const [left, top] = [Math.min(west, cx - r), Math.min(north, cy - r)]
    const [right, bottom] = [Math.max(east, cx + r), Math.max(south, cy + r)]
    const svg = document.createElementNS(namespace, 'svg')
    svg.setAttribute('viewBox', `${left} ${top} ${right - left} ${bottom - top}`)
    // the size in user units gives the drawing the proportions of the country,
    // which the stylesheet then scales down to the corner
    svg.setAttribute('width', String(right - left))
    svg.setAttribute('height', String(bottom - top))
    const path = document.createElementNS(namespace, 'path')
    path.setAttribute(
        'd',
        rings.map((ring) => `M${ring.map(([x, y]) => `${x},${y}`).join('L')}Z`).join('')
    )
    const dot = document.createElementNS(namespace, 'circle')
    dot.setAttribute('cx', String(cx))
    dot.setAttribute('cy', String(cy))
    dot.setAttribute('r', String(r))
    svg.append(path, dot)
    return svg
}

/**
 * Puts the country around a boundary in the corner of the boundary's map, in a
 * pane of its own between the mask and the pins.
 */
export const locator = (
    map: Leaflet.Map,
    country: {
        geometry: GeoJSON.MultiPolygon
        code: string
        name: string
        centre: Leaflet.LatLngTuple
    }
): void => {
    const pane = map.createPane('locator')
    pane.style.zIndex = '550'
    const figure = document.createElement('div')
    figure.className = 'locator'
    figure.ariaHidden = 'true'
    // the boundary as its source names it, in the language of the place, over the
    // ISO code of the country, which tells it apart where its shape does not
    const label = document.createElement('div')
    label.className = 'label'
    for (const text of [country.name, country.code]) {
        const line = document.createElement('span')
        line.textContent = text
        label.append(line)
    }
    figure.append(label, drawing(country.geometry, country.centre))
    pane.append(figure)
    // held against the panning of the map so it stays in the corner
    const hold = (): void => {
        L.DomUtil.setPosition(pane, map.containerPointToLayerPoint([0, 0]))
        pane.style.width = `${map.getContainer().clientWidth}px`
    }
    map.on('move resize', hold)
    hold()
}
