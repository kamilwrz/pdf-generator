import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import ScopedAiProvider from "./ScopedAiProvider";
import { useScopedAi } from "../../../store/scoped-ai-context";
import { CanvasTestContext } from "../../../store/canvas-context";

const mocks = vi.hoisted(() => ({ request: vi.fn(), epoch: 1, enabled: true }));
vi.mock("../../../services/api", () => ({
  ENDPOINTS: { AI: { ASSISTANT: "/ai/assistant" } },
  ApiClient: class { httpRequest(...args) { return mocks.request(...args); } },
}));
vi.mock("../../../store/canvas-context", async () => {
  const { createContext, useContext } = await import("react");
  const CanvasTestContext = createContext(null);
  return { CanvasTestContext, useCanvasContext: () => useContext(CanvasTestContext) };
});
vi.mock("../../../store/session-context", () => ({ useSession: () => ({ entitlements: { ai_assistant: true, scoped_ai: mocks.enabled } }) }));
vi.mock("../../../store/document-lifecycle-context", () => ({ useDocumentLifecycle: () => ({
  captureDocumentScope: () => ({ epoch: mocks.epoch }),
  isDocumentScopeCurrent: (scope) => scope.epoch === mocks.epoch,
}) }));

const before = "Tworzę i projektuję interfejsy React.";
const after = "Projektuję interfejsy React.";
const fixture = [
  { element_id: "head", category: "text", content: "Podsumowanie", flowRole: "section-chrome", top: 100, left: 66, page: 1 },
  { element_id: "body", category: "textarea", content: before, top: 130, left: 66, page: 1, width: 450, height: 30 },
];
const response = () => ({ message: "Propozycja", scoped_corrections: [{ fragment_id: "body:0", before, content: after }], achievement_templates: [] });
function Trigger() {
  const ai = useScopedAi();
  return <button onClick={(event) => ai.open({ kind: "section", headingId: "head" }, "shorten", event.currentTarget)}>Uruchom</button>;
}
function Harness() {
  const [elements, setElements] = useState(fixture);
  const canvas = { A4_Elements: elements, pageSize: { height: 842 }, setActiveCvData: vi.fn(),
    applyScopedTextPatches: (patches) => {
      const next = elements.map((element) => ({ ...element, ...(patches.find((p) => p.element_id === element.element_id) || {}) }));
      setElements(next);
      return { before: elements, after: next };
    } };
  return <CanvasTestContext.Provider value={canvas}><ScopedAiProvider><Trigger /><output data-testid="body">{elements[1].content}</output>
    <button onClick={() => setElements(elements.map((e) => e.element_id === "body" ? { ...e, content: "Manualna zmiana" } : e))}>Edytuj</button>
  </ScopedAiProvider></CanvasTestContext.Provider>;
}

beforeEach(() => {
  mocks.enabled = true;
  mocks.epoch = 1;
  mocks.request.mockReset();
});
afterEach(cleanup);

describe("scoped review lifecycle", () => {
  it("previews without mutation and applies only after acceptance", async () => {
    mocks.request.mockResolvedValue(response());
    render(<Harness />);
    fireEvent.click(screen.getByText("Uruchom"));
    await screen.findByText("Zastosuj wszystkie");
    expect(screen.getByTestId("body")).toHaveTextContent(before);
    const sent = JSON.parse(mocks.request.mock.calls[0][2]);
    expect(Object.keys(sent).sort()).toEqual(["action", "scoped_content"]);
    fireEvent.click(screen.getByText("Zastosuj wszystkie"));
    expect(screen.getByTestId("body")).toHaveTextContent(after);
  });

  it("blocks stale proposals instead of overwriting manual edits", async () => {
    mocks.request.mockResolvedValue(response());
    render(<Harness />);
    fireEvent.click(screen.getByText("Uruchom"));
    await screen.findByText("Zastosuj wszystkie");
    fireEvent.click(screen.getByText("Edytuj"));
    expect(screen.getByText("Zastosuj wszystkie")).toBeDisabled();
    expect(screen.getByText("Wygeneruj ponownie")).toBeEnabled();
    expect(screen.getByTestId("body")).toHaveTextContent("Manualna zmiana");
  });

  it("retries the same failed logical request with the same idempotency key", async () => {
    mocks.request.mockRejectedValueOnce(new Error("Sieć niedostępna")).mockResolvedValue(response());
    render(<Harness />);
    fireEvent.click(screen.getByText("Uruchom"));
    fireEvent.click(await screen.findByText("Ponów żądanie"));
    await screen.findByText("Zastosuj wszystkie");
    expect(mocks.request.mock.calls[0][4].headers).toEqual(mocks.request.mock.calls[1][4].headers);
    expect(mocks.request.mock.calls[0][2]).toEqual(mocks.request.mock.calls[1][2]);
  });

  it("does not issue parallel requests and ignores a late response after document replacement", async () => {
    let resolve;
    mocks.request.mockImplementation(() => new Promise((done) => { resolve = done; }));
    render(<Harness />);
    fireEvent.click(screen.getByText("Uruchom"));
    await waitFor(() => expect(mocks.request).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByText("Uruchom"));
    expect(mocks.request).toHaveBeenCalledTimes(1);
    mocks.epoch = 2;
    await act(async () => resolve(response()));
    expect(screen.queryByText("Zastosuj wszystkie")).not.toBeInTheDocument();
    expect(screen.getByTestId("body")).toHaveTextContent(before);
  });

  it("blocks scoped AI without Premium even with the generic assistant flag", async () => {
    mocks.enabled = false;
    render(<Harness />);
    fireEvent.click(screen.getByText("Uruchom"));
    expect(screen.queryByRole("button", { name: "Zamknij propozycje AI" })).not.toBeInTheDocument();
    expect(mocks.request).not.toHaveBeenCalled();
  });
});
