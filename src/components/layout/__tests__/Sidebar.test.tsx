import { describe, it, expect, vi, afterEach } from "vitest"
import { render, screen, fireEvent, cleanup } from "@testing-library/react"
import { TooltipProvider } from "@/components/ui/tooltip"
import { Sidebar } from "@/components/layout/Sidebar"
import { sk } from "@/lib/i18n/sk"

vi.mock("@/hooks/useExportQueue", () => ({
  useExportQueue: () => ({
    items: [],
    activeCount: 0,
    enqueue: () => {},
    cancelItem: () => {},
    clearFinished: () => {},
  }),
  ExportQueueProvider: ({ children }: { children: React.ReactNode }) => children,
}))

afterEach(cleanup)

function wrap(ui: React.ReactElement) {
  return <TooltipProvider>{ui}</TooltipProvider>
}

describe("Sidebar", () => {
  it("renders all nav items", () => {
    render(wrap(<Sidebar view="record" onChange={() => {}} />))
    expect(screen.getByText(sk.nav.record)).toBeTruthy()
    expect(screen.getByText(sk.nav.library)).toBeTruthy()
    expect(screen.getByText(sk.nav.news)).toBeTruthy()
    expect(screen.getByText(sk.nav.settings)).toBeTruthy()
    expect(screen.getByText(sk.nav.docs)).toBeTruthy()
  })

  it("fires onChange when an inactive tab is clicked", () => {
    const onChange = vi.fn()
    render(wrap(<Sidebar view="record" onChange={onChange} />))
    fireEvent.click(screen.getByText(sk.nav.library))
    expect(onChange).toHaveBeenCalledWith("library")
  })

  it("does not fire onChange when locked", () => {
    const onChange = vi.fn()
    render(wrap(<Sidebar view="record" onChange={onChange} locked />))
    fireEvent.click(screen.getByText(sk.nav.library))
    expect(onChange).not.toHaveBeenCalled()
  })
})
