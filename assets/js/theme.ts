// Runs before the first paint so the page never flashes the wrong palette.
// Its own file rather than an inline block, so a strict content security policy
// gets by without 'unsafe-inline'.
try {
    document.documentElement.classList.add('js')
    const chosen = localStorage.getItem('theme')
    if (chosen) {
        document.documentElement.dataset.theme = chosen
    }
} catch {}
