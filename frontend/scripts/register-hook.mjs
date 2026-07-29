import { register } from "node:module";
import { pathToFileURL } from "node:url";

register("./resolve-js-ext-hook.mjs", pathToFileURL("./"));
