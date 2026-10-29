import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ClipboardItemDto } from '../shared/types'
import { queryWords } from '../src/lib/search'
import { matches } from '../src/hooks/useFilteredItems'
import { colorFormats } from '../src/lib/colorUtils'
import { externalHref, stripTracking } from '../src/lib/urlPreview'
import { itemMetaKey, itemRenderKey } from '../src/lib/itemSignature'
import { holdsFocus, noteFocusHolder, takeSearchEngaged } from '../src/lib/searchFocus'
import { placeMenu } from '../src/components/CardMenu'
import { cardMenuHolds, cursorToWindow } from '../src/hooks/useEdgeHover'
import { CARD_MENU_STAY_MS, useStore } from '../src/store/appStore'
import { KEYBOARD_RELEASE_DELAY_MS, acquireKeyboard, releaseAllKeyboard, releaseKeyboard } from '../src/lib/keyboardFocus'

const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8')

const textItem = (id: string, text: string, extra: Partial<ClipboardItemDto> = {}): ClipboardItemDto => ({
  id,
  data: { kind: 'text', text, isUrl: false },
  capturedAt: 1,
  hitCount: 1,
  pinned: false,
  ...extra
})
const imageItem = (id: string, extra: Partial<ClipboardItemDto> = {}): ClipboardItemDto => ({
  id,
  data: { kind: 'image', imageId: id, width: 1, height: 1, bytes: 1, preview: 'p' },
  capturedAt: 1,
  hitCount: 1,
  pinned: false,
  ...extra
})

describe('search: every word, any order, across content and note', () => {
  const find = (item: ClipboardItemDto, q: string) => matches(item, queryWords(q))

  it('finds a card by its note, words in any order', () => {
    const img = imageItem('g', { note: 'Invoice for Acme, March' })
    expect(find(img, 'acme invoice')).toBe(true)
    expect(find(img, 'march')).toBe(true)
    expect(find(img, 'acme april')).toBe(false)
    // images have no text of their own: only a note finds them
    expect(find(imageItem('x'), 'anything')).toBe(false)
  })

  it('content and note count together', () => {
    const t = textItem('n', 'correct-horse-battery-staple', { note: 'Office Wi-Fi password' })
    expect(find(t, 'wifi office')).toBe(true) // hyphen ignored
    expect(find(t, 'horse password')).toBe(true) // one word from each
    expect(find(t, 'WI-FI')).toBe(true)
    expect(find(t, 'printer')).toBe(false)
  })

  it('ignores case and accents; plain search still works', () => {
    expect(find(textItem('r', 'Mon Résumé final'), 'resume')).toBe(true)
    expect(find(textItem('e', 'send an email'), 'e-mail')).toBe(true)
    const plain = textItem('p', 'just some words')
    expect(find(plain, 'some words')).toBe(true)
    expect(find(plain, 'words just')).toBe(true)
    expect(find(plain, '')).toBe(true)
    expect(find(plain, '   ')).toBe(true)
    expect(find(plain, '#')).toBe(false)
  })

  it('file cards are found by file name', () => {
    const f: ClipboardItemDto = { id: 'f', data: { kind: 'files', paths: ['C:/Docs/Quarterly report.pdf'] }, capturedAt: 1, hitCount: 1, pinned: false }
    expect(find(f, 'report quarterly')).toBe(true)
    expect(find(f, 'docs')).toBe(false) // the folder is not part of the name
  })
})

describe('menu helpers', () => {
  it('color formats keep the source as typed and convert the rest', () => {
    expect(colorFormats('#3B82F6')).toEqual({ source: 'hex', hex: '#3B82F6', rgb: 'rgb(59, 130, 246)', hsl: 'hsl(217, 91%, 60%)' })
    expect(colorFormats('rgb(255, 0, 0)')).toEqual({ source: 'rgb', hex: '#ff0000', rgb: 'rgb(255, 0, 0)', hsl: 'hsl(0, 100%, 50%)' })
    expect(colorFormats('hsl(120, 100%, 25%)')).toMatchObject({ source: 'hsl', hex: '#008000', rgb: 'rgb(0, 128, 0)', hsl: 'hsl(120, 100%, 25%)' })
    expect(colorFormats('#00000080')).toMatchObject({ rgb: 'rgba(0, 0, 0, 0.5)', hsl: 'hsla(0, 0%, 0%, 0.5)' })
    expect(colorFormats('#fff')).toMatchObject({ rgb: 'rgb(255, 255, 255)', hsl: 'hsl(0, 0%, 100%)' })
    expect(colorFormats('not a color')).toBeNull()
  })

  it('clean link removes only tracking parameters', () => {
    expect(stripTracking('https://www.example.com/a/?id=7&utm_source=x&UTM_Medium=y&fbclid=Z#top')).toBe('https://www.example.com/a/?id=7#top')
    expect(stripTracking('https://example.com/?gclid=1&si=2')).toBe('https://example.com/')
    expect(stripTracking('https://example.com/p?q=a+b&ref=tw&x')).toBe('https://example.com/p?q=a+b&x')
    expect(stripTracking('https://example.com/p?q=1')).toBe('https://example.com/p?q=1')
    expect(stripTracking('https://example.com/p')).toBe('https://example.com/p')
    expect(stripTracking('www.example.com/?utm_source=x')).toBe('www.example.com/?utm_source=x')
    expect(stripTracking('  https://e.com/?utm_id=1  ')).toBe('https://e.com/')
  })

  it('links without a scheme open as web links', () => {
    expect(externalHref('www.example.com')).toBe('https://www.example.com')
    expect(externalHref(' https://a.b ')).toBe('https://a.b')
    expect(externalHref('mailto:x@y.z')).toBe('mailto:x@y.z')
  })

  it('placeMenu opens away from the pointer and never leaves its area', () => {
    const area = { left: 8, top: 8, right: 262, bottom: 792 }
    expect(placeMenu({ x: 40, y: 100 }, { w: 208, h: 240 }, area)).toEqual({ left: 42, top: 102, origin: 'top left' })
    // near the right edge: flips left
    expect(placeMenu({ x: 250, y: 100 }, { w: 208, h: 240 }, area)).toMatchObject({ left: 40, origin: 'top right' })
    // near the bottom: flips up
    expect(placeMenu({ x: 40, y: 700 }, { w: 208, h: 240 }, area)).toMatchObject({ top: 458, origin: 'bottom left' })
    // too wide for the area: pinned to its left edge
    expect(placeMenu({ x: 100, y: 100 }, { w: 400, h: 240 }, area).left).toBe(8)
    // too tall: pinned to its top edge
    expect(placeMenu({ x: 40, y: 300 }, { w: 208, h: 900 }, area).top).toBe(8)
  })

  it('placeMenu can prefer the left side (right dock opens toward the screen middle)', () => {
    const win = { left: 8, top: 8, right: 376, bottom: 992 }
    expect(placeMenu({ x: 300, y: 100 }, { w: 208, h: 240 }, win, 'left')).toEqual({ left: 90, top: 102, origin: 'top right' })
    // no room on the left: flips right
    expect(placeMenu({ x: 100, y: 100 }, { w: 208, h: 240 }, win, 'left')).toMatchObject({ left: 102, origin: 'top left' })
    // left dock (prefer right) opens right of the pointer and may pass the blade (270px)
    expect(placeMenu({ x: 150, y: 100 }, { w: 208, h: 240 }, win, 'right')).toMatchObject({ left: 152, origin: 'top left' })
    // neither side fits: stays on the preferred side, clamped inside
    expect(placeMenu({ x: 190, y: 100 }, { w: 208, h: 240 }, win, 'right').left).toBe(168)
  })

  it('hover-close treats the open menu (or the editor) as part of the shelf', () => {
    const rect = { left: 100, top: 200, right: 300, bottom: 400 }
    expect(cardMenuHolds(null, rect, { x: 150, y: 250 })).toBe(false)
    expect(cardMenuHolds({ mode: 'menu' }, rect, { x: 150, y: 250 })).toBe(true)
    expect(cardMenuHolds({ mode: 'menu' }, rect, { x: 310, y: 405 })).toBe(true) // small margin
    expect(cardMenuHolds({ mode: 'menu' }, rect, { x: 500, y: 250 })).toBe(false)
    expect(cardMenuHolds({ mode: 'menu' }, null, { x: 150, y: 250 })).toBe(false)
    // the note editor holds only where it is, typing or not: pointer gone -> the shelf may close
    expect(cardMenuHolds({ mode: 'edit' }, rect, { x: 900, y: 900 })).toBe(false)
    expect(cardMenuHolds({ mode: 'edit' }, rect, { x: 150, y: 250 })).toBe(true)
    expect(cardMenuHolds({ mode: 'edit' }, rect, { x: 310, y: 405 })).toBe(true)
    expect(cardMenuHolds({ mode: 'edit' }, null, { x: 150, y: 250 })).toBe(false)
    // and nothing in the close path waits for the editor any more
    const hover = read('src/hooks/useEdgeHover.ts')
    expect(hover).not.toContain('isTypingInCardMenu')
    expect(hover).not.toContain('windowHasKeyboard')
  })

  it('closing the shelf with the note editor open saves what was typed, then gives the keyboard back', () => {
    const store = read('src/store/appStore.ts')
    const setOpen = store.slice(store.indexOf('  setOpen: (open) => {'), store.indexOf('  setSettingsOpen: (settingsOpen) =>'))
    // save first (while the editor still exists), then release the keyboard, then clear the menu
    const commit = setOpen.indexOf('cardEditorCommit?.()')
    const release = setOpen.indexOf('releaseAllKeyboard()')
    const clear = setOpen.indexOf('cardMenu: null')
    expect(commit).toBeGreaterThan(0)
    expect(setOpen).toContain("if (!open && get().cardMenu?.mode === 'edit') {")
    expect(release).toBeGreaterThan(commit)
    expect(clear).toBeGreaterThan(release)
    const menu = read('src/components/CardMenu.tsx')
    expect(menu).toContain('registerCardEditorCommit(() => commitRef.current?.())')
    expect(menu).toContain('return () => registerCardEditorCommit(null)')
  })

  it('maps the work-area cursor into window pixels for each dock', () => {
    expect(cursorToWindow({ x: 50, y: 60 }, 'left', 1920, 384, 0)).toEqual({ x: 50, y: 60 })
    expect(cursorToWindow({ x: 1900, y: 60 }, 'right', 1920, 384, 0)).toEqual({ x: 364, y: 60 })
    // top: window starts 30px left of the dock
    expect(cursorToWindow({ x: 450, y: 60 }, 'top', 1920, 1140, 420)).toEqual({ x: 60, y: 60 })
  })
})

describe('keyboard focus holders', () => {
  afterEach(() => {
    takeSearchEngaged()
  })

  it('first holder turns focus on, last one turns it off', () => {
    expect(noteFocusHolder('search', true)).toEqual({ first: true, last: false })
    expect(noteFocusHolder('card-meta', true)).toEqual({ first: false, last: false })
    expect(noteFocusHolder('card-meta', true)).toEqual({ first: false, last: false })
    expect(noteFocusHolder('search', false)).toEqual({ first: false, last: false })
    expect(holdsFocus()).toBe(true)
    expect(noteFocusHolder('card-meta', false)).toEqual({ first: false, last: true })
    expect(noteFocusHolder('card-meta', false)).toEqual({ first: false, last: false })
    expect(holdsFocus()).toBe(false)
  })

  it('closing the panel takes every holder at once', () => {
    noteFocusHolder('search', true)
    noteFocusHolder('card-meta', true)
    expect(takeSearchEngaged()).toBe(true)
    expect(holdsFocus()).toBe(false)
    expect(takeSearchEngaged()).toBe(false)
  })
})

describe('cards re-render on a note change', () => {
  it('render key and meta key include the note', () => {
    const a = textItem('a', 'x')
    const b = textItem('a', 'x', { note: 'N' })
    const c = textItem('a', 'x', { note: 'N2' })
    expect(itemMetaKey(a)).toBe('')
    expect(itemRenderKey(a)).not.toBe(itemRenderKey(b))
    expect(itemRenderKey(b)).not.toBe(itemRenderKey(c))
    expect(itemRenderKey(c)).toBe(itemRenderKey(textItem('a', 'x', { note: 'N2' })))
  })
})

describe('store: card menu and note saving', () => {
  let setItemMeta: ReturnType<typeof vi.fn>
  beforeEach(() => {
    setItemMeta = vi.fn(async (id: string, meta: { note?: string | null }) =>
      useStore.getState().items.map((it) => {
        if (it.id !== id) return it
        const next = { ...it }
        const note = meta.note?.trim().replace(/\s+/g, ' ')
        if (note) next.note = note
        else delete next.note
        return next
      })
    )
    ;(globalThis as any).window = {
      edge: {
        setItemMeta,
        copyText: vi.fn(async () => true),
        pasteItem: vi.fn(async () => true),
        setPreviewMode: vi.fn(),
        focusWindow: vi.fn(async () => undefined),
        pauseHotkey: vi.fn(async () => undefined)
      }
    }
    useStore.setState({ items: [textItem('a', 'x'), textItem('b', 'y')], toasts: [], cardMenu: null, cardMenuRect: null, open: true })
  })
  afterEach(() => {
    delete (globalThis as any).window
  })

  it('a note-only change from main is applied (not skipped as "unchanged")', () => {
    const items = useStore.getState().items.map((it) => (it.id === 'a' ? { ...it, note: 'New' } : it))
    useStore.getState().setItems(items)
    expect(useStore.getState().items[0].note).toBe('New')
  })

  it('opens, switches to the editor, and closes with every view change', () => {
    const s = () => useStore.getState()
    s().openCardMenu('a', 10, 20)
    expect(s().cardMenu).toEqual({ itemId: 'a', x: 10, y: 20, mode: 'menu' })
    s().editCardMeta()
    expect(s().cardMenu).toEqual({ itemId: 'a', x: 10, y: 20, mode: 'edit' })
    s().setCardMenuRect({ left: 1, top: 2, right: 3, bottom: 4 })
    s().setOpen(false)
    expect(s().cardMenu).toBeNull()
    expect(s().cardMenuRect).toBeNull()
    s().openCardMenu('a', 0, 0)
    s().setTypeFilter('links')
    expect(s().cardMenu).toBeNull()
    s().openCardMenu('a', 0, 0)
    s().setSettingsOpen(true)
    expect(s().cardMenu).toBeNull()
    s().setSettingsOpen(false)
    s().openCardMenu('a', 0, 0)
    s().setEmojiOpen(true)
    expect(s().cardMenu).toBeNull()
  })

  it('saves through main and shows the cleaned note at once, without pinning or a toast', async () => {
    const pending = useStore.getState().setItemMeta('a', { note: '  Office  Wi-Fi ' })
    expect(useStore.getState().items[0]).toMatchObject({ note: 'Office Wi-Fi', pinned: false })
    await pending
    expect(setItemMeta).toHaveBeenCalledWith('a', { note: '  Office  Wi-Fi ' })
    expect(useStore.getState().items[0]).toMatchObject({ note: 'Office Wi-Fi', pinned: false })
    expect(useStore.getState().toasts).toHaveLength(0)
    await useStore.getState().setItemMeta('a', { note: null })
    expect('note' in useStore.getState().items[0]).toBe(false)
  })

  it("the onboarding tour's shelf keeps a note in its own store, never sending it to main", async () => {
    useStore.setState({ demo: true })
    try {
      await useStore.getState().setItemMeta('a', { note: ' Train  tickets ' })
      expect(useStore.getState().items[0].note).toBe('Train tickets')
      expect(setItemMeta).not.toHaveBeenCalled()
      expect(useStore.getState().toasts).toHaveLength(0)
    } finally {
      useStore.setState({ demo: false })
    }
  })

  it('rolls back and reports when saving fails', async () => {
    setItemMeta.mockRejectedValueOnce(new Error('down'))
    await useStore.getState().setItemMeta('b', { note: 'X' })
    expect(useStore.getState().items[1].note).toBeUndefined()
    expect(useStore.getState().items[1].pinned).toBe(false)
    expect(useStore.getState().toasts.some((t) => t.tone === 'error')).toBe(true)
  })

  it('plain paste and derived copies go to main with the right options', async () => {
    await useStore.getState().paste('a', { plain: true })
    expect((globalThis as any).window.edge.pasteItem).toHaveBeenCalledWith('a', { plain: true })
    await useStore.getState().paste('a')
    expect((globalThis as any).window.edge.pasteItem).toHaveBeenLastCalledWith('a', undefined)
    expect(await useStore.getState().copyText('https://e.com/')).toBe(true)
    expect(useStore.getState().toasts.map((t) => t.message)).toContain('Copied to clipboard')
    useStore.setState({ toasts: [] })
    await useStore.getState().copyText('x', { quiet: true })
    expect(useStore.getState().toasts).toHaveLength(0)
  })
})

describe('wiring', () => {
  it('IPC contract, preload and main handlers', () => {
    const ipc = read('shared/ipc.ts')
    expect(ipc).toContain("'item:paste': { args: [id: string, opts?: { plain?: boolean }]; result: boolean }")
    expect(ipc).toContain("'item:set-meta': { args: [id: string, meta: import('./itemMeta').ItemMetaPatch]; result: ClipboardItemDto[] }")
    expect(ipc).toContain("'item:copy-text': { args: [text: string]; result: boolean }")
    expect(ipc).toContain("'item:save-images': { args: [id: string]; result: string[] }")
    const preload = read('electron/preload/index.ts')
    expect(preload).toContain("pasteItem: (id: string, opts?: { plain?: boolean }) => invoke('item:paste', id, opts)")
    expect(preload).toContain("setItemMeta: (id: string, meta: import('../../shared/itemMeta').ItemMetaPatch) => invoke('item:set-meta', id, meta)")
    expect(preload).toContain("copyText: (text: string) => invoke('item:copy-text', text)")
    expect(preload).toContain("saveImages: (id: string) => invoke('item:save-images', id)")
    const main = read('electron/main/ipc.ts')
    expect(main).toMatch(/handle\('item:set-meta'[\s\S]*?getStore\(\)\.setMeta\(id, meta\)/)
    expect(main).toMatch(/handle\('item:copy-text'[\s\S]*?watcher\.setPaused\(true\)[\s\S]*?resyncSignature\(\)/)
    expect(main).toMatch(/handle\('item:save-images'[\s\S]*?app\.getPath\('downloads'\)/)
    expect(main).toContain("writeItemToClipboard(itemDataWithFullText, item.capturedAt, { plain: opts?.plain === true })")
    expect(main).toContain('clipboard.write(opts?.plain ? { text: formatted.text } : { text: formatted.text, html: formatted.html })')
    expect(read('electron/main/window.ts')).toContain('if (isSafeExternalUrl(details.url))')
  })

  it('cards open the menu on right-click and show the note', () => {
    const card = read('src/components/ClipboardItem.tsx')
    expect(card).toContain('onContextMenu={handleContextMenu}')
    expect(card).toContain('s.openCardMenu(item.id, e.clientX, e.clientY)')
    expect(card).toContain("if (e.button !== 0) return // right-click opens the menu; nothing to stage")
    expect(card).toContain('<div className="item-note" title={item.note}>{item.note}</div>')
    expect(card).not.toMatch(/item\.label\b|item\.tags\b|MetaTags/)
    expect(card).toContain("if (target.closest('.card-menu')) return")
    const panel = read('src/components/Panel.tsx')
    expect(panel).toContain('<CardMenu />')
    expect(panel).not.toContain('TagSuggest')
  })

  it('search and the note editor share the keyboard hand-over', () => {
    expect(read('src/components/ShelfSearch.tsx')).toContain("acquireKeyboard('search')")
    expect(read('src/components/ShelfSearch.tsx')).toContain("releaseKeyboard('search')")
    const menu = read('src/components/CardMenu.tsx')
    expect(menu).toContain('onPress={() => void acquireKeyboard(EDITOR_FOCUS_OWNER)}')
    expect(menu).toContain('releaseKeyboard(EDITOR_FOCUS_OWNER)')
  })

  it('every language has every new string', () => {
    const src = read('src/i18n/translations.ts')
    const dictionaries = src.match(/export const \w+: TranslationKeys = \{/g)?.length ?? 0
    expect(dictionaries).toBe(31)
    for (const key of ['title', 'paste', 'pastePlain', 'addNote', 'editNote', 'openLink', 'copyCleanLink', 'copyAs', 'showInFolder', 'copyPath', 'copyPaths', 'saveToDownloads', 'preview', 'closePreview', 'note', 'notePlaceholder', 'noteHint', 'removeNote', 'cancel', 'save', 'noteFailed', 'savedToDownloads', 'saveImagesFailed']) {
      expect(src.split(`"${key}":`).length - 1, key).toBeGreaterThanOrEqual(dictionaries)
    }
    expect(src.split('"menu": {').length - 1).toBe(dictionaries)
    // the label / tags strings are gone everywhere
    for (const key of ['addLabel', 'editLabel', 'labelPlaceholder', 'tagPlaceholder', 'removeTag', 'usedBefore', 'labelPinned', 'labelFailed']) {
      expect(src.includes(`"${key}":`), key).toBe(false)
    }
    // placeholders survive translation
    expect(src.split('"savedToDownloads": "').length - 1).toBe(dictionaries)
    for (const m of src.matchAll(/"savedToDownloads": "([^"]*)"/g)) expect(m[1]).toContain('{name}')
    // several pictures: a plural group in every language, each form with the number in it
    const many = [...src.matchAll(/"savedToDownloads": \{([\s\S]*?)\n\s*\}/g)]
    expect(many.length).toBe(dictionaries)
    for (const m of many) {
      const forms = [...m[1].matchAll(/"\w+": "([^"]*)"/g)]
      expect(forms.length).toBeGreaterThan(0)
      for (const f of forms) expect(f[1]).toContain('{count}')
    }
  })
})

describe('keyboard hand-over is race-free', () => {
  let focusWindow: ReturnType<typeof vi.fn>
  let pauseHotkey: ReturnType<typeof vi.fn>
  beforeEach(() => {
    vi.useFakeTimers()
    focusWindow = vi.fn(async () => undefined)
    pauseHotkey = vi.fn(async () => undefined)
    ;(globalThis as any).window = { edge: { focusWindow, pauseHotkey } }
  })
  afterEach(() => {
    releaseAllKeyboard()
    vi.useRealTimers()
    delete (globalThis as any).window
  })

  it('release then immediate re-acquire (StrictMode cleanup + setup) never reaches main', () => {
    void acquireKeyboard('card-meta')
    releaseKeyboard('card-meta')
    void acquireKeyboard('card-meta')
    vi.advanceTimersByTime(KEYBOARD_RELEASE_DELAY_MS * 3)
    expect(focusWindow.mock.calls).toEqual([[true]])
  })

  it('search hands over to the note editor without a focus flip', () => {
    void acquireKeyboard('search')
    releaseKeyboard('search') // input blurs as the editor opens
    vi.advanceTimersByTime(KEYBOARD_RELEASE_DELAY_MS - 10)
    void acquireKeyboard('card-meta')
    vi.advanceTimersByTime(1000)
    expect(focusWindow.mock.calls).toEqual([[true]])
    expect(pauseHotkey.mock.calls).toEqual([[true]])
  })

  it('the last release hands focus back once, after a short delay', () => {
    void acquireKeyboard('card-meta')
    releaseKeyboard('card-meta')
    expect(focusWindow.mock.calls).toEqual([[true]])
    vi.advanceTimersByTime(KEYBOARD_RELEASE_DELAY_MS)
    expect(focusWindow.mock.calls).toEqual([[true], [false]])
    expect(pauseHotkey.mock.calls).toEqual([[true], [false]])
    releaseKeyboard('card-meta')
    vi.advanceTimersByTime(1000)
    expect(focusWindow.mock.calls).toHaveLength(2)
  })

  it('closing the panel gives focus back at once and only once', () => {
    void acquireKeyboard('search')
    void acquireKeyboard('card-meta')
    expect(releaseAllKeyboard()).toBe(true)
    expect(focusWindow.mock.calls).toEqual([[true], [false]])
    releaseKeyboard('card-meta')
    vi.advanceTimersByTime(1000)
    expect(releaseAllKeyboard()).toBe(false)
    expect(focusWindow.mock.calls).toEqual([[true], [false]])
    // and the next field takes focus again normally
    void acquireKeyboard('search')
    expect(focusWindow.mock.calls).toEqual([[true], [false], [true]])
  })
})

describe('after the menu closes, the shelf waits before hover-closing', () => {
  beforeEach(() => {
    ;(globalThis as any).window = { edge: { setPreviewMode: vi.fn(), focusWindow: vi.fn(async () => undefined), pauseHotkey: vi.fn(async () => undefined) } }
    useStore.setState({ items: [textItem('a', 'x')], cardMenu: null, cardMenuRect: null, cardMenuStayUntil: 0, open: true })
  })
  afterEach(() => {
    delete (globalThis as any).window
  })

  it('closing the menu while the shelf is open starts the grace; closing the shelf clears it', () => {
    const s = () => useStore.getState()
    s().openCardMenu('a', 0, 0)
    const before = Date.now()
    s().closeCardMenu()
    expect(s().cardMenuStayUntil).toBeGreaterThanOrEqual(before + CARD_MENU_STAY_MS)
    expect(s().cardMenuStayUntil).toBeLessThanOrEqual(Date.now() + CARD_MENU_STAY_MS)
    s().clearCardMenuStay()
    expect(s().cardMenuStayUntil).toBe(0)
    s().openCardMenu('a', 0, 0)
    s().closeCardMenu()
    s().setOpen(false)
    expect(s().cardMenuStayUntil).toBe(0)
    // nothing open: closing again does not start a grace
    s().closeCardMenu()
    expect(s().cardMenuStayUntil).toBe(0)
  })

  it('hover-close honours the grace and pointer-back clears it', () => {
    const hover = read('src/hooks/useEdgeHover.ts')
    expect(hover).toContain('const menuStayLeft = state.cardMenuStayUntil - Date.now()')
    expect(hover).toContain('if (menuStayLeft > 0) effectiveDelay = Math.max(effectiveDelay, menuStayLeft)')
    expect(hover).toContain('state.clearCardMenuStay()')
    expect(CARD_MENU_STAY_MS).toBeGreaterThanOrEqual(1000)
    expect(CARD_MENU_STAY_MS).toBeLessThanOrEqual(1500)
  })
})

describe('focus and menu robustness wiring', () => {
  it('a stale foreground repair stops when a newer focus request arrives', () => {
    const w = read('electron/main/window.ts')
    expect(w).toContain('const generation = ++focusRequestGeneration')
    expect(w).toContain("restoreFgAwaited(target, 'release-repair', () => focusRequestGeneration !== generation)")
    expect(w).toMatch(/for \(let attempt = 1; attempt <= 4; attempt\+\+\) \{\s*if \(isStale\?\.\(\)\)/)
  })

  it('the editor survives focus blips and style-only resizes', () => {
    const menu = read('src/components/CardMenu.tsx')
    expect(menu).toContain('if (window.innerWidth !== openSize.w || window.innerHeight !== openSize.h) dismiss(true)')
    expect(menu).toContain("if (!document.hasFocus() && useStore.getState().cardMenu?.mode === 'edit') dismiss(true)")
    expect(menu).toContain("const prefer: 'right' | 'left' = stick === 'right' ? 'left' : 'right'")
    expect(read('src/store/appStore.ts')).toContain('releaseAllKeyboard()')
  })
})
