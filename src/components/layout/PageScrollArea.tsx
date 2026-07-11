import { ScrollArea } from "@/components/ui/scroll-area"
import { useScrollToTop } from "@/hooks/useScrollToTop"
import { cn } from "@/lib/utils"

interface PageScrollAreaProps {
  children: React.ReactNode
  className?: string
  /** When true, scrolls to top (pass view-active state from App). */
  active?: boolean
}

export function PageScrollArea({ children, className, active = true }: PageScrollAreaProps) {
  const viewportRef = useScrollToTop(active)

  return (
    <ScrollArea viewportRef={viewportRef} className={cn("min-h-0 flex-1", className)}>
      {children}
    </ScrollArea>
  )
}
