import { describe, expect, it } from 'vitest'
import { detectCode } from '../src/lib/codeDetect'

const lang = (s: string) => detectCode(s).language

describe('detectCode: markup inside scripts', () => {
  it('a React component with lowercase tags is JSX, not HTML', () => {
    const src = [
      "import { useState } from 'react'",
      '',
      'export function Counter() {',
      '  const [n, setN] = useState(0)',
      '  return <button onClick={() => setN(n + 1)}>{n}</button>',
      '}'
    ].join('\n')
    expect(detectCode(src)).toEqual({ isCode: true, language: 'jsx', displayName: 'JSX' })
  })

  it('typed components are TSX', () => {
    expect(lang('const Row = ({ title }: { title: string }) => <div className="row">{title}</div>')).toBe('tsx')
  })

  it('real markup is still HTML', () => {
    expect(lang('<div class="card"><span>Hi</span></div>')).toBe('html')
    expect(lang('<!DOCTYPE html>\n<html><body><p>x</p></body></html>')).toBe('html')
    expect(lang('<script>\n  const x = 1\n</script>')).toBe('html')
    expect(lang('<button type="submit">Send</button>')).toBe('html')
  })

  it('prose that starts a line with "let" is not treated as script', () => {
    expect(lang('let me know if <span>this</span> works')).toBe('html')
    expect(detectCode('let me know when you are free').isCode).toBe(false)
  })

  it('markup inside a string or regex keeps a script JavaScript', () => {
    expect(lang('let html = "<div>x</div>"')).toBe('javascript')
    expect(lang('var tpl = `<section class="x"></section>`')).toBe('javascript')
    expect(lang('const re = /<div>/g')).toBe('javascript')
  })

  it('plain scripts are unchanged', () => {
    expect(lang('const answer = 42\nconsole.log(answer)')).toBe('javascript')
    expect(lang('let total: number = 0')).toBe('typescript')
  })
})
