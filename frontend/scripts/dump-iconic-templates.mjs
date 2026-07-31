// One-off dev utility: dumps the starter arrays that use generated mockups so
// the backend renderer can feed them straight into PDF_Generator without
// re-transcribing layout geometry. Not part of the app build — run manually
// with `node frontend/scripts/dump-iconic-templates.mjs`.
import { writeFileSync } from "node:fs";
import { loomTemplate, novaTemplate, ridgeTemplate, voltTemplate } from "../src/templates/iconic.js";
import { monumentTemplate } from "../src/templates/monument.js";

const out = {
    nova: novaTemplate,
    ridge: ridgeTemplate,
    loom: loomTemplate,
    volt: voltTemplate,
    monument: monumentTemplate,
};
writeFileSync(new URL("./iconic-templates.json", import.meta.url), JSON.stringify(out, null, 2));
console.log("wrote iconic-templates.json");
