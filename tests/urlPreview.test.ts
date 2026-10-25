import { describe, expect, it } from 'vitest'
import { parseUrlPreview, safeDecodeURIComponent, extractRootDomain, humanizeDomainName, humanizeSlug, cleanLink, unwrapRedirect, hostToUnicode, externalHref } from '../src/lib/urlPreview'
import { isLinkText, linkTitleFromHtml } from '../shared/linkText'

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
    expect(humanizeDomainName('myCoolApiDev')).toBe('My Cool API Dev')
    expect(humanizeSlug('made-in-india')).toBe('Made in India')
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

/** What the card shows: top line, body, and the link line under a title. */
function card(url: string, pageTitle?: string) {
  const i = parseUrlPreview(url)
  const top = i.subtitle ? `${i.serviceName} · ${i.subtitle}` : i.serviceName
  const t = (pageTitle || i.title || '').trim()
  const has = !!t && t.toLowerCase() !== i.displayUrl.toLowerCase() && t.toLowerCase() !== i.domain.toLowerCase() && t.toLowerCase() !== i.serviceName.toLowerCase()
  return { top, body: has ? t : i.displayUrl, link: has ? i.displayUrl : undefined }
}

describe('titles: the path part that reads like a title, never an ID', () => {
  it('product pages show the product, not codes or tracking', () => {
    expect(card('https://www.amazon.in/Apple-iPhone-15-128-GB/dp/B0CHX1W1XY/ref=sr_1_3?crid=2X&keywords=iphone')).toMatchObject({ top: 'Amazon · Product', body: 'Apple iPhone 15 128 GB' })
    expect(card('https://www.flipkart.com/apple-iphone-15-black-128-gb/p/itm6ac6485515ae4')).toMatchObject({ top: 'Flipkart · Product', body: 'Apple iPhone 15 Black 128 GB' })
    // an Amazon link with only the product code: no made-up title
    expect(card('https://www.amazon.co.uk/dp/B09G9FPHY6')).toEqual({ top: 'Amazon · Product', body: 'amazon.co.uk/dp/B09G9FPHY6', link: undefined })
  })

  it('articles: IDs glued to slugs and file endings are dropped', () => {
    expect(card('https://timesofindia.indiatimes.com/india/some-news-headline/articleshow/104123456.cms')).toMatchObject({ top: 'Times of India', body: 'Some News Headline' })
    expect(card('https://medium.com/@someone/how-i-built-a-thing-3f2a9b1c4d5e')).toMatchObject({ top: 'Medium · Article', body: 'How I Built a Thing' })
    expect(card('https://www.bbc.co.uk/news/world-asia-india-12345678')).toMatchObject({ top: 'BBC', body: 'World Asia India' })
    expect(card('https://www.example.com/blog/2026/10/how-to-make-great-coffee-at-home').body).toBe('How to Make Great Coffee at Home')
  })

  it('pages with nothing to tell show the link instead of junk', () => {
    expect(card('https://chatgpt.com/c/671234ab-1234-5678-9abc-def012345678')).toMatchObject({ top: 'ChatGPT · Conversation', body: 'chatgpt.com/c/671234ab-1234-5678-9abc-def012345678' })
    expect(card('https://claude.ai/chat/0b1c2d3e-4f5a-6b7c-8d9e-0f1a2b3c4d5e').top).toBe('Claude · Chat')
    expect(card('https://drive.google.com/file/d/1AbCdEf/view?usp=sharing')).toMatchObject({ top: 'Google Drive · File', body: 'drive.google.com/file/d/1AbCdEf/view?usp=sharing' })
    expect(card('https://shop.example.com/products/12345?variant=67890').body).toBe('shop.example.com/products/12345?variant=67890')
  })

  it('searches show what was searched', () => {
    expect(card('https://www.google.com/search?q=best+mechanical+keyboard+2026')).toMatchObject({ top: 'Google · Search', body: 'best mechanical keyboard 2026' })
    expect(card('https://www.youtube.com/results?search_query=lofi+beats')).toMatchObject({ top: 'YouTube · Search', body: 'lofi beats' })
    expect(card('https://www.amazon.in/s?k=usb+c+hub')).toMatchObject({ top: 'Amazon · Search', body: 'usb c hub' })
    expect(card('https://duckduckgo.com/?q=electron+tray')).toMatchObject({ top: 'DuckDuckGo · Search', body: 'electron tray' })
  })
})

describe('site rules match the exact site', () => {
  it('a site whose name contains another never borrows its rules (netflix.com ⊃ "x.com")', () => {
    const n = card('https://www.netflix.com/title/80057281')
    expect(n.top).toBe('Netflix · Title')
    expect(n.body).toBe('netflix.com/title/80057281')
    expect(card('https://www.max.com/movies/dune').top).not.toContain('X')
  })

  it('GitHub: repos, issues, PRs, files; site pages are not repos', () => {
    expect(card('https://github.com/facebook/react/pull/28000')).toMatchObject({ top: 'GitHub · Pull request', body: 'facebook/react #28000' })
    expect(card('https://github.com/microsoft/vscode/issues/199000')).toMatchObject({ top: 'GitHub · Issue', body: 'microsoft/vscode #199000' })
    expect(card('https://github.com/kushagrasinghx/BitChord.git')).toMatchObject({ top: 'GitHub · Repository', body: 'kushagrasinghx/BitChord' })
    expect(card('https://github.com/vercel/next.js/blob/canary/packages/next/src/server/next.ts')).toMatchObject({ top: 'GitHub · File', body: 'vercel/next.js · packages/next/src/server/next.ts' })
    expect(card('https://github.com/features/copilot')).toMatchObject({ top: 'GitHub', body: 'Copilot' })
    expect(card('https://github.com/settings/profile').top).toBe('GitHub')
    expect(card('https://github.com/torvalds')).toMatchObject({ top: 'GitHub · Profile', body: '@torvalds' })
  })

  it('YouTube: kind of page, start time when there is one, never the raw video ID as a title', () => {
    expect(card('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s')).toMatchObject({ top: 'YouTube · Video', body: 'Starts at 0:42' })
    expect(card('https://youtu.be/dQw4w9WgXcQ?t=1h2m3s').body).toBe('Starts at 1:02:03')
    expect(card('https://youtu.be/dQw4w9WgXcQ?si=abc')).toMatchObject({ top: 'YouTube · Video', body: 'youtu.be/dQw4w9WgXcQ' })
    expect(card('https://m.youtube.com/watch?v=dQw4w9WgXcQ').top).toBe('YouTube · Video')
    expect(card('https://youtube.com/shorts/abc123xyz').top).toBe('YouTube · Short')
    expect(card('https://www.youtube.com/@mkbhd/videos')).toMatchObject({ top: 'YouTube · Channel', body: '@mkbhd' })
  })

  it('Reddit, Wikipedia, X, LinkedIn, Instagram, Facebook', () => {
    expect(card('https://www.reddit.com/r/reactjs/comments/12345/awesome_new_state_manager/')).toMatchObject({ top: 'Reddit · r/reactjs', body: 'Awesome New State Manager' })
    expect(card('https://reddit.com/r/webdev')).toMatchObject({ top: 'Reddit · Community', body: 'r/webdev' })
    expect(card('https://en.wikipedia.org/wiki/Artificial_intelligence')).toMatchObject({ top: 'Wikipedia · Article', body: 'Artificial intelligence' })
    expect(card('https://en.m.wikipedia.org/wiki/Mount_Everest#History').body).toBe('Mount Everest § History')
    expect(card('https://x.com/elonmusk/status/1712345678901234567')).toMatchObject({ top: 'X · Post', body: '@elonmusk' })
    expect(card('https://www.linkedin.com/in/satyanadella/')).toMatchObject({ top: 'LinkedIn · Profile', body: 'satyanadella' })
    expect(card('https://www.linkedin.com/jobs/view/3912345678/').top).toBe('LinkedIn · Job')
    expect(card('https://www.instagram.com/p/C1a2b3c4d5e/').top).toBe('Instagram · Post')
    expect(card('https://www.instagram.com/natgeo/')).toMatchObject({ top: 'Instagram · Profile', body: '@natgeo' })
    expect(card('https://www.facebook.com/groups/123456789/posts/987654321/').top).toBe('Facebook · Group post')
  })

  it('maps, meetings and documents', () => {
    expect(card('https://www.google.com/maps/place/Eiffel+Tower/@48.85,2.29,17z')).toMatchObject({ top: 'Google Maps · Place', body: 'Eiffel Tower' })
    expect(card('https://www.google.com/maps/dir/Home/Office/@12.9,77.6,13z')).toMatchObject({ top: 'Google Maps · Directions', body: 'Home → Office' })
    expect(card('https://meet.google.com/abc-defg-hij')).toMatchObject({ top: 'Google Meet · Meeting', body: 'abc-defg-hij' })
    expect(card('https://us02web.zoom.us/j/1234567890?pwd=abc')).toMatchObject({ top: 'Zoom · Meeting', body: '123 456 7890' })
    expect(card('https://teams.microsoft.com/l/meetup-join/19%3ameeting_abc').top).toBe('Microsoft Teams · Meeting')
    expect(card('https://docs.google.com/spreadsheets/d/1AbCdEfGh/edit#gid=0').top).toBe('Google Sheets · Spreadsheet')
    expect(card('https://www.figma.com/design/AbC123/Edge-Drop-UI?node-id=1-2')).toMatchObject({ top: 'Figma · Design', body: 'Edge Drop UI' })
    expect(card('https://www.notion.so/myteam/Project-Roadmap-0123456789abcdef0123456789abcdef')).toMatchObject({ top: 'Notion · Page', body: 'Project Roadmap' })
  })

  it('packages and papers', () => {
    expect(card('https://www.npmjs.com/package/@types/react')).toMatchObject({ top: 'npm · Package', body: '@types/react' })
    expect(card('https://arxiv.org/abs/2401.12345')).toMatchObject({ top: 'arXiv · Paper', body: '2401.12345' })
    expect(card('https://chatgpt.com/g/g-1234').top).toBe('ChatGPT · GPT')
  })
})

describe('site names', () => {
  it('known sites by name, hosted sites by their own name, unknown ones humanized', () => {
    expect(parseUrlPreview('https://raw.githubusercontent.com/user/repo/main/README.md').serviceName).toBe('GitHub')
    expect(parseUrlPreview('https://someone.substack.com/p/the-future-of-work').serviceName).toBe('Someone')
    expect(card('https://my-app.vercel.app/')).toMatchObject({ top: 'My App · Vercel' })
    expect(parseUrlPreview('https://www.irctc.co.in/nget/train-search').serviceName).toBe('IRCTC')
    expect(parseUrlPreview('https://subdomain.my-cool-startup.io/').serviceName).toBe('My Cool Startup')
    expect(parseUrlPreview('https://xkcd.com/927/').serviceName).toBe('XKCD')
  })

  it('this computer, the local network and plain IP addresses', () => {
    expect(card('http://localhost:3000/dashboard')).toEqual({ top: 'This computer · Port 3000', body: 'Dashboard', link: 'localhost:3000/dashboard' })
    expect(card('http://127.0.0.1:8080/').top).toBe('This computer · Port 8080')
    expect(card('http://192.168.1.1/admin')).toMatchObject({ top: 'Local network', body: 'Admin' })
    expect(card('http://printer.local/').top).toBe('Local network')
    expect(parseUrlPreview('http://8.8.8.8/').serviceName).toBe('8.8.8.8')
  })

  it('short links say so, under their service', () => {
    expect(card('https://bit.ly/3xYzAbC')).toEqual({ top: 'Bitly · Short link', body: 'bit.ly/3xYzAbC', link: undefined })
    expect(card('https://t.co/AbCdEf123').top).toBe('X · Short link')
    expect(card('https://maps.app.goo.gl/AbCdEf123').top).toBe('Google Maps · Short link')
    expect(card('https://amzn.to/3AbCdEf').top).toBe('Amazon · Short link')
  })
})

describe('redirect wrappers show and clean to the real destination', () => {
  it('Google, Facebook, Outlook safe links, YouTube redirects', () => {
    expect(card('https://www.google.com/url?q=https://example.com/page&sa=D').body).toBe('example.com/page')
    expect(cleanLink('https://www.google.com/url?q=https://example.com/page&sa=D')).toBe('https://example.com/page')
    expect(cleanLink('https://l.facebook.com/l.php?u=https%3A%2F%2Fexample.com%2Fa%3Fx%3D1%26utm_source%3Dfb&h=AT0')).toBe('https://example.com/a?x=1')
    expect(cleanLink('https://eur01.safelinks.protection.outlook.com/?url=https%3A%2F%2Fexample.org%2Fdoc&data=05')).toBe('https://example.org/doc')
    expect(cleanLink('https://www.youtube.com/redirect?event=video_description&q=https%3A%2F%2Fexample.com%2F')).toBe('https://example.com/')
    expect(unwrapRedirect('https://example.com/url?q=https://evil.test')).toBeNull()
  })

  it('clean link removes tracking and stray punctuation only', () => {
    expect(cleanLink('https://example.com/page?utm_source=x&id=5)')).toBe('https://example.com/page?id=5')
    expect(cleanLink('(https://example.com/a_(b))')).toBe('https://example.com/a_(b)')
    expect(cleanLink('https://example.com/end.')).toBe('https://example.com/end')
  })
})

describe('readable links', () => {
  it('decodes percent-encoding and international domains for display only', () => {
    const hi = parseUrlPreview('https://hi.wikipedia.org/wiki/%E0%A4%AD%E0%A4%BE%E0%A4%B0%E0%A4%A4')
    expect(hi.title).toBe('भारत')
    expect(hi.displayUrl).toBe('hi.wikipedia.org/wiki/भारत')
    const idn = parseUrlPreview('https://例子.测试/路径')
    expect(idn.domain).toBe('例子.测试')
    expect(idn.displayUrl).toBe('例子.测试/路径')
    expect(hostToUnicode('xn--fsqu00a.xn--0zwm56d')).toBe('例子.测试')
  })

  it('a look-alike domain (Cyrillic "аррӏе") stays encoded so it can never pass for apple.com', () => {
    const fake = parseUrlPreview('https://xn--80ak6aa92e.com/')
    expect(fake.domain).toBe('xn--80ak6aa92e.com')
    expect(fake.serviceName).toBe('xn--80ak6aa92e.com')
    expect(hostToUnicode('xn--80ak6aa92e.com')).toBe('xn--80ak6aa92e.com')
  })

  it('credentials never show; spaces and brackets copied around a link are ignored', () => {
    expect(parseUrlPreview('https://user:pass@example.com/secret').displayUrl).toBe('example.com/secret')
    expect(card('  https://example.com/trailing-space  ').top).toBe('Example')
    expect(parseUrlPreview('https://example.com/page)').displayUrl).toBe('example.com/page')
    expect(externalHref('(www.example.com/page).')).toBe('https://www.example.com/page')
  })

  it('email and phone links', () => {
    expect(card('mailto:someone@example.com')).toEqual({ top: 'Email', body: 'someone@example.com', link: undefined })
    expect(card('mailto:someone@example.com?subject=Invoice%20March')).toEqual({ top: 'Email', body: 'Invoice March', link: 'someone@example.com' })
    expect(card('tel:+919876543210')).toEqual({ top: 'Phone · Call', body: '+919876543210', link: undefined })
  })

  it('every link parses fast and never throws, and results are cached', () => {
    const weird = ['', ' ', 'https://', 'http://[::1]:3000/x', 'https://a..b/', 'https://example.com/%', 'ftp://files.example.com/a.zip', 'file:///C:/x/y.pdf', 'javascript:alert(1)', 'https://' + 'a'.repeat(5000) + '.com']
    for (const w of weird) expect(() => parseUrlPreview(w)).not.toThrow()
    const t0 = performance.now()
    for (let i = 0; i < 2000; i++) parseUrlPreview(`https://example.com/post-${i}/how-to-do-thing-${i}?utm_source=x`)
    expect(performance.now() - t0).toBeLessThan(1500)
    expect(parseUrlPreview('https://github.com/a/b')).toBe(parseUrlPreview('https://github.com/a/b'))
  })
})

describe('what counts as a link (capture, drag-in)', () => {
  it('scheme, www., bare domains with real endings, mailto and tel', () => {
    for (const yes of ['https://example.com', 'http://localhost:3000', 'www.example.com', 'example.com', 'example.com/page', 'docs.example.dev/v2',
      'sub.domain.co.in/path?x=1', 'mailto:a@b.com', 'tel:+91 98765 43210', 'notion.so/page', 'claude.ai/chat', 'github.io/x']) {
      expect(isLinkText(yes), yes).toBe(true)
    }
  })

  it('ordinary text, file names and versions are not links', () => {
    for (const no of ['hello world', 'Node.js', 'e.g.', 'v1.2.3', '3.14', 'readme.md', 'notes.md', 'logo.ai', 'script.sh', 'archive.zip', 'app.py',
      'Safari.app', 'report.pdf', 'a@b.com', 'example.com is great', 'https://a.com https://b.com', 'example.c', 'my.file.txt']) {
      expect(isLinkText(no), no).toBe(false)
    }
  })
})

describe('page title copied with the link', () => {
  it('reads the title from an anchor pointing at this same link', () => {
    const link = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
    expect(linkTitleFromHtml(`<html><body><!--StartFragment--><a href="${link}">Rick Astley - Never Gonna Give You Up (Official Video)</a><!--EndFragment--></body></html>`, link))
      .toBe('Rick Astley - Never Gonna Give You Up (Official Video)')
    // scheme, www., trailing slash and entity encoding don't matter
    expect(linkTitleFromHtml('<a href="https://example.com/a?x=1&amp;y=2">Tom &amp; Jerry &#8211; <b>Episode</b> 1</a>', 'example.com/a?x=1&y=2/')).toBe('Tom & Jerry – Episode 1')
  })

  it('ignores anchors to other links, link-looking text and empty text; caps the length', () => {
    expect(linkTitleFromHtml('<a href="https://other.com">Other</a>', 'https://example.com')).toBeUndefined()
    expect(linkTitleFromHtml('<a href="https://example.com">https://example.com</a>', 'https://example.com')).toBeUndefined()
    expect(linkTitleFromHtml('<a href="https://example.com">   </a>', 'https://example.com')).toBeUndefined()
    expect(linkTitleFromHtml(undefined, 'https://example.com')).toBeUndefined()
    expect(Array.from(linkTitleFromHtml(`<a href="https://example.com">${'x '.repeat(400)}</a>`, 'https://example.com')!).length).toBeLessThanOrEqual(200)
  })
})
