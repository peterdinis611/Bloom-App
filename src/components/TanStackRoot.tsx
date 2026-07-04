import { HotkeysProvider } from "@tanstack/react-hotkeys"
import { PacerProvider } from "@tanstack/react-pacer"
import { PACER } from "@/lib/pacer"

export function TanStackRoot({ children }: { children: React.ReactNode }) {
  return (
    <PacerProvider
      defaultOptions={{
        debouncer: { wait: PACER.search },
        throttler: { wait: 100 },
      }}
    >
      <HotkeysProvider
        defaultOptions={{
          hotkey: { preventDefault: true, stopPropagation: true },
        }}
      >
        {children}
      </HotkeysProvider>
    </PacerProvider>
  )
}

/** @deprecated Use TanStackRoot */
export const HotkeysRoot = TanStackRoot
