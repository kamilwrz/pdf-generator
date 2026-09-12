/**
 * Resolve literal localisation calls for legacy structural source assertions.
 * This is a copy compiler, not a runtime mock: keys must exist and parameters
 * remain the original JS expressions. Behaviour and EN switching are covered
 * separately by runtime/browser tests. Non-source files are read unchanged.
 */
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import pl from '../src/i18n/locales/pl.json' with { type: 'json' };
const require = createRequire(import.meta.url);
const { parse } = require('@babel/parser');
const traverse = require('@babel/traverse').default;

export async function readPresentationSource(file, encoding) {
  return compilePresentation(await readFile(file, encoding), file);
}
export function readPresentationSourceSync(file, encoding) {
  return compilePresentation(readFileSync(file, encoding), file);
}
function compilePresentation(source, file) {
  if (!/\.(jsx|js)$/.test(String(file)) || typeof source !== 'string') return source;
  const ast = parse(source, { sourceType: 'module', plugins: ['jsx'] });
  const edits = [];
  traverse(ast, { CallExpression(path) {
    const node = path.node;
    if (!['uiText', 'messageRef'].includes(node.callee.name) || node.arguments[0]?.type !== 'StringLiteral') return;
    if (path.findParent((p) => p.isCallExpression() && ['uiText', 'messageRef'].includes(p.node.callee.name))) return;
    const [namespace, key] = node.arguments[0].value.split(':');
    const text = pl[namespace]?.[key];
    if (typeof text !== 'string') throw new Error(`Unknown translation in source contract: ${node.arguments[0].value}`);
    const properties = node.arguments[1]?.properties || [];
    const parameters = Object.fromEntries(properties.filter((p) => p.type === 'ObjectProperty').map((p) => [p.key.name || p.key.value, source.slice(p.value.start, p.value.end)]));
    const dynamic = /{{/.test(text);
    let code = dynamic ? '`' + text.replaceAll('`', '\`').replace(/{{\s*([^}]+)\s*}}/g, (_, name) => '${' + (parameters[name.trim()] || 'undefined') + '}') + '`' : JSON.stringify(text);
    let start = node.start, end = node.end;
    if (path.parent.type === 'JSXExpressionContainer' && !dynamic) {
      start = path.parent.start; end = path.parent.end;
      if (path.parentPath.parent.type !== 'JSXAttribute') code = text;
    }
    const getter = path.findParent((p) => p.isObjectMethod() && p.node.kind === 'get');
    if (getter && getter.node.body.body.length === 1) {
      start = getter.node.start; end = getter.node.end;
      code = source.slice(getter.node.key.start, getter.node.key.end) + ': ' + code;
    }
    edits.push({ start, end, code });
  } });
  let result = source;
  for (const edit of edits.sort((a, b) => b.start - a.start)) result = result.slice(0, edit.start) + edit.code + result.slice(edit.end);
  return result;
}
