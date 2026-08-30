// One-off dev utility: dumps the starter arrays that use generated mockups so
// the backend renderer can feed them straight into PDF_Generator without
// re-transcribing layout geometry. Not part of the app build — run manually
// with `node frontend/scripts/dump-iconic-templates.mjs`.
import { writeFileSync } from "node:fs";
import { monumentTemplate } from "../src/templates/monument.js";
import { slateTemplate } from "../src/templates/slate.js";
import { atriumTemplate } from "../src/templates/atrium.js";
import { sterlingTemplate } from "../src/templates/sterling.js";
import { regentTemplate } from "../src/templates/regent.js";
import { meridianTemplate } from "../src/templates/meridian.js";
import { lindenTemplate } from "../src/templates/linden.js";
import { cadenzaTemplate } from "../src/templates/cadenza.js";
import { vellumTemplate } from "../src/templates/vellum.js";

const out = {
    monument: monumentTemplate,
    slate: slateTemplate,
    atrium: atriumTemplate,
    sterling: sterlingTemplate,
    regent: regentTemplate,
    meridian: meridianTemplate,
    linden: lindenTemplate,
    cadenza: cadenzaTemplate,
    vellum: vellumTemplate,
};
writeFileSync(new URL("./iconic-templates.json", import.meta.url), JSON.stringify(out, null, 2));
console.log("wrote iconic-templates.json");
