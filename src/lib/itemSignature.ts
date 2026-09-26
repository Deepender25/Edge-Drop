/**
 * Stable render-identity key for clipboard item cards.
 *
 * WHY: every `state:items` push serialises the whole history into brand-new
 * DTO objects. React.memo's default shallow prop compare then sees "new
 * object" for every card and re-renders the entire list on each push — even
 * though hundreds of items did not change. This key captures exactly the
 * fields a card renders, so the memo comparator can prove two pushes are
 * visually identical for a given card and skip its re-render entirely.
 *
 * Any field a card actually displays is included. Fields added to the DTO in
 * the future must be mirrored here ONLY if they start being rendered.
 */
import type { ClipboardItemDto } from '../../shared/types'

const renderKeyCache = new WeakMap<ClipboardItemDto, string>()

export function itemRenderKey(item: ClipboardItemDto): string {
  const cached = renderKeyCache.get(item)
  if (cached !== undefined) return cached

  const d = item.data
  let key: string
  switch (d.kind) {
    case 'text':
      // text feeds both the plain preview and the offline link-preview card;
      // isUrl switches the whole body layout. Do not include html: Excel
      // CF_HTML can be megabytes and cards never render it.
      key = `t|${d.isUrl ? 1 : 0}|${d.isColor ? 1 : 0}|${d.text}`
      break
    case 'image':
      key = `i|${d.imageId}|${d.width}x${d.height}|${d.bytes}|${d.ext ?? ''}|${d.source ?? ''}|${d.fileName ?? ''}|${d.preview}`
      break
    case 'image-collection':
      key = `c|${d.images
        .map((i) => `${i.imageId},${i.width},${i.height},${i.bytes},${i.ext ?? ''},${i.preview}`)
        .join(';')}`
      break
    case 'files': {
      const entries =
        d.entries
          ?.map(
            (en) =>
              `${en.name},${en.size},${en.isImage ? 1 : 0},${en.isDirectory ? 1 : 0},${en.preview ?? ''}`
          )
          .join(';') ?? ''
      key = `f|${d.paths.join('\n')}|${entries}`
      break
    }
  }

  renderKeyCache.set(item, key)
  return key
}
