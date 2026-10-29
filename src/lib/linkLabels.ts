/**
 * The words a link card shows about a link ("Wikipedia · Article", "This computer", "Starts at 1:05"),
 * in the user's language. parseUrlPreview keeps returning its English words (its results are cached by
 * URL, whatever the language); they are put into the language here, when a card is drawn. Site and
 * platform names (GitHub, Gist, GPT, …) and anything taken from the link itself pass through as they are.
 */
import { t } from '../i18n'
import type { UrlPreviewInfo } from './urlPreview'

/** parseUrlPreview's page kinds → `link.*` keys. */
const KINDS: Record<string, string> = {
  Album: 'album', Answer: 'answer', App: 'app', Article: 'article', Artist: 'artist', Board: 'board', Call: 'call',
  Card: 'card', Channel: 'channel', Chat: 'chat', Clip: 'clip', Commit: 'commit', Community: 'community',
  'Community file': 'communityFile', Company: 'company', Conversation: 'conversation', Dataset: 'dataset',
  Design: 'design', Directions: 'directions', Discussion: 'discussion', Document: 'document', Drawing: 'drawing',
  Episode: 'episode', Event: 'event', 'FigJam board': 'figjamBoard', File: 'file', Folder: 'folder', Form: 'form',
  Game: 'game', 'Go package': 'goPackage', Group: 'group', 'Group invite': 'groupInvite', 'Group post': 'groupPost',
  Image: 'image', 'Image search': 'imageSearch', Invite: 'invite', Issue: 'issue', Issues: 'issues', Job: 'job',
  Jobs: 'jobs', Live: 'live', 'Local file': 'localFile', Map: 'map', Marketplace: 'marketplace',
  'Marketplace item': 'marketplaceItem', Meeting: 'meeting', 'Merge request': 'mergeRequest', Message: 'message',
  Model: 'model', Package: 'package', Page: 'page', Paper: 'paper', Person: 'person', 'Personal room': 'personalRoom',
  Photo: 'photo', Pin: 'pin', Place: 'place', Playlist: 'playlist', 'Playlist video': 'playlistVideo',
  Podcast: 'podcast', Post: 'post', Presentation: 'presentation', Problem: 'problem', Product: 'product',
  Profile: 'profile', Project: 'project', Prototype: 'prototype', 'Pull request': 'pullRequest',
  'Pull requests': 'pullRequests', 'Python package': 'pythonPackage', Question: 'question', 'Raw file': 'rawFile',
  Recording: 'recording', Reel: 'reel', Releases: 'releases', Repository: 'repository', 'Rust crate': 'rustCrate',
  School: 'school', Search: 'search', 'Shared chat': 'sharedChat', 'Shared conversation': 'sharedConversation',
  'Shared file': 'sharedFile', 'Shared link': 'sharedLink', Short: 'short', 'Short link': 'shortLink',
  Slides: 'slides', Song: 'song', Space: 'space', Spreadsheet: 'spreadsheet', Story: 'story', Tag: 'tag',
  Title: 'title', Track: 'track', Video: 'video', Watch: 'watch', Webinar: 'webinar', Wiki: 'wiki'
}

/** Names parseUrlPreview gives a link that has no site of its own. */
const NAMES: Record<string, string> = {
  Email: 'email', Phone: 'phone', File: 'file', 'This computer': 'thisComputer', 'Local network': 'localNetwork',
  'Web Link': 'webLink'
}

function kind(s: string | undefined): string | undefined {
  if (!s) return s
  const key = KINDS[s]
  if (key) return t(`link.${key}`)
  const release = /^Release (.+)$/.exec(s)
  if (release) return t('link.release', { name: release[1] })
  const port = /^Port (\d+)$/.exec(s)
  if (port) return t('link.port', { port: port[1] })
  return s
}

function name(s: string): string {
  const key = NAMES[s]
  return key ? t(`link.${key}`) : s
}

/** `info` with its words in the user's language (call it where the card is drawn, not cached). */
export function localizeLinkInfo(info: UrlPreviewInfo): UrlPreviewInfo {
  const starts = info.title ? /^Starts at (.+)$/.exec(info.title) : null
  return {
    ...info,
    serviceName: name(info.serviceName),
    domain: info.domain === 'This computer' ? t('link.thisComputer') : info.domain,
    subtitle: kind(info.subtitle),
    title: starts ? t('link.startsAt', { time: starts[1] }) : info.title
  }
}
