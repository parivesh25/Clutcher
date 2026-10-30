import { useEffect, useRef } from 'react'

export const APP_NAME = 'Clutcher'

export function Logo({ size = 40, className = '' }: { size?: number; className?: string }) {
  return (
    <img src="/clutcher-logo.jpg" alt={`${APP_NAME} logo`} width={size} height={size}
      className={`logo-blend rounded-full object-cover ${className}`} style={{ width: size, height: size }} />
  )
}

export function Wordmark({ size = 'text-2xl' }: { size?: string }) {
  return <span className={`wordmark ${size}`}>Clutch<b>er</b></span>
}

/** Drifting colour field behind every page. Pure CSS animation. */
export function LiquidBackground() {
  return (
    <div className="lg-world" aria-hidden="true">
      <div className="lg-blob b1" />
      <div className="lg-blob b2" />
      <div className="lg-blob b3" />
      <div className="lg-grid" />
    </div>
  )
}

/**
 * Soft trailing cursor. It writes transforms straight to the DOM from one animation loop,
 * so moving the mouse never re-renders React (the old state-based cursor made the app lag).
 */
export function GlassCursor() {
  const dot = useRef<HTMLDivElement>(null)
  const ring = useRef<HTMLDivElement>(null)
  const aura = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (window.matchMedia('(pointer: coarse)').matches) return
    document.body.classList.add('clutcher-cursor')
    const target = { x: -100, y: -100 }
    const ringPos = { x: -100, y: -100 }
    const auraPos = { x: -100, y: -100 }
    let hover = false
    let frame = 0

    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(loop)
    }
    const onMove = (e: PointerEvent) => {
      target.x = e.clientX
      target.y = e.clientY
      const el = e.target as HTMLElement | null
      hover = !!el?.closest('button, a, input, select, textarea, [role="button"]')
      schedule()
    }
    const loop = () => {
      frame = 0
      ringPos.x += (target.x - ringPos.x) * 0.45
      ringPos.y += (target.y - ringPos.y) * 0.45
      auraPos.x += (target.x - auraPos.x) * 0.22
      auraPos.y += (target.y - auraPos.y) * 0.22
      if (dot.current) dot.current.style.transform = `translate3d(${target.x - 6}px, ${target.y - 6}px, 0) scale(${hover ? 0.5 : 1})`
      if (ring.current) ring.current.style.transform = `translate3d(${ringPos.x - 18}px, ${ringPos.y - 18}px, 0) scale(${hover ? 1.5 : 1})`
      if (aura.current) aura.current.style.transform = `translate3d(${auraPos.x - 64}px, ${auraPos.y - 64}px, 0)`
      const ringDistance = Math.abs(target.x - ringPos.x) + Math.abs(target.y - ringPos.y)
      const auraDistance = Math.abs(target.x - auraPos.x) + Math.abs(target.y - auraPos.y)
      if (ringDistance > 0.3 || auraDistance > 0.3) schedule()
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    return () => {
      window.removeEventListener('pointermove', onMove)
      cancelAnimationFrame(frame)
      document.body.classList.remove('clutcher-cursor')
    }
  }, [])

  return (
    <>
      <div ref={aura} className="fixed top-0 left-0 w-32 h-32 rounded-full pointer-events-none z-[9997] bg-violet-500/15 blur-2xl will-change-transform" />
      <div ref={dot} className="fixed top-0 left-0 w-3 h-3 rounded-full pointer-events-none z-[9999] bg-violet-600 transition-[scale] duration-200 will-change-transform" />
      <div ref={ring} className="fixed top-0 left-0 w-9 h-9 rounded-full pointer-events-none z-[9998] border border-violet-500/60 transition-[scale] duration-200 will-change-transform" />
    </>
  )
}
