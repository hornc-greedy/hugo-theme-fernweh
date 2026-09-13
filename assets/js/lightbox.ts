const gallery = document.getElementById('gallery')

if (gallery) {
    const tiles = [...gallery.querySelectorAll<HTMLAnchorElement>('.tile')]
    const wording = gallery.dataset

    const part = <K extends keyof HTMLElementTagNameMap>(
        tag: K,
        css?: string
    ): HTMLElementTagNameMap[K] => {
        const el = document.createElement(tag)
        if (css) {
            el.className = css
        }
        return el
    }

    // built element by element rather than from a string of markup: the labels
    // come from the translation tables, and a quotation mark in one would break
    // markup assembled by hand
    const knob = (css: string, label: string | undefined, glyph: string): HTMLButtonElement => {
        const button = part('button', css)
        button.type = 'button'
        button.ariaLabel = label ?? ''
        button.textContent = glyph
        return button
    }

    const closer = knob('lightbox-close', wording.close, '×')
    closer.autofocus = true
    const previous = knob('lightbox-prev', wording.previous, '‹')
    const following = knob('lightbox-next', wording.next, '›')

    const img = part('img')
    img.alt = ''
    const text = part('figcaption')
    const figure = part('figure')
    figure.append(img, text)

    const strip = part('div', 'lightbox-strip')
    const counter = part('span', 'lightbox-count')
    const bar = part('div', 'lightbox-bar')
    bar.append(strip, counter)

    const frame = part('dialog', 'lightbox')
    frame.ariaLabel = wording.photo ?? ''
    frame.append(closer, previous, following, figure, bar)
    document.body.append(frame)

    let current = -1

    // the strip reuses the pictures the grid has already loaded
    const thumbs = tiles.map((tile, i) => {
        const thumb = part('button')
        thumb.type = 'button'
        thumb.ariaLabel = `${wording.photo ?? ''} ${i + 1}`
        const picture = part('img')
        picture.src = tile.querySelector('img')?.src ?? ''
        picture.alt = ''
        thumb.append(picture)
        thumb.addEventListener('click', () => show(i))
        strip.append(thumb)
        return thumb
    })

    function show(i: number): void {
        const tile = tiles[i]
        if (!tile) {
            return
        }
        scale = 1
        shift = { x: 0, y: 0 }
        img.style.transform = ''
        img.src = tile.href
        img.width = Number(tile.dataset.width)
        img.height = Number(tile.dataset.height)
        img.alt = tile.dataset.caption ?? ''
        text.textContent = tile.dataset.caption ?? ''
        counter.textContent = `${i + 1} / ${tiles.length}`
        thumbs.forEach((thumb, n) => {
            thumb.classList.toggle('current', n === i)
        })
        thumbs[i]?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
        current = i
        // the neighbours are fetched now so that paging feels instant
        for (const n of [i - 1, i + 1]) {
            const neighbour = tiles[n]
            if (neighbour) {
                new Image().src = neighbour.href
            }
        }
    }

    // touch devices show a browser bar, a mouse does not
    const handheld = matchMedia('(pointer: coarse)').matches

    async function open(i: number): Promise<void> {
        show(i)
        // before the dialog, not after: the top layer shows whoever entered it
        // last. Granted only on a gesture, so a photo opened from a link on the
        // map stays in the window
        if (handheld) {
            await document.documentElement
                .requestFullscreen?.({ navigationUI: 'hide' })
                .catch(() => undefined)
        }
        frame.showModal()
    }

    function step(by: number): void {
        show((current + by + tiles.length) % tiles.length)
    }

    frame.addEventListener('close', () => {
        if (document.fullscreenElement) {
            document.exitFullscreen()
        }
        tiles[current]?.focus()
        // opened from a thumbnail on the map: closing belongs back on that map,
        // not on the album page the link happened to lead to. A tab opened
        // straight on this address has no map behind it and stays where it is.
        if (fromMap && history.length > 1) {
            fromMap = false
            history.back()
        }
    })

    tiles.forEach((tile, i) => {
        tile.addEventListener('click', (e) => {
            e.preventDefault()
            open(i)
        })
    })

    closer.addEventListener('click', () => frame.close())
    previous.addEventListener('click', () => step(-1))
    following.addEventListener('click', () => step(1))
    frame.addEventListener('click', (e) => {
        // without a margin the space beside the picture belongs to the figure
        if (e.target === frame || e.target === figure) {
            frame.close()
        }
    })

    frame.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowLeft') {
            step(-1)
        }
        if (e.key === 'ArrowRight') {
            step(1)
        }
    })

    // a hidden strip cannot scroll, so it is centred again once it is back
    addEventListener('resize', () => {
        thumbs[current]?.scrollIntoView({ inline: 'center', block: 'nearest' })
    })

    // the browser does not zoom a photo inside a fullscreen dialog, so the
    // gestures on it are handled here
    let scale = 1
    let taken = 1
    let span = 0
    let shift = { x: 0, y: 0 }
    // where the photo sits unmoved and unenlarged
    let middle = { x: 0, y: 0 }
    // the spot the fingers hold, measured in the photo, not in the window
    let anchor = { x: 0, y: 0 }
    let grabbed = { x: 0, y: 0 }
    let start = 0
    let swipe = false

    const pair = (touches: TouchList): [Touch, Touch] | undefined => {
        const one = touches[0]
        const two = touches[1]
        return one && two ? [one, two] : undefined
    }

    const spread = ([one, two]: [Touch, Touch]): number =>
        Math.hypot(one.clientX - two.clientX, one.clientY - two.clientY)

    const between = ([one, two]: [Touch, Touch]) => ({
        x: (one.clientX + two.clientX) / 2,
        y: (one.clientY + two.clientY) / 2
    })

    // the photo is not moved past its own edges
    const hold = (): void => {
        const room = {
            x: Math.max(0, (img.offsetWidth * scale - figure.clientWidth) / 2),
            y: Math.max(0, (img.offsetHeight * scale - figure.clientHeight) / 2)
        }
        shift = {
            x: Math.min(room.x, Math.max(-room.x, shift.x)),
            y: Math.min(room.y, Math.max(-room.y, shift.y))
        }
        img.style.transform = `translate(${shift.x}px, ${shift.y}px) scale(${scale})`
    }

    frame.addEventListener(
        'touchstart',
        (e) => {
            swipe = e.touches.length === 1
            const first = e.touches[0]
            start = first?.clientX ?? start
            if (first) {
                grabbed = { x: first.clientX - shift.x, y: first.clientY - shift.y }
            }
            const two = pair(e.touches)
            if (two) {
                const box = img.getBoundingClientRect()
                middle = {
                    x: box.left + box.width / 2 - shift.x,
                    y: box.top + box.height / 2 - shift.y
                }
                const grip = between(two)
                anchor = {
                    x: (grip.x - middle.x - shift.x) / scale,
                    y: (grip.y - middle.y - shift.y) / scale
                }
                span = spread(two)
                taken = scale
            }
        },
        { passive: true }
    )

    frame.addEventListener('touchmove', (e) => {
        const two = pair(e.touches)
        if (two) {
            scale = Math.min(4, Math.max(1, (taken * spread(two)) / span))
            const grip = between(two)
            shift = {
                x: grip.x - middle.x - anchor.x * scale,
                y: grip.y - middle.y - anchor.y * scale
            }
            hold()
            e.preventDefault()
            return
        }
        const first = e.touches[0]
        if (scale > 1 && first) {
            shift = { x: first.clientX - grabbed.x, y: first.clientY - grabbed.y }
            hold()
            e.preventDefault()
        }
    })

    frame.addEventListener('touchend', (e) => {
        // a finger still down after a pinch takes over the moving
        const left = e.touches[0]
        if (left) {
            grabbed = { x: left.clientX - shift.x, y: left.clientY - shift.y }
        }
        if (scale === 1) {
            shift = { x: 0, y: 0 }
            hold()
        }
        const dir = (e.changedTouches[0]?.clientX ?? start) - start
        if (swipe && scale === 1 && Math.abs(dir) > 50) {
            step(dir > 0 ? -1 : 1)
        }
    })

    // the thumbnails on the map link to a single photo, named by its tile
    const linked = tiles.findIndex((tile) => `#${tile.id}` === location.hash)
    // a bookmark of the same address has no map to return to
    let fromMap = linked > -1 && document.referrer.startsWith(location.origin)
    if (linked > -1) {
        open(linked)
    }
}
