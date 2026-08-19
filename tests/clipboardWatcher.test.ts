import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ClipboardWatcher } from '../electron/clipboard/ClipboardWatcher'
import * as formats from '../electron/clipboard/formats'

describe('ClipboardWatcher Re-Copy Detection & Flare Flow', () => {
  let watcher: ClipboardWatcher

  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    if (watcher) watcher.stop()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('detects re-copies of the identical item when the OS sequence number increments', async () => {
    let mockSeq = 100
    let mockText = 'Hello Edge-Drop'

    vi.spyOn(formats, 'clipboardSignature').mockImplementation(() => `seq:${mockSeq}:text:${mockText}`)
    vi.spyOn(formats, 'readClipboard').mockImplementation(async () => ({ kind: 'text', text: mockText }))

    const onNew = vi.fn()
    watcher = new ClipboardWatcher(50)
    watcher.start(onNew)

    // Initially seeded — no callback on tick 1
    await vi.advanceTimersByTimeAsync(60)
    expect(onNew).not.toHaveBeenCalled()

    // 1. User copies the exact same text again in the OS (sequence number increments)
    mockSeq = 101
    await vi.advanceTimersByTimeAsync(60) // interval tick
    await vi.advanceTimersByTimeAsync(160) // settling window timeout

    expect(onNew).toHaveBeenCalledTimes(1)
    expect(onNew).toHaveBeenCalledWith({ kind: 'text', text: 'Hello Edge-Drop' })

    // 2. Ticks without any new copy action do NOT fire
    await vi.advanceTimersByTimeAsync(200)
    expect(onNew).toHaveBeenCalledTimes(1)

    // 3. User copies the exact same text a third time (sequence number increments again)
    mockSeq = 102
    await vi.advanceTimersByTimeAsync(60)
    await vi.advanceTimersByTimeAsync(160)

    expect(onNew).toHaveBeenCalledTimes(2)
  })

  it('detects brand new items when content changes', async () => {
    let mockSeq = 200
    let mockText = 'First Item'

    vi.spyOn(formats, 'clipboardSignature').mockImplementation(() => `seq:${mockSeq}:text:${mockText}`)
    vi.spyOn(formats, 'readClipboard').mockImplementation(async () => ({ kind: 'text', text: mockText }))

    const onNew = vi.fn()
    watcher = new ClipboardWatcher(50)
    watcher.start(onNew)

    await vi.advanceTimersByTimeAsync(60)
    expect(onNew).not.toHaveBeenCalled()

    // Change to a new item
    mockSeq = 201
    mockText = 'Second Item'
    await vi.advanceTimersByTimeAsync(60)
    await vi.advanceTimersByTimeAsync(160)

    expect(onNew).toHaveBeenCalledTimes(1)
    expect(onNew).toHaveBeenCalledWith({ kind: 'text', text: 'Second Item' })
  })

  it('respects paused state during self-copy and incognito mode', async () => {
    let mockSeq = 300
    let mockText = 'Initial'

    vi.spyOn(formats, 'clipboardSignature').mockImplementation(() => `seq:${mockSeq}:text:${mockText}`)
    vi.spyOn(formats, 'readClipboard').mockImplementation(async () => ({ kind: 'text', text: mockText }))

    const onNew = vi.fn()
    watcher = new ClipboardWatcher(50)
    watcher.start(onNew)

    watcher.setPaused(true)

    mockSeq = 301
    mockText = 'Copied While Paused'
    await vi.advanceTimersByTimeAsync(300)

    expect(onNew).not.toHaveBeenCalled()
  })
})
