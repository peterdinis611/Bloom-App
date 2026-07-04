import type { LetterKey } from "@tanstack/react-hotkeys"
import type { AnnotationTool } from "@/hooks/useSettings"

export const ANNOTATION_TOOL_HOTKEYS: { hotkey: LetterKey; tool: AnnotationTool }[] = [
  { hotkey: "P", tool: "pen" },
  { hotkey: "H", tool: "highlighter" },
  { hotkey: "L", tool: "line" },
  { hotkey: "A", tool: "arrow" },
  { hotkey: "R", tool: "rect" },
  { hotkey: "C", tool: "circle" },
  { hotkey: "E", tool: "eraser" },
]
