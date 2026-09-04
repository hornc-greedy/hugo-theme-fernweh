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

    function open(i: number): void {
        show(i)
        frame.showModal()
    }

    function step(by: number): void {
        show((current + by + tiles.length) % tiles.length)
    }

    frame.addEventListener('close', () => {
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
        if (e.target === frame) {
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

    let start = 0
    frame.addEventListener(
        'touchstart',
        (e) => {
            start = e.touches[0]?.clientX ?? start
        },
        { passive: true }
    )
    frame.addEventListener('touchend', (e) => {
        const dir = (e.changedTouches[0]?.clientX ?? start) - start
        if (Math.abs(dir) > 50) {
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
