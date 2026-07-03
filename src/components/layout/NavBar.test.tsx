import { describe, it, expect, vi, afterEach } from "vitest"
import { render, screen, fireEvent, cleanup } from "@testing-library/react"
import { TooltipProvider } from "@/components/ui/tooltip"
import { NavBar } from "@/components/layout/NavBar"

afterEach(cleanup)

describe("NavBar", () => {
  it("renders both tabs", () => {
    render(<NavBar view="record" onChange={() => {}} />)
    expect(screen.getByText("Record")).toBeTruthy()
    expect(screen.getByText("Library")).toBeTruthy()
  })

  it("fires onChange when an inactive tab is clicked", () => {
    const onChange = vi.fn()
    render(<NavBar view="record" onChange={onChange} />)
    fireEvent.click(screen.getByText("Library"))
    expect(onChange).toHaveBeenCalledWith("library")
  })

  it("does not fire onChange for the already-active tab click when locked-out tabs are disabled", () => {
    const onChange = vi.fn()
    render(
      <TooltipProvider>
        <NavBar view="record" onChange={onChange} locked />
      </TooltipProvider>,
    )
    // The other tab is disabled while locked → clicking it is a no-op.
    fireEvent.click(screen.getByText("Library"))
    expect(onChange).not.toHaveBeenCalled()
  })
})
