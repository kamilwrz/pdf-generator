// @vitest-environment jsdom

import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import SaveGateModal from "./SaveGateModal";

function LocationProbe() {
  const location = useLocation();
  return <output aria-label="Aktualna trasa">{`${location.pathname}${location.search}`}</output>;
}

describe("SaveGateModal account decisions", () => {
  beforeEach(() => {
    window.requestAnimationFrame = (callback) => window.setTimeout(callback, 0);
    window.cancelAnimationFrame = (id) => window.clearTimeout(id);
  });

  afterEach(cleanup);

  it("explains the save value and focuses the primary registration action", async () => {
    render(
      <MemoryRouter initialEntries={["/cvstudio/guest"]}>
        <SaveGateModal open onCancel={vi.fn()} purpose="save" />
      </MemoryRouter>,
    );

    const dialog = screen.getByRole("dialog", { name: "Zapisz szkic na swoim koncie" });
    expect(dialog).toHaveTextContent("1 CV");
    expect(dialog).toHaveTextContent("3 pliki PDF");
    expect(dialog).toHaveTextContent("Szkic jest również zapisany lokalnie w tej przeglądarce.");
    await waitFor(() => expect(screen.getByRole("button", { name: "Utwórz darmowe konto" })).toHaveFocus());
  });

  it("describes a download without promising to save the project", () => {
    render(
      <MemoryRouter initialEntries={["/cvstudio/guest"]}>
        <SaveGateModal open onCancel={vi.fn()} purpose="download" />
      </MemoryRouter>,
    );

    const dialog = screen.getByRole("dialog", { name: "Pobierz CV jako plik PDF" });
    expect(dialog).toHaveTextContent("3 pliki PDF");
    expect(dialog).toHaveTextContent("Bez znaku wodnego");
    expect(dialog).toHaveTextContent("Pobranie nie zapisuje CV w „Moich dokumentach”");
    expect(dialog).not.toHaveTextContent("Zapisz szkic na swoim koncie");
  });

  it("preserves import intent for login without mounting a file input", () => {
    render(
      <MemoryRouter initialEntries={["/cvstudio/guest"]}>
        <SaveGateModal open onCancel={vi.fn()} purpose="import" />
        <LocationProbe />
      </MemoryRouter>,
    );

    const dialog = screen.getByRole("dialog", { name: "Kontynuuj import na swoim koncie" });
    expect(dialog).toHaveTextContent("1 import");
    expect(dialog).toHaveTextContent("Bez zmian");
    expect(dialog.querySelector('input[type="file"]')).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Zaloguj się" }));

    expect(screen.getByRole("status", { name: "Aktualna trasa" })).toHaveTextContent("/login?start=import");
  });
});
