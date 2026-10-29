import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Highlight, type PrismTheme } from 'prism-react-renderer'
import React, { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { CopyIcon, CheckIcon } from './icons'
import { t } from '../i18n'

const TAP_SPRING = { type: 'spring', stiffness: 500, damping: 30 } as const
const SWAP_SPRING = { type: 'spring', duration: 0.3, bounce: 0 } as const
const CHECK_SPRING = { type: 'spring', duration: 0.4, bounce: 0.35 } as const
const COPY_RESET_MS = 1800
const DEFAULT_ACCENT = '#0A84FF' // Signature electric blue accent

export type CodeBlockProps = Omit<React.ComponentProps<'div'>, 'children'> & {
  /** The source code to render. */
  code: string
  /** Prism language id, e.g. "tsx", "css", "json", "bash". */
  language?: string
  /** Any hex color. The whole theme is built from shades of it. */
  accent?: string
  /** "auto" follows the page theme; pass "dark" or "light" to pin it. */
  mode?: 'auto' | 'dark' | 'light'
  /** Filename or path shown in the header. Falls back to the language id when omitted. */
  filename?: string
  /** Show the outer frame — background, border, rounded corners, and header. */
  showFrame?: boolean
  /** Show the header bar. Ignored when the frame is off. */
  showHeader?: boolean
  /** Show the line-number gutter. */
  showLineNumbers?: boolean
  /** Show the copy-to-clipboard button. */
  showCopyButton?: boolean
  /** Optional 1-based line numbers to highlight with an accent wash. */
  highlightLines?: number[]
  /** Maximum lines to show (e.g. for card thumbnail previews). */
  maxLines?: number
  /** Compact styling for inside the card preview. */
  compact?: boolean
}

function resolvePageMode(): 'dark' | 'light' {
  if (typeof document === 'undefined') return 'dark'
  const root = document.documentElement
  if (root.classList.contains('dark')) return 'dark'
  if (root.classList.contains('light')) return 'light'
  const attr = root.getAttribute('data-theme')
  if (attr === 'dark') return 'dark'
  if (attr === 'light') return 'light'
  if (typeof window.matchMedia !== 'function') return 'dark'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function subscribeToPageMode(onChange: () => void) {
  if (typeof document === 'undefined') return () => {}
  const observer = new MutationObserver(onChange)
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class', 'data-theme'],
  })
  const media = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-color-scheme: dark)') : null
  media?.addEventListener?.('change', onChange)
  return () => {
    observer.disconnect()
    media?.removeEventListener?.('change', onChange)
  }
}

const serverMode = () => 'dark' as const

const FALLBACK_HSL: [number, number, number] = [211, 100, 52]

function hexToHsl(hex: string): [number, number, number] {
  if (typeof hex !== 'string') return FALLBACK_HSL
  let value = hex.replace('#', '')
  if (value.length === 4 || value.length === 8) {
    value = value.slice(0, value.length === 4 ? 3 : 6)
  }
  if (value.length === 3) {
    value = value.split('').map((c) => c + c).join('')
  }
  const r = parseInt(value.slice(0, 2), 16) / 255
  const g = parseInt(value.slice(2, 4), 16) / 255
  const b = parseInt(value.slice(4, 6), 16) / 255
  if (value.length !== 6 || [r, g, b].some(Number.isNaN)) return FALLBACK_HSL

  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l * 100]

  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h: number
  switch (max) {
    case r:
      h = ((g - b) / d + (g < b ? 6 : 0)) / 6
      break
    case g:
      h = ((b - r) / d + 2) / 6
      break
    default:
      h = ((r - g) / d + 4) / 6
  }
  return [h * 360, s * 100, l * 100]
}

const hsl = (h: number, s: number, l: number, a = 1) => {
  const hue = ((h % 360) + 360) % 360
  return a === 1
    ? `hsl(${hue.toFixed(1)} ${s.toFixed(1)}% ${l.toFixed(1)}%)`
    : `hsl(${hue.toFixed(1)} ${s.toFixed(1)}% ${l.toFixed(1)}% / ${a})`
}

export function buildTheme(accent: string = DEFAULT_ACCENT, mode: 'dark' | 'light' = 'dark') {
  const [h, s, l] = hexToHsl(accent)
  const tint = (lightness: number, sat = s) => hsl(h, sat, lightness)
  const dark = mode !== 'light'
  const accentTone = dark
    ? tint(Math.min(Math.max(l, 56), 72))
    : tint(Math.min(Math.max(l, 38), 50))
  const colors = dark
    ? {
        accent: accentTone,
        bg: '#0e0e12',
        border: 'rgba(255, 255, 255, 0.08)',
        headerBg: 'rgba(255, 255, 255, 0.03)',
        plain: '#ffffff',
        muted: 'rgba(255, 255, 255, 0.6)',
        gutter: 'rgba(255, 255, 255, 0.28)',
        hoverWash: 'rgba(255, 255, 255, 0.08)',
        floatBg: 'rgba(20, 20, 26, 0.75)',
        selection: hsl(h, s, 58, 0.3),
        lineWash: hsl(h, s, 58, 0.12),
      }
    : {
        accent: accentTone,
        bg: '#f8fafc',
        border: 'rgba(0, 0, 0, 0.08)',
        headerBg: 'rgba(0, 0, 0, 0.03)',
        plain: '#171717',
        muted: 'rgba(0, 0, 0, 0.6)',
        gutter: 'rgba(0, 0, 0, 0.32)',
        hoverWash: 'rgba(0, 0, 0, 0.06)',
        floatBg: 'rgba(0, 0, 0, 0.04)',
        selection: hsl(h, s, 45, 0.25),
        lineWash: hsl(h, s, 45, 0.08),
      }

  const theme: PrismTheme = {
    plain: { color: colors.plain, backgroundColor: 'transparent' },
    styles: [
      { types: ['comment', 'prolog', 'doctype', 'cdata'], style: { color: 'rgba(255, 255, 255, 0.35)', fontStyle: 'italic' } },
      { types: ['punctuation'], style: { color: 'rgba(255, 255, 255, 0.55)' } },
      { types: ['operator', 'combinator'], style: { color: '#38bdf8' } },
      { types: ['keyword', 'selector', 'atrule', 'important'], style: { color: '#0A84FF', fontWeight: '500' } },
      { types: ['tag'], style: { color: '#0A84FF' } },
      { types: ['string', 'char', 'inserted', 'url'], style: { color: '#38bdf8' } },
      { types: ['function'], style: { color: '#ffffff' } },
      { types: ['attr-name'], style: { color: '#93c5fd', fontStyle: 'italic' } },
      { types: ['number', 'boolean', 'constant', 'symbol', 'deleted'], style: { color: '#60a5fa' } },
      { types: ['class-name', 'maybe-class-name', 'builtin'], style: { color: '#ffffff' } },
      { types: ['property', 'variable', 'parameter'], style: { color: '#ffffff' } },
      { types: ['regex'], style: { color: '#60a5fa' } },
    ],
  }

  return { colors, theme }
}

/* ------------------------------- copy button ------------------------------- */

function CopyButton({ code, floating }: { code: string; floating?: boolean }) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])

  const copy = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(code)
      } else {
        const area = document.createElement('textarea')
        area.value = code
        area.style.position = 'fixed'
        area.style.opacity = '0'
        document.body.appendChild(area)
        area.select()
        document.execCommand('copy')
        area.remove()
      }
    } catch {
      return
    }
    setCopied(true)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setCopied(false), COPY_RESET_MS)
  }, [code])

  const reduceMotion = useReducedMotion()
  const swap = reduceMotion
    ? {
        initial: { opacity: 0 },
        animate: { opacity: 1 },
        exit: { opacity: 0 },
      }
    : {
        initial: { opacity: 0, scale: 0.5, filter: 'blur(4px)' },
        animate: { opacity: 1, scale: 1, filter: 'blur(0px)' },
        exit: { opacity: 0, scale: 0.5, filter: 'blur(4px)' },
      }

  return (
    <motion.button
      type="button"
      aria-label={copied ? t('flyout.copied') : t('flyout.copyCode')}
      onClick={copy}
      whileTap={reduceMotion ? undefined : { scale: 0.9 }}
      transition={TAP_SPRING}
      style={{
        position: floating ? 'absolute' : 'relative',
        top: floating ? 8 : undefined,
        right: floating ? 8 : undefined,
        zIndex: floating ? 10 : undefined,
        width: 26,
        height: 26,
        borderRadius: 7,
        display: 'grid',
        placeItems: 'center',
        background: copied ? 'rgba(10, 132, 255, 0.18)' : floating ? 'var(--cb-float-bg)' : 'transparent',
        border: floating ? '1px solid var(--cb-border)' : 'none',
        color: copied ? 'var(--cb-accent)' : 'var(--cb-muted)',
        cursor: 'pointer',
        padding: 0,
        outline: 'none',
        transition: 'all 0.15s ease',
      }}
      onMouseEnter={(e) => {
        if (!copied) {
          e.currentTarget.style.background = 'var(--cb-hover-wash)'
          e.currentTarget.style.color = 'var(--cb-plain)'
        }
      }}
      onMouseLeave={(e) => {
        if (!copied) {
          e.currentTarget.style.background = floating ? 'var(--cb-float-bg)' : 'transparent'
          e.currentTarget.style.color = 'var(--cb-muted)'
        }
      }}
    >
      <AnimatePresence initial={false} mode="wait">
        {copied ? (
          <motion.span
            key="check"
            style={{ gridColumn: 1, gridRow: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            {...swap}
            transition={reduceMotion ? { duration: 0.15 } : CHECK_SPRING}
          >
            <CheckIcon width={13} height={13} style={{ color: 'var(--cb-accent)', strokeWidth: 2.5 }} />
          </motion.span>
        ) : (
          <motion.span
            key="copy"
            style={{ gridColumn: 1, gridRow: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            {...swap}
            transition={reduceMotion ? { duration: 0.15 } : SWAP_SPRING}
          >
            <CopyIcon width={12} height={12} />
          </motion.span>
        )}
      </AnimatePresence>
    </motion.button>
  )
}

export function CodeBlock({
  code,
  language = 'tsx',
  accent = DEFAULT_ACCENT,
  mode = 'auto',
  filename,
  showFrame = true,
  showHeader = true,
  showLineNumbers = true,
  showCopyButton = true,
  highlightLines,
  maxLines,
  compact = false,
  className = '',
  style,
  ...props
}: CodeBlockProps) {
  const safeLanguage = typeof language === 'string' && language.trim() ? language.trim().toLowerCase() : 'tsx'
  const pageMode = useSyncExternalStore(subscribeToPageMode, resolvePageMode, serverMode)
  const safeMode = mode === 'light' || mode === 'dark' ? mode : pageMode
  const { colors, theme } = useMemo(() => buildTheme(accent, safeMode), [accent, safeMode])

  const { trimmed, lineMap } = useMemo(() => {
    const source = typeof code === 'string' ? code : String(code ?? '')
    const rawLines = source.split('\n')

    if (compact) {
      // In compact thumbnail mode, collapse/skip empty lines so meaningful code fills the card
      const denseLines: { line: string; originalIndex: number }[] = []
      for (let i = 0; i < rawLines.length; i++) {
        const line = rawLines[i]
        if (line.trim().length > 0) {
          denseLines.push({ line, originalIndex: i + 1 })
          if (maxLines && denseLines.length >= maxLines) break
        }
      }
      return {
        trimmed: denseLines.map((d) => d.line).join('\n'),
        lineMap: denseLines.map((d) => d.originalIndex),
      }
    }

    const cleaned = source.replace(/^\n+/, '').trimEnd()
    if (maxLines && maxLines > 0) {
      const lines = cleaned.split('\n')
      if (lines.length > maxLines) {
        return {
          trimmed: lines.slice(0, maxLines).join('\n'),
          lineMap: null,
        }
      }
    }
    return { trimmed: cleaned, lineMap: null }
  }, [code, maxLines, compact])

  const highlighted = useMemo(
    () => new Set(Array.isArray(highlightLines) ? highlightLines : []),
    [highlightLines]
  )

  const cssVars = {
    '--cb-accent': colors.accent,
    '--cb-bg': colors.bg,
    '--cb-border': colors.border,
    '--cb-header-bg': colors.headerBg,
    '--cb-plain': colors.plain,
    '--cb-muted': colors.muted,
    '--cb-gutter': colors.gutter,
    '--cb-hover-wash': colors.hoverWash,
    '--cb-float-bg': colors.floatBg,
    '--cb-selection': colors.selection,
    '--cb-line-wash': colors.lineWash,
  } as React.CSSProperties

  const fontSize = compact ? '11.5px' : '13px'
  const lineHeight = compact ? '1.4' : '1.7'
  const paddingX = showFrame ? (compact ? '8px' : '14px') : '0px'
  const paddingY = showFrame ? (compact ? '6px' : '12px') : '0px'

  return (
    <div
      className={`code-block-container ${compact ? 'is-compact' : ''} ${className}`.trim()}
      style={{
        ...cssVars,
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        textAlign: 'left',
        borderRadius: showFrame ? (compact ? 10 : 16) : 0,
        border: showFrame ? '1px solid var(--cb-border)' : 'none',
        background: showFrame ? 'var(--cb-bg)' : 'transparent',
        boxShadow: showFrame && !compact ? '0 8px 24px rgba(0, 0, 0, 0.45)' : 'none',
        fontFamily: 'var(--font-mono)',
        ...style,
      }}
      {...props}
    >
      {showFrame && showHeader && (
        <div
          style={{
            display: 'flex',
            height: compact ? 26 : 34,
            flexShrink: 0,
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
            borderBottom: '1px solid var(--cb-border)',
            background: 'var(--cb-header-bg)',
            padding: `0 ${paddingX}`,
            boxSizing: 'border-box',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, flex: 1 }}>
            <span
              style={{
                display: 'inline-block',
                width: 6,
                height: 6,
                borderRadius: 999,
                background: 'var(--cb-accent)',
                boxShadow: '0 0 8px var(--cb-accent)',
                flexShrink: 0,
              }}
            />
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: compact ? 10 : 11.5,
                fontWeight: 600,
                color: 'var(--cb-muted)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                letterSpacing: '0.02em',
              }}
            >
              {filename ?? safeLanguage}
            </span>
          </div>
          {showCopyButton && <CopyButton code={typeof code === 'string' ? code : trimmed} />}
        </div>
      )}

      {!(showFrame && showHeader) && showCopyButton && (
        <CopyButton code={typeof code === 'string' ? code : trimmed} floating />
      )}

      <div
        role="region"
        aria-label={filename ?? t('flyout.codeLabel', { language: safeLanguage })}
        tabIndex={0}
        style={{
          minHeight: 0,
          flex: 1,
          overflow: compact ? 'hidden' : 'auto',
          outline: 'none',
          padding: `${paddingY} 0`,
          boxSizing: 'border-box',
          scrollbarWidth: 'thin',
          scrollbarColor: 'var(--cb-border) transparent',
        }}
      >
        <Highlight code={trimmed} language={safeLanguage} theme={theme}>
          {({ tokens, getLineProps, getTokenProps }) => {
            const maxLineNum = lineMap && lineMap.length > 0 ? lineMap[lineMap.length - 1] : tokens.length
            const gutterWidth = `${String(maxLineNum).length}ch`
            return (
              <pre
                style={{
                  margin: 0,
                  padding: 0,
                  width: 'max-content',
                  minWidth: '100%',
                  fontFamily: 'var(--font-mono)',
                  fontSize,
                  lineHeight,
                  tabSize: 2,
                  boxSizing: 'border-box',
                }}
              >
                {tokens.map((line, i) => {
                  const lineProps = getLineProps({ line })
                  const isHighlighted = highlighted.has(i + 1)
                  const lineNumber = lineMap ? lineMap[i] : i + 1
                  return (
                    <div
                      key={i}
                      {...lineProps}
                      style={{
                        ...lineProps.style,
                        position: 'relative',
                        display: 'flex',
                        minWidth: '100%',
                        padding: `0 ${paddingX}`,
                        background: isHighlighted ? 'var(--cb-line-wash)' : undefined,
                        boxSizing: 'border-box',
                      }}
                    >
                      {showLineNumbers && (
                        <span
                          aria-hidden
                          style={{
                            marginRight: compact ? 10 : 18,
                            flexShrink: 0,
                            textAlign: 'right',
                            color: 'var(--cb-gutter)',
                            userSelect: 'none',
                            width: gutterWidth,
                            fontSize: compact ? '10px' : '12px',
                          }}
                        >
                          {lineNumber}
                        </span>
                      )}
                      <span style={{ paddingRight: showFrame ? paddingX : '8px', whiteSpace: 'pre', wordBreak: 'normal' }}>
                        {line.map((token, key) => (
                          <span key={key} {...getTokenProps({ token })} />
                        ))}
                      </span>
                    </div>
                  )
                })}
              </pre>
            )
          }}
        </Highlight>
      </div>
    </div>
  )
}

export default CodeBlock
