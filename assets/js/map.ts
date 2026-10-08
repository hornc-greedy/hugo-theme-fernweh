import type * as Leaflet from 'leaflet'
import { headroom, heap, type PinScale, pinSize, type Spot, tipSize } from './arc.ts'
import { lightbox } from './lightbox.ts'
import { locator } from './locator.ts'
import { mask } from './mask.ts'
import { panControl, panKeys } from './pan.ts'

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
    /** the map among maps this pin stands on */
    mapIndex: number
}

interface Day {
    title: string
    url: string
    photos: Photo[]
}

interface Country {
    geometry: GeoJSON.MultiPolygon
    /** the country around a boundary, drawn small beside it with the boundary's name */
    locator?: {
        geometry: GeoJSON.MultiPolygon
        code: string
        name: string
        /** the middle of the photos of the map */
        centre: Leaflet.LatLngTuple
    }
}

interface MapData {
    maps: Country[]
    days: Day[]
}

interface Region {
    country: Country
    bounds: Leaflet.LatLngBounds
    /** its extent in projected metres */
    extent: { x: number; y: number }
    /** a stopover of few photos, drawn in a frame of its own */
    secondary: boolean
}

interface Shape extends Region {
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

/** how long a flight in or out lasts, in seconds */
const flyDuration = 0.7
/** how many zoom steps a tap on a pin flies in */
const flyInZoom = 3
/** the room between a country and the edge of its frame, in pixels */
const fitPadding = 12

const grid = document.getElementById('maps')

if (grid) {
    // the stylesheet fades the mask and the outline over the same seconds
    grid.style.setProperty('--fly-duration', `${flyDuration}s`)
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
            const wording = grid.dataset

            // the map that is currently zoomed in, and therefore the one the arrow
            // keys belong to. It is null again as soon as that map is back in the
            // overview
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

            const measure = (region: Region, box: HTMLElement): void => {
                const { x, y } = region.extent
                if (region.secondary) {
                    // a stopover keeps a frame of its own, so a tall island cannot outgrow the main maps
                    box.style.width = `${Math.round(available)}px`
                    box.style.height = `${Math.round(available * 0.75)}px`
                    return
                }
                // every map takes the full width it is given, the height follows from
                // the country. Only the extreme shapes are capped, and relative to that
                // width rather than to the window: a viewport-bound cap makes a tall
                // country narrower than a round one standing right beside it.
                const scale = Math.min(available / x, (available * 2) / y)
                box.style.height = `${Math.round(y * scale)}px`
                box.style.width = `${Math.round(x * scale)}px`
            }

            function build(
                id: string,
                country: Country,
                allDays: Day[],
                bounds: Leaflet.LatLngBounds,
                mapIndex: number
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
                // the footer. Leaflet's own name is not part of that
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

                const showMask = mask(map, country.geometry)

                const overview = {
                    center: bounds.getCenter(),
                    zoom: 0,
                    bounds
                }

                // further out than the overview the map shows the whole country around
                // its boundary, painted and outlined like a country of its own, with the
                // boundary outlined within it
                const out = (zoom: number): boolean => zoom < overview.zoom
                // the frame of the whole country, held there once the map has arrived
                const fly = (whole: Leaflet.LatLngBounds): void => {
                    // Leaflet answers no further out than the floor it has, so the
                    // floor goes first
                    map.setMaxBounds(null)
                    map.setMinZoom(0)
                    const zoom = map.getBoundsZoom(
                        whole,
                        false,
                        L.point(2 * fitPadding, 2 * fitPadding)
                    )
                    map.setMinZoom(zoom)
                    glide(zoom, flyDuration)
                    map.flyTo(whole.getCenter(), zoom, { duration: flyDuration })
                    map.once('moveend', () => {
                        map.setMaxBounds(map.getBounds().pad(0.02))
                    })
                }
                const around = country.locator
                const wide = around && {
                    show: mask(map, around.geometry),
                    press: locator(map, around, wording.wholecountry ?? '', () => {
                        if (out(map.getZoom())) {
                            back()
                        } else {
                            fly(L.geoJSON(around.geometry).getBounds())
                        }
                    })
                }

                // the outline comes from a world map, fine for the shape of a country
                // and far too coarse for a coastline at street zoom, where it would cut
                // across the land and leave pins outside it
                const shroud = (zoom: number): void => {
                    showMask(zoom <= overview.zoom && !out(zoom), zoom <= overview.zoom)
                    wide?.show(out(zoom))
                    wide?.press(out(zoom))
                }

                // in the overview or nearer the map is held to the overview
                const floor = (): void => {
                    map.setMinZoom(overview.zoom)
                    map.setMaxBounds(overview.bounds)
                }

                const pins: Pin[] = []

                const back = (): void => {
                    if (map.getZoom() === overview.zoom) {
                        return
                    }
                    glide(overview.zoom, flyDuration)
                    map.flyTo(overview.center, overview.zoom, { duration: flyDuration })
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
                    // switch sources when the small one would have to be stretched on this screen
                    const source =
                        Math.round(size(zoom)) * devicePixelRatio > pin.photo.thumbwidth
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
                        if (photo.mapIndex !== mapIndex) {
                            continue
                        }
                        const image = document.createElement('img')
                        image.alt = ''
                        image.style.background = photo.color
                        const link = document.createElement('a')
                        link.append(image)
                        link.title = `${day.title}, ${photo.caption || photo.time}`
                        // hidden from assistive technology and out of the tab order,
                        // because the album below lists every photo already and the
                        // pins would double the stations
                        link.ariaHidden = 'true'
                        link.tabIndex = -1
                        const marker = L.marker([photo.lat, photo.long], {
                            keyboard: false,
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
                        // in the overview a pin leads nowhere, so the photo waits
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
                            // the overview of a small boundary already lies close to
                            // maxZoom, and flyTo does not stop there
                            const zoom = Math.min(overview.zoom + flyInZoom, map.getMaxZoom())
                            glide(zoom, flyDuration)
                            map.flyTo([photo.lat, photo.long], zoom, { duration: flyDuration })
                        })
                    }
                }

                // dragging comes with the zoom. The keyboard has these steps instead
                const panArrows = panControl(wording)
                let panShown = false
                // set while the code itself moves the map: every zoom event during a
                // programmatic fit compares against a baseline that is not updated yet
                let building = false

                const showPan = (): void => {
                    const inside = map.getZoom() > overview.zoom
                    if (inside && !panShown) {
                        panArrows.addTo(map)
                        panShown = true
                    }
                    if (!inside && panShown) {
                        panArrows.remove()
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

                // a drag that comes to rest on a pin ends in a click on its link,
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
                        // without a script. Here the view opens over the map
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
                    map.fitBounds(b, { padding: [fitPadding, fitPadding], animate: false })
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
                            paddingTopLeft: [fitPadding, fitPadding + room],
                            paddingBottomRight: [fitPadding, fitPadding],
                            animate: false
                        })
                    }
                    overview.center = map.getCenter()
                    overview.zoom = map.getZoom()
                    // the country filled the frame at this zoom, only the button of the
                    // locator leads further out. The bound gets a little slack: exactly
                    // the visible box makes Leaflet zoom in a step to satisfy it.
                    overview.bounds = map.getBounds().pad(0.02)
                    floor()
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
                    if (!out(map.getZoom()) && map.getMinZoom() < overview.zoom) {
                        floor()
                    }
                    arrange()
                    shroud(map.getZoom())
                    showPan()
                })

                return map
            }

            const regions: Region[] = data.maps.map((country, i) => {
                const photos = data.days
                    .flatMap((day) => day.photos)
                    .filter((photo) => photo.mapIndex === i)
                // a photo just outside a boundary still belongs in the frame
                const bounds = L.geoJSON(country.geometry).getBounds()
                for (const photo of photos) {
                    bounds.extend([photo.lat, photo.long])
                }
                const nw = L.CRS.EPSG3857.project(bounds.getNorthWest())
                const se = L.CRS.EPSG3857.project(bounds.getSouthEast())
                return {
                    country,
                    bounds,
                    extent: { x: se.x - nw.x, y: nw.y - se.y },
                    secondary: photos.length < 5
                }
            })

            const shapes: Shape[] = regions.map((region, i) => {
                const box = document.createElement('div')
                box.className = 'map-box'
                measure(region, box)
                box.innerHTML = `<div class="map-canvas" id="map-${i}"></div>`
                grid.appendChild(box)

                return {
                    ...region,
                    box,
                    map: build(`map-${i}`, region.country, data.days, region.bounds, i)
                }
            })

            panKeys(() => active)

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
                        measure(shape, shape.box)
                        shape.map.remeasure(shape.bounds)
                    }
                }, 200)
            })
        })
}
