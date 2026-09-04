import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import TemplatesModal from "./TemplatesModal";

const mocks = vi.hoisted(() => ({
    loadTemplate: vi.fn(),
    loadAiElements: vi.fn(),
    fillTemplate: vi.fn(),
}));

vi.mock("../../../store/canvas-context", () => ({
    useCanvasContext: () => ({ ...mocks, A4_Elements: [], flowSpacing: {} }),
}));
vi.mock("../../../store/session-context", () => ({
    useSession: () => ({ entitlements: { template_tier: "all" } }),
}));
vi.mock("../../../store/ui-surfaces-context", () => ({
    useUiSurfaces: () => ({ isTemplates: true, showTemplates: vi.fn() }),
}));
vi.mock("../../../templates", () => ({
    TEMPLATES: [
        { id: "static", name: "Static layout", tier: "free", elements: [] },
        { id: "generated", name: "Generated layout", tier: "paid" },
    ],
}));
vi.mock("../../../services/fillTemplate", () => ({ fillTemplate: mocks.fillTemplate }));

beforeEach(() => {
    mocks.fillTemplate.mockResolvedValue({ elements: [] });
});
afterEach(cleanup);

it("opens a static template with an empty document title", async () => {
    render(<TemplatesModal />);
    fireEvent.click(screen.getAllByRole("button", { name: "Użyj szablonu" })[0]);
    await waitFor(() => expect(mocks.loadTemplate).toHaveBeenCalledWith([], "", "static"));
});

it("opens a generated template with an empty document title", async () => {
    render(<TemplatesModal />);
    fireEvent.click(screen.getAllByRole("button", { name: "Użyj szablonu" })[1]);
    await waitFor(() => expect(mocks.loadAiElements).toHaveBeenCalledWith(
        [], "", "generated", expect.objectContaining({ cvData: expect.any(Object) }),
    ));
});
