const toggle = document.getElementById('toggle') as HTMLButtonElement | null
const root = document.documentElement

if (toggle) {
    const theme = (): string =>
        root.dataset.theme ??
        (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')

    const label = (): void => {
        const wording = theme() === 'dark' ? toggle.dataset.light : toggle.dataset.dark
        if (wording) {
            toggle.setAttribute('aria-label', wording)
        }
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
}
