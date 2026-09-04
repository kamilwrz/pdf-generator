import { act, renderHook } from "@testing-library/react";
import { expect, it } from "vitest";
import { useDocumentLifecycleController } from "./document-lifecycle-context";

it("preserves the conversation across templates while invalidating old canvas work", () => {
  const { result } = renderHook(() => useDocumentLifecycleController());
  const initialKey = result.current.conversationKey;
  const oldScope = result.current.captureDocumentScope();
  act(() => result.current.advanceDocumentSession({ preserveConversation: true }));
  expect(result.current.conversationKey).toBe(initialKey);
  expect(result.current.isDocumentScopeCurrent(oldScope)).toBe(false);
  expect(result.current.sessionKey).not.toBe(String(oldScope.epoch));
  act(() => result.current.advanceDocumentSession());
  expect(result.current.conversationKey).not.toBe(initialKey);
});
