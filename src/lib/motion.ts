import { useEffect, type PointerEvent } from 'react'

// Adds `in` to every `.reveal` element once it scrolls into view. Checks on scroll, resize and any page change.
export function useReveal(key: unknown) {
  useEffect(() => {
    let frame = 0
    const check = () => {
      frame = 0
      const limit = window.innerHeight * 0.92
      document.querySelectorAll<HTMLElement>('.reveal:not(.in)').forEach((item) => { if (item.getBoundingClientRect().top < limit) item.classList.add('in') })
    }
    const queue = () => { if (!frame) frame = requestAnimationFrame(check) }
    const changes = new MutationObserver(queue)
    changes.observe(document.body, { childList: true, subtree: true })
    window.addEventListener('scroll', queue, { passive: true }); window.addEventListener('resize', queue)
    queue()
    return () => { changes.disconnect(); window.removeEventListener('scroll', queue); window.removeEventListener('resize', queue); if (frame) cancelAnimationFrame(frame) }
  }, [key])
}

// Tilts an element toward the pointer. Returns handlers to spread on it.
export function tiltHandlers(strength = 10) {
  return {
    onPointerMove: (event: PointerEvent<HTMLElement>) => {
      const box = event.currentTarget.getBoundingClientRect()
      const x = (event.clientX - box.left) / box.width - 0.5
      const y = (event.clientY - box.top) / box.height - 0.5
      event.currentTarget.style.setProperty('--rx', `${(-y * strength).toFixed(2)}deg`)
      event.currentTarget.style.setProperty('--ry', `${(x * strength).toFixed(2)}deg`)
    },
    onPointerLeave: (event: PointerEvent<HTMLElement>) => {
      event.currentTarget.style.setProperty('--rx', '0deg')
      event.currentTarget.style.setProperty('--ry', '0deg')
    },
  }
}
