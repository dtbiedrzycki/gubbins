import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Markdown } from './Markdown';

describe('Markdown', () => {
  it('renders bold, italics, lists and links', () => {
    const { container } = render(
      <Markdown text={'**bold** and *soft*\n\n- one\n- two\n\n[site](https://example.com)'} />,
    );
    expect(container.querySelector('strong')?.textContent).toBe('bold');
    expect(container.querySelector('em')?.textContent).toBe('soft');
    expect(container.querySelectorAll('li')).toHaveLength(2);
    expect(screen.getByRole('link', { name: 'site' }).getAttribute('href')).toBe('https://example.com');
  });

  it('turns a bare https URL into a link', () => {
    render(<Markdown text="see https://example.com/gift now" />);
    expect(screen.getByRole('link').getAttribute('href')).toBe('https://example.com/gift');
  });

  it('links only to http and https, keeping the text of other links', () => {
    const { container } = render(
      <Markdown
        text={'[a](javascript:alert(1)) [b](data:text/html,x) [c](mailto:a@b.c) [d](/wishlists/abc) [e](JaVaScRiPt:x)'}
      />,
    );
    expect(container.querySelector('[href]')).toBeNull();
    for (const word of ['a', 'b', 'c', 'd', 'e']) expect(container.textContent).toContain(word);
  });

  it('keeps each line of a multi-line address on its own line', () => {
    const { container } = render(<Markdown text={'Jane Doe\n1 Main St\nTown\n\n- one'} />);
    expect(container.querySelectorAll('br')).toHaveLength(2);
    expect(container.querySelector('li')?.textContent).toBe('one');
  });

  it('separates paragraphs split by a blank line with a gap', () => {
    const { container } = render(<Markdown text={'Hello\n\nShip to:\n1 Main St'} />);
    expect(container.querySelectorAll('p')[1].className).toContain('mt-3');
  });

  it('puts no gap above the first paragraph', () => {
    const { container } = render(<Markdown text="Hello" />);
    expect(container.querySelector('p')?.className).toContain('first:mt-0');
  });

  it('shows bullets on unordered lists and numbers on ordered lists', () => {
    const { container } = render(<Markdown text={'- one\n\n1. first'} />);
    expect(container.querySelector('ul')?.className).toContain('list-disc');
    expect(container.querySelector('ol')?.className).toContain('list-decimal');
  });

  it('separates a list from the text before it with the paragraph gap', () => {
    const { container } = render(<Markdown text={'Ideas:\n\n- one\n\nSteps:\n\n1. first'} />);
    expect(container.querySelector('ul')?.className).toContain('mt-3');
    expect(container.querySelector('ol')?.className).toContain('mt-3');
  });

  it('puts a sub-list directly under its item', () => {
    const { container } = render(<Markdown text={'- **a**\n  - b'} />);
    expect(container.querySelector('li ul')?.className).toContain('[li>&]:mt-0');
  });

  it('separates the items of a list written with blank lines by the paragraph gap', () => {
    const { container } = render(<Markdown text={'- a\n\n- b'} />);
    expect(container.querySelector('ul')?.className).toContain('[&>li:has(>p)+li]:mt-3');
  });

  it('keeps the starting number of an ordered list', () => {
    const { container } = render(<Markdown text={'3. third\n4. fourth'} />);
    expect(container.querySelector('ol')?.getAttribute('start')).toBe('3');
  });

  it('gives a heading its own paragraph', () => {
    const { container } = render(<Markdown text={'# Shipping\n\nJane Doe'} />);
    expect([...container.querySelectorAll('p')].map((p) => p.textContent)).toEqual(['Shipping', 'Jane Doe']);
  });

  it('renders a link inside a heading as a link', () => {
    render(<Markdown text="# See [site](https://example.com)" />);
    expect(screen.getByRole('link', { name: 'site' }).closest('p')).not.toBeNull();
  });

  it('shows a code block as a paragraph with one line per code line', () => {
    const { container } = render(<Markdown text={'```\nline one\nline two\n```'} />);
    expect(container.querySelector('p')?.innerHTML).toBe('line one<br>line two');
  });

  it('shows a table as a paragraph with one row per line and cells separated by a dot', () => {
    const { container } = render(<Markdown text={'| Size | Colour |\n|---|---|\n| M | Red |'} />);
    expect(container.querySelector('p')?.innerHTML).toBe('Size · Colour<br>M · Red');
  });

  it('marks checklist items as ticked or unticked', () => {
    const { container } = render(<Markdown text={'- [ ] socks\n- [x] books'} />);
    expect([...container.querySelectorAll('li')].map((li) => li.textContent)).toEqual(['☐ socks', '☑ books']);
  });

  it('renders no image and shows raw HTML as inert text', () => {
    const { container } = render(
      <Markdown text={'![x](http://e.com/a.png)\n\n<img src=x>\n\nT-shirt size <L> <script>alert(1)</script>'} />,
    );
    expect(container.querySelector('img, script')).toBeNull();
    expect(container.textContent).toContain('<img src=x>');
    expect(container.textContent).toContain('T-shirt size <L> <script>alert(1)</script>');
  });

  it('shows quotes and inline code as plain text', () => {
    const { container } = render(<Markdown text={'> quoted\n\n`code`'} />);
    expect(container.querySelector('blockquote, code')).toBeNull();
    expect(container.textContent).toContain('quoted');
    expect(container.textContent).toContain('code');
  });

  it('opens links in a new tab without passing on the page', () => {
    render(<Markdown text="[site](https://example.com)" />);
    const link = screen.getByRole('link');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer nofollow ugc');
  });
});
