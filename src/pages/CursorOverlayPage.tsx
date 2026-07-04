import { useEffect, useRef, useState } from "react"
import { listen } from "@tauri-apps/api/event"

interface CursorPos {
  x: number
  y: number
}

interface Ripple {
  id: number
  x: number
  y: number
}

export function CursorOverlayPage() {
  const [pos, setPos] = useState<CursorPos>({ x: -100, y: -100 })
  const [down, setDown] = useState(false)
  const [ripples, setRipples] = useState<Ripple[]>([])
  const rippleId = useRef(0)

  useEffect(() => {
    const unsubs: Array<() => void> = []

    listen<CursorPos>("cursor-pos", (e) => {
      setPos({ x: e.payload.x, y: e.payload.y })
    }).then((fn) => unsubs.push(fn))

    const onDown = (e: MouseEvent) => {
      setDown(true)
      const id = ++rippleId.current
      setRipples((r) => [...r.slice(-8), { id, x: e.clientX, y: e.clientY }])
      setTimeout(() => setRipples((r) => r.filter((x) => x.id !== id)), 600)
    }
    const onUp = () => setDown(false)

    window.addEventListener("mousedown", onDown)
    window.addEventListener("mouseup", onUp)
    unsubs.push(() => {
      window.removeEventListener("mousedown", onDown)
      window.removeEventListener("mouseup", onUp)
    })

    return () => { unsubs.forEach((fn) => fn()) }
  }, [])

  return (
    <div
      className="pointer-events-none fixed inset-0 overflow-hidden"
      style={{ background: "transparent" }}
    >
      {/* Spotlight ring */}
      <div
        className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full transition-[width,height,opacity] duration-75"
        style={{
          left: pos.x,
          top: pos.y,
          width: down ? 56 : 72,
          height: down ? 56 : 72,
          boxShadow: down
            ? "0 0 0 3px rgba(249,115,22,0.95), 0 0 24px 8px rgba(249,115,22,0.35)"
            : "0 0 0 2px rgba(249,115,22,0.75), 0 0 32px 12px rgba(249,115,22,0.25)",
          background: "radial-gradient(circle, rgba(249,115,22,0.12) 0%, transparent 70%)",
        }}
      />

      {/* Click ripples */}
      {ripples.map((r) => (
        <div
          key={r.id}
          className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-orange-400/90"
          style={{
            left: r.x,
            top: r.y,
            width: 24,
            height: 24,
            animation: "cursor-ripple 0.55s ease-out forwards",
          }}
        />
      ))}

      <style>{`
        @keyframes cursor-ripple {
          from { transform: translate(-50%, -50%) scale(0.4); opacity: 1; }
          to   { transform: translate(-50%, -50%) scale(3.5); opacity: 0; }
        }
      `}</style>
    </div>
  )
}
