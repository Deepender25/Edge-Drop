/**
 * Example clipboard items the onboarding tour plays with. They only ever live
 * in the onboarding window's own store; nothing here is saved or sent to main.
 * Paths are made up and never opened: the shelf is inert during the tour.
 *
 * They tell one small story (a weekend in the mountains), and the pictures are
 * drawn in the wallpaper's own style, so the demo feels like one world. Their
 * words are in the user's language (`tour.*`), read each time they are used.
 */
import type { ClipboardItemDto, FileEntry } from '../../shared/types'
import { getResolvedLanguage, t } from '../i18n'
import summitUrl from '../assets/onboarding/summit.png'

export const DEMO_DIR = 'C:\\Users\\You\\Documents\\'
const DIR = DEMO_DIR

/** The photo of the summit (it carries its own thumbnail: the app would make one from the file). */
export const photoName = () => `${t('tour.filePhoto')}.png`

function file(name: string, size: number): FileEntry {
  const preview = name === photoName() ? summitUrl : undefined
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

/** The web page's title (also the link card's). */
export const pageTitle = () => t('tour.pageTitle')

/** The sentence selected on the web page in the copy demo, line by line as the page lays it out. */
export const pageLines = () => [t('tour.line1'), t('tour.line2'), t('tour.line3')]

/** The sentence as one text: Chinese and Japanese lines join without a space. */
export function pageText(): string {
  const joiner = /^(zh|ja)/.test(getResolvedLanguage()) ? '' : ' '
  return pageLines().join(joiner)
}

export function demoText(at: number): ClipboardItemDto {
  return {
    id: 'demo-text',
    capturedAt: at,
    hitCount: 1,
    pinned: false,
    data: { kind: 'text', isUrl: false, text: pageText() }
  }
}

/** The page's address, dragged in from the browser's address bar (with its title, as browsers give it). */
export function demoLink(at: number): ClipboardItemDto {
  return {
    id: 'demo-link',
    capturedAt: at,
    hitCount: 1,
    pinned: false,
    data: { kind: 'text', isUrl: true, text: 'https://en.wikipedia.org/wiki/Sea_of_clouds', linkTitle: pageTitle() }
  }
}

export function demoImage(at: number): ClipboardItemDto {
  return {
    id: 'demo-image',
    capturedAt: at,
    hitCount: 1,
    pinned: false,
    data: { kind: 'image', preview: summitUrl, imageId: 'demo-summit', width: 1920, height: 1200, bytes: 1_284_600, ext: 'png', fileName: photoName() }
  }
}

/**
 * The three files selected in File Explorer and dragged in at once: they land as one stack. The itinerary
 * is the one later pulled out of it (the expanded stack's first row); the slides' orange folder then
 * stands in front of what is left, ahead of the (blue) photo dropped onto it, where Word's blue would
 * blend in.
 */
export const stackFiles = (): Array<[string, number]> => [
  [`${t('tour.fileItinerary')}.pdf`, 412_000],
  [`${t('tour.fileSlides')}.pptx`, 2_318_400],
  [`${t('tour.fileBudget')}.xlsx`, 144_639]
]

/** The rest of the folder in File Explorer, above the three that are dragged in. */
export const otherFiles = (): Array<[string, number]> => [
  [`${t('tour.fileChecklist')}.txt`, 2_150],
  [`${t('tour.filePacking')}.docx`, 96_426],
  [`${t('tour.filePhotos')}.zip`, 18_874_368]
]

/** The three files as they land: one stack (`names`: what is left in it). */
export function demoStack(at: number, names = stackFiles()): ClipboardItemDto {
  return files('demo-stack', names, at)
}

/** The itinerary pulled out of the stack: a card of its own (with the note the tour gives it later). */
export function demoPdf(at: number, note?: string): ClipboardItemDto {
  const it = files('demo-pdf', [stackFiles()[0]], at)
  return note ? { ...it, note } : it
}

/**
 * What is left of the stack once the itinerary is out, with the photo dropped onto it (main's merge: the
 * target's files, then the dropped one's).
 */
export function demoStackWithPhoto(at: number): ClipboardItemDto {
  return files('demo-stack', [...stackFiles().slice(1), [photoName(), 1_284_600]], at)
}

/**
 * The note the tour adds to the itinerary from its right-click menu, and what it then types in search to
 * find it: a word only the note has, so the shelf narrows to that card as it is typed.
 */
export const demoNote = () => t('tour.note')
export const demoQuery = () => t('tour.query')
