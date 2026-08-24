// One-off dev utility: dumps the starter arrays that use generated mockups so
// the backend renderer can feed them straight into PDF_Generator without
// re-transcribing layout geometry. Not part of the app build — run manually
// with `node frontend/scripts/dump-iconic-templates.mjs`.
import { writeFileSync } from "node:fs";
import { voltTemplate } from "../src/templates/iconic.js";
import { monumentTemplate } from "../src/templates/monument.js";
import { tesseraTemplate } from "../src/templates/tessera.js";
import { slateTemplate } from "../src/templates/slate.js";
import { porticoTemplate } from "../src/templates/portico.js";
import { atriumTemplate } from "../src/templates/atrium.js";
import { sterlingTemplate } from "../src/templates/sterling.js";
import { regentTemplate } from "../src/templates/regent.js";
import { meridianTemplate } from "../src/templates/meridian.js";
import { vestigeTemplate } from "../src/templates/vestige.js";
import { archiveTemplate } from "../src/templates/archive.js";

const out = {
    volt: voltTemplate,
    monument: monumentTemplate,
    tessera: tesseraTemplate,
    slate: slateTemplate,
    portico: porticoTemplate,
    atrium: atriumTemplate,
    sterling: sterlingTemplate,
    regent: regentTemplate,
    meridian: meridianTemplate,
    vestige: vestigeTemplate,
    archive: archiveTemplate,
};
writeFileSync(new URL("./iconic-templates.json", import.meta.url), JSON.stringify(out, null, 2));
console.log("wrote iconic-templates.json");
