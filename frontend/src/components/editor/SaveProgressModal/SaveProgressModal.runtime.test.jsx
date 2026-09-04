import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import SaveProgressModal from "./SaveProgressModal";

afterEach(cleanup);

describe("SaveProgressModal", () => {
    it("describes persistence without presenting it as a PDF download", () => {
        render(<SaveProgressModal phase="persist" title="CV Kamil" />);

        expect(screen.getByRole("dialog", { name: "Zapisujemy Twoje CV" })).toHaveAttribute("aria-modal", "true");
        expect(screen.getByRole("status")).toHaveTextContent("Aktualny etap: Zapis w Moich dokumentach");
        expect(screen.getByText("Plik PDF nie zostanie teraz pobrany.", { exact: false })).toBeInTheDocument();
        expect(screen.getByText("CV Kamil.pdf")).toBeInTheDocument();
        expect(screen.getByRole("progressbar", { name: "Postęp zapisu CV" })).toHaveAttribute("aria-valuenow", "67");
    });

    it("marks real save phases as completed, current and queued", () => {
        render(<SaveProgressModal phase="persist" />);

        expect(screen.getByText("Przygotowanie CV").closest("li")).toHaveTextContent("Gotowe");
        expect(screen.getByText("Zapis w Moich dokumentach").closest("li")).toHaveAttribute("aria-current", "step");
        expect(screen.getByText("Potwierdzenie wersji").closest("li")).toHaveTextContent("Oczekuje");
    });

    it("renders nothing when closed", () => {
        render(<SaveProgressModal open={false} />);

        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("returns focus to the save action when the disabled opener lost focus", async () => {
        const saveButton = document.createElement("button");
        saveButton.setAttribute("aria-label", "Zapisz dokument");
        document.body.appendChild(saveButton);
        const { rerender } = render(<SaveProgressModal />);
        await waitFor(() => expect(screen.getByRole("dialog")).toHaveFocus());

        rerender(<SaveProgressModal open={false} />);

        await waitFor(() => expect(saveButton).toHaveFocus());
        saveButton.remove();
    });
});
