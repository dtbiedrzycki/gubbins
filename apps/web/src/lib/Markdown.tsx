import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const allowedElements = ['p', 'br', 'strong', 'em', 'ul', 'ol', 'li', 'a'];

// Anything but http(s) becomes '', so the link renders as plain text.
const httpOnly = (url: string) => (/^https?:\/\//i.test(url) ? url : '');

// Owner text reaches guests: no images, raw HTML or non-http(s) links.
export function Markdown({ text }: { text: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      skipHtml
      allowedElements={allowedElements}
      unwrapDisallowed
      urlTransform={httpOnly}
      components={{
        a: ({ href, children }) =>
          href ? (
            <a href={href} target="_blank" rel="noopener noreferrer nofollow ugc">
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
