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

export function itemRenderKey(item: ClipboardItemDto): string {
  const d = item.data
  switch (d.kind) {
    case 'text':
      // text feeds both the plain preview and the offline link-preview card;
      // isUrl switches the whole body layout. html/isColor included for
      // future-proofing at negligible cost (text is capped at 300 chars).
      return `t|${d.isUrl ? 1 : 0}|${d.isColor ? 1 : 0}|${d.text}|${d.html ?? ''}`
    case 'image':
      return `i|${d.imageId}|${d.width}x${d.height}|${d.bytes}|${d.ext ?? ''}|${d.source ?? ''}|${d.fileName ?? ''}|${d.preview}`
    case 'image-collection':
      return `c|${d.images
        .map((i) => `${i.imageId},${i.width},${i.height},${i.bytes},${i.ext ?? ''},${i.preview}`)
        .join(';')}`
    case 'files': {
      const entries =
        d.entries
          ?.map(
            (en) =>
              `${en.name},${en.size},${en.isImage ? 1 : 0},${en.isDirectory ? 1 : 0},${en.preview ?? ''}`
          )
          .join(';') ?? ''
      return `f|${d.paths.join('\n')}|${entries}`
    }
  }
}
