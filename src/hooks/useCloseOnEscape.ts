import { useHotkey } from "@tanstack/react-hotkeys"

/** Close a modal or overlay when Escape is pressed. */
export function useCloseOnEscape(onClose: () => void, enabled = true) {
  useHotkey("Escape", onClose, {
    enabled,
    meta: { name: "Close", description: "Close dialog" },
  })
}
