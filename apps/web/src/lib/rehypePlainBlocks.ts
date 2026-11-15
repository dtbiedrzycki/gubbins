import type { Element, ElementContent, Root, RootContent } from 'hast';

const HEADINGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);
const BR: Element = { type: 'element', tagName: 'br', properties: {}, children: [] };

const text = (value: string): ElementContent => ({ type: 'text', value });
const paragraph = (children: ElementContent[]): Element => ({ type: 'element', tagName: 'p', properties: {}, children });
const elements = (nodes: ElementContent[], ...tags: string[]) =>
  nodes.filter((n): n is Element => n.type === 'element' && tags.includes(n.tagName));

/** Lines joined by line breaks. */
function lines(rows: ElementContent[][]): ElementContent[] {
  return rows.flatMap((row, i) => (i === 0 ? row : [{ ...BR }, ...row]));
}

function textOf(node: ElementContent): string {
  if (node.type === 'text') return node.value;
  return node.type === 'element' ? node.children.map(textOf).join('') : '';
}

function codeAsParagraph(pre: Element): Element {
  const code = pre.children.map(textOf).join('').replace(/\n$/, '');
  return paragraph(lines(code.split('\n').map((line) => [text(line)])));
}

function tableAsParagraph(table: Element): Element {
  const rows = elements(table.children, 'thead', 'tbody').flatMap((section) => elements(section.children, 'tr'));
  return paragraph(lines(rows.map((tr) =>
    elements(tr.children, 'th', 'td').flatMap((cell, i) => (i === 0 ? cell.children : [text(' · '), ...cell.children])))));
}

function rewrite(node: RootContent): RootContent {
  if (node.type !== 'element') return node;
  if (node.tagName === 'pre') return codeAsParagraph(node);
  if (node.tagName === 'table') return tableAsParagraph(node);
  if (node.tagName === 'input' && node.properties.type === 'checkbox') return text(node.properties.checked ? '☑' : '☐');
  if (HEADINGS.has(node.tagName)) node.tagName = 'p';
  node.children = node.children.map((child) => rewrite(child) as ElementContent);
  return node;
}

/**
 * Turns the blocks owner text may not use (headings, code, tables, checkboxes)
 * into plain paragraphs and symbols before the element allowlist runs.
 */
export function rehypePlainBlocks() {
  return (tree: Root) => {
    tree.children = tree.children.map(rewrite);
  };
}
