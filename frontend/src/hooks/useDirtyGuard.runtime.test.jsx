import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useDirtyGuard } from "./useDirtyGuard";

vi.mock("react-router-dom", () => ({ useBlocker: () => ({ state: "unblocked" }) }));
afterEach(cleanup);

function setup(initial = {}) {
  return renderHook((props) => useDirtyGuard(props), {
    initialProps: { signature: "saved", isGuest: false, ...initial },
  });
}

describe("unsaved work decisions", () => {
  it("does not warn for unchanged or fully reverted saved content", async () => {
    const { result, rerender } = setup();
    expect(await result.current.confirmDiscard()).toBe(true);
    rerender({ signature: "edited", isGuest: false });
    expect(result.current.dirty).toBe(true);
    rerender({ signature: "saved", isGuest: false });
    expect(result.current.dirty).toBe(false);
    expect(await result.current.confirmDiscard()).toBe(true);
  });

  it("protects a never-saved account CV even when its local baseline matches", async () => {
    const { result } = setup({ hasUnpersistedDocument: true });
    let pending;
    act(() => { pending = result.current.confirmDiscard(); });
    expect(result.current.dialogOpen).toBe(true);
    act(() => result.current.cancelDialogDiscard());
    expect(await pending).toBe(false);
  });

  it("flushes the guest draft without showing an account-save dialog", async () => {
    const flushGuestDraft = vi.fn();
    const { result, rerender } = setup({ isGuest: true, flushGuestDraft });
    rerender({ signature: "edited", isGuest: true, flushGuestDraft });
    expect(await result.current.confirmDiscard()).toBe(true);
    expect(flushGuestDraft).toHaveBeenCalledOnce();
    expect(result.current.dialogOpen).toBe(false);
  });

  it("keeps newer edits protected and prevents duplicate save submissions", async () => {
    const { result, rerender } = setup();
    rerender({ signature: "submitted", isGuest: false });
    let navigation;
    act(() => { navigation = result.current.confirmDiscard(); });
    let finishSave;
    const save = vi.fn(() => new Promise((resolve) => { finishSave = resolve; }));
    let firstSave;
    act(() => { firstSave = result.current.confirmDialogSave(save); });
    await act(async () => { expect(await result.current.confirmDialogSave(save)).toBe(false); });
    expect(save).toHaveBeenCalledOnce();
    rerender({ signature: "later edit", isGuest: false });
    await act(async () => {
      result.current.markClean("submitted");
      finishSave(true);
      expect(await firstSave).toBe(false);
    });
    expect(result.current.dirty).toBe(true);
    expect(result.current.dialogOpen).toBe(true);
    expect(result.current.dialogError).toContain("nowe zmiany");
    act(() => result.current.cancelDialogDiscard());
    expect(await navigation).toBe(false);
  });
});
