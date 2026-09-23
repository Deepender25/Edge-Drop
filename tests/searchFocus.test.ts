import { describe, expect, it } from 'vitest'
import { noteSearchEngaged, takeSearchEngaged } from '../src/lib/searchFocus'

describe('search engagement flag', () => {
  it('starts disengaged and takes exactly once', () => {
    expect(takeSearchEngaged()).toBe(false)
    noteSearchEngaged(true)
    expect(takeSearchEngaged()).toBe(true)
    expect(takeSearchEngaged()).toBe(false)
  })

  it('can be cleared without taking', () => {
    noteSearchEngaged(true)
    noteSearchEngaged(false)
    expect(takeSearchEngaged()).toBe(false)
  })
})
