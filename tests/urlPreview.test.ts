import { describe, expect, it } from 'vitest'
import { parseUrlPreview, safeDecodeURIComponent, extractRootDomain, humanizeDomainName, humanizeSlug } from '../src/lib/urlPreview'

describe('safeDecodeURIComponent', () => {
  it('decodes a complete sequence', () => {
    expect(safeDecodeURIComponent('%E3%82%AF')).toBe('ク')
  })

  it('returns the raw string instead of throwing on a truncated %XX', () => {
    expect(() => safeDecodeURIComponent('%E3%82')).not.toThrow()
    expect(safeDecodeURIComponent('%E3%82')).toBe('%E3%82')
    expect(safeDecodeURIComponent('foo%')).toBe('foo%')
  })
})

describe('extractRootDomain with Global eTLD Registry', () => {
  it('resolves complex global multi-part TLDs accurately', () => {
    expect(extractRootDomain('news.bbc.co.uk').rootDomain).toBe('bbc.co.uk')
    expect(extractRootDomain('store.apple.com.au').rootDomain).toBe('apple.com.au')
    expect(extractRootDomain('amazon.co.jp').rootDomain).toBe('amazon.co.jp')
    expect(extractRootDomain('portal.uidai.gov.in').rootDomain).toBe('uidai.gov.in')
    expect(extractRootDomain('g1.globo.com.br').rootDomain).toBe('globo.com.br')
    expect(extractRootDomain('health.gov.bc.ca').rootDomain).toBe('health.gov.bc.ca')
    expect(extractRootDomain('service.sh.cn').rootDomain).toBe('service.sh.cn')
    expect(extractRootDomain('startup.co.kr').rootDomain).toBe('startup.co.kr')
  })

  it('resolves standard gTLDs', () => {
    expect(extractRootDomain('sub.domain.example.com').rootDomain).toBe('example.com')
    expect(extractRootDomain('api.github.com').rootDomain).toBe('github.com')
    expect(extractRootDomain('app.linear.app').rootDomain).toBe('linear.app')
  })
})

describe('humanizeDomainName with Acronym & CamelCase Intelligence', () => {
  it('humanizes unknown domains cleanly with proper casing and acronyms', () => {
    expect(humanizeDomainName('super-ai-tools')).toBe('Super AI Tools')
    expect(humanizeDomainName('myCoolApiDev')).toBe('My Cool API DEV')
    expect(humanizeDomainName('fast-ui-sdk')).toBe('Fast UI SDK')
    expect(humanizeDomainName('hacker-news-feed')).toBe('Hacker News Feed')
  })
})

describe('humanizeSlug for URL Path Segments', () => {
  it('cleans and title-cases path slugs', () => {
    expect(humanizeSlug('how-to-build-a-neural-network.html')).toBe('How to Build a Neural Network')
    expect(humanizeSlug('release-v2.0.0_final')).toBe('Release V2.0.0 Final')
    expect(humanizeSlug('12345678abcdef0123456789')).toBe('') // Ignores hex hashes
  })
})

describe('parseUrlPreview never throws on truncated long URLs', () => {
  it('survives a cut in the middle of a percent-encoded Japanese path', () => {
    const truncated =
      'https://www.amazon.co.jp/%E3%82%AF%E3%83%AF%E3%83%88%E3%82%B8%E3%83%A3%E3%83%91%E3%83%B3/' +
      'dp/B0EXAMPLE/%E3%82%B8%'
    expect(() => parseUrlPreview(truncated)).not.toThrow()
    const info = parseUrlPreview(truncated)
    expect(info.domain).toContain('amazon.co.jp')
    expect(info.serviceName).toBe('Amazon')
  })

  it('survives an incomplete UTF-8 percent triplet in the last segment', () => {
    const truncated = 'https://www.amazon.co.jp/foo/%E3%82'
    expect(() => parseUrlPreview(truncated)).not.toThrow()
    const info = parseUrlPreview(truncated)
    expect(info.domain).toBe('amazon.co.jp')
  })
})

describe('parseUrlPreview tracking parameter stripper', () => {
  it('strips tracking parameters from cleanUrl and displayPath', () => {
    const dirty = 'https://theverge.com/tech/2026/cool-gadget?utm_source=twitter&utm_medium=social&fbclid=IwAR123&gclid=456&si=xyz&keep=1'
    const info = parseUrlPreview(dirty)
    expect(info.cleanUrl).not.toContain('utm_source')
    expect(info.cleanUrl).not.toContain('fbclid')
    expect(info.cleanUrl).not.toContain('gclid')
    expect(info.cleanUrl).not.toContain('si=xyz')
    expect(info.cleanUrl).toContain('keep=1')
    expect(info.serviceName).toBe('The Verge')
  })
})

describe('parseUrlPreview deep semantic path extractors', () => {
  it('extracts GitHub PRs, Issues, and Repos', () => {
    const pr = parseUrlPreview('https://github.com/facebook/react/pull/28000')
    expect(pr.title).toBe('facebook/react · Pull Request #28000')
    expect(pr.subtitle).toBe('Pull Request')
    expect(pr.serviceName).toBe('GitHub')

    const issue = parseUrlPreview('https://github.com/microsoft/vscode/issues/199000')
    expect(issue.title).toBe('microsoft/vscode · Issue #199000')
    expect(issue.subtitle).toBe('Issue')

    const repo = parseUrlPreview('https://github.com/kushagrasinghx/BitChord.git')
    expect(repo.title).toBe('kushagrasinghx/BitChord')
    expect(repo.subtitle).toBe('GitHub Repository')
  })

  it('extracts YouTube videos, shorts, and channels', () => {
    const vid = parseUrlPreview('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
    expect(vid.title).toBe('YouTube Video (dQw4w9WgXcQ)')
    expect(vid.serviceName).toBe('YouTube')

    const shorts = parseUrlPreview('https://youtube.com/shorts/abc123xyz')
    expect(shorts.title).toBe('YouTube Shorts · abc123xyz')
    expect(shorts.subtitle).toBe('Shorts')
  })

  it('extracts Reddit subreddits and posts', () => {
    const post = parseUrlPreview('https://www.reddit.com/r/reactjs/comments/12345/awesome_new_state_manager/')
    expect(post.title).toBe('r/reactjs · Awesome New State Manager')
    expect(post.subtitle).toBe('Reddit Post')

    const sub = parseUrlPreview('https://reddit.com/r/webdev')
    expect(sub.title).toBe('r/webdev')
    expect(sub.subtitle).toBe('Subreddit')
  })

  it('extracts Wikipedia articles with proper decoding', () => {
    const wiki = parseUrlPreview('https://en.wikipedia.org/wiki/Artificial_intelligence')
    expect(wiki.title).toBe('Artificial intelligence')
    expect(wiki.subtitle).toBe('Wikipedia Article')
  })

  it('extracts AI, Dev & Knowledge platform metadata', () => {
    const claude = parseUrlPreview('https://claude.ai/chat/abc-123')
    expect(claude.serviceName).toBe('Claude')

    const chatgpt = parseUrlPreview('https://chatgpt.com/g/g-1234')
    expect(chatgpt.serviceName).toBe('ChatGPT')

    const arxiv = parseUrlPreview('https://arxiv.org/abs/2401.12345')
    expect(arxiv.title).toBe('arXiv Paper · 2401.12345')
    expect(arxiv.serviceName).toBe('arXiv')

    const npm = parseUrlPreview('https://www.npmjs.com/package/@types/react')
    expect(npm.title).toBe('npm · @types/react')
    expect(npm.serviceName).toBe('npm')
  })
})
