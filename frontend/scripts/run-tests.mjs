// Cross-platform frontend unit-test runner for Node's built-in test harness.
//
// Windows shells do not expand recursive globs the way POSIX shells do, and
// passing directory paths to `node --test` treats each directory as one failed
// test. This script collects *.test.js files and re-executes Node with an
// explicit file list.
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const frontendRoot = fileURLToPath(new URL("..", import.meta.url));
const sourceRoot = join(frontendRoot, "src");

function collectTests(dir) {
  const found = [];
  const entries = readdirSync(dir, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name, "en"));

  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...collectTests(full));
    } else if (entry.isFile() && entry.name.endsWith(".test.js")) {
      found.push(full);
    }
  }
  return found;
}

function portableRelativePath(file) {
  return relative(frontendRoot, file).split(sep).join("/");
}

const discoveredFiles = collectTests(sourceRoot)
  .map(portableRelativePath)
  .sort((left, right) => left.localeCompare(right, "en"));
const relativeFiles = [...new Set(discoveredFiles)];

if (relativeFiles.length !== discoveredFiles.length) {
  console.error("Duplicate frontend test files were discovered; refusing to run a partial or repeated suite.");
  process.exit(1);
}

if (relativeFiles.length === 0) {
  console.error("No *.test.js files found under frontend/src");
  process.exit(1);
}

const runnerArgs = process.argv.slice(2);
if (runnerArgs.includes("--list")) {
  if (runnerArgs.length !== 1) {
    console.error("--list cannot be combined with Node test-runner arguments.");
    process.exit(1);
  }

  console.log(relativeFiles.join("\n"));
  console.log(`Discovered ${relativeFiles.length} frontend test files.`);
  process.exit(0);
}

// Vite-style extensionless imports (e.g. from "./helpers") need the loader hook.
const result = spawnSync(
  process.execPath,
  ["--import", "./scripts/register-hook.mjs", "--test", ...runnerArgs, ...relativeFiles],
  { cwd: frontendRoot, stdio: "inherit" },
);

if (result.error) {
  console.error(`Unable to start the frontend test runner: ${result.error.message}`);
}

process.exit(result.status ?? 1);
