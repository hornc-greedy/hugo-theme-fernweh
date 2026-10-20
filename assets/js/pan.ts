import type * as Leaflet from 'leaflet'

type Dir = 'up' | 'left' | 'down' | 'right'

/**
 * one step of the arrows on a map and of the arrow keys alike, in the order the
 * arrows are tabbed through
 */
const directions: Record<Dir, Leaflet.PointTuple> = {
    up: [0, -1],
    left: [-1, 0],
    down: [0, 1],
    right: [1, 0]
}

const glyphs: Record<Dir, string> = {
    up: '↑',
    left: '←',
    down: '↓',
    right: '→'
}

/** the labels of the arrows, as map.html writes them */
export type PanWording = Record<`pan${Dir}`, string>

/** moves a map a quarter of its width in one of the directions */
const pan = (target: Leaflet.Map, [x, y]: Leaflet.PointTuple): void => {
    const s = Math.round(target.getContainer().clientWidth / 4)
    target.panBy([x * s, y * s], { duration: 0.25 })
}

/** the arrows in the corner of a map, labelled with the page's wording */
export const panControl = (wording: PanWording): Leaflet.Control => {
    const control = new L.Control({ position: 'bottomright' })
    control.onAdd = (map) => {
        const box = L.DomUtil.create('div', 'pan')
        // built element by element: the labels come from the translation tables,
        // and a quotation mark in one would break markup assembled by hand
        for (const dir of Object.keys(directions) as Dir[]) {
            const button = document.createElement('button')
            button.type = 'button'
            button.dataset.dir = dir
            button.ariaLabel = wording[`pan${dir}`]
            button.textContent = glyphs[dir]
            button.addEventListener('click', () => pan(map, directions[dir]))
            box.append(button)
        }
        L.DomEvent.disableClickPropagation(box)
        return box
    }
    return control
}

/** lets the arrow keys move the map that `active` names, if any */
export const panKeys = (active: () => Leaflet.Map | null): void => {
    document.addEventListener('keydown', (e) => {
        const map = active()
        if (!map) {
            return
        }
        const dir = e.key.replace('Arrow', '').toLowerCase()
        // every other key is left to the page, and so is an arrow with alt, ctrl
        // or meta, as in Leaflet's keyboard handler
        if (e.altKey || e.ctrlKey || e.metaKey || !Object.hasOwn(directions, dir)) {
            return
        }
        e.preventDefault()
        pan(map, directions[dir as Dir])
    })
}
