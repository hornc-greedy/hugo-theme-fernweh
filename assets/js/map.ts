import type * as Leaflet from 'leaflet'
import { headroom, heap, type PinScale, pinSize, type Spot, tipSize } from './arc.ts'
import { lightbox } from './lightbox.ts'

// What the geojson template hands over
interface Photo {
    lat: number
    long: number
    url: string
    w: number
    h: number
    color: string
    thumb: string
    thumbwidth: number
    large: string
    /** the cuts of the photo, as a srcset */
    cuts: string
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
    photo: Photo
    day: Day
    /** where it goes when it shares its spot with another pin */
    step: Spot
    /** the two elements the pin is drawn from */
    link: HTMLAnchorElement
    image: HTMLImageElement
    /** fetches the photo behind it, once, and says when it is there */
    fetch: (priority?: 'high' | 'low') => Promise<void>
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
                        cuts: photo.cuts,
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
                const tiles = [
                    L.tileLayer(grid?.dataset.tiles ?? '', {
                        maxZoom: maxzoom,
                        attribution: grid?.dataset.attribution
                    }).addTo(map)
                ]
                if (grid?.dataset.overlay) {
                    tiles.push(L.tileLayer(grid?.dataset.overlay, { maxZoom: maxzoom }).addTo(map))
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

                const outline = L.geoJSON(country.geometry, {
                    style: { color: '#8fa6c0', weight: 1.5, fill: false }
                }).addTo(map)

                // the outline comes from a world map, fine for the shape of a country
                // and far too coarse for a coastline at street zoom, where it would cut
                // across the land and leave pins outside it
                const shroud = (zoom: number): void => {
                    const shown = zoom <= overview.zoom
                    mask.setStyle({ fillOpacity: shown ? 1 : 0 })
                    outline.setStyle({ opacity: shown ? 1 : 0 })
                }

                const overview = { center: bounds.getCenter(), zoom: 0 }

                const pins: Pin[] = []

                const back = (): void => {
                    if (map.getZoom() === overview.zoom) {
                        return
                    }
                    glide(overview.zoom, 0.7)
                    map.flyTo(overview.center, overview.zoom, { duration: 0.7 })
                }

                const scale = (zoom: number): PinScale => ({
                    width: map.getContainer().clientWidth,
                    smallest: smallestPin,
                    largest: largestPin,
                    overview: overview.zoom,
                    maxZoom: map.getMaxZoom(),
                    zoom
                })

                const size = (zoom: number): number => pinSize(scale(zoom))

                // the one number the stylesheet measures the pins against, the same
                // for every pin of a map
                const grow = (zoom: number): void => {
                    const pin = Math.round(size(zoom))
                    const frame = map.getContainer()
                    frame.style.setProperty('--pin', `${pin}px`)
                    frame.style.setProperty('--tip', `${tipSize(pin)}px`)
                    // a pin moved into a heap no longer stands on its own spot
                    frame.classList.toggle('heaped', zoom >= map.getMaxZoom())
                }

                // the zoom is passed in, because during a flight the pins already
                // belong to the destination
                const spread = (zoom: number): void => {
                    const spots = pins.map((pin) => {
                        const point = map.project([pin.photo.lat, pin.photo.long], zoom)
                        return { pin, x: point.x, y: point.y }
                    })
                    for (const [spot, step] of heap(spots, scale(zoom))) {
                        spot.pin.step = step
                    }
                }

                /** the pins nearest this photo, the ones a finger reaches next. Eight,
                    because the view holds ninety of them on a journey the size of an
                    island, and every photo is a third of a megabyte */
                const nearest = (centre: Photo): Pin[] => {
                    const zoom = map.getZoom()
                    const here = map.project([centre.lat, centre.long], zoom)
                    return pins
                        .map((pin) => ({
                            pin,
                            away: here.distanceTo(
                                map.project([pin.photo.lat, pin.photo.long], zoom)
                            )
                        }))
                        .sort((one, two) => one.away - two.away)
                        .slice(0, 8)
                        .map(({ pin }) => pin)
                }

                const place = (pin: Pin, zoom = map.getZoom()): void => {
                    // switch sources when the small one would have to be stretched
                    const source =
                        Math.round(size(zoom)) > pin.photo.thumbwidth
                            ? pin.photo.large
                            : pin.photo.thumb
                    if (pin.image.getAttribute('src') !== source) {
                        pin.image.src = source
                    }
                    // a glide that is still running ends here, on the plain size
                    pin.image.style.transition = 'none'
                    pin.image.style.transform = ''
                    const { x, y } = pin.step
                    pin.link.style.transition = 'none'
                    pin.link.style.translate = `${Math.round(x)}px ${Math.round(y)}px`
                    // the size already belongs to the destination, the link only once the
                    // map is there. Otherwise the click that starts the flight follows it
                    const arrived = Math.min(zoom, map.getZoom()) > overview.zoom
                    if (arrived) {
                        // the opener has no tile of its own, its pin leads to the day
                        pin.link.href =
                            pin.photo.index < 0
                                ? pin.day.url
                                : `${pin.day.url}#photo-${pin.photo.index}`
                        pin.link.dataset.shot = String(at.get(pin.photo))
                    } else {
                        pin.link.removeAttribute('href')
                        delete pin.link.dataset.shot
                    }
                }

                /** the pins take the size and the place of the destination at once, held
                    back by a counter-scale and their old step, both released over the
                    seconds the map flies */
                const glide = (zoom: number, seconds: number): void => {
                    shroud(zoom)
                    // flying in, the tiles at hand cover the destination and only turn
                    // blurry, so they wait for the landing. Flying out they cover a
                    // fraction of the frame and have to follow
                    for (const layer of tiles) {
                        layer.options.updateWhenZooming = zoom < map.getZoom()
                    }
                    // every pin of a map measures the same, so the counter-scale is
                    // worked out once instead of read back from each element
                    const held = size(map.getZoom()) / size(zoom)
                    grow(zoom)
                    spread(zoom)
                    const moving = pins.map((pin) => {
                        const stood = pin.link.style.translate
                        place(pin, zoom)
                        const steps = pin.link.style.translate
                        pin.link.style.translate = stood
                        pin.image.style.transform = `scale(${held})`
                        return { image: pin.image, link: pin.link, steps }
                    })
                    requestAnimationFrame(() => {
                        for (const { image, link, steps } of moving) {
                            image.style.transition = `transform ${seconds}s ease-in-out`
                            image.style.transform = ''
                            link.style.transition = `translate ${seconds}s ease-in-out`
                            link.style.translate = steps
                        }
                    })
                }

                /** every pin at the size and the place this zoom gives it */
                const arrange = (): void => {
                    const zoom = map.getZoom()
                    grow(zoom)
                    spread(zoom)
                    for (const pin of pins) {
                        place(pin, zoom)
                    }
                }

                for (const day of allDays) {
                    for (const photo of day.photos) {
                        if (!bounds.contains([photo.lat, photo.long])) {
                            continue
                        }
                        const image = document.createElement('img')
                        image.alt = ''
                        image.style.background = photo.color
                        const link = document.createElement('a')
                        link.append(image)
                        // out of the tab order: the album below lists every photo
                        // already, and the pins would double the stations
                        const marker = L.marker([photo.lat, photo.long], {
                            keyboard: false,
                            title: `${day.title}, ${photo.caption || photo.time}`,
                            // built once, because a rebuilt icon cannot be animated
                            icon: L.divIcon({
                                html: link,
                                className: 'photo-pin',
                                // no size from Leaflet, because an inline width and the
                                // margin that comes with it beat the stylesheet, which
                                // measures the pin against --pin
                                iconSize: undefined
                            })
                        }).addTo(map)
                        // the flight lasts long enough to bring the photo in, and the
                        // hand that flew here opens this photo next
                        let asked: Promise<void> | undefined
                        const fetchPhoto = (priority: 'high' | 'low' = 'high'): Promise<void> => {
                            if (!asked) {
                                const full = new Image()
                                full.fetchPriority = priority
                                full.sizes = '100vw'
                                full.srcset = photo.cuts
                                full.src = photo.url
                                asked = full.decode().catch(() => undefined)
                            }
                            return asked
                        }
                        pins.push({
                            photo,
                            day,
                            step: { x: 0, y: 0 },
                            link,
                            image,
                            fetch: fetchPhoto
                        })
                        // in the overview a thumbnail leads nowhere, so the photo waits
                        image.addEventListener('pointerenter', () => {
                            if (map.getZoom() > overview.zoom) {
                                fetchPhoto()
                            }
                        })
                        marker.on('click', (e) => {
                            // a marker click reaches the map afterwards, which would fly straight back out
                            L.DomEvent.stopPropagation(e)
                            void fetchPhoto()
                            if (map.getZoom() > overview.zoom) {
                                return
                            }
                            // the next tap goes to a photo around this one, so they
                            // come in behind it, one after another
                            map.once('moveend', () => {
                                void nearest(photo).reduce(
                                    (before, pin) => before.then(() => pin.fetch('low')),
                                    Promise.resolve()
                                )
                            })
                            glide(overview.zoom + 3, 0.7)
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

                // the pins stand over their spots, so the one furthest north decides
                // how far the frame reaches above the country
                const north = Math.max(...pins.map((pin) => pin.photo.lat))

                const settle = (b: Leaflet.LatLngBounds): void => {
                    map.fitBounds(b, { padding: [12, 12], animate: false })
                    overview.zoom = map.getZoom()
                    const room = headroom(
                        size(overview.zoom),
                        map.latLngToContainerPoint([north, b.getCenter().lng]).y
                    )
                    if (room > 0) {
                        const box = map.getContainer().parentElement as HTMLElement
                        box.style.height = `${box.offsetHeight + room}px`
                        map.invalidateSize(false)
                        map.fitBounds(b, {
                            paddingTopLeft: [12, 12 + room],
                            paddingBottomRight: [12, 12],
                            animate: false
                        })
                    }
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
                    arrange()
                    shroud(map.getZoom())
                    showPan()
                }

                arrange()
                shroud(map.getZoom())

                // registered only now: during fitBounds the overview zoom is not known
                // yet, and every comparison against it would be answered wrongly
                map.on('zoomend', () => {
                    if (building) {
                        return
                    }
                    arrange()
                    shroud(map.getZoom())
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
