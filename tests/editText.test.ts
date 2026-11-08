import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const fsRoots = vi.hoisted(() => ({ home: '', userData: '' }))

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getAppPath: () => join(fsRoots.userData, 'app'),
    getPath: (name: string) => (name === 'userData' ? fsRoots.userData : join(fsRoots.userData, name))
  },
  nativeImage: { createFromPath: () => ({ isEmpty: () => true }) },
  safeStorage: { isEncryptionAvailable: () => false }
}))

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>()
  return { ...actual, homedir: () => fsRoots.home }
})

import { ItemStore } from '../electron/store/ItemStore'

const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8')
const editor = read('src/components/EditTextFlyout.tsx')
const editorCss = read('src/styles/editTextFlyout.css')
const cardMenu = read('src/components/CardMenu.tsx')

describe('EditTextFlyout UI and UX matches PreviewFlyout standards', () => {
  it('uses compositor CSS motion matching PreviewFlyout', () => {
    expect(editor).not.toContain('framer-motion')
    expect(editor).not.toContain('requestAnimationFrame')
    expect(editor).toContain("import '../styles/editTextFlyout.css'")
    expect(editorCss).toContain('--pf-spring: linear(')
    expect(editorCss).toContain('--pf-out: cubic-bezier(')
  })

  it('implements defensive text overflow styling to guarantee text never overflows', () => {
    expect(editorCss).toContain('word-break: break-word')
    expect(editorCss).toContain('overflow-wrap: anywhere')
    expect(editorCss).toContain('white-space: pre-wrap')
    expect(editorCss).toContain('overflow-x: hidden')
    expect(editorCss).toContain('overflow-y: auto')
    expect(editorCss).toContain('box-sizing: border-box')
    expect(editorCss).toContain('max-width: 100%')
  })

  it('hides scrollbars in edit-text-flyout and code editor while maintaining scrollability', () => {
    const globalCss = read('src/styles/global.css')
    expect(globalCss).toContain('.edit-text-flyout')
    expect(globalCss).toContain('scrollbar-width: none !important')
    expect(editorCss).toContain('scrollbar-width: none !important')
    expect(editorCss).toContain('::-webkit-scrollbar')
    expect(editorCss).toContain('display: none !important')
  })

  it('borrows and releases keyboard focus for Windows NOACTIVATE window', () => {
    expect(editor).toContain("acquireKeyboard('edit-text')")
    expect(editor).toContain("releaseKeyboard('edit-text')")
  })

  it('handles Ctrl+Enter to save and Esc to close', () => {
    expect(editor).toContain("e.key === 'Enter'")
    expect(editor).toContain("e.key === 'Escape'")
    expect(editor).toContain('handleSave')
    expect(editor).toContain('handleClose')
  })

  it('protects user work with dirty check before discarding', () => {
    expect(editor).toContain('isDirty')
    expect(editor).toContain('showDiscardConfirm')
    expect(editor).toContain('setShowDiscardConfirm')
  })

  it('updates the system clipboard upon save so edited text is immediately pasteable', () => {
    expect(editor).toContain('copyText')
    expect(editor).toContain('updateItemText')
    expect(editor).toContain('setEditTextItemId(null)')
  })

  it('broadcasts items on item:update-text in IPC', () => {
    const ipcFile = read('electron/main/ipc.ts')
    expect(ipcFile).toContain("handle('item:update-text'")
    expect(ipcFile).toContain("pushState.items({ reason: 'usage' })")
  })

  it('verifies setItems in appStore detects text mutations via itemRenderKey', () => {
    const appStoreFile = read('src/store/appStore.ts')
    expect(appStoreFile).toContain('itemRenderKey(it) === itemRenderKey(items[i])')
  })

  it('renders line numbers for code editor and supports tab indentation', () => {
    expect(editor).toContain('et-code-gutter')
    expect(editor).toContain('et-code-wrap')
    expect(editor).toContain('lineNumbersText')
    expect(editor).toContain("e.key === 'Tab'")
    expect(editorCss).toContain('.et-code-gutter')
    expect(editorCss).toContain('.et-code-wrap')
  })

  it('applies previewing blur effect to card when editing', () => {
    const cardFile = read('src/components/ClipboardItem.tsx')
    expect(cardFile).toContain('s.previewItemId === item.id || s.editTextItemId === item.id')
  })

  it('CodeBlock wraps lines by default to prevent cutting off text in preview', () => {
    const codeBlockFile = read('src/components/CodeBlock.tsx')
    expect(codeBlockFile).toContain('wrap = true')
    expect(codeBlockFile).toContain("whiteSpace: wrap ? 'pre-wrap' : 'pre'")
    expect(codeBlockFile).toContain("overflowWrap: wrap ? 'anywhere' : 'normal'")
  })

  it('keeps window in preview mode when transitioning from PreviewFlyout to EditTextFlyout', () => {
    const previewFile = read('src/components/PreviewFlyout.tsx')
    expect(previewFile).toContain('!useStore.getState().previewItemId && !useStore.getState().editTextItemId && !useStore.getState().styleFlyoutOpen')
  })
})

describe('CardMenu and contextual naming integration', () => {
  it('offers contextual menu options for links, code, colors, and plain text', () => {
    expect(cardMenu).toContain("t('menu.editText')")
    expect(cardMenu).toContain("t('menu.editLink')")
    expect(cardMenu).toContain("t('menu.editCode')")
    expect(cardMenu).toContain("t('menu.editColor')")
    expect(cardMenu).toContain('setEditTextItemId')
    expect(cardMenu).toContain('isText')

    expect(editor).toContain("t('flyout.editText')")
    expect(editor).toContain("t('flyout.editLink')")
    expect(editor).toContain("t('flyout.editCode')")
    expect(editor).toContain("t('flyout.editColor')")
  })

  it('keeps panel open when cursor moves to edit flyout (hasFlyout and flyoutWide)', () => {
    const hoverHook = read('src/hooks/useEdgeHover.ts')
    expect(hoverHook).toContain('state.editTextItemId')
  })
})

describe('ItemStore.updateText logic', () => {
  beforeEach(() => {
    const run = `edit-test-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    fsRoots.home = join(tmpdir(), `${run}-home`)
    fsRoots.userData = join(tmpdir(), `${run}-user`)
    mkdirSync(fsRoots.home, { recursive: true })
    mkdirSync(fsRoots.userData, { recursive: true })
  })

  afterEach(() => {
    for (const d of [fsRoots.home, fsRoots.userData]) {
      try {
        if (existsSync(d)) rmSync(d, { recursive: true, force: true })
      } catch {
        /* ignore */
      }
    }
  })

  it('updates short text and derived flags (isUrl, isColor)', () => {
    const store = new ItemStore()
    store.add({ kind: 'text', text: 'Hello World', isUrl: false }, 50)
    const items = store.toDto()
    const id = items[0].id
    expect(items[0].data.kind).toBe('text')

    // Update to URL
    const updatedUrl = store.updateText(id, 'https://example.com/docs')
    expect(updatedUrl).toBe(true)
    const afterUrl = store.toDto()[0]
    if (afterUrl.data.kind === 'text') {
      expect(afterUrl.data.text).toBe('https://example.com/docs')
      expect(afterUrl.data.isUrl).toBe(true)
      expect(afterUrl.data.isColor).toBe(false)
      expect(afterUrl.data.hasFullPayload).toBe(false)
    }

    // Update to Hex color
    const updatedColor = store.updateText(id, '#3b82f6')
    expect(updatedColor).toBe(true)
    const afterColor = store.toDto()[0]
    if (afterColor.data.kind === 'text') {
      expect(afterColor.data.text).toBe('#3b82f6')
      expect(afterColor.data.isUrl).toBe(false)
      expect(afterColor.data.isColor).toBe(true)
    }
  })

  it('updates text exceeding 300 characters with on-disk payload', () => {
    const store = new ItemStore()
    store.add({ kind: 'text', text: 'Short initially', isUrl: false }, 50)
    const id = store.toDto()[0].id

    const longText = 'A'.repeat(500)
    const ok = store.updateText(id, longText)
    expect(ok).toBe(true)

    const item = store.toDto()[0]
    if (item.data.kind === 'text') {
      expect(item.data.hasFullPayload).toBe(true)
      expect(item.data.previewText).toBe('A'.repeat(300))
      expect(item.data.text).toBe('A'.repeat(300))
    }
    expect(store.getFullText(id)).toBe(longText)

    // Now edit back to short text: payload file is cleaned up
    const okShort = store.updateText(id, 'Short again')
    expect(okShort).toBe(true)
    const itemShort = store.toDto()[0]
    if (itemShort.data.kind === 'text') {
      expect(itemShort.data.hasFullPayload).toBe(false)
      expect(itemShort.data.text).toBe('Short again')
      expect(itemShort.data.previewText).toBeUndefined()
    }
    expect(store.getFullText(id)).toBe('Short again')
  })
})
