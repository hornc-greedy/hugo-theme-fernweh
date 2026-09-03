// images fade in as they come into view; the class is only added, never
// removed, so nothing moves a second time
const still = matchMedia('(prefers-reduced-motion: reduce)').matches
const candidates = document.querySelectorAll<HTMLElement>('.shot, .opener')

if (still) {
    candidates.forEach((el) => {
        el.classList.add('shown')
    })
} else {
    const observer = new IntersectionObserver(
        (entries) => {
            entries.forEach((entry) => {
                if (!entry.isIntersecting) {
                    return
                }
                entry.target.classList.add('shown')
                observer.unobserve(entry.target)
            })
        },
        { rootMargin: '0px 0px -8% 0px' }
    )
    candidates.forEach((el) => {
        observer.observe(el)
    })
}
