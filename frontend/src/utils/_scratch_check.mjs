import { buildSectionElements, SECTION_LAYOUTS } from './sectionBuilder.js';
import { appendSectionAtEnd, deriveSectionStyle } from './sectionStructure.js';

const pageHeight = 842;
const rhythm = { stack: 4, record: 10, section: 21, after_rule: 8 };
const doc = [
  { element_id: 'name', category: 'text', flowRole: 'masthead', content: 'Jan Kowalski', left: 76, top: 60, fontSize: 20, height: 24, page: 1 },
  { element_id: 'h1', category: 'text', flowRole: 'section-chrome', content: 'Doświadczenie', left: 76, top: 120, fontSize: 8.7, height: 12, page: 1 },
  { element_id: 'r1', category: 'line', flowRole: 'section-chrome', left: 76, top: 132, width: 466, height: 1, page: 1 },
  { element_id: 'b1', category: 'textarea', flowRole: 'content', autoHeight: true, left: 76, top: 150, width: 466, height: 60, fontSize: 9.3, page: 1 },
];
const style = deriveSectionStyle(doc, pageHeight);
console.log('style.rule =', style.rule);
console.log('style.heading =', style.heading);
const { elements: newElements, firstBodyId } = buildSectionElements({
  name: 'Kursy', layout: SECTION_LAYOUTS.RECORD_EDUCATION, style, spacing: rhythm, idFactory: (() => { let n = 0; return () => `id-${n++}`; })(),
});
const ruleId = newElements.find(e => e.category === 'line').element_id;
console.log('--- pre-append ---');
for (const e of newElements) {
  console.log(e.category.padEnd(10), 'top=', e.top, 'content=', (e.content || '').slice(0, 20));
}
const appended = appendSectionAtEnd(doc, newElements, pageHeight, { spacing: rhythm });
const rule = appended.find(e => e.element_id === ruleId);
const body = appended.find(e => e.element_id === firstBodyId);
console.log('--- post-append ---');
console.log('rule.top+height =', rule.top + rule.height);
console.log('body.top =', body.top);
console.log('gap =', body.top - (rule.top + rule.height), '(expected: 8)');
