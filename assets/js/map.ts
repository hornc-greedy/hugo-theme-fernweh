import type * as Leaflet from 'leaflet'
import { pinSize } from './arc.ts'
import { lightbox } from './lightbox.ts'

// What the geojson template hands over
interface Photo {
    lat: number
    long: number
    url: string
    w: number
    h: number
    thumb: string
    thumbwidth: number
    large: string
    time: string
    caption: string
    /** the tile in the album this pin leads to, -1 for the opener */
    index: number
}

interface Day {
    title: string
    url: string
    photos: Photo[]
}

interface Country {
    geometry: GeoJSON.MultiPolygon
}

interface MapData {
    maps: Country[]
    days: Day[]
}

interface Shape {
    country: Country
    bounds: Leaflet.LatLngBounds
    ratio: number
    box: HTMLElement
    map: Leaflet.Map
}

interface Pin {
    marker: Leaflet.Marker
    photo: Photo
    day: Day
}

const grid = document.getElementById('maps')

if (grid) {
    const maxzoom = Number(grid.dataset.maxzoom)
    const smallestPin = Number(grid.dataset.pin)
    const largestPin = Number(grid.dataset.pinmax)

    void fetch(grid.dataset.source ?? '')
        .then((r) => r.json() as Promise<MapData>)
        .then((data) => {
            // every located photograph of the journey, in the order the days run.
            // A pin opens the view here instead of leading to the album, so the
            // tap that opens it is the gesture a browser wants before it gives
            // up its own bars
            const at = new Map<Photo, number>()
            const shots = data.days.flatMap((day) =>
                day.photos.map((photo) => {
                    at.set(photo, at.size)
                    return {
                        href: photo.url,
                        width: photo.w,
                        height: photo.h,
                        caption: photo.caption,
                        thumb: photo.thumb
                    }
                })
            )
            const view = lightbox(shots, grid.dataset)

            // the map that is currently zoomed in, and therefore the one the arrow
            // keys belong to; null again as soon as it is back in the overview
            let active: Leaflet.Map | null = null

            // measured once and without the padding clientWidth counts in, otherwise
            // the second map is built against a width the first one changed
            const space = (): number => {
                const style = getComputedStyle(grid)
                return (
                    grid.clientWidth -
                    parseFloat(style.paddingLeft) -
                    parseFloat(style.paddingRight)
                )
            }

            let available = space()

            const measure = (ratio: number, box: HTMLElement): void => {
                // every map takes the full width it is given, the height follows from
                // the country. Only the extreme shapes are capped, and relative to that
                // width rather than to the window: a viewport-bound cap makes a tall
                // country narrower than a round one standing right beside it.
                const h = Math.min(available / ratio, available * 2)
                box.style.height = `${Math.round(h)}px`
                box.style.width = `${Math.round(h * ratio)}px`
            }

            function build(
                id: string,
                country: Country,
                allDays: Day[],
                bounds: Leaflet.LatLngBounds
            ): Leaflet.Map {
                // a view has to exist before layers are added, otherwise the renderer
                // has no bounds yet when fitBounds pulls them in
                const map = L.map(id, {
                    zoomControl: false,
                    dragging: false,
                    keyboard: false,
                    boxZoom: false,
                    // without this Leaflet snaps fitBounds down to a whole zoom level and
                    // a country can end up at half the width of the box built for it
                    zoomSnap: 0,
                    zoomDelta: 1,
                    maxBoundsViscosity: 1,
                    maxZoom: maxzoom
                }).setView(bounds.getCenter(), 6)

                // the tile policy asks for the credit on the map itself, not only in
                // the footer; Leaflet's own name is not part of that
                map.attributionControl.setPrefix('')
                L.tileLayer(grid?.dataset.tiles ?? '', {
                    maxZoom: maxzoom,
                    attribution: grid?.dataset.attribution
                }).addTo(map)
                if (grid?.dataset.overlay) {
                    L.tileLayer(grid?.dataset.overlay, { maxZoom: maxzoom }).addTo(map)
                }

                // everything outside the country is painted over in the page colour;
                // an even-odd polygon with the country as its holes is the mask
                const world: Leaflet.LatLngTuple[] = [
                    [-85, -180],
                    [-85, 180],
                    [85, 180],
                    [85, -180]
                ]
                // geojson counts longitude first, Leaflet latitude; a ring without
                // points cannot become a hole and is left out
                const holes: Leaflet.LatLngTuple[][] = country.geometry.coordinates.flatMap(
                    (part) => {
                        const ring = part[0]
                        return ring ? [ring.map(([x, y]) => [y, x] as Leaflet.LatLngTuple)] : []
                    }
                )
                const mask = L.polygon([world, ...holes], {
                    fillColor: getComputedStyle(document.body).backgroundColor,
                    fillOpacity: 1,
                    stroke: false,
                    interactive: false
                }).addTo(map)

                document.addEventListener('themechange', () => {
                    mask.setStyle({ fillColor: getComputedStyle(document.body).backgroundColor })
                })

                L.geoJSON(country.geometry, {
                    style: { color: '#8fa6c0', weight: 1.5, fill: false }
                }).addTo(map)

                const overview = { center: bounds.getCenter(), zoom: 0 }

                /** the three elements of a pin, once Leaflet has put it on the map */
                const parts = (pin: Pin) => {
                    const box = pin.marker.getElement()
                    const link = box?.querySelector('a')
                    const image = box?.querySelector('img')
                    return box && link && image ? { box, link, image } : undefined
                }

                const pins: Pin[] = []

                const back = (): void => {
                    if (map.getZoom() === overview.zoom) {
                        return
                    }
                    map.flyTo(overview.center, overview.zoom, { duration: 0.7 })
                }

                const size = (): number =>
                    pinSize({
                        width: map.getContainer().clientWidth,
                        smallest: smallestPin,
                        largest: largestPin,
                        overview: overview.zoom,
                        maxZoom: map.getMaxZoom(),
                        zoom: map.getZoom()
                    })

                const place = (pin: Pin): void => {
                    const p = parts(pin)
                    if (!p) {
                        return
                    }
                    const g = Math.round(size())
                    // switch sources when the small one would have to be stretched
                    const source = g > pin.photo.thumbwidth ? pin.photo.large : pin.photo.thumb
                    if (p.image.getAttribute('src') !== source) {
                        p.image.src = source
                    }
                    // the one number the stylesheet measures the pin against
                    p.box.style.setProperty('--pin', `${g}px`)
                    if (map.getZoom() > overview.zoom) {
                        // the opener has no tile of its own, its pin leads to the day
                        p.link.href =
                            pin.photo.index < 0
                                ? pin.day.url
                                : `${pin.day.url}#photo-${pin.photo.index}`
                        p.link.dataset.shot = String(at.get(pin.photo))
                    } else {
                        p.link.removeAttribute('href')
                        delete p.link.dataset.shot
                    }
                }

                for (const day of allDays) {
                    for (const photo of day.photos) {
                        if (!bounds.contains([photo.lat, photo.long])) {
                            continue
                        }
                        // out of the tab order: the album below lists every photo
                        // already, and the pins would double the stations
                        const marker = L.marker([photo.lat, photo.long], {
                            keyboard: false,
                            title: `${day.title}, ${photo.caption || photo.time}`,
                            // built once, because a rebuilt icon cannot be animated
                            icon: L.divIcon({
                                html: '<a><img alt=""></a>',
                                className: 'photo-pin'
                            })
                        }).addTo(map)
                        pins.push({ marker, photo, day })
                        marker.on('click', (e) => {
                            // a marker click reaches the map afterwards, which would fly straight back out
                            L.DomEvent.stopPropagation(e)
                            if (map.getZoom() > overview.zoom) {
                                return
                            }
                            map.flyTo([photo.lat, photo.long], overview.zoom + 3, { duration: 0.7 })
                        })
                    }
                }

                // dragging comes with the zoom; the keyboard has these steps instead
                const panControl = new L.Control({ position: 'bottomright' })
                panControl.onAdd = () => {
                    const box = L.DomUtil.create('div', 'pan')
                    const arrows: Record<string, string> = {
                        up: '↑',
                        left: '←',
                        down: '↓',
                        right: '→'
                    }
                    box.innerHTML = Object.keys(arrows)
                        .map(
                            (dir) =>
                                '<button data-dir="' +
                                dir +
                                '" aria-label="' +
                                (grid?.dataset[`pan${dir}`] ?? '') +
                                '">' +
                                arrows[dir] +
                                '</button>'
                        )
                        .join('')
                    L.DomEvent.disableClickPropagation(box)
                    box.addEventListener('click', (e) => {
                        const button = (e.target as Element).closest('button')
                        if (!button) {
                            return
                        }
                        const s = Math.round(map.getContainer().clientWidth / 4)
                        const steps: Record<string, Leaflet.PointTuple> = {
                            up: [0, -s],
                            down: [0, s],
                            left: [-s, 0],
                            right: [s, 0]
                        }
                        const step = steps[button.dataset.dir ?? '']
                        if (step) {
                            map.panBy(step, { duration: 0.25 })
                        }
                    })
                    return box
                }
                let panShown = false
                // set while the code itself moves the map: every zoom event during a
                // programmatic fit compares against a baseline that is not updated yet
                let building = false

                const showPan = (): void => {
                    const inside = map.getZoom() > overview.zoom
                    if (inside && !panShown) {
                        panControl.addTo(map)
                        panShown = true
                    }
                    if (!inside && panShown) {
                        panControl.remove()
                        panShown = false
                    }
                    if (inside) {
                        active = map
                    }
                    if (!inside && active === map) {
                        active = null
                    }
                    // in the overview the map already fills its frame: dragging there
                    // moves nothing and swallows a swipe meant for the page
                    if (inside) {
                        map.dragging.enable()
                    } else {
                        map.dragging.disable()
                    }
                }

                map.on('click', back)

                // a drag that comes to rest on a thumbnail ends in a click on its link,
                // and the album would open although the finger only pushed the map
                let dragged = false
                map.on('dragstart', () => {
                    dragged = true
                })
                map.getContainer().addEventListener('pointerdown', () => {
                    dragged = false
                })
                map.getContainer().addEventListener(
                    'click',
                    (e) => {
                        const link = (e.target as Element).closest('a')
                        // in the overview a pin carries no photo yet, and the credit
                        // under the map is a link of its own
                        if (!(link instanceof HTMLElement) || !link.dataset.shot) {
                            return
                        }
                        // the address of the photo stays on the link for anyone
                        // without a script; here the view opens over the map
                        e.preventDefault()
                        if (!dragged) {
                            view.open(Number(link.dataset.shot))
                        }
                    },
                    true
                )

                const settle = (b: Leaflet.LatLngBounds): void => {
                    map.fitBounds(b, { padding: [12, 12], animate: false })
                    overview.center = map.getCenter()
                    overview.zoom = map.getZoom()
                    // the country filled the frame at this zoom, there is nothing further
                    // out. The bound gets a little slack: exactly the visible box makes
                    // Leaflet zoom in a step to satisfy it.
                    map.setMinZoom(overview.zoom)
                    map.setMaxBounds(map.getBounds().pad(0.02))
                }

                settle(bounds)

                map.remeasure = (b: Leaflet.LatLngBounds): void => {
                    // a turn of the phone gives the frame another width, so the
                    // country is fitted again. How far the reader had zoomed in
                    // is kept, counted from the overview: that step is a
                    // different one in the new frame
                    const kept = {
                        centre: map.getCenter(),
                        steps: map.getZoom() - overview.zoom
                    }
                    building = true
                    map.setMinZoom(0)
                    map.setMaxBounds(null)
                    map.invalidateSize(false)
                    settle(b)
                    building = false
                    if (kept.steps > 0) {
                        map.setView(kept.centre, overview.zoom + kept.steps, { animate: false })
                    }
                    pins.forEach(place)
                    showPan()
                }

                pins.forEach(place)

                // registered only now: during fitBounds the overview zoom is not known
                // yet, and every comparison against it would be answered wrongly
                map.on('zoomend', () => {
                    if (building) {
                        return
                    }
                    pins.forEach(place)
                    showPan()
                })

                return map
            }

            const shapes: Shape[] = data.maps.map((country, i) => {
                const bounds = L.geoJSON(country.geometry).getBounds()
                const nw = L.CRS.EPSG3857.project(bounds.getNorthWest())
                const se = L.CRS.EPSG3857.project(bounds.getSouthEast())
                const ratio = (se.x - nw.x) / (nw.y - se.y)

                const box = document.createElement('div')
                box.className = 'map-box'
                measure(ratio, box)
                box.innerHTML = `<div class="map-canvas" id="map-${i}"></div>`
                grid.appendChild(box)

                return {
                    country,
                    bounds,
                    ratio,
                    box,
                    map: build(`map-${i}`, country, data.days, bounds)
                }
            })

            document.addEventListener('keydown', (e) => {
                if (!active) {
                    return
                }
                const dirs: Record<string, Leaflet.PointTuple> = {
                    ArrowUp: [0, -1],
                    ArrowDown: [0, 1],
                    ArrowLeft: [-1, 0],
                    ArrowRight: [1, 0]
                }
                const dir = dirs[e.key]
                if (!dir) {
                    return
                }
                e.preventDefault()
                const s = Math.round(active.getContainer().clientWidth / 4)
                active.panBy([dir[0] * s, dir[1] * s], { duration: 0.25 })
            })

            // a phone that turns round changes every width the boxes were built
            // from. The height alone changes when a browser bar slides in or out
            // or a photo takes the screen, and measuring again would throw the
            // map back to its overview
            let pending: ReturnType<typeof setTimeout>
            addEventListener('resize', () => {
                clearTimeout(pending)
                pending = setTimeout(() => {
                    const width = space()
                    if (width === available) {
                        return
                    }
                    available = width
                    for (const shape of shapes) {
                        measure(shape.ratio, shape.box)
                        shape.map.remeasure(shape.bounds)
                    }
                }, 200)
            })
        })
}
