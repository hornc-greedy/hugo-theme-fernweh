const toggle = document.getElementById('toggle') as HTMLButtonElement
const root = document.documentElement

const theme = (): string =>
    root.dataset.theme ?? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')

// the header carries the wording for both directions
const label = (): void => {
    toggle.setAttribute(
        'aria-label',
        (theme() === 'dark' ? toggle.dataset.light : toggle.dataset.dark) as string
    )
}

label()

toggle.addEventListener('click', () => {
    const next = theme() === 'dark' ? 'light' : 'dark'
    root.dataset.theme = next
    try {
        localStorage.setItem('theme', next)
    } catch {}
    label()
    // the map paints its surroundings in the page colour and cannot read a change
    document.dispatchEvent(new CustomEvent('themechange'))
})
