import type * as Leaflet from 'leaflet'

/** one step of the arrows on a map and of the arrow keys alike */
const directions: Record<string, Leaflet.PointTuple> = {
    up: [0, -1],
    down: [0, 1],
    left: [-1, 0],
    right: [1, 0]
}

/** moves a map a quarter of its width in one of the directions */
const pan = (target: Leaflet.Map, [x, y]: Leaflet.PointTuple): void => {
    const s = Math.round(target.getContainer().clientWidth / 4)
    target.panBy([x * s, y * s], { duration: 0.25 })
}

/** the arrows in the corner of a map, labelled with the page's wording */
export const panControl = (wording: Record<string, string | undefined>): Leaflet.Control => {
    const control = new L.Control({ position: 'bottomright' })
    control.onAdd = (map) => {
        const box = L.DomUtil.create('div', 'pan')
        const glyphs: Record<string, string> = {
            up: '↑',
            left: '←',
            down: '↓',
            right: '→'
        }
        box.innerHTML = Object.keys(glyphs)
            .map(
                (dir) =>
                    '<button data-dir="' +
                    dir +
                    '" aria-label="' +
                    (wording[`pan${dir}`] ?? '') +
                    '">' +
                    glyphs[dir] +
                    '</button>'
            )
            .join('')
        L.DomEvent.disableClickPropagation(box)
        box.addEventListener('click', (e) => {
            const button = (e.target as Element).closest('button')
            if (!button) {
                return
            }
            const step = directions[button.dataset.dir ?? '']
            if (step) {
                pan(map, step)
            }
        })
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
        const dir = directions[e.key.replace('Arrow', '').toLowerCase()]
        if (!dir) {
            return
        }
        e.preventDefault()
        pan(map, dir)
    })
}
