/**
 * Split a file-kind folder icon (resources/file-icons/<kind>.svg) into the
 * layers its hover "opening" moves: the back panel, the three papers and the
 * front glass pocket. Each layer is a standalone SVG with the icon's full
 * <defs>, so its gradients and filters render exactly as in the whole icon,
 * and stacking the five in order draws the original icon (measured: mean
 * difference 0.013 of 255 at 136px).
 *
 * The art keeps its own structure (all 13 icons share it):
 *   <svg><defs>…</defs>
 *    <g transform="translate(0 14)">
 *     shadows, panel, panel light          -> back
 *     <g id="<kind>-contents"> 3 papers </g> -> paper1 (back right),
 *                                            paper2 (middle), paper3 (front left)
 *     <g mask="url(#<kind>-mask)"> … </g>   -> front (frosts the papers through
 *                                            <use>, so they stay in its <defs>)
 *    </g>
 *   </svg>
 * Returns null when a file does not have that shape; the icon then simply
 * does not open.
 */

export const ICON_LAYER_PARTS = ['back', 'paper1', 'paper2', 'paper3', 'front'] as const
export type IconLayerPart = (typeof ICON_LAYER_PARTS)[number]

const OUTER_OPEN = '<g transform="translate(0 14)">'

/** The direct child <g>…</g> elements of a fragment, in order. */
function childGroups(fragment: string): string[] {
  const out: string[] = []
  const tag = /<(\/?)g\b[^>]*?(\/?)>/g
  let depth = 0
  let start = -1
  for (let m = tag.exec(fragment); m; m = tag.exec(fragment)) {
    const closing = m[1] === '/'
    const selfClosing = m[2] === '/'
    if (selfClosing) continue
    if (!closing) {
      if (depth === 0) start = m.index
      depth++
    } else {
      depth--
      if (depth === 0 && start >= 0) {
        out.push(fragment.slice(start, m.index + m[0].length))
        start = -1
      }
      if (depth < 0) return []
    }
  }
  return depth === 0 ? out : []
}

/** All five layers of an icon, in drawing order, or null. */
export function fileIconLayers(svg: string): Record<IconLayerPart, string> | null {
  const defsEnd = svg.indexOf('</defs>')
  if (defsEnd < 0) return null
  const head = svg.slice(0, defsEnd + '</defs>'.length)
  const outerAt = svg.indexOf(OUTER_OPEN, defsEnd)
  const contentsMatch = /<g id="[a-z]+-contents">/.exec(svg)
  const maskMatch = /<g mask="url\(#[a-z]+-mask\)">/.exec(svg)
  const outerClose = svg.lastIndexOf('</g>')
  if (outerAt < 0 || !contentsMatch || !maskMatch || outerClose < 0) return null
  const contentsAt = contentsMatch.index
  const maskAt = maskMatch.index
  if (!(outerAt < contentsAt && contentsAt < maskAt && maskAt < outerClose)) return null

  const contents = svg.slice(contentsAt, maskAt).trim()
  if (childGroups(contents).length !== 1) return null
  const papers = childGroups(contents.slice(contentsMatch[0].length, contents.length - '</g>'.length))
  if (papers.length !== 3) return null

  const wrap = (body: string): string => `${head}\n ${OUTER_OPEN}\n  ${body.trim()}\n </g>\n</svg>\n`
  return {
    back: wrap(svg.slice(outerAt + OUTER_OPEN.length, contentsAt)),
    paper1: wrap(papers[0]),
    paper2: wrap(papers[1]),
    paper3: wrap(papers[2]),
    // the pocket frosts the papers through <use href="#…-contents">: keep them
    // defined, not drawn
    front: wrap(`<defs>${contents}</defs>${svg.slice(maskAt, outerClose)}`)
  }
}
