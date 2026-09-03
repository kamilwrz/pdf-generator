import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import AddSectionModal from "./AddSectionModal";
import { SECTION_LAYOUTS, SECTION_TYPES } from "../../../utils/sectionBuilder";

describe("AddSectionModal", () => {
  beforeEach(() => {
    window.requestAnimationFrame = (callback) => window.setTimeout(callback, 0);
    window.cancelAnimationFrame = (id) => window.clearTimeout(id);
  });

  afterEach(cleanup);

  it("selects a concrete CV structure and submits its semantic preset", async () => {
    const onConfirm = vi.fn();
    render(
      <AddSectionModal
        open
        onCancel={vi.fn()}
        onConfirm={onConfirm}
      />,
    );

    const summary = screen.getByRole("radio", { name: /Podsumowanie/ });
    await waitFor(() => expect(summary).toHaveFocus());
    expect(screen.getAllByRole("radio")).toHaveLength(6);
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("radio", { name: /Doświadczenie/ }));
    fireEvent.click(screen.getByRole("button", { name: "Dodaj sekcję" }));

    expect(onConfirm).toHaveBeenCalledWith({
      name: "Doświadczenie",
      layout: SECTION_LAYOUTS.RECORD_EXPERIENCE,
      sectionType: SECTION_TYPES.EXPERIENCE,
      iconName: null,
    });
  });
});
