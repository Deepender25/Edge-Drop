import { describe, expect, it } from 'vitest'
import { isUpdateMode, resolveUpdateMode } from '../shared/types'

describe('updateMode resolution and legacy migration', () => {
  it('defaults to auto when nothing is stored', () => {
    expect(resolveUpdateMode({})).toBe('auto')
  })

  it('prefers a stored valid mode over the legacy boolean', () => {
    expect(resolveUpdateMode({ updateMode: 'notify', autoUpdates: true })).toBe('notify')
    expect(resolveUpdateMode({ updateMode: 'off', autoUpdates: true })).toBe('off')
    expect(resolveUpdateMode({ updateMode: 'auto', autoUpdates: false })).toBe('auto')
  })

  it('migrates legacy booleans: on stays auto, off becomes notify', () => {
    expect(resolveUpdateMode({ autoUpdates: true })).toBe('auto')
    expect(resolveUpdateMode({ autoUpdates: false })).toBe('notify')
  })

  it('falls back to the legacy boolean on corrupt mode values', () => {
    expect(resolveUpdateMode({ updateMode: 'sometimes' as never, autoUpdates: false })).toBe('notify')
    expect(resolveUpdateMode({ updateMode: '' as never })).toBe('auto')
  })

  it('validates mode values', () => {
    expect(isUpdateMode('auto')).toBe(true)
    expect(isUpdateMode('notify')).toBe(true)
    expect(isUpdateMode('off')).toBe(true)
    expect(isUpdateMode('sometimes')).toBe(false)
    expect(isUpdateMode(undefined)).toBe(false)
  })
})
