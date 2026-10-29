import { useEffect, useRef } from 'react'

const GAP = 22 // px between dots
const RADIUS = 130 // px around the cursor that pushes dots
const PUSH = 18 // px a dot moves at the cursor itself

/** Fixed dot-grid background. Dots near the pointer drift away from it and settle back. */
export default function DotField() {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let w = 0, h = 0, cols = 0, rows = 0
    let ox = new Float32Array(0), oy = new Float32Array(0)
    let mx = -1e4, my = -1e4
    let frame = 0
    let base = '', hot = ''

    function readColors() {
      const s = getComputedStyle(canvas!)
      base = s.getPropertyValue('--dot').trim() || 'rgba(15,27,61,0.18)'
      hot = s.getPropertyValue('--dot-hot').trim() || 'rgba(52,102,242,0.9)'
    }

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      w = window.innerWidth
      h = window.innerHeight
      canvas!.width = w * dpr
      canvas!.height = h * dpr
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0)
      cols = Math.ceil(w / GAP) + 1
      rows = Math.ceil(h / GAP) + 1
      ox = new Float32Array(cols * rows)
      oy = new Float32Array(cols * rows)
      draw()
    }

    // Returns true while any dot is still moving.
    function step(): boolean {
      let moving = false
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const i = r * cols + c
          const x = c * GAP + GAP / 2, y = r * GAP + GAP / 2
          const dx = x - mx, dy = y - my
          const d = Math.hypot(dx, dy)
          let tx = 0, ty = 0
          if (d < RADIUS && d > 0.01) {
            const f = (1 - d / RADIUS) ** 2 * PUSH
            tx = (dx / d) * f
            ty = (dy / d) * f
          }
          ox[i] += (tx - ox[i]) * 0.16
          oy[i] += (ty - oy[i]) * 0.16
          if (Math.abs(tx - ox[i]) > 0.05 || Math.abs(ty - oy[i]) > 0.05) moving = true
        }
      }
      return moving
    }

    function draw() {
      ctx!.clearRect(0, 0, w, h)
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const i = r * cols + c
          const x = c * GAP + GAP / 2 + ox[i], y = r * GAP + GAP / 2 + oy[i]
          const near = Math.hypot(ox[i], oy[i]) / PUSH // 0 at rest, up to ~1 near the cursor
          ctx!.fillStyle = near > 0.15 ? hot : base
          ctx!.globalAlpha = near > 0.15 ? Math.min(1, 0.35 + near) : 1
          ctx!.beginPath()
          ctx!.arc(x, y, near > 0.15 ? 1.6 : 1.1, 0, Math.PI * 2)
          ctx!.fill()
        }
      }
      ctx!.globalAlpha = 1
    }

    function loop() {
      const moving = step()
      draw()
      frame = moving ? requestAnimationFrame(loop) : 0
    }
    function kick() { if (!frame && !reduced) frame = requestAnimationFrame(loop) }

    const onMove = (e: PointerEvent) => { mx = e.clientX; my = e.clientY; kick() }
    const onLeave = () => { mx = -1e4; my = -1e4; kick() }
    const scheme = window.matchMedia('(prefers-color-scheme: dark)')
    const onScheme = () => { readColors(); draw() }

    readColors()
    resize()
    window.addEventListener('resize', resize)
    window.addEventListener('pointermove', onMove, { passive: true })
    document.addEventListener('pointerleave', onLeave)
    scheme.addEventListener('change', onScheme)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', resize)
      window.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerleave', onLeave)
      scheme.removeEventListener('change', onScheme)
    }
  }, [])

  return <canvas ref={ref} className="dot-field" aria-hidden="true" />
}
