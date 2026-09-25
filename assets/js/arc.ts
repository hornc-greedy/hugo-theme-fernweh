/** How a map is set up for measuring a pin */
export interface PinScale {
    /** the width of the map in pixels */
    width: number
    /** the smallest a pin may get, from the configuration */
    smallest: number
    /** the largest a pin may get, from the configuration */
    largest: number
    /** the zoom the country fills the frame at */
    overview: number
    /** how far the map can be zoomed in */
    maxZoom: number
    /** where the map stands now */
    zoom: number
}

/**
 * The size of a pin follows an arc: small in the overview, largest halfway in
 * where the surroundings are read, small again at full zoom where the exact
 * spot is. Both ends scale with the map rather than with pixels, so that a
 * thumbnail cannot cover half a phone screen.
 */
export const pinSize = (scale: PinScale): number => {
    const small = Math.min(scale.smallest, scale.width * 0.22)
    const peak = Math.min(scale.largest, scale.width * 0.42)
    const span = scale.maxZoom - scale.overview
    const t = span === 0 ? 0 : (scale.zoom - scale.overview) / span
    return small + (peak - small) * Math.sin(Math.PI * t)
}

/** the point under a pin that stands on its spot, in proportion to the pin */
export const tipSize = (pin: number): number => Math.max(4, Math.round(pin / 8))

/**
 * How far a frame has to reach above its country so that the pin of the
 * northernmost photo stands in it whole. `below` is how far under the upper
 * edge of the frame that photo's spot lies.
 */
export const headroom = (pin: number, below: number): number =>
    Math.max(0, Math.ceil(pin + tipSize(pin) - below))

/** Where a pin sits on the map, in pixels */
export interface Spot {
    x: number
    y: number
}

/** how much of a pin another may cover before the two count as one spot */
const crowded = 0.25

/** the share one pin covers of another of the same size */
const covered = (a: Spot, b: Spot, size: number): number =>
    (Math.max(0, size - Math.abs(a.x - b.x)) * Math.max(0, size - Math.abs(a.y - b.y))) /
    (size * size)

const middle = (spots: Spot[]): Spot => ({
    x: spots.reduce((sum, spot) => sum + spot.x, 0) / spots.length,
    y: spots.reduce((sum, spot) => sum + spot.y, 0) / spots.length
})

/** The heap belongs to the last zoom step alone. The thumbnails are back to
    their smallest there, and one still covers another only because the two
    photographs were taken on one spot. */
const heaped = (scale: PinScale): boolean => scale.zoom >= scale.maxZoom

/** the pins that cover each other, gathered into heaps */
const gathered = <T extends Spot>(spots: T[], size: number): T[][] => {
    // a spot joins every heap it reaches, and those heaps become one
    let heaps: T[][] = []
    for (const spot of spots) {
        const touches = (heap: T[]): boolean =>
            heap.some((other) => covered(spot, other, size) > crowded)
        const joined = heaps.filter(touches).flat()
        heaps = heaps.filter((heap) => !touches(heap))
        heaps.push([...joined, spot])
    }
    return heaps
}

/**
 * Photographs from one spot cover each other however far the map is zoomed in.
 * On the last zoom step the ones that still do are laid out as a block over the
 * middle of where they sat, edge to edge and in the order they were taken, as
 * many across as it takes for the block to come out square. Every picture is
 * then whole, however many share the spot. Before that a thumbnail is meant to
 * cover its neighbours and nothing moves. The answer is the step every pin
 * takes.
 */
export const heap = <T extends Spot>(spots: T[], scale: PinScale): Map<T, Spot> => {
    if (!heaped(scale)) {
        return new Map(spots.map((spot): [T, Spot] => [spot, { x: 0, y: 0 }]))
    }
    const size = pinSize(scale)

    const steps = new Map<T, Spot>()
    for (const group of gathered(spots, size)) {
        const pile = spots.filter((spot) => group.includes(spot))
        const across = Math.ceil(Math.sqrt(pile.length))
        const cells = pile.map((spot, k) => ({
            spot,
            x: k % across,
            y: Math.floor(k / across)
        }))
        const here = middle(pile)
        const block = middle(cells)
        for (const cell of cells) {
            steps.set(cell.spot, {
                x: here.x + (cell.x - block.x) * size - cell.spot.x,
                y: here.y + (cell.y - block.y) * size - cell.spot.y
            })
        }
    }
    return steps
}
