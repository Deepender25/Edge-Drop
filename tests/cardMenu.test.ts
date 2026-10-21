import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ClipboardItemDto } from '../shared/types'
import { activeTagPrefix, completeTag, matchesTagFilters, metaMatchesText, parseQuery, suggestTags, tagCounts } from '../src/lib/tagQuery'
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

describe('search over labels and tags', () => {
  it('a query without #tags is one substring, as before', () => {
    expect(parseQuery('  Hello World ')).toEqual({ text: 'hello world', tags: [] })
    expect(parseQuery('')).toEqual({ text: '', tags: [] })
  })

  it('#words become tag filters, the rest stays text', () => {
    expect(parseQuery('#Work invoice #client-a')).toEqual({ text: 'invoice', tags: ['work', 'client-a'] })
    expect(parseQuery('#')).toEqual({ text: '', tags: [] })
  })

  it('finds images by label, text by label or tag, keeps content search', () => {
    const img = imageItem('g', { label: 'Invoice March', tags: ['finance'] })
    const note = textItem('n', 'agenda', { label: 'Meeting', tags: ['work', 'team'] })
    const plain = textItem('p', 'just some words')
    expect(matches(img, parseQuery('invoice'))).toBe(true)
    expect(matches(img, parseQuery('finance'))).toBe(true)
    expect(matches(imageItem('x'), parseQuery('anything'))).toBe(false)
    expect(matches(note, parseQuery('meet'))).toBe(true)
    expect(matches(note, parseQuery('agenda'))).toBe(true)
    expect(matches(note, parseQuery('#wo'))).toBe(true)
    expect(matches(note, parseQuery('#work #team'))).toBe(true)
    expect(matches(note, parseQuery('#work #finance'))).toBe(false)
    expect(matches(note, parseQuery('#work agenda'))).toBe(true)
    expect(matches(note, parseQuery('#work nothing'))).toBe(false)
    expect(matches(plain, parseQuery('some words'))).toBe(true)
    expect(matches(plain, parseQuery('#work'))).toBe(false)
    expect(matches(plain, parseQuery(''))).toBe(true)
  })

  it('tag helpers', () => {
    expect(matchesTagFilters({ tags: ['work'] }, [])).toBe(true)
    expect(matchesTagFilters({}, ['w'])).toBe(false)
    expect(metaMatchesText({ tags: ['wifi'] }, '#wi')).toBe(true)
    expect(metaMatchesText({ tags: ['wifi'] }, '#')).toBe(false)
    const counts = tagCounts([{ tags: ['work', 'wifi'] }, { tags: ['work'] }, {}, { tags: ['team'] }])
    expect([...counts]).toEqual([['work', 2], ['wifi', 1], ['team', 1]])
    expect(suggestTags(counts, '')).toEqual([{ tag: 'work', count: 2 }, { tag: 'team', count: 1 }, { tag: 'wifi', count: 1 }])
    expect(suggestTags(counts, '#W', { exclude: ['work'] })).toEqual([{ tag: 'wifi', count: 1 }])
    expect(suggestTags(counts, '', { limit: 1 })).toHaveLength(1)
    expect(activeTagPrefix('invoice #wo')).toBe('wo')
    expect(activeTagPrefix('#')).toBe('')
    expect(activeTagPrefix('#work ')).toBeNull()
    expect(activeTagPrefix('a#b')).toBeNull()
    expect(completeTag('invoice #wo', 'work')).toBe('invoice #work ')
    expect(completeTag('#', 'team')).toBe('#team ')
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
    expect(cardMenuHolds({ mode: 'edit' }, rect, { x: 900, y: 900 }, true)).toBe(true)
    // editor open but the shelf never got the keyboard: only its own box holds
    expect(cardMenuHolds({ mode: 'edit' }, rect, { x: 900, y: 900 }, false)).toBe(false)
    expect(cardMenuHolds({ mode: 'edit' }, rect, { x: 150, y: 250 }, false)).toBe(true)
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

describe('cards re-render on a label / tag change', () => {
  it('render key and meta key include label and tags', () => {
    const a = textItem('a', 'x')
    const b = textItem('a', 'x', { label: 'L' })
    const c = textItem('a', 'x', { label: 'L', tags: ['t'] })
    expect(itemMetaKey(a)).toBe('')
    expect(itemRenderKey(a)).not.toBe(itemRenderKey(b))
    expect(itemRenderKey(b)).not.toBe(itemRenderKey(c))
    expect(itemRenderKey(c)).toBe(itemRenderKey(textItem('a', 'x', { label: 'L', tags: ['t'] })))
  })
})

describe('store: card menu and label saving', () => {
  let setItemMeta: ReturnType<typeof vi.fn>
  beforeEach(() => {
    setItemMeta = vi.fn(async (id: string, meta: { label?: string | null; tags?: string[] | null }) =>
      useStore.getState().items.map((it) => (it.id === id ? { ...it, label: meta.label ?? undefined, tags: meta.tags ?? undefined, pinned: true } : it))
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

  it('a label-only change from main is applied (not skipped as "unchanged")', () => {
    const items = useStore.getState().items.map((it) => (it.id === 'a' ? { ...it, label: 'New' } : it))
    useStore.getState().setItems(items)
    expect(useStore.getState().items[0].label).toBe('New')
  })

  it('opens, switches to the editor, and closes with every view change', () => {
    const s = () => useStore.getState()
    s().openCardMenu('a', 10, 20)
    expect(s().cardMenu).toEqual({ itemId: 'a', x: 10, y: 20, mode: 'menu' })
    s().editCardMeta('tags')
    expect(s().cardMenu).toMatchObject({ mode: 'edit', focus: 'tags' })
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

  it('saves through main, shows the cleaned value at once, and says when it pinned', async () => {
    const pending = useStore.getState().setItemMeta('a', { label: '  Office  Wi-Fi ', tags: ['#Work'] })
    expect(useStore.getState().items[0]).toMatchObject({ label: 'Office Wi-Fi', tags: ['work'], pinned: true })
    await pending
    expect(setItemMeta).toHaveBeenCalledWith('a', { label: '  Office  Wi-Fi ', tags: ['#Work'] })
    expect(useStore.getState().toasts.map((t) => t.message)).toContain("Pinned so it's kept")
  })

  it('rolls back and reports when saving fails', async () => {
    setItemMeta.mockRejectedValueOnce(new Error('down'))
    await useStore.getState().setItemMeta('b', { label: 'X' })
    expect(useStore.getState().items[1].label).toBeUndefined()
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

  it('cards open the menu on right-click and show labels / tags', () => {
    const card = read('src/components/ClipboardItem.tsx')
    expect(card).toContain('onContextMenu={handleContextMenu}')
    expect(card).toContain('s.openCardMenu(item.id, e.clientX, e.clientY)')
    expect(card).toContain("if (e.button !== 0) return // right-click opens the menu; nothing to stage")
    expect(card).toContain('<div className="item-label" title={item.label}>{item.label}</div>')
    expect(card).toContain("if (target.closest('.card-menu')) return")
    const panel = read('src/components/Panel.tsx')
    expect(panel).toContain('<CardMenu />')
    expect(panel).toContain('<TagSuggest isHorizontal={false} />')
    expect(panel).toContain('<TagSuggest isHorizontal />')
  })

  it('search and the label editor share the keyboard hand-over', () => {
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
    for (const key of ['title', 'paste', 'pastePlain', 'addLabel', 'editLabel', 'openLink', 'copyCleanLink', 'copyAs', 'showInFolder', 'copyPath', 'copyPaths', 'saveToDownloads', 'preview', 'closePreview', 'label', 'labelPlaceholder', 'tags', 'tagPlaceholder', 'removeTag', 'usedBefore', 'removeAll', 'cancel', 'save', 'labelPinned', 'labelFailed', 'savedToDownloads', 'savedManyToDownloads', 'saveImagesFailed']) {
      expect(src.split(`"${key}":`).length - 1, key).toBeGreaterThanOrEqual(dictionaries)
    }
    expect(src.split('"menu": {').length - 1).toBe(dictionaries)
    // placeholders survive translation
    expect(src.split('#{tag}').length - 1).toBe(dictionaries)
    expect(src.split('"savedToDownloads": "').length - 1).toBe(dictionaries)
    for (const m of src.matchAll(/"savedToDownloads": "([^"]*)"/g)) expect(m[1]).toContain('{name}')
    for (const m of src.matchAll(/"savedManyToDownloads": "([^"]*)"/g)) expect(m[1]).toContain('{count}')
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

  it('search hands over to the label editor without a focus flip', () => {
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
