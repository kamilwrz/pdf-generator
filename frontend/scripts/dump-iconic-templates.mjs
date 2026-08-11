// One-off dev utility: dumps the starter arrays that use generated mockups so
// the backend renderer can feed them straight into PDF_Generator without
// re-transcribing layout geometry. Not part of the app build — run manually
// with `node frontend/scripts/dump-iconic-templates.mjs`.
import { writeFileSync } from "node:fs";
import { novaTemplate, voltTemplate } from "../src/templates/iconic.js";
import { monumentTemplate } from "../src/templates/monument.js";
import { wordsTemplate } from "../src/templates/words.js";
import { cardinalTemplate } from "../src/templates/cardinal.js";
import { harborTemplate } from "../src/templates/harbor.js";
import { tesseraTemplate } from "../src/templates/tessera.js";
import { slateTemplate } from "../src/templates/slate.js";
import { porticoTemplate } from "../src/templates/portico.js";
import { axisTemplate } from "../src/templates/axis.js";
import { atriumTemplate } from "../src/templates/atrium.js";
import { regentTemplate } from "../src/templates/regent.js";
import { aureliaTemplate } from "../src/templates/aurelia.js";
import { blueprintTemplate } from "../src/templates/blueprint.js";
import { manifestTemplate } from "../src/templates/manifest.js";
import { sterlingTemplate } from "../src/templates/sterling.js";
import { ledgerTemplate } from "../src/templates/ledger.js";
import { nimbusTemplate } from "../src/templates/nimbus.js";
import { cinderTemplate } from "../src/templates/cinder.js";
import { kernelTemplate } from "../src/templates/kernel.js";
import { aldineTemplate } from "../src/templates/aldine.js";

const out = {
    nova: novaTemplate,
    volt: voltTemplate,
    monument: monumentTemplate,
    words: wordsTemplate,
    cardinal: cardinalTemplate,
    harbor: harborTemplate,
    tessera: tesseraTemplate,
    slate: slateTemplate,
    portico: porticoTemplate,
    axis: axisTemplate,
    atrium: atriumTemplate,
    regent: regentTemplate,
    aurelia: aureliaTemplate,
    blueprint: blueprintTemplate,
    manifest: manifestTemplate,
    sterling: sterlingTemplate,
    ledger: ledgerTemplate,
    nimbus: nimbusTemplate,
    cinder: cinderTemplate,
    kernel: kernelTemplate,
    aldine: aldineTemplate,
};
writeFileSync(new URL("./iconic-templates.json", import.meta.url), JSON.stringify(out, null, 2));
console.log("wrote iconic-templates.json");
