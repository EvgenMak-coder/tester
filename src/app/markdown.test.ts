import { describe, expect, it } from 'vitest'
import { parseMarkdown, splitInline } from './markdown'

describe('разметка теории', () => {
  it('разбирает заголовки, абзацы, списки, код и цитаты', () => {
    const source = ['# Права', '', 'Первая строка', 'и вторая.', '', '- чтение', '- запись', '', '1. раз', '2. два', '', '```', 'chmod 640 file', '', '# не заголовок', '```', '> Важно:', '> не забыть', '## Итог'].join('\n')
    expect(parseMarkdown(source)).toEqual([
      { kind: 'heading', depth: 1, text: 'Права' },
      { kind: 'paragraph', text: 'Первая строка и вторая.' },
      { kind: 'list', ordered: false, items: ['чтение', 'запись'] },
      { kind: 'list', ordered: true, items: ['раз', 'два'] },
      { kind: 'code', text: 'chmod 640 file\n\n# не заголовок' },
      { kind: 'quote', text: 'Важно: не забыть' },
      { kind: 'heading', depth: 2, text: 'Итог' },
    ])
  })

  it('выделяет код и полужирный внутри строки', () => {
    expect(splitInline('Команда `ls -l` покажет **права** файла')).toEqual([
      { kind: 'text', text: 'Команда ' },
      { kind: 'code', text: 'ls -l' },
      { kind: 'text', text: ' покажет ' },
      { kind: 'bold', text: 'права' },
      { kind: 'text', text: ' файла' },
    ])
    expect(splitInline('без разметки')).toEqual([{ kind: 'text', text: 'без разметки' }])
  })

  it('не теряет текст при незакрытом блоке кода', () => {
    expect(parseMarkdown('```\nls')).toEqual([{ kind: 'code', text: 'ls' }])
  })
})
