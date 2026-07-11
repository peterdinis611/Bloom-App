import { useEffect, useRef } from "react"

/** Scroll a Radix ScrollArea viewport (or any element) to top when `active` becomes true. */
export function useScrollToTop(active: boolean) {
  const viewportRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (active) {
      viewportRef.current?.scrollTo({ top: 0, behavior: "instant" })
    }
  }, [active])

  return viewportRef
}
