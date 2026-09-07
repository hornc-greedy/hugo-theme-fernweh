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
    const small = Math.max(12, Math.min(scale.smallest, scale.width / 10))
    const peak = Math.max(80, Math.min(scale.largest, scale.width * 0.42))
    const span = scale.maxZoom - scale.overview
    const t = span === 0 ? 0 : (scale.zoom - scale.overview) / span
    return small + (peak - small) * Math.sin(Math.PI * t)
}
