import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import rehypeRaw from "rehype-raw";
import "highlight.js/styles/github-dark.css";

interface Props {
  content: string;
}

export function MarkdownMessage({ content }: Props) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeHighlight, rehypeRaw]}
      components={{
        // Paragraphs
        p: ({ children }) => (
          <p className="mb-3 last:mb-0 leading-[1.75]">{children}</p>
        ),

        // Headings
        h1: ({ children }) => (
          <h1 className="text-lg font-semibold mt-5 mb-2 text-foreground">
            {children}
          </h1>
        ),
        h2: ({ children }) => (
          <h2 className="text-base font-semibold mt-4 mb-2 text-foreground">
            {children}
          </h2>
        ),
        h3: ({ children }) => (
          <h3 className="text-sm font-semibold mt-3 mb-1.5 text-foreground">
            {children}
          </h3>
        ),

        // Lists
        ul: ({ children }) => (
          <ul className="mb-3 pl-5 space-y-1 list-disc marker:text-primary/60">
            {children}
          </ul>
        ),
        ol: ({ children }) => (
          <ol className="mb-3 pl-5 space-y-1 list-decimal marker:text-primary/60">
            {children}
          </ol>
        ),
        li: ({ children }) => <li className="leading-[1.7]">{children}</li>,

        // Inline code
        code: ({ children, className }) => {
          const isBlock = className?.includes("language-");
          if (isBlock) {
            return <code className={className}>{children}</code>;
          }
          return (
            <code className="px-1.5 py-0.5 rounded-md bg-primary/10 text-primary font-mono text-[0.82em]">
              {children}
            </code>
          );
        },

        // Code blocks
        pre: ({ children }) => (
          <pre className="mb-3 rounded-xl overflow-x-auto bg-[#0d1117] border border-border text-[0.82em] leading-relaxed [&>code]:p-4 [&>code]:block">
            {children}
          </pre>
        ),

        // Blockquote
        blockquote: ({ children }) => (
          <blockquote className="mb-3 pl-4 border-l-2 border-primary/40 text-muted-foreground italic">
            {children}
          </blockquote>
        ),

        // Horizontal rule
        hr: () => <hr className="my-4 border-border" />,

        // Strong / em
        strong: ({ children }) => (
          <strong className="font-semibold text-foreground">{children}</strong>
        ),
        em: ({ children }) => (
          <em className="italic text-foreground/80">{children}</em>
        ),

        // Links
        a: ({ href, children }) => (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline underline-offset-2 hover:text-primary/80 transition-colors"
          >
            {children}
          </a>
        ),

        // Tables (from remark-gfm)
        table: ({ children }) => (
          <div className="mb-3 overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">{children}</table>
          </div>
        ),
        thead: ({ children }) => (
          <thead className="bg-surface">{children}</thead>
        ),
        th: ({ children }) => (
          <th className="px-3 py-2 text-left font-medium text-foreground border-b border-border">
            {children}
          </th>
        ),
        td: ({ children }) => (
          <td className="px-3 py-2 text-foreground/80 border-b border-border last:border-0">
            {children}
          </td>
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  );
}
