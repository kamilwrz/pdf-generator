import { register } from "node:module";

// Resolve from this module rather than the caller's working directory so the
// documented command works consistently from the repository root.
register(new URL("./resolve-js-ext-hook.mjs", import.meta.url));

// Unit modules exercise workspace utilities outside the browser route loader.
const { ensureWorkspaceMessages } = await import("../src/i18n/index.js");
await ensureWorkspaceMessages();
