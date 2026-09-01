import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ClipboardWatcher } from '../electron/clipboard/ClipboardWatcher'
import * as formats from '../electron/clipboard/formats'

describe('ClipboardWatcher Re-Copy Detection & Flare Flow', () => {
  let watcher: ClipboardWatcher
  let mockSeq = 100
  let mockText = 'Hello'
  let mockItem: { kind: 'text'; text: string } | { kind: 'files'; paths: string[] } = { kind: 'text', text: 'Hello' }
  let hasFileNameW = false

  beforeEach(() => {
    vi.useFakeTimers()
    mockSeq = 100
    mockText = 'Hello'
    mockItem = { kind: 'text', text: 'Hello' }
    hasFileNameW = false
    vi.spyOn(formats, 'getClipboardSequenceNumber').mockImplementation(() => mockSeq)
    vi.spyOn(formats, 'clipboardSignature').mockImplementation(() => `seq:${mockSeq}:text:${mockText}`)
    vi.spyOn(formats, 'readClipboard').mockImplementation(async () => mockItem)
    vi.spyOn(formats, 'clipboardHasFileNameW').mockImplementation(() => hasFileNameW)
    vi.spyOn(formats, 'clipboardTextContent').mockImplementation(() =>
      mockItem.kind === 'text' ? mockItem.text : null
    )
    vi.spyOn(formats, 'clipboardFilesContentKey').mockImplementation(() =>
      mockItem.kind === 'files' && hasFileNameW ? `files|${mockItem.paths.join('\n')}` : null
    )
  })

  afterEach(() => {
    if (watcher) watcher.stop()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  async function startWatcher(onNew = vi.fn(), onHint = vi.fn()) {
    watcher = new ClipboardWatcher(50, 200)
    watcher.start(onNew, onHint)
    await vi.advanceTimersByTimeAsync(60)
    return { onNew, onHint }
  }

  async function copyAndSettle() {
    await vi.advanceTimersByTimeAsync(60)
    await vi.advanceTimersByTimeAsync(220)
  }

  it('detects re-copies of the identical item when the OS sequence number increments', async () => {
    mockSeq = 100
    mockText = 'Hello Edge-Drop'
    mockItem = { kind: 'text', text: 'Hello Edge-Drop' }
    const { onNew } = await startWatcher()
    expect(onNew).not.toHaveBeenCalled()

    mockSeq = 101
    await copyAndSettle()
    expect(onNew).toHaveBeenCalledTimes(1)
    expect(onNew).toHaveBeenCalledWith({ kind: 'text', text: 'Hello Edge-Drop' })

    await vi.advanceTimersByTimeAsync(200)
    expect(onNew).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(400)
    mockSeq = 102
    await copyAndSettle()
    expect(onNew).toHaveBeenCalledTimes(2)
  })

  it('detects brand new items when content changes', async () => {
    mockSeq = 200
    mockText = 'First Item'
    mockItem = { kind: 'text', text: 'First Item' }
    const { onNew } = await startWatcher()
    expect(onNew).not.toHaveBeenCalled()

    mockSeq = 201
    mockText = 'Second Item'
    mockItem = { kind: 'text', text: 'Second Item' }
    await copyAndSettle()

    expect(onNew).toHaveBeenCalledTimes(1)
    expect(onNew).toHaveBeenCalledWith({ kind: 'text', text: 'Second Item' })
  })

  it('fires onHint once per burst, before settle, and coalesces sequence bumps', async () => {
    mockSeq = 400
    mockText = 'Hint First'
    mockItem = { kind: 'text', text: 'Hint First' }
    const { onNew, onHint } = await startWatcher()
    expect(onHint).not.toHaveBeenCalled()

    mockSeq = 401
    await vi.advanceTimersByTimeAsync(60)
    expect(onHint).toHaveBeenCalledTimes(1)
    expect(onNew).not.toHaveBeenCalled()

    mockSeq = 402
    await vi.advanceTimersByTimeAsync(60)
    mockSeq = 403
    await vi.advanceTimersByTimeAsync(60)
    expect(onHint).toHaveBeenCalledTimes(1)
    expect(onNew).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(220)
    expect(onNew).toHaveBeenCalledTimes(1)
  })

  it('does not recapture identical content that arrives as a late Explorer format', async () => {
    mockSeq = 500
    mockText = 'Same Files'
    mockItem = { kind: 'text', text: 'Same Files' }
    const { onNew } = await startWatcher()

    mockSeq = 501
    await copyAndSettle()
    expect(onNew).toHaveBeenCalledTimes(1)

    mockSeq = 502
    await copyAndSettle()
    expect(onNew).toHaveBeenCalledTimes(1)
  })

  it('does not fire a second copy indicator for late Explorer formats', async () => {
    mockSeq = 510
    mockText = 'Flare Once'
    mockItem = { kind: 'text', text: 'Flare Once' }
    const { onNew, onHint } = await startWatcher()

    mockSeq = 511
    await copyAndSettle()
    expect(onHint).toHaveBeenCalledTimes(1)
    expect(onNew).toHaveBeenCalledTimes(1)

    mockSeq = 512
    await copyAndSettle()
    expect(onHint).toHaveBeenCalledTimes(1)
    expect(onNew).toHaveBeenCalledTimes(1)
  })

  it('absorbs Explorer file-list delay-renders without re-reading the clipboard', async () => {
    mockSeq = 600
    mockItem = { kind: 'files', paths: ['C:\\a.png', 'C:\\b.png'] }
    hasFileNameW = true
    const { onNew, onHint } = await startWatcher()

    mockSeq = 601
    await copyAndSettle()
    expect(onNew).toHaveBeenCalledTimes(1)
    expect(formats.readClipboard).toHaveBeenCalledTimes(1)

    mockSeq = 602
    await vi.advanceTimersByTimeAsync(60)
    mockSeq = 603
    await copyAndSettle()

    expect(onNew).toHaveBeenCalledTimes(1)
    expect(onHint).toHaveBeenCalledTimes(1)
    expect(formats.readClipboard).toHaveBeenCalledTimes(1)
  })

  it('does not recapture the same Explorer files when the source window later flushes delayed formats', async () => {
    mockSeq = 1000
    mockItem = { kind: 'files', paths: ['C:\\a.png', 'C:\\b.png'] }
    hasFileNameW = true
    const { onNew, onHint } = await startWatcher()

    mockSeq = 1001
    await copyAndSettle()
    expect(onNew).toHaveBeenCalledTimes(1)
    expect(onHint).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(5000)

    mockSeq = 1002
    await copyAndSettle()
    expect(onNew).toHaveBeenCalledTimes(1)
    expect(onHint).toHaveBeenCalledTimes(1)
    expect(formats.readClipboard).toHaveBeenCalledTimes(1)
  })

  it('still captures a different file list after an Explorer copy', async () => {
    mockSeq = 1100
    mockItem = { kind: 'files', paths: ['C:\\a.png', 'C:\\b.png'] }
    hasFileNameW = true
    const { onNew } = await startWatcher()

    mockSeq = 1101
    await copyAndSettle()
    expect(onNew).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(5000)
    mockSeq = 1102
    mockItem = { kind: 'files', paths: ['C:\\c.png'] }
    await copyAndSettle()
    expect(onNew).toHaveBeenCalledTimes(2)
    expect(onNew).toHaveBeenLastCalledWith({ kind: 'files', paths: ['C:\\c.png'] })
  })

  it('still captures a different copy that lands inside the coalesce window', async () => {
    mockSeq = 700
    mockText = 'Alpha'
    mockItem = { kind: 'text', text: 'Alpha' }
    const { onNew } = await startWatcher()

    mockSeq = 701
    await copyAndSettle()
    expect(onNew).toHaveBeenCalledTimes(1)

    mockSeq = 702
    mockText = 'Beta'
    mockItem = { kind: 'text', text: 'Beta' }
    await copyAndSettle()
    expect(onNew).toHaveBeenCalledTimes(2)
    expect(onNew).toHaveBeenLastCalledWith({ kind: 'text', text: 'Beta' })
  })

  it('captures a genuine recopy after paste invalidates the signature', async () => {
    mockSeq = 800
    mockText = 'Paste Then Copy'
    mockItem = { kind: 'text', text: 'Paste Then Copy' }
    const { onNew } = await startWatcher()

    mockSeq = 801
    await copyAndSettle()
    expect(onNew).toHaveBeenCalledTimes(1)

    watcher.invalidateSignature()
    mockSeq = 802
    await copyAndSettle()
    expect(onNew).toHaveBeenCalledTimes(2)
  })

  it('captures a copy that arrives while a previous read is in flight', async () => {
    mockSeq = 900
    mockText = 'First'
    mockItem = { kind: 'text', text: 'First' }

    let hangFirst = true
    let releaseRead: () => void = () => {}
    vi.spyOn(formats, 'readClipboard').mockImplementation(() => {
      const snapshot = mockItem
      if (hangFirst) {
        hangFirst = false
        return new Promise((resolve) => {
          releaseRead = () => resolve(snapshot)
        })
      }
      return Promise.resolve(snapshot)
    })

    const { onNew } = await startWatcher()
    mockSeq = 901
    await vi.advanceTimersByTimeAsync(60)
    await vi.advanceTimersByTimeAsync(220)
    expect(onNew).not.toHaveBeenCalled()

    mockSeq = 902
    mockItem = { kind: 'text', text: 'Second' }
    watcher.nudge()
    releaseRead()
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(220)
    expect(onNew).toHaveBeenCalledTimes(2)
    expect(onNew).toHaveBeenLastCalledWith({ kind: 'text', text: 'Second' })
  })

  it('respects paused state during self-copy and incognito mode', async () => {
    mockSeq = 300
    mockText = 'Initial'
    mockItem = { kind: 'text', text: 'Initial' }
    const { onNew } = await startWatcher()

    watcher.setPaused(true)

    mockSeq = 301
    mockText = 'Copied While Paused'
    mockItem = { kind: 'text', text: 'Copied While Paused' }
    await vi.advanceTimersByTimeAsync(400)

    expect(onNew).not.toHaveBeenCalled()
  })
})
