/**
 * Shared Framer Motion variants + GSAP helpers.
 * Import what you need — tree-shaken, zero runtime overhead if unused.
 */

// ─── Framer Motion Variants ───────────────────────────────────────────────────

export const fadeDown = {
  hidden: { opacity: 0, y: -18 },
  show:   {
    opacity: 1, y: 0,
    transition: { type: 'spring' as const, stiffness: 160, damping: 28, duration: 0.7 },
  },
}

export const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  show:   {
    opacity: 1, y: 0,
    transition: { type: 'spring' as const, stiffness: 140, damping: 26, duration: 0.7 },
  },
}

export const scaleIn = {
  hidden: { opacity: 0, scale: 0.88 },
  show:   {
    opacity: 1, scale: 1,
    transition: { type: 'spring' as const, stiffness: 160, damping: 26, duration: 0.8 },
  },
}

export const slideInLeft = {
  hidden: { opacity: 0, x: -28 },
  show:   {
    opacity: 1, x: 0,
    transition: { type: 'spring' as const, stiffness: 130, damping: 24, duration: 0.8 },
  },
}

/** Wrap parent with this → children animate in sequence */
export const stagger = {
  hidden: {},
  show:   { transition: { staggerChildren: 0.14, delayChildren: 0.18 } },
}

export const staggerFast = {
  hidden: {},
  show:   { transition: { staggerChildren: 0.09, delayChildren: 0.1 } },
}

/** For AnimatePresence children */
export const fadeScalePresence = {
  initial: { opacity: 0, scale: 0.92, y: 8 },
  animate: {
    opacity: 1, scale: 1, y: 0,
    transition: { type: 'spring' as const, stiffness: 160, damping: 26, duration: 0.65 },
  },
  exit:    { opacity: 0, scale: 0.92, y: 8, transition: { duration: 0.22 } },
}

// ─── GSAP Helpers ─────────────────────────────────────────────────────────────

type CleanupFn = () => void

/**
 * CODEKILL title glitch — repeating irregular skew/shift timeline.
 * Dynamically imports GSAP (safe in SSR / server components).
 * Returns a cleanup fn, use directly as useEffect callback return value.
 */
export function startGlitch(el: HTMLElement | null): CleanupFn {
  if (!el || typeof window === 'undefined') return () => {}
  let killed = false
  import('gsap').then(({ gsap }) => {
    if (killed) return
    const tl = gsap.timeline({ repeat: -1, repeatDelay: 3.5 })
    tl.to(el, { skewX: 9,  x:  5, duration: 0.05, ease: 'none' })
      .to(el, { skewX: -6, x: -4, duration: 0.04 })
      .to(el, { skewX: 0,  x:  0, duration: 0.05 })
      .to(el, { opacity: 0.65, duration: 0.03 })
      .to(el, { opacity: 1,    duration: 0.03 })
      .to(el, { x: 3, duration: 0.03 })
      .to(el, { x: 0, duration: 0.04 })
      .to(el, { skewX: 4,  x:  2, duration: 0.04 })
      .to(el, { skewX: 0,  x:  0, duration: 0.04 })
    ;(el as any).__glitchTl = tl
  })
  return () => {
    killed = true
    const tl = (el as any).__glitchTl
    if (tl) tl.kill()
  }
}

/**
 * Infinite neon glow pulse on a button / panel via GSAP boxShadow.
 * Returns cleanup fn.
 */
export function startNeonPulse(
  el: HTMLElement | null,
  color = '#7c5cfc',
): CleanupFn {
  if (!el || typeof window === 'undefined') return () => {}
  let killed = false
  import('gsap').then(({ gsap }) => {
    if (killed) return
    const tl = gsap.timeline({ repeat: -1, yoyo: true })
    tl.to(el, {
      boxShadow: `0 0 22px ${color}88, 0 4px 0 #166b2a`,
      duration: 1.1,
      ease: 'sine.inOut',
    })
    ;(el as any).__neonTl = tl
  })
  return () => {
    killed = true
    const tl = (el as any).__neonTl
    if (tl) tl.kill()
  }
}
