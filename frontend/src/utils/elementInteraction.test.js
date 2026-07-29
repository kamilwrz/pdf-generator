import { isDecorativeChrome } from "./elementInteraction";

describe("isDecorativeChrome", () => {
  it("treats fixedToPage as non-interactive chrome", () => {
    expect(isDecorativeChrome({ fixedToPage: true })).toBe(true);
    expect(isDecorativeChrome({ fixedToPage: false })).toBe(false);
    expect(isDecorativeChrome({})).toBe(false);
    expect(isDecorativeChrome(null)).toBe(false);
  });
});
