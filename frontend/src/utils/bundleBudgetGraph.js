/**
 * Resolves one manifest key for every route/entry predicate used by a budget.
 *
 * Failing on a missing or ambiguous match is intentional: a renamed lazy
 * route must never make CI report an artificially small bundle.
 *
 * @param {Record<string, object>} manifest - Vite build manifest.
 * @param {Array<(key: string, entry: object) => boolean>} predicates - Ordered
 * selectors for the application entry and the route chunk being measured.
 * @returns {string[]} Manifest keys in predicate order.
 */
export function findManifestEntryKeys(manifest, predicates) {
  const entries = Object.entries(manifest);
  return predicates.map((predicate, index) => {
    const matches = entries.filter(([key, entry]) => predicate(key, entry));
    if (matches.length !== 1) {
      throw new Error(
        `Unable to locate bundle-budget entry ${index + 1}: expected 1 manifest match, found ${matches.length}.`,
      );
    }
    return matches[0][0];
  });
}

/**
 * Collects the emitted files needed to synchronously evaluate manifest seeds.
 *
 * Only `imports` are traversed. `dynamicImports` represent later user actions
 * or other routes and therefore must not inflate the route's synchronous
 * budget. Shared chunks are de-duplicated through both visited manifest keys
 * and the returned file set.
 *
 * @param {Record<string, object>} manifest - Vite build manifest.
 * @param {string[]} seedKeys - Entry/lazy-route keys to evaluate together.
 * @returns {Set<string>} Emitted paths relative to `dist`.
 */
export function collectStaticManifestFiles(manifest, seedKeys) {
  const visited = new Set();
  const files = new Set();

  const visit = (key) => {
    if (visited.has(key)) return;
    visited.add(key);

    const entry = manifest[key];
    if (!entry) {
      throw new Error(`Manifest import ${key} is missing.`);
    }
    if (entry.file) files.add(entry.file);
    for (const cssFile of entry.css || []) files.add(cssFile);
    for (const assetFile of entry.assets || []) files.add(assetFile);
    for (const importKey of entry.imports || []) visit(importKey);
  };

  for (const seedKey of seedKeys) visit(seedKey);
  return files;
}
