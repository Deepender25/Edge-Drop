import { describe, expect, it } from 'vitest'
import { fitPreviewImage, type PreviewImageBounds } from '../src/lib/previewImageFit'

// Side dock: 440 normal, up to 526 (820px preview window - 270 blade - 24 gaps).
const side: PreviewImageBounds = { minFlyoutWidth: 440, maxFlyoutWidth: 526, maxImageHeight: 560, sidePadding: 40, devicePixelRatio: 1 }
// Top dock: up to 760 wide, shorter.
const top: PreviewImageBounds = { ...side, maxFlyoutWidth: 760, maxImageHeight: 380 }

describe('fitPreviewImage', () => {
  it('a full-screen screenshot widens the flyout instead of shrinking to ~20%', () => {
    expect(fitPreviewImage(1920, 1080, side)).toEqual({ flyoutWidth: 526, width: 486, height: 273, scroll: false })
    const t = fitPreviewImage(1920, 1080, top)
    // height-limited here: 676 x 380 (was 400 x 225)
    expect(t).toEqual({ flyoutWidth: 716, width: 676, height: 380, scroll: false })
  })

  it('a long screenshot is drawn at full width and scrolls, not squeezed to a sliver', () => {
    expect(fitPreviewImage(1080, 2400, side)).toEqual({ flyoutWidth: 526, width: 486, height: 1080, scroll: true })
    expect(fitPreviewImage(800, 6000, top)).toMatchObject({ width: 720, scroll: true })
  })

  it('a portrait photo still fits whole', () => {
    const f = fitPreviewImage(600, 900, side)
    expect(f.scroll).toBe(false)
    expect(f.height).toBe(560)
    expect(f.width).toBe(373)
    expect(f.flyoutWidth).toBe(440)
  })

  it('a small icon is enlarged at most 2x and never widens the flyout', () => {
    expect(fitPreviewImage(48, 48, side)).toEqual({ flyoutWidth: 440, width: 96, height: 96, scroll: false })
    // on a 2x screen, 2 screen pixels per image pixel is already 2x
    expect(fitPreviewImage(48, 48, { ...side, devicePixelRatio: 2 })).toMatchObject({ width: 48, height: 48 })
  })

  it('an image a bit wider than the normal flyout is shown at its own size, not stretched', () => {
    expect(fitPreviewImage(480, 360, side)).toEqual({ flyoutWidth: 520, width: 480, height: 360, scroll: false })
  })

  it('a medium image keeps the normal flyout and fills its width as before', () => {
    expect(fitPreviewImage(300, 200, side)).toEqual({ flyoutWidth: 440, width: 400, height: 267, scroll: false })
  })

  it('never exceeds the window: width, and height unless scrolling', () => {
    for (const [w, h] of [[5000, 5000], [10000, 200], [200, 10000], [1, 1], [4096, 2160], [2560, 1600]]) {
      for (const b of [side, top, { ...side, devicePixelRatio: 1.5 }]) {
        const f = fitPreviewImage(w, h, b)
        expect(f.flyoutWidth).toBeGreaterThanOrEqual(b.minFlyoutWidth)
        expect(f.flyoutWidth).toBeLessThanOrEqual(b.maxFlyoutWidth)
        expect(f.width).toBeLessThanOrEqual(b.maxFlyoutWidth - b.sidePadding)
        if (!f.scroll) expect(f.height).toBeLessThanOrEqual(b.maxImageHeight)
      }
    }
  })

  it('bad sizes fall back to the normal flyout', () => {
    expect(fitPreviewImage(0, 0, side).flyoutWidth).toBe(440)
    expect(fitPreviewImage(NaN, 100, side).flyoutWidth).toBe(440)
  })
})
