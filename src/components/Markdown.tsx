import { parseMarkdown, splitInline } from '../app/markdown'

function Inline({ text }: { text: string }) {
  return (
    <>
      {splitInline(text).map((span, i) => (span.kind === 'code' ? <code key={i}>{span.text}</code> : span.kind === 'bold' ? <b key={i}>{span.text}</b> : span.text))}
    </>
  )
}

/** Текст теории. Заголовок страницы уже занят названием раздела, поэтому # начинается с h2. */
export function Markdown({ source }: { source: string }) {
  return (
    <div className="prose">
      {parseMarkdown(source).map((block, i) => {
        if (block.kind === 'heading') {
          const Tag = (['h2', 'h3', 'h4'] as const)[block.depth - 1]
          return (
            <Tag key={i}>
              <Inline text={block.text} />
            </Tag>
          )
        }
        if (block.kind === 'code') {
          return (
            <pre className="code" key={i}>
              {block.text}
            </pre>
          )
        }
        if (block.kind === 'list') {
          const Tag = block.ordered ? 'ol' : 'ul'
          return (
            <Tag key={i}>
              {block.items.map((item, n) => (
                <li key={n}>
                  <Inline text={item} />
                </li>
              ))}
            </Tag>
          )
        }
        if (block.kind === 'quote') {
          return (
            <blockquote key={i}>
              <Inline text={block.text} />
            </blockquote>
          )
        }
        return (
          <p key={i}>
            <Inline text={block.text} />
          </p>
        )
      })}
    </div>
  )
}
