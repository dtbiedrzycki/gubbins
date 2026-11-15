import ReactMarkdown from 'react-markdown';
import remarkBreaks from 'remark-breaks';
import remarkGfm from 'remark-gfm';
import { rehypePlainBlocks } from './rehypePlainBlocks';

const allowedElements = ['p', 'br', 'strong', 'em', 'ul', 'ol', 'li', 'a'];

// Anything but http(s) becomes '', so the link renders as plain text.
const httpOnly = (url: string) => (/^https?:\/\//i.test(url) ? url : '');

// Owner text reaches guests: no images or non-http(s) links. Raw HTML stays
// literal text (no rehype-raw), so "size <L>" is shown, not deleted.
export function Markdown({ text }: { text: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkBreaks]}
      rehypePlugins={[rehypePlainBlocks]}
      allowedElements={allowedElements}
      unwrapDisallowed
      urlTransform={httpOnly}
      components={{
        // Tailwind's preflight strips paragraph gaps and list markers; restore them for owner text.
        p: ({ children }) => <p className="mt-3 first:mt-0">{children}</p>,
        ul: ({ children }) => <ul className="mt-3 first:mt-0 list-disc pl-5 [li>&]:mt-0 [&>li:has(>p)+li]:mt-3">{children}</ul>,
        ol: ({ children, start }) => <ol start={start} className="mt-3 first:mt-0 list-decimal pl-5 [li>&]:mt-0 [&>li:has(>p)+li]:mt-3">{children}</ol>,
        // Checklist items start with ☐/☑ instead of a bullet.
        li: ({ className, children }) => <li className={className?.includes('task-list-item') ? 'list-none' : undefined}>{children}</li>,
        a: ({ href, children }) =>
          href ? (
            <a href={href} className="text-moss underline" target="_blank" rel="noopener noreferrer nofollow ugc">
              {children}
            </a>
          ) : (
            <span>{children}</span>
          ),
      }}
    >
      {text}
    </ReactMarkdown>
  );
}
