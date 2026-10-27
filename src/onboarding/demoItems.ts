/**
 * Example clipboard items the onboarding tour plays with. They only ever live
 * in the onboarding window's own store; nothing here is saved or sent to main.
 * Paths are made up and never opened: the shelf is inert during the tour.
 *
 * They tell one small story (a weekend in the mountains), and the pictures are
 * drawn in the wallpaper's own style, so the demo feels like one world.
 */
import type { ClipboardItemDto, FileEntry } from '../../shared/types'
import summitUrl from '../assets/onboarding/summit.png'

export const DEMO_DIR = 'C:\\Users\\You\\Documents\\'
const DIR = DEMO_DIR

/** Pictures carry their own thumbnail (the app would make one from the file, which does not exist here). */
const PICTURES: Record<string, string> = { 'Summit.png': summitUrl }

function file(name: string, size: number): FileEntry {
  const preview = PICTURES[name]
  return { name, ext: name.split('.').pop() ?? '', size, isImage: !!preview, ...(preview ? { preview } : {}) }
}

function files(id: string, names: Array<[string, number]>, at: number): ClipboardItemDto {
  return {
    id,
    capturedAt: at,
    hitCount: 1,
    pinned: false,
    data: { kind: 'files', paths: names.map(([n]) => DIR + n), entries: names.map(([n, s]) => file(n, s)) }
  }
}

/** The sentence selected on the web page in the copy demo, line by line as the page lays it out. */
export const PAGE_LINES = [
  'A sea of clouds forms when cloud fills the',
  'valleys below a summit, and the peaks stand',
  'above it like islands.'
]

export function demoText(at: number): ClipboardItemDto {
  return {
    id: 'demo-text',
    capturedAt: at,
    hitCount: 1,
    pinned: false,
    data: { kind: 'text', isUrl: false, text: PAGE_LINES.join(' ') }
  }
}

export function demoLink(at: number): ClipboardItemDto {
  return {
    id: 'demo-link',
    capturedAt: at,
    hitCount: 1,
    pinned: false,
    data: { kind: 'text', isUrl: true, text: 'https://en.wikipedia.org/wiki/Sea_of_clouds' }
  }
}

export function demoImage(at: number): ClipboardItemDto {
  return {
    id: 'demo-image',
    capturedAt: at,
    hitCount: 1,
    pinned: false,
    data: { kind: 'image', preview: summitUrl, imageId: 'demo-summit', width: 1920, height: 1200, bytes: 1_284_600, ext: 'png', fileName: 'Summit.png' }
  }
}

export function demoPdf(at: number): ClipboardItemDto {
  return files('demo-pdf', [['Itinerary.pdf', 412_000]], at)
}

/** Three files of different kinds, selected in File Explorer and copied at once: they arrive as one stack. */
export const STACK_FILES: Array<[string, number]> = [
  ['Packing list.docx', 96_426],
  ['Budget.xlsx', 144_639],
  ['Trip slides.pptx', 2_318_400]
]

export function demoStack(at: number, names = STACK_FILES): ClipboardItemDto {
  return files('demo-stack', names, at)
}

/** One file pulled out of the stack becomes a card of its own. */
export function demoSingle(at: number, name: [string, number]): ClipboardItemDto {
  return files('demo-single', [name], at)
}

/** The image dropped onto the single file: one stack holding both. */
export function demoMerged(at: number, name: [string, number]): ClipboardItemDto {
  return {
    id: 'demo-single',
    capturedAt: at,
    hitCount: 1,
    pinned: false,
    data: {
      kind: 'files',
      paths: [DIR + 'Summit.png', DIR + name[0]],
      entries: [file('Summit.png', 1_284_600), file(name[0], name[1])]
    }
  }
}
