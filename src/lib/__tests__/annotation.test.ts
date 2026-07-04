import { describe, it, expect } from "vitest"
import { AnnotationLayer, clientToNorm, contentRectContain, RECORDING_ASPECT } from "@/lib/annotation"

describe("contentRectContain", () => {
  it("letterboxes wide containers", () => {
    const r = contentRectContain(160, 90, RECORDING_ASPECT)
    expect(r.w).toBe(160)
    expect(r.h).toBe(90)
    expect(r.x).toBe(0)
    expect(r.y).toBe(0)
  })

  it("pillarboxes tall containers", () => {
    const r = contentRectContain(100, 100, RECORDING_ASPECT)
    expect(r.w).toBe(100)
    expect(r.h).toBeCloseTo(100 / RECORDING_ASPECT)
    expect(r.y).toBeGreaterThan(0)
  })
})

describe("clientToNorm", () => {
  it("maps center of a 16:9 box to 0.5, 0.5", () => {
    const rect = { left: 0, top: 0, width: 320, height: 180, right: 320, bottom: 180, x: 0, y: 0, toJSON: () => ({}) }
    const p = clientToNorm(160, 90, rect as DOMRect)
    expect(p).toEqual({ x: 0.5, y: 0.5 })
  })
})

describe("AnnotationLayer", () => {
  it("stores and clears strokes", () => {
    const layer = new AnnotationLayer()
    layer.beginStroke({ tool: "pen", color: "#f00", width: 4 }, { x: 0.1, y: 0.2 })
    layer.extendStroke({ x: 0.5, y: 0.5 })
    layer.endStroke()
    expect(layer.revision).toBeGreaterThan(0)
    layer.undo()
    layer.clear()
  })
})
