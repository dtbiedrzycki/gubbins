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

  it('drops javascript: and data: links, keeping the text', () => {
    const { container } = render(<Markdown text={'[bad](javascript:alert(1)) [worse](data:text/html,x)'} />);
    expect(container.querySelector('[href]')).toBeNull();
    expect(container.textContent).toContain('bad');
    expect(container.textContent).toContain('worse');
  });

  it('renders no image and no raw HTML', () => {
    const { container } = render(
      <Markdown text={'![x](http://e.com/a.png)\n\n<img src=x>\n\n<script>alert(1)</script>'} />,
    );
    expect(container.querySelector('img, script')).toBeNull();
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
