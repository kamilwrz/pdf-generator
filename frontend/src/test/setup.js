import "@testing-library/jest-dom/vitest";

// Runtime component tests should fail on browser API gaps instead of silently
// depending on state leaked from another case. Add narrow polyfills beside the
// component test that needs them rather than growing a fake browser globally.
