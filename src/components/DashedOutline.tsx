/**
 * The drag targets' dashed outline (drop zone, stacking ring).
 *
 * Drawn as SVG instead of a CSS `dashed` border: a border's dashes are thin
 * and short with fixed gaps, while a stroke takes its weight, dash length and
 * gap from one place (`.dashed-outline` in panel.css), the same everywhere.
 * The outline fills its positioned parent.
 */
export function DashedOutline({ radius }: { radius: number }) {
  return (
    <svg className="dashed-outline" aria-hidden="true" focusable="false">
      <rect className="dashed-outline-shape" rx={radius} ry={radius} />
    </svg>
  )
}
