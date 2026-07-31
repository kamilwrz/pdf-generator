import { register } from "node:module";

// Resolve from this module rather than the caller's working directory so the
// documented command works consistently from the repository root.
register(new URL("./resolve-js-ext-hook.mjs", import.meta.url));
