import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import DownloadProgressModal from "./DownloadProgressModal";

afterEach(cleanup);

describe("DownloadProgressModal", () => {
    it("describes local delivery without implying that the project is saved", () => {
        render(<DownloadProgressModal phase="render" title="CV Kamil" />);

        expect(screen.getByRole("dialog", { name: "Przygotowujemy plik PDF" })).toHaveAttribute("aria-modal", "true");
        expect(screen.getByRole("status")).toHaveTextContent("Aktualny etap: Generowanie pliku PDF");
        expect(screen.getByText("Projekt w edytorze i Moich dokumentach pozostanie bez zmian.", { exact: false })).toBeInTheDocument();
        expect(screen.getByText("CV Kamil.pdf")).toBeInTheDocument();
        expect(screen.getByRole("progressbar", { name: "Postęp pobierania CV" })).toHaveAttribute("aria-valuenow", "67");
    });

    it("marks download phases as completed, current and queued", () => {
        render(<DownloadProgressModal phase="render" />);

        expect(screen.getByText("Przygotowanie stron").closest("li")).toHaveTextContent("Gotowe");
        expect(screen.getByText("Generowanie pliku PDF").closest("li")).toHaveAttribute("aria-current", "step");
        expect(screen.getByText("Rozpoczęcie pobierania").closest("li")).toHaveTextContent("Oczekuje");
    });

    it("returns focus to the download action when the opener becomes available again", async () => {
        const downloadButton = document.createElement("button");
        downloadButton.setAttribute("aria-label", "Pobierz PDF");
        document.body.appendChild(downloadButton);
        const { rerender } = render(<DownloadProgressModal />);
        await waitFor(() => expect(screen.getByRole("dialog")).toHaveFocus());

        rerender(<DownloadProgressModal open={false} />);

        await waitFor(() => expect(downloadButton).toHaveFocus());
        downloadButton.remove();
    });
});
