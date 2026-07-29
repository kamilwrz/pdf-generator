// Node ESM loader hook: lets the one-off dump script import Vite-style
// extensionless relative specifiers (`./foo` -> `./foo.js`) the same way
// Vite's dev server resolves them in the app. Not part of the app build.
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

export async function resolve(specifier, context, nextResolve) {
    if (specifier.startsWith(".") && !/\.[a-zA-Z]+$/.test(specifier)) {
        const base = fileURLToPath(new URL(specifier, context.parentURL));
        if (existsSync(base + ".js")) {
            return nextResolve(specifier + ".js", context);
        }
    }
    return nextResolve(specifier, context);
}

// Vite injects `import.meta.env` at build time; plain Node leaves it
// undefined. Stub it out only for this dump script so api.js's module-level
// `import.meta.env.VITE_API_URL` read doesn't throw — the resulting fallback
// URL is discarded anyway since the backend resolves `template-assets/`
// paths by pattern, not by host.
export async function load(url, context, nextLoad) {
    const result = await nextLoad(url, context);
    if (url.endsWith("/src/services/api.js") && result.source != null) {
        const text = result.source.toString().replace("import.meta.env", "({})");
        return { ...result, source: text };
    }
    return result;
}
