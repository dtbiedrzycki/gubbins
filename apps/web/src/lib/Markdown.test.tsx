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

  it('renders no image and shows raw HTML as inert text', () => {
    const { container } = render(
      <Markdown text={'![x](http://e.com/a.png)\n\n<img src=x>\n\nT-shirt size <L> <script>alert(1)</script>'} />,
    );
    expect(container.querySelector('img, script')).toBeNull();
    expect(container.textContent).toContain('<img src=x>');
    expect(container.textContent).toContain('T-shirt size <L> <script>alert(1)</script>');
  });

  it('keeps the text of headings, code and quotes without their elements', () => {
    const { container } = render(<Markdown text={'# Title\n\n> quoted\n\n`code`'} />);
    expect(container.querySelector('h1, blockquote, code')).toBeNull();
    expect(container.textContent).toContain('Title');
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
