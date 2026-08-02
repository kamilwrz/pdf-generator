// Cross-platform frontend unit-test runner for Node's built-in test harness.
//
// Windows shells do not expand recursive globs the way POSIX shells do, and
// passing directory paths to `node --test` treats each directory as one failed
// test. This script collects *.test.js files and re-executes Node with an
// explicit file list.
import { spawnSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const frontendRoot = fileURLToPath(new URL("..", import.meta.url));
const roots = [
  join(frontendRoot, "src", "utils"),
  join(frontendRoot, "src", "templates"),
  join(frontendRoot, "src", "hooks"),
  join(frontendRoot, "src", "services"),
  join(frontendRoot, "src", "components", "ai", "AiAssistant"),
];

function collectTests(dir) {
  const found = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      found.push(...collectTests(full));
    } else if (entry.endsWith(".test.js")) {
      found.push(full);
    }
  }
  return found;
}

const files = roots.flatMap(collectTests).sort();
if (files.length === 0) {
  console.error("No *.test.js files found under frontend/src");
  process.exit(1);
}

const relativeFiles = files.map((file) => relative(frontendRoot, file));
// Vite-style extensionless imports (e.g. from "./helpers") need the loader hook.
const result = spawnSync(
  process.execPath,
  ["--import", "./scripts/register-hook.mjs", "--test", ...relativeFiles],
  { cwd: frontendRoot, stdio: "inherit" },
);
process.exit(result.status ?? 1);
