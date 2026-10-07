/** Блок текста теории. Разбирается небольшое подмножество Markdown — то, что нужно конспекту. */
export type Block =
  | { kind: 'heading'; depth: 1 | 2 | 3; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'list'; ordered: boolean; items: string[] }
  | { kind: 'code'; text: string }
  | { kind: 'quote'; text: string }

export type Span = { kind: 'text' | 'code' | 'bold'; text: string }

const HEADING = /^(#{1,3})\s+(.+)$/
const BULLET = /^[-*]\s+(.+)$/
const NUMBER = /^\d+[.)]\s+(.+)$/
const QUOTE = /^>\s?(.*)$/
const FENCE = /^```/

/** Заголовки #–###, абзацы, списки, блоки кода в ``` и цитаты через >. */
export function parseMarkdown(source: string): Block[] {
  const lines = source.replace(/\r\n/g, '\n').split('\n')
  const blocks: Block[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (line.trim() === '') {
      i++
    } else if (FENCE.test(line)) {
      const code: string[] = []
      for (i++; i < lines.length && !FENCE.test(lines[i]); i++) code.push(lines[i])
      i++
      blocks.push({ kind: 'code', text: code.join('\n') })
    } else if (HEADING.test(line)) {
      const [, marks, text] = HEADING.exec(line)!
      blocks.push({ kind: 'heading', depth: marks.length as 1 | 2 | 3, text: text.trim() })
      i++
    } else if (BULLET.test(line) || NUMBER.test(line)) {
      const pattern = BULLET.test(line) ? BULLET : NUMBER
      const items: string[] = []
      for (; i < lines.length && pattern.test(lines[i]); i++) items.push(pattern.exec(lines[i])![1].trim())
      blocks.push({ kind: 'list', ordered: pattern === NUMBER, items })
    } else if (QUOTE.test(line)) {
      const parts: string[] = []
      for (; i < lines.length && QUOTE.test(lines[i]); i++) parts.push(QUOTE.exec(lines[i])![1].trim())
      blocks.push({ kind: 'quote', text: parts.join(' ') })
    } else {
      const parts: string[] = []
      for (; i < lines.length && lines[i].trim() !== '' && !FENCE.test(lines[i]) && !HEADING.test(lines[i]) && !BULLET.test(lines[i]) && !NUMBER.test(lines[i]) && !QUOTE.test(lines[i]); i++) {
        parts.push(lines[i].trim())
      }
      blocks.push({ kind: 'paragraph', text: parts.join(' ') })
    }
  }
  return blocks
}

/** Делит строку на обычный текст, `код` и **выделение**. */
export function splitInline(text: string): Span[] {
  const spans: Span[] = []
  const pattern = /`([^`]+)`|\*\*([^*]+)\*\*/g
  let last = 0
  for (let m = pattern.exec(text); m; m = pattern.exec(text)) {
    if (m.index > last) spans.push({ kind: 'text', text: text.slice(last, m.index) })
    spans.push(m[1] !== undefined ? { kind: 'code', text: m[1] } : { kind: 'bold', text: m[2] })
    last = m.index + m[0].length
  }
  if (last < text.length) spans.push({ kind: 'text', text: text.slice(last) })
  return spans
}
