import { ESLint } from '../frontend/node_modules/eslint/lib/api.js';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const files = ['src/hooks/useA4Elements.js', 'src/pages/PdfCanvas.jsx'];
const eslint = new ESLint({ cwd: resolve('frontend') });
for (const file of files) {
  const old = execFileSync('git', ['show', `HEAD:frontend/${file}`], { encoding: 'utf8' });
  const current = readFileSync(`frontend/${file}`, 'utf8');
  const counts = (results) => results.flatMap((result) => result.messages)
    .reduce((acc, message) => {
      const key = `${message.severity}:${message.ruleId}`;
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
  const before = counts(await eslint.lintText(old, { filePath: resolve('frontend', file) }));
  const after = counts(await eslint.lintText(current, { filePath: resolve('frontend', file) }));
  console.log(JSON.stringify({ file, before, after, unchanged: JSON.stringify(before) === JSON.stringify(after) }));
}
