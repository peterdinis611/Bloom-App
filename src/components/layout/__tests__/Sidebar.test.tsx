import { describe, it, expect, vi, afterEach } from "vitest"
import { render, screen, fireEvent, cleanup } from "@testing-library/react"
import { TooltipProvider } from "@/components/ui/tooltip"
import { Sidebar } from "@/components/layout/Sidebar"

afterEach(cleanup)

describe("Sidebar", () => {
  it("renders all nav items", () => {
    render(<Sidebar view="record" onChange={() => {}} />)
    expect(screen.getByText("Record")).toBeTruthy()
    expect(screen.getByText("Library")).toBeTruthy()
    expect(screen.getByText("Settings")).toBeTruthy()
  })

  it("fires onChange when an inactive tab is clicked", () => {
    const onChange = vi.fn()
    render(<Sidebar view="record" onChange={onChange} />)
    fireEvent.click(screen.getByText("Library"))
    expect(onChange).toHaveBeenCalledWith("library")
  })

  it("does not fire onChange when locked", () => {
    const onChange = vi.fn()
    render(
      <TooltipProvider>
        <Sidebar view="record" onChange={onChange} locked />
      </TooltipProvider>,
    )
    fireEvent.click(screen.getByText("Library"))
    expect(onChange).not.toHaveBeenCalled()
  })
})
