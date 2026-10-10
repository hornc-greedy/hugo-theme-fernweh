// Runs before the first paint so the page never flashes the wrong palette or a
// picture still to be revealed.
// Its own file rather than an inline block, so a strict content security policy
// gets by without 'unsafe-inline'.
document.documentElement.classList.add('js')
try {
    const chosen = localStorage.getItem('theme')
    if (chosen) {
        document.documentElement.dataset.theme = chosen
    }
} catch {}
