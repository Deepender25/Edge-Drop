export type StickPosition = 'left' | 'right'

export interface DisplayInfo {
  id: number
  workArea: { x: number; y: number; width: number; height: number }
}

export interface StickBoundsParams {
  position: StickPosition
  displays: DisplayInfo[]
  displayId?: number
  windowWidth: number
  windowHeight: number
  currentBounds?: { x: number; y: number }
}

export interface StickBoundsResult {
  x: number
  y: number
  width: number
  height: number
  displayId: number
}

export function computeStickBounds(params: StickBoundsParams): StickBoundsResult {
  const { position, displays, displayId, windowWidth, currentBounds } = params

  let display: DisplayInfo | undefined

  if (displayId !== undefined) {
    display = displays.find(d => d.id === displayId)
  }

  if (!display && displayId === undefined && currentBounds) {
    const nearest = findNearestDisplay(displays, currentBounds)
    if (nearest) display = nearest
  }

  if (!display) {
    display = displays.find(d => (d as any).isPrimary) || displays[0]
  }

  const wa = display.workArea

  let x: number
  let y: number
  let width = windowWidth
  let height: number

  switch (position) {
    case 'left':
      x = wa.x
      y = wa.y
      height = wa.height
      break
    case 'right':
      x = wa.x + wa.width - windowWidth
      y = wa.y
      height = wa.height
      break

  }

  return { x, y, width, height, displayId: display.id }
}

function findNearestDisplay(displays: DisplayInfo[], point: { x: number; y: number }): DisplayInfo | undefined {
  let nearest: DisplayInfo | undefined
  let minDist = Infinity
  for (const d of displays) {
    const cx = d.workArea.x + d.workArea.width / 2
    const cy = d.workArea.y + d.workArea.height / 2
    const dx = cx - point.x
    const dy = cy - point.y
    const dist = dx * dx + dy * dy
    if (dist < minDist) {
      minDist = dist
      nearest = d
    }
  }
  return nearest
}
