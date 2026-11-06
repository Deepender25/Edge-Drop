import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ClipboardItemDto } from '../shared/types'

const mocks = vi.hoisted(() => ({
  handlers: {} as Record<string, (...args: unknown[]) => unknown>,
  calls: [] as string[],
  items: new Map<string, { kind: string; full?: string }>(),
  settings: { movePastedToTop: true, incognito: false },
  sendDelay: 50
}))

vi.mock('electron', () => ({
  app: { isPackaged: false, getAppPath: () => 'C:\\mock', getPath: () => 'C:\\mock', on: vi.fn(), quit: vi.fn() },
  ipcMain: {
    on: vi.fn(),
    handle: (channel: string, fn: (e: unknown, ...args: unknown[]) => unknown) => {
      mocks.handlers[channel] = (...args) => fn({}, ...args)
    }
  },
  nativeImage: {},
  shell: {},
  net: {},
  BrowserWindow: { fromWebContents: vi.fn() },
  safeStorage: { isEncryptionAvailable: () => false }
}))

vi.mock('../electron/clipboard/osClipboard', () => ({
  clear: vi.fn(() => mocks.calls.push('clear')),
  write: vi.fn(async (data: { text: string; html?: string }) => {
    mocks.calls.push(`write:${JSON.stringify(data)}`)
  })
}))

vi.mock('../electron/main/powershell', () => ({
  psHost: { run: vi.fn(async () => mocks.calls.push('ctrl+v')) },
  getSystemPowerShellPath: () => 'powershell.exe',
  getWritableCwd: () => 'C:\\mock'
}))

vi.mock('../electron/main/state', () => ({
  getStore: () => ({
    get: (id: string) => {
      const it = mocks.items.get(id)
      return it ? { id, data: { kind: it.kind } } : undefined
    },
    getFullText: (id: string) => mocks.items.get(id)?.full ?? '',
    touch: (id: string) => mocks.calls.push(`touch:${id}`)
  }),
  getWatcher: () => ({
    setPaused: (paused: boolean) => mocks.calls.push(`paused:${paused}`),
    resyncSignature: () => mocks.calls.push('resync')
  }),
  loadSettings: () => mocks.settings,
  saveSettings: vi.fn(),
  addFiles: vi.fn(),
  pushState: {
    items: vi.fn(),
    togglePanel: (open: boolean) => mocks.calls.push(`panel:${open}`)
  }
}))

vi.mock('../electron/main/window', () => ({
  resolvePasteTarget: async () => mocks.sendDelay,
  sendToMainWindow: (channel: string, payload: { message: string }) => mocks.calls.push(`${channel}:${payload.message}`),
  traceFg: vi.fn()
}))

vi.mock('../electron/main/index', () => ({ registerGlobalHotkey: vi.fn() }))
vi.mock('../electron/main/tray', () => ({ rebuildTrayMenu: vi.fn() }))
vi.mock('../electron/main/updater', () => ({}))

import { registerIpc } from '../electron/main/ipc'
import { useStore } from '../src/store/appStore'

const text = (id: string): ClipboardItemDto => ({
  id,
  data: { kind: 'text', text: id, isUrl: false },
  capturedAt: 1,
  hitCount: 1,
  pinned: false
})

describe('selecting cards (renderer store)', () => {
  const pasteItems = vi.fn()

  beforeEach(() => {
    pasteItems.mockReset()
    vi.stubGlobal('window', { edge: { pasteItems } })
    useStore.setState({ items: ['a', 'b', 'c'].map(text), selectedIds: [] })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('keeps the order the cards were picked in, and a second pick drops the card', () => {
    const { toggleSelected } = useStore.getState()
    toggleSelected('c')
    toggleSelected('a')
    toggleSelected('b')
    expect(useStore.getState().selectedIds).toEqual(['c', 'a', 'b'])
    toggleSelected('a')
    expect(useStore.getState().selectedIds).toEqual(['c', 'b'])
  })

  it('selecting closes an open stack, whose rows would paste on click', () => {
    useStore.setState({ expandedStackId: 'stack' })
    useStore.getState().toggleSelected('a')
    expect(useStore.getState().expandedStackId).toBeNull()
  })

  it('a card that leaves the shelf leaves the selection, whatever removed it', () => {
    useStore.setState({ selectedIds: ['a', 'b', 'c'] })
    useStore.setState({ items: [text('a'), text('c')] })
    expect(useStore.getState().selectedIds).toEqual(['a', 'c'])
  })

  it('survives the shelf closing and a new card arriving', () => {
    useStore.setState({ selectedIds: ['a', 'b'] })
    useStore.getState().setOpen(false)
    useStore.setState({ items: [text('new'), ...useStore.getState().items] })
    expect(useStore.getState().selectedIds).toEqual(['a', 'b'])
  })

  it('pastes the ids in order, then clears', async () => {
    pasteItems.mockResolvedValue(true)
    useStore.setState({ selectedIds: ['c', 'a'] })
    await useStore.getState().pasteSelected()
    expect(pasteItems).toHaveBeenCalledWith(['c', 'a'])
    expect(useStore.getState().selectedIds).toEqual([])
  })

  it('keeps the selection when main refuses the paste or the call fails', async () => {
    useStore.setState({ selectedIds: ['a', 'b'] })
    pasteItems.mockResolvedValue(false)
    await useStore.getState().pasteSelected()
    expect(useStore.getState().selectedIds).toEqual(['a', 'b'])
    pasteItems.mockRejectedValue(new Error('renderer reload'))
    await useStore.getState().pasteSelected()
    expect(useStore.getState().selectedIds).toEqual(['a', 'b'])
  })

  it('an empty selection never reaches main', async () => {
    await useStore.getState().pasteSelected()
    expect(pasteItems).not.toHaveBeenCalled()
  })
})

describe('item:paste-many (main process)', () => {
  const pasteMany = (ids: unknown) => mocks.handlers['item:paste-many'](ids) as Promise<boolean>

  beforeEach(() => {
    vi.useFakeTimers()
    mocks.calls.length = 0
    mocks.settings.movePastedToTop = true
    mocks.sendDelay = 50
    mocks.items = new Map([
      ['a', { kind: 'text', full: 'first' }],
      ['b', { kind: 'text', full: 'second\nline' }],
      // A long card: the card only holds a 300-char preview, the paste must not.
      ['long', { kind: 'text', full: 'x'.repeat(5000) }],
      ['img', { kind: 'image' }]
    ])
    registerIpc() // a fresh paste guard per test
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  const writes = () => mocks.calls.filter((c) => c.startsWith('write:')).map((c) => JSON.parse(c.slice(6)))

  it('writes once, plain, in the order picked, then presses Ctrl+V once', async () => {
    expect(await pasteMany(['b', 'a'])).toBe(true)
    await vi.runAllTimersAsync()
    expect(writes()).toEqual([{ text: 'second\r\nline\r\nfirst' }])
    expect(mocks.calls.filter((c) => c === 'ctrl+v')).toHaveLength(1)
    expect(mocks.calls.indexOf('ctrl+v')).toBeGreaterThan(mocks.calls.findIndex((c) => c.startsWith('write:')))
  })

  it('pastes the full text of long cards, not their preview', async () => {
    await pasteMany(['a', 'long'])
    await vi.runAllTimersAsync()
    expect(writes()[0].text).toBe(`first\r\n${'x'.repeat(5000)}`)
  })

  it('tabs stay plain text: a tabbed card does not turn the whole paste into a table', async () => {
    mocks.items.set('row', { kind: 'text', full: 'name\tqty' })
    await pasteMany(['a', 'row'])
    await vi.runAllTimersAsync()
    expect(writes()).toEqual([{ text: 'first\r\nname\tqty' }])
  })

  it('closes the shelf before the keys go out', async () => {
    await pasteMany(['a', 'b'])
    await vi.runAllTimersAsync()
    expect(mocks.calls.indexOf('panel:false')).toBeLessThan(mocks.calls.indexOf('ctrl+v'))
  })

  it('never lets the joined text become a new card: paused before the write, resynced before resuming', async () => {
    await pasteMany(['a', 'b'])
    await vi.runAllTimersAsync()
    const pausedAt = mocks.calls.indexOf('paused:true')
    const wroteAt = mocks.calls.findIndex((c) => c.startsWith('write:'))
    const resyncAt = mocks.calls.indexOf('resync')
    const resumedAt = mocks.calls.indexOf('paused:false')
    expect(pausedAt).toBeGreaterThanOrEqual(0)
    expect(pausedAt).toBeLessThan(wroteAt)
    expect(wroteAt).toBeLessThan(resyncAt)
    expect(resyncAt).toBeLessThan(resumedAt)
  })

  it('moves the cards to the top with the first one picked on top', async () => {
    await pasteMany(['a', 'b'])
    await vi.runAllTimersAsync()
    expect(mocks.calls.filter((c) => c.startsWith('touch:'))).toEqual(['touch:b', 'touch:a'])
  })

  it('respects "move pasted to top" being off', async () => {
    mocks.settings.movePastedToTop = false
    await pasteMany(['a', 'b'])
    await vi.runAllTimersAsync()
    expect(mocks.calls.some((c) => c.startsWith('touch:'))).toBe(false)
  })

  it('skips ids that are gone or not text', async () => {
    await pasteMany(['img', 'a', 'gone', 'b'])
    await vi.runAllTimersAsync()
    expect(writes()).toEqual([{ text: 'first\r\nsecond\r\nline' }])
  })

  it.each([[[]], [['img', 'gone']], ['a'], [null]])('does nothing for %j', async (ids) => {
    expect(await pasteMany(ids)).toBe(false)
    await vi.runAllTimersAsync()
    expect(mocks.calls).toEqual([])
  })

  it('a double click pastes once', async () => {
    expect(await pasteMany(['a', 'b'])).toBe(true)
    expect(await pasteMany(['a', 'b'])).toBe(false)
    await vi.runAllTimersAsync()
    expect(mocks.calls.filter((c) => c === 'ctrl+v')).toHaveLength(1)
  })

  it('no verified target: the text stays on the clipboard and no key is sent blind', async () => {
    mocks.sendDelay = -1
    expect(await pasteMany(['a', 'b'])).toBe(true)
    await vi.runAllTimersAsync()
    expect(writes()).toHaveLength(1)
    expect(mocks.calls).not.toContain('ctrl+v')
    expect(mocks.calls).toContain('ui:toast:toast.pasteFallback')
  })
})
