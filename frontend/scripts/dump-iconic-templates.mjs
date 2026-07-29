// One-off dev utility: dumps the four Iconic template element arrays to JSON
// so the backend mockup-rendering script can feed them straight into
// PDF_Generator without re-transcribing the layout by hand. Not part of the
// app build — run manually with `node frontend/scripts/dump-iconic-templates.mjs`.
import { writeFileSync } from "node:fs";
import { loomTemplate, novaTemplate, ridgeTemplate, voltTemplate } from "../src/templates/iconic.js";

const out = { nova: novaTemplate, ridge: ridgeTemplate, loom: loomTemplate, volt: voltTemplate };
writeFileSync(new URL("./iconic-templates.json", import.meta.url), JSON.stringify(out, null, 2));
console.log("wrote iconic-templates.json");
