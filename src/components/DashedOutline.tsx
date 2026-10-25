/**
 * The drag targets' dashed line (drop zone, stacking ring, detach edge).
 *
 * Drawn as SVG instead of a CSS `dashed` border: a border's dashes are thin
 * and short with fixed gaps, while a stroke takes its weight, dash length and
 * gap from one place (`.dashed-outline` in panel.css), the same everywhere.
 * The outline fills its positioned parent; the line runs along one edge of it.
 */
export function DashedOutline({ radius }: { radius: number }) {
  return (
    <svg className="dashed-outline" aria-hidden="true" focusable="false">
      <rect className="dashed-outline-shape" rx={radius} ry={radius} />
    </svg>
  )
}

export function DashedLine({ vertical }: { vertical: boolean }) {
  return (
    <svg className="dashed-outline" aria-hidden="true" focusable="false">
      {vertical ? (
        <line className="dashed-outline-shape" x1="50%" y1="0" x2="50%" y2="100%" />
      ) : (
        <line className="dashed-outline-shape" x1="0" y1="50%" x2="100%" y2="50%" />
      )}
    </svg>
  )
}
