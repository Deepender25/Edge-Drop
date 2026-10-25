/**
 * Link cards, worked out offline from the link text alone (no network).
 *
 * What a card shows: the site's name and what kind of page it is ("GitHub ·
 * Issue"), a title when the link tells one (a repo, an article slug, a search,
 * a place), and the link itself, readable (decoded, international domains in
 * their own script). Everything is string work: exact host matching against a
 * directory of known sites, page-type rules for common platforms, and for any
 * other site a scored pick of the path part that reads like a title (IDs,
 * hashes and filler words are skipped). Redirect wrappers are unwrapped to the
 * real destination; short links say so. Results are cached per link.
 */

export interface UrlPreviewInfo {
  /** The link as given (trimmed). */
  url: string
  /** The destination with tracking parameters removed (redirect wrappers unwrapped). */
  cleanUrl: string
  /** The link to show: readable, without scheme or credentials. */
  displayUrl: string
  /** Host to show (international domains decoded, no www.). */
  domain: string
  rootDomain: string
  /** The site's name ("GitHub", "Times of India", "This computer"). */
  serviceName: string
  /** A title the link itself tells, when it says more than the site name. */
  title?: string
  /** What kind of page it is ("Issue", "Video", "Search", "Short link"). */
  subtitle?: string
  /** Path, query and hash of the destination, decoded. */
  displayPath: string
}

/* ------------------------------------------------------------------ */
/* Domains                                                             */
/* ------------------------------------------------------------------ */

const MULTI_PART_TLDS = new Set([
  // United Kingdom & Commonwealth
  'co.uk', 'org.uk', 'gov.uk', 'ac.uk', 'me.uk', 'net.uk', 'sch.uk', 'police.uk', 'nhs.uk',
  'co.nz', 'net.nz', 'org.nz', 'govt.nz', 'ac.nz', 'school.nz', 'geek.nz', 'gen.nz',
  'com.au', 'net.au', 'org.au', 'edu.au', 'gov.au', 'id.au', 'asn.au',
  'co.za', 'org.za', 'web.za', 'gov.za', 'ac.za', 'net.za',
  // Asia & Oceania
  'co.jp', 'ne.jp', 'or.jp', 'go.jp', 'ac.jp', 'ed.jp', 'lg.jp', 'ad.jp', 'gr.jp',
  'co.in', 'net.in', 'org.in', 'gen.in', 'firm.in', 'ind.in', 'gov.in', 'res.in', 'ac.in', 'edu.in', 'mil.in', 'nic.in',
  'co.kr', 'ne.kr', 'or.kr', 're.kr', 'pe.kr', 'go.kr', 'ac.kr', 'hs.kr', 'ms.kr', 'es.kr',
  'com.sg', 'net.sg', 'org.sg', 'gov.sg', 'edu.sg', 'per.sg',
  'com.tw', 'org.tw', 'net.tw', 'gov.tw', 'edu.tw', 'idv.tw', 'club.tw',
  'com.hk', 'org.hk', 'net.hk', 'gov.hk', 'edu.hk', 'idv.hk',
  'com.cn', 'net.cn', 'org.cn', 'gov.cn', 'edu.cn', 'ac.cn', 'ah.cn', 'bj.cn', 'sh.cn',
  'co.id', 'net.id', 'org.id', 'web.id', 'sch.id', 'go.id', 'ac.id', 'my.id', 'biz.id',
  'com.my', 'net.my', 'org.my', 'gov.my', 'edu.my', 'mil.my',
  'com.ph', 'net.ph', 'org.ph', 'gov.ph', 'edu.ph',
  'com.vn', 'net.vn', 'org.vn', 'gov.vn', 'edu.vn', 'ac.vn',
  'co.th', 'ac.th', 'go.th', 'in.th', 'or.th', 'net.th',
  'co.il', 'org.il', 'net.il', 'ac.il', 'gov.il', 'muni.il', 'k12.il',
  'co.ae', 'net.ae', 'org.ae', 'gov.ae', 'ac.ae', 'sch.ae',
  'com.sa', 'net.sa', 'org.sa', 'gov.sa', 'edu.sa', 'med.sa',
  'com.pk', 'org.pk', 'gov.pk', 'edu.pk', 'net.pk',
  'com.bd', 'org.bd', 'gov.bd', 'edu.bd', 'com.np', 'org.np', 'gov.np', 'com.lk', 'org.lk', 'gov.lk',
  // Europe
  'com.tr', 'org.tr', 'gov.tr', 'edu.tr', 'net.tr', 'k12.tr', 'av.tr', 'bel.tr',
  'co.at', 'or.at', 'gv.at', 'ac.at',
  'co.hu', 'org.hu', 'gov.hu', 'edu.hu',
  'co.ee', 'org.ee', 'fie.ee', 'med.ee',
  'com.pl', 'org.pl', 'net.pl', 'gov.pl', 'com.ua', 'org.ua', 'gov.ua', 'com.ru', 'org.ru', 'com.gr', 'gov.gr', 'com.es', 'gob.es', 'co.it',
  // Americas
  'com.br', 'net.br', 'org.br', 'gov.br', 'edu.br', 'art.br', 'app.br', 'dev.br', 'srv.br',
  'com.mx', 'org.mx', 'gob.mx', 'edu.mx', 'net.mx',
  'com.ar', 'org.ar', 'gov.ar', 'edu.ar', 'net.ar',
  'com.co', 'org.co', 'gov.co', 'edu.co', 'net.co',
  'com.pe', 'org.pe', 'gob.pe', 'edu.pe', 'net.pe',
  'com.cl', 'gob.cl', 'gov.cl', 'co.cl',
  'gc.ca', 'gov.bc.ca', 'gov.ab.ca', 'gov.sk.ca', 'gov.mb.ca', 'gov.on.ca', 'gov.qc.ca',
  // Africa
  'com.ng', 'org.ng', 'gov.ng', 'edu.ng', 'net.ng',
  'com.eg', 'org.eg', 'gov.eg', 'edu.eg', 'net.eg',
  'co.ke', 'or.ke', 'go.ke', 'ac.ke', 'sc.ke'
])

/* ------------------------------------------------------------------ */
/* Known sites (exact host, or any subdomain of it)                    */
/* ------------------------------------------------------------------ */

const BRAND_DIRECTORY: Record<string, string> = {
  // Developer & Infrastructure
  'github.com': 'GitHub', 'gist.github.com': 'GitHub Gist', 'docs.github.com': 'GitHub Docs',
  'githubusercontent.com': 'GitHub', 'github.io': 'GitHub Pages', 'github.dev': 'GitHub',
  'gitlab.com': 'GitLab', 'bitbucket.org': 'Bitbucket', 'codeberg.org': 'Codeberg',
  'stackoverflow.com': 'Stack Overflow', 'stackexchange.com': 'Stack Exchange', 'superuser.com': 'Super User',
  'serverfault.com': 'Server Fault', 'askubuntu.com': 'Ask Ubuntu', 'mathoverflow.net': 'MathOverflow',
  'npmjs.com': 'npm', 'pypi.org': 'PyPI', 'crates.io': 'crates.io', 'packagist.org': 'Packagist', 'rubygems.org': 'RubyGems',
  'pkg.go.dev': 'Go Packages', 'hub.docker.com': 'Docker Hub', 'docker.com': 'Docker', 'nuget.org': 'NuGet',
  'codepen.io': 'CodePen', 'jsfiddle.net': 'JSFiddle', 'replit.com': 'Replit', 'codesandbox.io': 'CodeSandbox', 'stackblitz.com': 'StackBlitz',
  'jsdelivr.com': 'jsDelivr', 'cdnjs.com': 'cdnjs', 'unpkg.com': 'unpkg',
  'vercel.com': 'Vercel', 'vercel.app': 'Vercel', 'netlify.com': 'Netlify', 'netlify.app': 'Netlify', 'render.com': 'Render',
  'railway.app': 'Railway', 'fly.io': 'Fly.io', 'supabase.com': 'Supabase', 'firebase.google.com': 'Firebase',
  'cloudflare.com': 'Cloudflare', 'pages.dev': 'Cloudflare Pages', 'workers.dev': 'Cloudflare Workers',
  'aws.amazon.com': 'AWS', 'console.aws.amazon.com': 'AWS Console', 'digitalocean.com': 'DigitalOcean', 'heroku.com': 'Heroku', 'herokuapp.com': 'Heroku',
  'neon.tech': 'Neon', 'planetscale.com': 'PlanetScale', 'upstash.com': 'Upstash', 'sentry.io': 'Sentry', 'datadoghq.com': 'Datadog',
  'postman.com': 'Postman', 'swagger.io': 'Swagger', 'readthedocs.io': 'Read the Docs', 'gitbook.io': 'GitBook',
  'developer.mozilla.org': 'MDN Web Docs', 'w3schools.com': 'W3Schools', 'freecodecamp.org': 'freeCodeCamp',
  'geeksforgeeks.org': 'GeeksforGeeks', 'leetcode.com': 'LeetCode', 'hackerrank.com': 'HackerRank', 'codeforces.com': 'Codeforces', 'codechef.com': 'CodeChef',
  'tailwindcss.com': 'Tailwind CSS', 'react.dev': 'React', 'reactjs.org': 'React', 'vuejs.org': 'Vue.js', 'svelte.dev': 'Svelte', 'angular.dev': 'Angular', 'angular.io': 'Angular',
  'nextjs.org': 'Next.js', 'nodejs.org': 'Node.js', 'deno.com': 'Deno', 'bun.sh': 'Bun', 'typescriptlang.org': 'TypeScript',
  'python.org': 'Python', 'docs.python.org': 'Python Docs', 'rust-lang.org': 'Rust', 'go.dev': 'Go', 'kotlinlang.org': 'Kotlin',
  'learn.microsoft.com': 'Microsoft Learn', 'electronjs.org': 'Electron', 'vitejs.dev': 'Vite', 'vite.dev': 'Vite',

  // AI & Machine Learning
  'openai.com': 'OpenAI', 'platform.openai.com': 'OpenAI Platform', 'chatgpt.com': 'ChatGPT', 'chat.openai.com': 'ChatGPT',
  'anthropic.com': 'Anthropic', 'claude.ai': 'Claude', 'console.anthropic.com': 'Anthropic Console',
  'perplexity.ai': 'Perplexity', 'gemini.google.com': 'Google Gemini', 'aistudio.google.com': 'Google AI Studio', 'notebooklm.google.com': 'NotebookLM',
  'huggingface.co': 'Hugging Face', 'kaggle.com': 'Kaggle', 'midjourney.com': 'Midjourney', 'stability.ai': 'Stability AI',
  'replicate.com': 'Replicate', 'mistral.ai': 'Mistral AI', 'chat.mistral.ai': 'Le Chat', 'cohere.com': 'Cohere', 'elevenlabs.io': 'ElevenLabs',
  'runwayml.com': 'Runway', 'suno.com': 'Suno', 'civitai.com': 'Civitai', 'cursor.com': 'Cursor', 'cursor.sh': 'Cursor',
  'phind.com': 'Phind', 'deepseek.com': 'DeepSeek', 'chat.deepseek.com': 'DeepSeek', 'x.ai': 'xAI', 'grok.com': 'Grok', 'copilot.microsoft.com': 'Microsoft Copilot',
  'poe.com': 'Poe', 'character.ai': 'Character.AI',

  // Design & Creative
  'figma.com': 'Figma', 'dribbble.com': 'Dribbble', 'behance.net': 'Behance', 'canva.com': 'Canva', 'adobe.com': 'Adobe',
  'artstation.com': 'ArtStation', 'unsplash.com': 'Unsplash', 'pexels.com': 'Pexels', 'freepik.com': 'Freepik', 'pixabay.com': 'Pixabay',
  'spline.design': 'Spline', 'webflow.com': 'Webflow', 'webflow.io': 'Webflow', 'framer.com': 'Framer', 'framer.website': 'Framer', 'framer.app': 'Framer',
  'fontawesome.com': 'Font Awesome', 'fonts.google.com': 'Google Fonts', 'iconify.design': 'Iconify', 'lucide.dev': 'Lucide', 'coolors.co': 'Coolors',

  // Productivity & Collaboration
  'notion.so': 'Notion', 'notion.site': 'Notion', 'obsidian.md': 'Obsidian', 'linear.app': 'Linear',
  'atlassian.net': 'Atlassian', 'atlassian.com': 'Atlassian', 'jira.atlassian.com': 'Jira', 'confluence.atlassian.com': 'Confluence', 'trello.com': 'Trello',
  'asana.com': 'Asana', 'monday.com': 'monday.com', 'clickup.com': 'ClickUp', 'basecamp.com': 'Basecamp', 'airtable.com': 'Airtable',
  'coda.io': 'Coda', 'miro.com': 'Miro', 'lucidchart.com': 'Lucidchart', 'excalidraw.com': 'Excalidraw',
  'dropbox.com': 'Dropbox', 'box.com': 'Box', 'evernote.com': 'Evernote', 'raycast.com': 'Raycast', 'loom.com': 'Loom', 'calendly.com': 'Calendly',
  'zoom.us': 'Zoom', 'zoom.com': 'Zoom', 'webex.com': 'Webex', 'whereby.com': 'Whereby', 'typeform.com': 'Typeform', 'tally.so': 'Tally',

  // Google
  'google.com': 'Google', 'docs.google.com': 'Google Docs', 'drive.google.com': 'Google Drive', 'maps.google.com': 'Google Maps',
  'meet.google.com': 'Google Meet', 'calendar.google.com': 'Google Calendar', 'mail.google.com': 'Gmail', 'photos.google.com': 'Google Photos',
  'keep.google.com': 'Google Keep', 'cloud.google.com': 'Google Cloud', 'console.cloud.google.com': 'Google Cloud Console',
  'play.google.com': 'Google Play', 'news.google.com': 'Google News', 'translate.google.com': 'Google Translate',
  'sites.google.com': 'Google Sites', 'chat.google.com': 'Google Chat', 'scholar.google.com': 'Google Scholar', 'books.google.com': 'Google Books',
  'forms.gle': 'Google Forms', 'g.co': 'Google', 'goo.gl': 'Google', 'maps.app.goo.gl': 'Google Maps', 'blogspot.com': 'Blogger', 'blogger.com': 'Blogger',
  'web.app': 'Firebase', 'firebaseapp.com': 'Firebase',

  // Microsoft
  'microsoft.com': 'Microsoft', 'office.com': 'Microsoft 365', 'microsoft365.com': 'Microsoft 365', 'live.com': 'Microsoft', 'outlook.com': 'Outlook',
  'outlook.live.com': 'Outlook', 'outlook.office.com': 'Outlook', 'teams.microsoft.com': 'Microsoft Teams', 'teams.live.com': 'Microsoft Teams',
  'onedrive.live.com': 'OneDrive', '1drv.ms': 'OneDrive', 'sharepoint.com': 'SharePoint', 'azure.microsoft.com': 'Azure', 'portal.azure.com': 'Azure Portal',
  'bing.com': 'Bing', 'msn.com': 'MSN', 'aka.ms': 'Microsoft', 'apps.microsoft.com': 'Microsoft Store', 'xbox.com': 'Xbox', 'linkedin.com': 'LinkedIn', 'lnkd.in': 'LinkedIn',

  // Apple
  'apple.com': 'Apple', 'icloud.com': 'iCloud', 'developer.apple.com': 'Apple Developer', 'music.apple.com': 'Apple Music',
  'podcasts.apple.com': 'Apple Podcasts', 'tv.apple.com': 'Apple TV', 'apps.apple.com': 'App Store', 'support.apple.com': 'Apple Support', 'apple.co': 'Apple',

  // Social & Messaging
  'twitter.com': 'X', 'x.com': 'X', 't.co': 'X', 'reddit.com': 'Reddit', 'redd.it': 'Reddit', 'discord.com': 'Discord', 'discord.gg': 'Discord',
  'slack.com': 'Slack', 'telegram.org': 'Telegram', 't.me': 'Telegram', 'telegram.me': 'Telegram', 'web.telegram.org': 'Telegram Web',
  'whatsapp.com': 'WhatsApp', 'web.whatsapp.com': 'WhatsApp Web', 'chat.whatsapp.com': 'WhatsApp', 'wa.me': 'WhatsApp',
  'signal.org': 'Signal', 'signal.me': 'Signal', 'threads.net': 'Threads', 'threads.com': 'Threads', 'bsky.app': 'Bluesky', 'mastodon.social': 'Mastodon',
  'instagram.com': 'Instagram', 'instagr.am': 'Instagram', 'facebook.com': 'Facebook', 'fb.com': 'Facebook', 'fb.me': 'Facebook', 'fb.watch': 'Facebook',
  'messenger.com': 'Messenger', 'pinterest.com': 'Pinterest', 'pin.it': 'Pinterest', 'tiktok.com': 'TikTok', 'snapchat.com': 'Snapchat', 'tumblr.com': 'Tumblr',
  'quora.com': 'Quora', 'medium.com': 'Medium', 'substack.com': 'Substack', 'dev.to': 'DEV Community', 'hashnode.com': 'Hashnode', 'hashnode.dev': 'Hashnode',
  'producthunt.com': 'Product Hunt', 'news.ycombinator.com': 'Hacker News', 'linktr.ee': 'Linktree', 'wordpress.com': 'WordPress', 'ghost.io': 'Ghost',

  // Video, Music & Entertainment
  'youtube.com': 'YouTube', 'youtu.be': 'YouTube', 'music.youtube.com': 'YouTube Music', 'studio.youtube.com': 'YouTube Studio',
  'vimeo.com': 'Vimeo', 'twitch.tv': 'Twitch', 'netflix.com': 'Netflix', 'primevideo.com': 'Prime Video', 'disneyplus.com': 'Disney+',
  'hotstar.com': 'JioHotstar', 'jiohotstar.com': 'JioHotstar', 'jiocinema.com': 'JioCinema', 'sonyliv.com': 'SonyLIV', 'zee5.com': 'ZEE5',
  'hulu.com': 'Hulu', 'max.com': 'Max', 'spotify.com': 'Spotify', 'spotify.link': 'Spotify', 'spoti.fi': 'Spotify',
  'soundcloud.com': 'SoundCloud', 'tidal.com': 'Tidal', 'bandcamp.com': 'Bandcamp', 'deezer.com': 'Deezer', 'gaana.com': 'Gaana', 'jiosaavn.com': 'JioSaavn',
  'wynk.in': 'Wynk Music', 'imdb.com': 'IMDb', 'rottentomatoes.com': 'Rotten Tomatoes', 'letterboxd.com': 'Letterboxd',
  'goodreads.com': 'Goodreads', 'audible.com': 'Audible', 'audible.in': 'Audible',

  // Gaming
  'steampowered.com': 'Steam', 'steamcommunity.com': 'Steam', 'epicgames.com': 'Epic Games', 'playstation.com': 'PlayStation',
  'nintendo.com': 'Nintendo', 'roblox.com': 'Roblox', 'gog.com': 'GOG', 'itch.io': 'itch.io', 'chess.com': 'Chess.com', 'lichess.org': 'Lichess',

  // Shopping, Food, Travel & Finance
  'amazon.com': 'Amazon', 'amzn.to': 'Amazon', 'amzn.in': 'Amazon', 'amzn.eu': 'Amazon', 'a.co': 'Amazon',
  'ebay.com': 'eBay', 'aliexpress.com': 'AliExpress', 'shopify.com': 'Shopify', 'myshopify.com': 'Shopify', 'etsy.com': 'Etsy',
  'walmart.com': 'Walmart', 'target.com': 'Target', 'bestbuy.com': 'Best Buy', 'ikea.com': 'IKEA',
  'flipkart.com': 'Flipkart', 'dl.flipkart.com': 'Flipkart', 'myntra.com': 'Myntra', 'meesho.com': 'Meesho', 'nykaa.com': 'Nykaa',
  'ajio.com': 'AJIO', 'snapdeal.com': 'Snapdeal', 'bigbasket.com': 'BigBasket', 'blinkit.com': 'Blinkit', 'zeptonow.com': 'Zepto',
  'swiggy.com': 'Swiggy', 'zomato.com': 'Zomato', 'uber.com': 'Uber', 'olacabs.com': 'Ola', 'rapido.bike': 'Rapido',
  'makemytrip.com': 'MakeMyTrip', 'goibibo.com': 'Goibibo', 'cleartrip.com': 'Cleartrip', 'bookmyshow.com': 'BookMyShow',
  'irctc.co.in': 'IRCTC', 'booking.com': 'Booking.com', 'airbnb.com': 'Airbnb', 'tripadvisor.com': 'Tripadvisor', 'expedia.com': 'Expedia', 'skyscanner.net': 'Skyscanner',
  'stripe.com': 'Stripe', 'paypal.com': 'PayPal', 'paypal.me': 'PayPal', 'wise.com': 'Wise', 'coinbase.com': 'Coinbase', 'binance.com': 'Binance', 'robinhood.com': 'Robinhood',
  'paytm.com': 'Paytm', 'phonepe.com': 'PhonePe', 'razorpay.com': 'Razorpay', 'groww.in': 'Groww', 'zerodha.com': 'Zerodha', 'kite.zerodha.com': 'Kite',
  'moneycontrol.com': 'Moneycontrol', 'onlinesbi.sbi': 'SBI', 'sbi.co.in': 'SBI', 'hdfcbank.com': 'HDFC Bank', 'icicibank.com': 'ICICI Bank', 'axisbank.com': 'Axis Bank',
  'uidai.gov.in': 'UIDAI', 'incometax.gov.in': 'Income Tax India', 'digilocker.gov.in': 'DigiLocker', 'naukri.com': 'Naukri',
  'indeed.com': 'Indeed', 'glassdoor.com': 'Glassdoor', 'internshala.com': 'Internshala',

  // Learning
  'coursera.org': 'Coursera', 'udemy.com': 'Udemy', 'edx.org': 'edX', 'khanacademy.org': 'Khan Academy', 'unacademy.com': 'Unacademy',
  'byjus.com': "BYJU'S", 'duolingo.com': 'Duolingo', 'brilliant.org': 'Brilliant', 'nptel.ac.in': 'NPTEL', 'swayam.gov.in': 'SWAYAM',

  // News & Knowledge
  'wikipedia.org': 'Wikipedia', 'wikimedia.org': 'Wikimedia', 'wiktionary.org': 'Wiktionary', 'wikihow.com': 'wikiHow', 'britannica.com': 'Britannica',
  'theverge.com': 'The Verge', 'techcrunch.com': 'TechCrunch', 'wired.com': 'WIRED', 'arstechnica.com': 'Ars Technica', 'engadget.com': 'Engadget',
  '9to5mac.com': '9to5Mac', '9to5google.com': '9to5Google', 'macrumors.com': 'MacRumors', 'androidauthority.com': 'Android Authority', 'gsmarena.com': 'GSMArena',
  'nytimes.com': 'The New York Times', 'wsj.com': 'The Wall Street Journal', 'washingtonpost.com': 'The Washington Post', 'bloomberg.com': 'Bloomberg',
  'reuters.com': 'Reuters', 'apnews.com': 'AP News', 'ft.com': 'Financial Times', 'economist.com': 'The Economist', 'forbes.com': 'Forbes',
  'bbc.com': 'BBC', 'bbc.co.uk': 'BBC', 'cnn.com': 'CNN', 'theguardian.com': 'The Guardian', 'aljazeera.com': 'Al Jazeera', 'ign.com': 'IGN', 'polygon.com': 'Polygon',
  'timesofindia.indiatimes.com': 'Times of India', 'economictimes.indiatimes.com': 'The Economic Times', 'indiatimes.com': 'Indiatimes',
  'ndtv.com': 'NDTV', 'thehindu.com': 'The Hindu', 'hindustantimes.com': 'Hindustan Times', 'indianexpress.com': 'The Indian Express',
  'livemint.com': 'Mint', 'news18.com': 'News18', 'indiatoday.in': 'India Today', 'aajtak.in': 'Aaj Tak', 'thewire.in': 'The Wire', 'scroll.in': 'Scroll',
  'arxiv.org': 'arXiv', 'nature.com': 'Nature', 'sciencedirect.com': 'ScienceDirect', 'pubmed.ncbi.nlm.nih.gov': 'PubMed', 'researchgate.net': 'ResearchGate',
  'doi.org': 'DOI', 'archive.org': 'Internet Archive', 'web.archive.org': 'Wayback Machine',

  // Short-link services
  'bit.ly': 'Bitly', 'bitly.com': 'Bitly', 'tinyurl.com': 'TinyURL', 'ow.ly': 'Hootsuite', 'buff.ly': 'Buffer', 'rebrand.ly': 'Rebrandly',
  'is.gd': 'is.gd', 'v.gd': 'v.gd', 'cutt.ly': 'Cuttly', 'rb.gy': 'rb.gy', 'shorturl.at': 'ShortURL', 's.id': 's.id', 't.ly': 'T.LY',
  'bl.ink': 'BL.INK', 'dub.sh': 'Dub', 'tiny.cc': 'tiny.cc', 'ift.tt': 'IFTTT', 'lnk.to': 'Linkfire', 'trib.al': 'Trib.al', 'surl.li': 'surl.li',
  'msft.it': 'Microsoft', 'shorte.st': 'Shorte.st',

  // Search engines
  'duckduckgo.com': 'DuckDuckGo', 'search.yahoo.com': 'Yahoo Search', 'yahoo.com': 'Yahoo', 'baidu.com': 'Baidu', 'yandex.com': 'Yandex',
  'yandex.ru': 'Yandex', 'ecosia.org': 'Ecosia', 'search.brave.com': 'Brave Search', 'brave.com': 'Brave', 'startpage.com': 'Startpage', 'mozilla.org': 'Mozilla'
}

/**
 * Sites people build on as subdomains (you.github.io, app.vercel.app): the
 * subdomain is the site, the platform says where it is hosted.
 */
const HOSTED_PLATFORMS = new Set([
  'github.io', 'vercel.app', 'netlify.app', 'pages.dev', 'workers.dev', 'web.app', 'firebaseapp.com', 'herokuapp.com',
  'blogspot.com', 'wordpress.com', 'substack.com', 'medium.com', 'notion.site', 'webflow.io', 'framer.website', 'framer.app',
  'gitbook.io', 'readthedocs.io', 'tumblr.com', 'myshopify.com', 'hashnode.dev', 'ghost.io', 'wixsite.com', 'carrd.co',
  'neocities.org', 'glitch.me', 'surge.sh', 'onrender.com', 'fly.dev', 'replit.app', 'streamlit.app', 'bearblog.dev'
])

/** Short-link services: the destination can't be known offline. */
const SHORTENERS = new Set([
  'bit.ly', 'bitly.com', 't.co', 'tinyurl.com', 'ow.ly', 'buff.ly', 'rebrand.ly', 'is.gd', 'v.gd', 'cutt.ly', 'rb.gy', 'shorturl.at',
  's.id', 't.ly', 'bl.ink', 'dub.sh', 'tiny.cc', 'shorte.st', 'lnkd.in', 'amzn.to', 'amzn.in', 'amzn.eu', 'a.co', 'goo.gl', 'maps.app.goo.gl',
  'forms.gle', 'g.co', 'fb.me', 'pin.it', 'spoti.fi', 'spotify.link', 'apple.co', 'aka.ms', '1drv.ms', 'redd.it',
  'dl.flipkart.com', 'vm.tiktok.com', 'vt.tiktok.com', 'instagr.am', 'trib.al', 'ift.tt', 'lnk.to', 'msft.it', 'surl.li'
])

/* ------------------------------------------------------------------ */
/* Tracking parameters                                                 */
/* ------------------------------------------------------------------ */

const TRACKING_PARAM_PREFIXES = ['utm_', 'ga_', 'mc_', 'hs_', 'pk_', 'mtm_']
const TRACKING_PARAMS = new Set([
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'utm_id',
  'fbclid', 'gclid', 'dclid', 'msclkid', 'twclid', 'gbraid', 'wbraid', 'ttclid', 'li_fat_id', 'epik', 'srsltid',
  'ref', 'ref_src', 'ref_url', 'source', 'si', 'igshid', 'igsh', 'feature', 'trk', 'trkid', 'pp',
  '_hsenc', '_hsmi', 'mc_cid', 'mc_eid', 'yclid', 'zanpid', 'sc_cid', 'cmpid', 'icid', 'ncid',
  'mkt_tok', 'spreportid', '__twitter_impression', 'vero_id', 'vero_conv', 'oly_anon_id', 'oly_enc_id', 'rb_clickid', 's_cid', 'share_id'
])

function isTrackingParam(key: string): boolean {
  const k = key.toLowerCase()
  return TRACKING_PARAMS.has(k) || TRACKING_PARAM_PREFIXES.some((p) => k.startsWith(p))
}

/* ------------------------------------------------------------------ */
/* Text helpers                                                        */
/* ------------------------------------------------------------------ */

/** Safe decodeURIComponent that never throws URIError on truncated sequences */
export function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

/** Decodes each %XX run it can, leaving broken ones as written. */
function decodeLoose(value: string): string {
  if (!value.includes('%')) return value
  const whole = safeDecodeURIComponent(value)
  if (whole !== value) return whole
  return value.replace(/(%[0-9a-f]{2})+/gi, (run) => safeDecodeURIComponent(run))
}

/**
 * Punctuation that was copied around a link, not part of it: a closing
 * bracket without its opening one, a sentence's full stop, quotes.
 */
export function trimLinkText(raw: string): string {
  let t = typeof raw === 'string' ? raw.trim() : ''
  t = t.replace(/^[<"'(\[]+(?=[a-z])/i, (m) => (m.includes('(') || m.includes('[') ? m.replace(/[(\[]/g, '') : '').replace(/[<"']/g, ''))
  for (let i = 0; i < 8; i++) {
    const last = t.slice(-1)
    if ('.,;:!?\'">'.includes(last) && t.length > 1) {
      t = t.slice(0, -1)
      continue
    }
    const pairs: Record<string, string> = { ')': '(', ']': '[', '}': '{' }
    if (pairs[last]) {
      const open = t.split(pairs[last]).length - 1
      const close = t.split(last).length - 1
      if (close > open) {
        t = t.slice(0, -1)
        continue
      }
    }
    break
  }
  return t
}

/**
 * A copied link as something the browser can open: "www.example.com" (no
 * scheme) becomes "https://www.example.com", and stray punctuation copied
 * around it is dropped.
 */
export function externalHref(text: string): string {
  const t = trimLinkText(typeof text === 'string' ? text : '')
  return /^[a-z][a-z0-9+.-]*:/i.test(t) ? t : `https://${t}`
}

/**
 * The link with only its tracking parameters removed (utm_*, fbclid, gclid,
 * ...). Everything else is kept exactly as written: host, www., path,
 * trailing slash, other parameters and their order, and the #hash. Returns
 * the input unchanged when it is not an http(s) link or has nothing to strip.
 */
export function stripTracking(rawUrl: string): string {
  const raw = typeof rawUrl === 'string' ? rawUrl.trim() : ''
  const q = raw.indexOf('?')
  if (q < 0 || !/^https?:\/\//i.test(raw)) return raw
  const hashAt = raw.indexOf('#', q)
  const head = raw.slice(0, q)
  const query = raw.slice(q + 1, hashAt < 0 ? undefined : hashAt)
  const hash = hashAt < 0 ? '' : raw.slice(hashAt)
  const parts = query.split('&').filter(Boolean)
  const kept = parts.filter((part) => {
    const eq = part.indexOf('=')
    const name = eq < 0 ? part : part.slice(0, eq)
    let key = name
    try {
      key = decodeURIComponent(name.replace(/\+/g, ' '))
    } catch { /* keep raw name */ }
    return !isTrackingParam(key)
  })
  if (kept.length === parts.length) return raw
  return `${head}${kept.length ? `?${kept.join('&')}` : ''}${hash}`
}

/**
 * The real link inside a redirect wrapper (google.com/url?q=..., Facebook's
 * l.php?u=..., Outlook safe links, ...), or null when it is not one.
 */
export function unwrapRedirect(rawUrl: string): string | null {
  let u: URL
  try {
    u = new URL(rawUrl)
  } catch {
    return null
  }
  const host = u.hostname.toLowerCase().replace(/^www\./, '')
  const path = u.pathname
  const p = (k: string) => u.searchParams.get(k)
  let target: string | null = null
  if ((host === 'google.com' || /^google\.[a-z.]+$/.test(host)) && path === '/url') target = p('q') || p('url')
  else if ((host === 'l.facebook.com' || host === 'lm.facebook.com' || host === 'l.messenger.com') && path.startsWith('/l.php')) target = p('u')
  else if (host === 'l.instagram.com') target = p('u')
  else if (host === 'youtube.com' && path === '/redirect') target = p('q')
  else if (host.endsWith('safelinks.protection.outlook.com')) target = p('url')
  else if (host === 'linkedin.com' && path.startsWith('/redir/redirect')) target = p('url')
  else if (host === 'out.reddit.com') target = p('url')
  else if (host === 't.umblr.com' && path.startsWith('/redirect')) target = p('z')
  else if (host === 'steamcommunity.com' && path.startsWith('/linkfilter')) target = p('url') || p('u')
  else if (host === 'duckduckgo.com' && path.startsWith('/l/')) target = p('uddg')
  else if (host === 'href.li') target = u.search.slice(1) || null
  else if (host === 'slack-redir.net' && path.startsWith('/link')) target = p('url')
  if (!target || !/^https?:\/\//i.test(target)) return null
  return target
}

/** The link to copy as "clean": the real destination, tracking removed, stray punctuation dropped. */
export function cleanLink(rawUrl: string): string {
  let t = trimLinkText(rawUrl)
  for (let i = 0; i < 3; i++) {
    const inner = unwrapRedirect(/^[a-z][a-z0-9+.-]*:/i.test(t) ? t : `https://${t}`)
    if (!inner) break
    t = inner
  }
  return stripTracking(t)
}

/* ------------------------------------------------------------------ */
/* Names and titles                                                    */
/* ------------------------------------------------------------------ */

const ACRONYMS = new Set([
  'AI', 'API', 'UI', 'UX', 'SDK', 'CLI', 'URL', 'URI', 'CSS', 'HTML', 'JS', 'TS',
  'SQL', 'DB', 'AWS', 'GCP', 'OS', 'ID', 'IP', 'VR', 'AR', 'MR', 'ML', 'LLM',
  'PR', 'FAQ', 'PDF', 'CSV', 'JSON', 'YAML', 'XML', 'SVG', 'PNG', 'JPG', 'GIF',
  'BBC', 'CNN', 'WSJ', 'IMDB', 'NPM', 'PYPI', 'USA', 'UK', 'EU',
  'GB', 'TB', 'MB', 'KB', 'HD', 'UHD', 'TV', 'PC', 'USB', 'SSD', 'GPU', 'CPU', 'RAM', 'IOS', 'NFT', 'CEO', 'GPT'
])
/** Words with a fixed spelling ("iphone" in a slug means iPhone). */
const CASED_WORDS: Record<string, string> = {
  iphone: 'iPhone', ipad: 'iPad', ipod: 'iPod', imac: 'iMac', macbook: 'MacBook', airpods: 'AirPods', ios: 'iOS', macos: 'macOS',
  ipados: 'iPadOS', watchos: 'watchOS', icloud: 'iCloud', itunes: 'iTunes', youtube: 'YouTube', github: 'GitHub', gitlab: 'GitLab',
  javascript: 'JavaScript', typescript: 'TypeScript', nodejs: 'Node.js', linkedin: 'LinkedIn', paypal: 'PayPal', whatsapp: 'WhatsApp',
  tiktok: 'TikTok', chatgpt: 'ChatGPT', openai: 'OpenAI', wifi: 'Wi-Fi', ebay: 'eBay', playstation: 'PlayStation', xbox: 'Xbox',
  oneplus: 'OnePlus', powerpoint: 'PowerPoint', onedrive: 'OneDrive', sharepoint: 'SharePoint', wordpress: 'WordPress', mongodb: 'MongoDB',
  postgresql: 'PostgreSQL', mysql: 'MySQL', graphql: 'GraphQL', webassembly: 'WebAssembly', devops: 'DevOps', faq: 'FAQ', faqs: 'FAQs'
}
const SMALL_WORDS = new Set(['a', 'an', 'the', 'and', 'or', 'but', 'of', 'in', 'on', 'at', 'to', 'for', 'by', 'with', 'vs', 'via', 'as', 'from', 'into'])

/** Title-cases one word, keeping deliberate casing ("iPhone", "GB") and known acronyms. */
function titleWord(word: string, first: boolean): string {
  const upper = word.toUpperCase()
  if (ACRONYMS.has(upper)) return upper
  const lower = word.toLowerCase()
  if (CASED_WORDS[lower]) return CASED_WORDS[lower]
  if (lower === 'i') return 'I'
  if (!first && SMALL_WORDS.has(lower)) return lower
  // already mixed case (iPhone, GitHub) or a short all-caps code: as written
  if (word !== lower && word !== upper) return word
  if (word === upper && /[A-Z]/.test(word) && word.length <= 4) return word
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
}

/** Humanizes raw domain slugs into properly formatted company / site names */
export function humanizeDomainName(rawName: string): string {
  if (!rawName) return 'Web Link'
  const words = rawName
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[-_.]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  if (words.length === 0) return rawName
  return words
    .map((word) => {
      const upper = word.toUpperCase()
      if (ACRONYMS.has(upper)) return upper
      // no vowels at all ("ndtv", "xkcd"): an acronym
      if (/^[a-z]{2,6}$/i.test(word) && !/[aeiouy]/i.test(word)) return upper
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    })
    .join(' ')
}

/** Humanizes URL path slugs into clean readable article / document titles */
export function humanizeSlug(slug: string): string {
  const decoded = decodeLoose(slug)
    .replace(/[-_+]+/g, ' ')
    .replace(/\.(html?|php|aspx?|jsp|json|md|txt|cms|shtml|cfm)$/i, '')
    .trim()
  if (!decoded || decoded.length < 2) return ''
  // Skip pure hex hashes or raw numbers
  if (/^[0-9a-f]{8,}$/i.test(decoded) || /^\d+$/.test(decoded)) return ''
  return decoded
    .split(/\s+/)
    .filter(Boolean)
    .map((word, i) => titleWord(word, i === 0))
    .join(' ')
}

/** Path parts that never name a page by themselves. */
const FILLER_SEGMENTS = new Set([
  'view', 'edit', 'index', 'default', 'home', 'main', 'p', 'dp', 'gp', 'd', 's', 'w', 'r', 'u', 'c', 'g', 'e', 't', 'a', 'b', 'l', 'x',
  'product', 'products', 'item', 'items', 'itm', 'article', 'articles', 'post', 'posts', 'page', 'pages', 'search', 'amp', 'm',
  'share', 'shared', 'embed', 'watch', 'file', 'files', 'folder', 'folders', 'open', 'details', 'detail', 'show', 'read',
  'story', 'stories', 'content', 'contents', 'entry', 'category', 'categories', 'tag', 'tags', 'id', 'preview', 'download',
  'status', 'comments', 'thread', 'topic', 'articleshow', 'photostory', 'videoshow', 'liveblog', 'web', 'www', 'public',
  'static', 'assets', 'en', 'us', 'html', 'php', 'aspx', 'redirect', 'link', 'out', 'go', 'click'
])

/** True for an ID, hash, version, locale or parameter blob rather than words. */
function isIdLike(seg: string): boolean {
  if (!seg) return true
  if (/[=;&]/.test(seg)) return true
  if (/^\d+$/.test(seg)) return true
  if (/^[0-9a-f]{8,}$/i.test(seg)) return true
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(seg)) return true
  if (/^v?\d+(\.\d+)+$/i.test(seg) || /^v\d+$/i.test(seg)) return true
  if (/^[a-z]{2}([-_][a-z]{2,4})?$/i.test(seg) && seg.length <= 5 && /[-_]/.test(seg)) return true // en-us, intl-de
  if (/^intl-[a-z]{2}$/i.test(seg)) return true
  // letters and digits run together with no separators: B09G9FPHY6, itm6ac64…, C1a2b3c4d5e
  if (seg.length >= 6 && /\d/.test(seg) && /[a-z]/i.test(seg) && !/[-_.~+ ]/.test(seg)) return true
  return false
}

/** Removes an ID glued to the end (or start) of a word slug: "how-to-x-3f2a9b1c4d5e", "world-news-12345678". */
function stripSlugId(seg: string): string {
  let s = seg
  s = s.replace(/[-_](?:[0-9a-f]{8,}|\d{5,}|[0-9a-z]*\d[0-9a-z]*\d[0-9a-z]{6,})$/i, '')
  s = s.replace(/^\d{4,}[-_](?=[a-z])/i, '')
  return s
}

/** The path part that reads most like a title, from the end; '' when none does. */
function titleFromSegments(segments: string[]): string {
  for (let i = segments.length - 1; i >= 0; i--) {
    let seg = decodeLoose(segments[i]).replace(/\.(html?|php|aspx?|jsp|cms|shtml|cfm|asp)$/i, '')
    if (isIdLike(seg)) continue
    seg = stripSlugId(seg)
    if (isIdLike(seg) || FILLER_SEGMENTS.has(seg.toLowerCase())) continue
    if (!/\p{L}/u.test(seg)) continue
    const title = humanizeSlug(seg)
    if (title && title.length >= 2) return title
  }
  return ''
}

const SEARCH_PARAMS = ['q', 'query', 'search_query', 'search', 'k', 'keywords', 'keyword', 'term', 'text', 'p', 'wd', 'searchTerm', 'st']

/** A search query in the link, as typed ('' when none). */
function searchQuery(u: URL, keys = SEARCH_PARAMS): string {
  for (const key of keys) {
    const v = u.searchParams.get(key)
    if (v && v.trim() && !/^https?:\/\//i.test(v)) return v.replace(/\s+/g, ' ').trim()
  }
  return ''
}

/** "dQw4w9WgXcQ&t=1m30s" → "1:30" (YouTube-style start times). */
function formatStart(t: string | null): string {
  if (!t) return ''
  let secs = 0
  const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/.exec(t.trim())
  if (!m || (!m[1] && !m[2] && !m[3])) return ''
  secs = (Number(m[1] || 0) * 3600) + (Number(m[2] || 0) * 60) + Number(m[3] || 0)
  if (!secs) return ''
  const h = Math.floor(secs / 3600), mm = Math.floor((secs % 3600) / 60), ss = secs % 60
  return h ? `${h}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}` : `${mm}:${String(ss).padStart(2, '0')}`
}

/** "1234567890" → "123 456 7890" (meeting IDs as people read them). */
function groupDigits(id: string): string {
  const d = id.replace(/\D/g, '')
  if (d.length === 10) return `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}`
  if (d.length === 11) return `${d.slice(0, 3)} ${d.slice(3, 7)} ${d.slice(7)}`
  if (d.length === 9) return `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}`
  return d
}

/* ------------------------------------------------------------------ */
/* International domain names (punycode, RFC 3492 decode)              */
/* ------------------------------------------------------------------ */

function punycodeDecode(input: string): string {
  const base = 36, tMin = 1, tMax = 26, skew = 38, damp = 700
  const out: number[] = []
  let basic = input.lastIndexOf('-')
  if (basic < 0) basic = 0
  for (let j = 0; j < basic; j++) out.push(input.charCodeAt(j))
  let n = 128, i = 0, bias = 72
  const adapt = (delta: number, numPoints: number, first: boolean) => {
    delta = first ? Math.floor(delta / damp) : delta >> 1
    delta += Math.floor(delta / numPoints)
    let k = 0
    while (delta > ((base - tMin) * tMax) >> 1) {
      delta = Math.floor(delta / (base - tMin))
      k += base
    }
    return k + Math.floor(((base - tMin + 1) * delta) / (delta + skew))
  }
  for (let idx = basic > 0 ? basic + 1 : 0; idx < input.length;) {
    const oldi = i
    let w = 1
    for (let k = base; ; k += base) {
      if (idx >= input.length) throw new Error('bad punycode')
      const c = input.charCodeAt(idx++)
      const digit = c - 48 < 10 ? c - 22 : c - 65 < 26 ? c - 65 : c - 97 < 26 ? c - 97 : base
      if (digit >= base) throw new Error('bad punycode')
      i += digit * w
      const t = k <= bias ? tMin : k >= bias + tMax ? tMax : k - bias
      if (digit < t) break
      w *= base - t
    }
    bias = adapt(i - oldi, out.length + 1, oldi === 0)
    n += Math.floor(i / (out.length + 1))
    i %= out.length + 1
    out.splice(i++, 0, n)
  }
  return String.fromCodePoint(...out)
}

/**
 * Letters from other scripts that look like Latin ones. A domain written only
 * in these ("аррӏе.com" in Cyrillic) is shown encoded, as browsers do, so it
 * can never pass for a Latin name ("apple.com").
 */
const LATIN_LOOKALIKES = new Set(Array.from(
  'аеорсухіјӏԁѕԛԝһкмпвтгьзΑΒΕΖΗΙΚΜΝΟΡΤΥΧαβεικνορτυχοаАВЕКМНОРСТХѵѡԑɡ'
))

/** A decoded label is safe to show when it doesn't mix Latin with another script and isn't all look-alikes. */
function safeToShow(label: string): boolean {
  const letters = Array.from(label).filter((c) => /\p{L}/u.test(c))
  if (letters.length === 0) return true
  const latin = letters.filter((c) => /\p{Script=Latin}/u.test(c)).length
  if (latin > 0 && latin < letters.length) return false
  if (latin === 0 && letters.every((c) => LATIN_LOOKALIKES.has(c))) return false
  return true
}

/** "xn--fsqu00a.xn--0zwm56d" → "例子.测试" for display; look-alike or undecodable labels stay encoded. */
export function hostToUnicode(host: string): string {
  if (!host.includes('xn--')) return host
  return host
    .split('.')
    .map((label) => {
      if (!label.startsWith('xn--')) return label
      try {
        const decoded = punycodeDecode(label.slice(4))
        return safeToShow(decoded) ? decoded : label
      } catch {
        return label
      }
    })
    .join('.')
}

/** Resolves eTLD+1 root domain taking multi-part TLDs into account */
export function extractRootDomain(hostname: string): { rootDomain: string; mainName: string } {
  const parts = hostname.toLowerCase().split('.').filter(Boolean)
  if (parts.length <= 1) return { rootDomain: hostname, mainName: hostname }
  if (parts.length >= 3) {
    const lastTwo = `${parts[parts.length - 2]}.${parts[parts.length - 1]}`
    if (MULTI_PART_TLDS.has(lastTwo)) {
      const main = parts[parts.length - 3]
      return { rootDomain: `${main}.${lastTwo}`, mainName: main }
    }
  }
  if (parts.length >= 4) {
    const lastThree = `${parts[parts.length - 3]}.${parts[parts.length - 2]}.${parts[parts.length - 1]}`
    if (MULTI_PART_TLDS.has(lastThree)) {
      const main = parts[parts.length - 4]
      return { rootDomain: `${main}.${lastThree}`, mainName: main }
    }
  }
  const main = parts[parts.length - 2]
  const tld = parts[parts.length - 1]
  return { rootDomain: `${main}.${tld}`, mainName: main }
}

/** The host is this domain or a subdomain of it. */
function onHost(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`)
}

/** The known name for a host: exact host first, then the nearest parent domain. */
function brandFor(host: string): string {
  let h = host
  while (h.includes('.')) {
    const name = BRAND_DIRECTORY[h]
    if (name) return name
    h = h.slice(h.indexOf('.') + 1)
  }
  return ''
}

const PRIVATE_IPV4 = /^(10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|169\.254\.\d+\.\d+)$/

/* ------------------------------------------------------------------ */
/* Parse                                                               */
/* ------------------------------------------------------------------ */

type Page = { title?: string; subtitle?: string; serviceName?: string }

/** Page-type rules for common platforms. `segs` are the raw path parts. */
function platformPage(host: string, rootMain: string, u: URL, segs: string[]): Page | null {
  const seg = (i: number) => (segs[i] !== undefined ? decodeLoose(segs[i]) : '')
  const first = seg(0).toLowerCase()
  const q = (k: string) => u.searchParams.get(k)

  // GitHub
  if (host === 'github.com') {
    const RESERVED = new Set(['settings', 'features', 'marketplace', 'orgs', 'topics', 'explore', 'notifications', 'pulls', 'issues', 'sponsors',
      'about', 'pricing', 'login', 'join', 'new', 'codespaces', 'enterprise', 'collections', 'trending', 'events', 'search', 'apps', 'security',
      'customer-stories', 'readme', 'site', 'team', 'solutions', 'resources', 'contact', 'organizations', 'dashboard', 'copilot', 'premium-support'])
    if (first === 'search') return { title: searchQuery(u) || undefined, subtitle: 'Search' }
    if (RESERVED.has(first)) return { title: humanizeSlug(seg(segs.length - 1)) || humanizeSlug(first) }
    if (segs.length >= 2) {
      const repo = `${seg(0)}/${seg(1).replace(/\.git$/i, '')}`
      const kind = seg(2)
      if (kind === 'pull' && segs[3]) return { title: `${repo} #${seg(3)}`, subtitle: 'Pull request' }
      if (kind === 'issues' && segs[3]) return { title: `${repo} #${seg(3)}`, subtitle: 'Issue' }
      if (kind === 'issues') return { title: repo, subtitle: 'Issues' }
      if (kind === 'pulls') return { title: repo, subtitle: 'Pull requests' }
      if (kind === 'discussions') return { title: segs[3] ? `${repo} #${seg(3)}` : repo, subtitle: 'Discussion' }
      if ((kind === 'commit' || kind === 'commits') && segs[3]) return { title: `${repo} @ ${seg(3).slice(0, 7)}`, subtitle: 'Commit' }
      if ((kind === 'blob' || kind === 'tree') && segs.length >= 4) return { title: `${repo} · ${segs.slice(4).map(decodeLoose).join('/') || seg(3)}`, subtitle: kind === 'blob' ? 'File' : 'Folder' }
      if (kind === 'releases') return { title: repo, subtitle: segs[4] ? `Release ${seg(4)}` : 'Releases' }
      if (kind === 'actions') return { title: repo, subtitle: 'Actions' }
      if (kind === 'wiki') return { title: segs[3] ? humanizeSlug(seg(3)) : repo, subtitle: 'Wiki' }
      return { title: repo, subtitle: 'Repository' }
    }
    if (segs.length === 1) return { title: `@${seg(0)}`, subtitle: 'Profile' }
    return null
  }
  if (host === 'gist.github.com' && segs.length >= 1) return { title: `@${seg(0)}`, subtitle: 'Gist' }
  if (host === 'raw.githubusercontent.com' && segs.length >= 2) {
    return { title: `${seg(0)}/${seg(1)} · ${segs.slice(3).map(decodeLoose).join('/') || ''}`.replace(/ · $/, ''), subtitle: 'Raw file' }
  }
  if (host === 'gitlab.com' || host === 'bitbucket.org' || host === 'codeberg.org') {
    if (segs.length >= 2) {
      const repo = `${seg(0)}/${seg(1).replace(/\.git$/i, '')}`
      const mr = segs.indexOf('merge_requests') >= 0 ? segs.indexOf('merge_requests') : segs.indexOf('pull-requests') >= 0 ? segs.indexOf('pull-requests') : segs.indexOf('pulls')
      if (mr >= 0) return { title: segs[mr + 1] ? `${repo} !${seg(mr + 1)}` : repo, subtitle: host === 'gitlab.com' ? 'Merge request' : 'Pull request' }
      const is = segs.indexOf('issues')
      if (is >= 0) return { title: segs[is + 1] ? `${repo} #${seg(is + 1)}` : repo, subtitle: 'Issue' }
      return { title: repo, subtitle: 'Repository' }
    }
    if (segs.length === 1) return { title: `@${seg(0)}`, subtitle: 'Profile' }
    return null
  }

  // YouTube
  if (onHost(host, 'youtube.com') || host === 'youtu.be') {
    const start = formatStart(q('t') || q('start'))
    const startTitle = start ? `Starts at ${start}` : undefined
    if (host === 'youtu.be' && segs[0]) return { title: startTitle, subtitle: 'Video' }
    if (first === 'watch' && q('v')) return { title: startTitle, subtitle: q('list') ? 'Playlist video' : 'Video' }
    if (first === 'shorts') return { subtitle: 'Short' }
    if (first === 'live') return { title: startTitle, subtitle: 'Live' }
    if (first === 'playlist') return { subtitle: 'Playlist' }
    if (first === 'results') return { title: searchQuery(u, ['search_query', 'q']) || undefined, subtitle: 'Search' }
    if (first.startsWith('@')) return { title: seg(0), subtitle: 'Channel' }
    if (first === 'channel' || first === 'c' || first === 'user') return { title: first === 'channel' ? undefined : seg(1), subtitle: 'Channel' }
    if (first === 'embed' || first === 'v') return { subtitle: 'Video' }
    return null
  }

  // Reddit
  if (onHost(host, 'reddit.com')) {
    if (first === 'r' && segs[2] === 'comments') {
      const post = humanizeSlug(seg(4)) || undefined
      return { title: post, subtitle: `r/${seg(1)}` }
    }
    if (first === 'r' && segs[1]) return { title: `r/${seg(1)}`, subtitle: segs[2] === 'wiki' ? 'Wiki' : 'Community' }
    if ((first === 'u' || first === 'user') && segs[1]) return { title: `u/${seg(1)}`, subtitle: 'Profile' }
    if (first === 'search') return { title: searchQuery(u) || undefined, subtitle: 'Search' }
    return null
  }

  // Wikipedia and friends
  if (onHost(host, 'wikipedia.org') || onHost(host, 'wiktionary.org') || onHost(host, 'wikimedia.org')) {
    if (first === 'wiki' && segs[1]) {
      const name = decodeLoose(segs.slice(1).join('/')).replace(/_/g, ' ')
      if (/^Special:Search/i.test(name)) return { title: searchQuery(u, ['search', 'q']) || undefined, subtitle: 'Search' }
      const section = u.hash ? decodeLoose(u.hash.slice(1)).replace(/_/g, ' ') : ''
      return { title: section ? `${name} § ${section}` : name, subtitle: 'Article' }
    }
    if (first === 'w' && q('search')) return { title: q('search') || undefined, subtitle: 'Search' }
    return null
  }

  // Spotify / Apple Music / SoundCloud
  if (onHost(host, 'spotify.com')) {
    const parts = first.startsWith('intl-') ? segs.slice(1) : segs
    const kind = (parts[0] || '').toLowerCase()
    const names: Record<string, string> = { track: 'Track', album: 'Album', playlist: 'Playlist', artist: 'Artist', episode: 'Episode', show: 'Podcast', user: 'Profile', search: 'Search' }
    if (names[kind]) return { title: kind === 'search' && parts[1] ? decodeLoose(parts[1]) : undefined, subtitle: names[kind] }
    return null
  }
  if (host === 'music.apple.com' || host === 'podcasts.apple.com' || host === 'apps.apple.com') {
    const kinds: Record<string, string> = { album: 'Album', playlist: 'Playlist', song: 'Song', artist: 'Artist', podcast: 'Podcast', app: 'App' }
    const idx = segs.findIndex((s) => kinds[s.toLowerCase()])
    if (idx >= 0) {
      const name = humanizeSlug(seg(idx + 1))
      return { title: name || undefined, subtitle: kinds[segs[idx].toLowerCase()] }
    }
    return null
  }
  if (host === 'soundcloud.com' && segs.length >= 1) {
    if (segs.length >= 2 && segs[1] !== 'sets') return { title: humanizeSlug(seg(1)) || undefined, subtitle: 'Track' }
    if (segs[1] === 'sets') return { title: humanizeSlug(seg(2)) || undefined, subtitle: 'Playlist' }
    return { title: seg(0), subtitle: 'Profile' }
  }

  // X / Twitter
  if (host === 'x.com' || onHost(host, 'twitter.com')) {
    const RESERVED = new Set(['home', 'explore', 'notifications', 'messages', 'settings', 'i', 'search', 'compose', 'login', 'signup', 'tos', 'privacy'])
    if (first === 'search') return { title: searchQuery(u) || undefined, subtitle: 'Search' }
    if (segs[1] === 'status' && segs[2]) return { title: `@${seg(0)}`, subtitle: 'Post' }
    if (segs[0] && !RESERVED.has(first)) return { title: `@${seg(0)}`, subtitle: 'Profile' }
    return null
  }

  // Google
  if (host === 'docs.google.com') {
    if (segs.includes('document')) return { serviceName: 'Google Docs', subtitle: 'Document' }
    if (segs.includes('spreadsheets')) return { serviceName: 'Google Sheets', subtitle: 'Spreadsheet' }
    if (segs.includes('presentation')) return { serviceName: 'Google Slides', subtitle: 'Presentation' }
    if (segs.includes('forms')) return { serviceName: 'Google Forms', subtitle: 'Form' }
    if (segs.includes('drawings')) return { serviceName: 'Google Drawings', subtitle: 'Drawing' }
    return null
  }
  if (host === 'drive.google.com') {
    if (first === 'file') return { subtitle: 'File' }
    if (segs.includes('folders')) return { subtitle: 'Folder' }
    if (first === 'open' || first === 'uc') return { subtitle: 'File' }
    return null
  }
  if (host === 'meet.google.com' && segs[0] && /^[a-z]{3,4}-[a-z]{4}-[a-z]{3,4}$/i.test(seg(0))) return { title: seg(0).toLowerCase(), subtitle: 'Meeting' }
  if (host === 'maps.google.com' || ((host === 'google.com' || /^google\.[a-z.]+$/.test(host)) && first === 'maps')) {
    const parts = first === 'maps' ? segs.slice(1) : segs
    const k = (parts[0] || '').toLowerCase()
    const words = (s: string) => decodeLoose(s.replace(/\+/g, ' ')).trim()
    if (k === 'place' && parts[1]) return { serviceName: 'Google Maps', title: words(parts[1]), subtitle: 'Place' }
    if (k === 'search' && parts[1]) return { serviceName: 'Google Maps', title: words(parts[1]), subtitle: 'Search' }
    if (k === 'dir') {
      const stops = parts.slice(1).filter((p) => p && !p.startsWith('@') && !p.startsWith('data=')).map(words).filter(Boolean)
      return { serviceName: 'Google Maps', title: stops.length ? stops.join(' → ') : undefined, subtitle: 'Directions' }
    }
    const qq = q('q') || q('query')
    return { serviceName: 'Google Maps', title: qq ? qq.trim() : undefined, subtitle: qq ? 'Search' : 'Map' }
  }
  if ((host === 'google.com' || /^google\.[a-z.]+$/.test(host)) && (first === 'search' || first === 'webhp' || (!first && q('q')))) {
    return { title: searchQuery(u) || undefined, subtitle: q('tbm') === 'isch' || q('udm') === '2' ? 'Image search' : 'Search' }
  }
  if (host === 'play.google.com' && q('id')) {
    const pkg = q('id') || ''
    return { title: humanizeDomainName(pkg.split('.').pop() || pkg), subtitle: 'App' }
  }

  // Other search engines
  if ((onHost(host, 'bing.com') && first === 'search') || (host === 'duckduckgo.com' && q('q')) || (host === 'search.yahoo.com') ||
      (onHost(host, 'baidu.com') && first === 's') || (rootMain === 'yandex' && first === 'search') || (host === 'ecosia.org' && first === 'search') ||
      (host === 'search.brave.com' && first === 'search') || host === 'startpage.com') {
    return { title: searchQuery(u) || undefined, subtitle: 'Search' }
  }
  if (host === 'perplexity.ai' && first === 'search') {
    const fromPath = segs[1] ? humanizeSlug(stripSlugId(seg(1))) : ''
    return { title: searchQuery(u) || fromPath || undefined, subtitle: 'Search' }
  }

  // Meetings
  if (onHost(host, 'zoom.us') || onHost(host, 'zoom.com')) {
    if ((first === 'j' || first === 'w' || first === 's') && segs[1]) return { title: groupDigits(seg(1)), subtitle: first === 'w' ? 'Webinar' : 'Meeting' }
    if (first === 'my' && segs[1]) return { title: seg(1), subtitle: 'Personal room' }
    if (first === 'rec') return { subtitle: 'Recording' }
    return null
  }
  if (host === 'teams.microsoft.com' || host === 'teams.live.com') {
    const path = segs.map((s) => s.toLowerCase()).join('/')
    if (path.includes('meetup-join') || first === 'meet') return { subtitle: 'Meeting' }
    if (path.includes('channel')) return { subtitle: 'Channel' }
    if (path.includes('chat')) return { subtitle: 'Chat' }
    return null
  }
  if (onHost(host, 'webex.com')) {
    if (first === 'meet' && segs[1]) return { title: seg(1), subtitle: 'Meeting' }
    if (segs.some((s) => /^j\.php$|^join$/i.test(s))) return { subtitle: 'Meeting' }
    return null
  }

  // LinkedIn
  if (host === 'linkedin.com' || onHost(host, 'linkedin.com')) {
    if (first === 'in' && segs[1]) return { title: seg(1), subtitle: 'Profile' }
    if (first === 'company' && segs[1]) return { title: humanizeSlug(seg(1)) || seg(1), subtitle: 'Company' }
    if (first === 'school' && segs[1]) return { title: humanizeSlug(seg(1)) || seg(1), subtitle: 'School' }
    if (first === 'jobs') return { title: segs[2] ? humanizeSlug(stripSlugId(seg(2))) || undefined : undefined, subtitle: segs[1] === 'view' ? 'Job' : 'Jobs' }
    if (first === 'posts' && segs[1]) {
      const m = /^([^_]+)_(.*?)-(?:activity|ugcpost|share)-\d+/i.exec(seg(1))
      const words = m ? humanizeSlug(m[2]) : ''
      return { title: m ? (words && words.split(' ').length >= 2 ? words : m[1]) : undefined, subtitle: 'Post' }
    }
    if (first === 'feed' && segs[1] === 'update') return { subtitle: 'Post' }
    if (first === 'pulse' && segs[1]) return { title: humanizeSlug(stripSlugId(seg(1))) || undefined, subtitle: 'Article' }
    if (first === 'groups') return { subtitle: 'Group' }
    if (first === 'events') return { subtitle: 'Event' }
    return null
  }

  // Instagram / Facebook / TikTok / Threads / Pinterest
  if (host === 'instagram.com' || onHost(host, 'instagram.com')) {
    if (first === 'p' && segs[1]) return { subtitle: 'Post' }
    if ((first === 'reel' || first === 'reels') && segs[1]) return { subtitle: 'Reel' }
    if (first === 'stories' && segs[1]) return { title: `@${seg(1)}`, subtitle: 'Story' }
    if (first === 'explore' && segs[1] === 'tags' && segs[2]) return { title: `#${seg(2)}`, subtitle: 'Tag' }
    if (segs[0] && !['explore', 'accounts', 'direct', 'tv', 'about', 'developer', 'legal'].includes(first)) {
      if (segs[1] === 'p' || segs[1] === 'reel') return { title: `@${seg(0)}`, subtitle: segs[1] === 'p' ? 'Post' : 'Reel' }
      return { title: `@${seg(0)}`, subtitle: 'Profile' }
    }
    return null
  }
  if (onHost(host, 'facebook.com') || host === 'fb.com' || host === 'fb.watch') {
    if (host === 'fb.watch') return { subtitle: 'Video' }
    if (first === 'groups' && segs[1]) {
      const name = /^\d+$/.test(seg(1)) ? undefined : humanizeSlug(seg(1)) || undefined
      return { title: name, subtitle: segs[2] === 'posts' || segs[2] === 'permalink' ? 'Group post' : 'Group' }
    }
    if (first === 'watch' || segs[1] === 'videos' || first === 'reel') return { subtitle: first === 'reel' ? 'Reel' : 'Video' }
    if (first === 'events') return { subtitle: 'Event' }
    if (first === 'marketplace') return { subtitle: segs[1] === 'item' ? 'Marketplace item' : 'Marketplace' }
    if (first === 'photo' || first === 'photo.php' || segs[1] === 'photos') return { subtitle: 'Photo' }
    if (first === 'story.php' || first === 'permalink.php' || segs[1] === 'posts') return { subtitle: 'Post' }
    if (first === 'share') return { subtitle: 'Shared link' }
    if (first === 'profile.php') return { subtitle: 'Profile' }
    if (segs[0] && !['login', 'help', 'settings', 'pages', 'gaming', 'business', 'privacy', 'policies'].includes(first)) {
      return { title: seg(0), subtitle: 'Page' }
    }
    return null
  }
  if (onHost(host, 'tiktok.com')) {
    if (first.startsWith('@') && segs[1] === 'video') return { title: seg(0), subtitle: 'Video' }
    if (first.startsWith('@')) return { title: seg(0), subtitle: 'Profile' }
    if (first === 'search') return { title: searchQuery(u) || undefined, subtitle: 'Search' }
    return null
  }
  if (host === 'threads.net' || host === 'threads.com') {
    if (first.startsWith('@') && segs[1] === 'post') return { title: seg(0), subtitle: 'Post' }
    if (first.startsWith('@')) return { title: seg(0), subtitle: 'Profile' }
    return null
  }
  if (host === 'bsky.app' && first === 'profile' && segs[1]) return { title: `@${seg(1)}`, subtitle: segs[2] === 'post' ? 'Post' : 'Profile' }
  if (onHost(host, 'pinterest.com')) {
    if (first === 'pin') return { subtitle: 'Pin' }
    if (first === 'search') return { title: searchQuery(u) || undefined, subtitle: 'Search' }
    if (segs[0] && segs[1]) return { title: humanizeSlug(seg(1)) || undefined, subtitle: 'Board' }
    return null
  }

  // Messaging and invites
  if (host === 'discord.gg' || (host === 'discord.com' && first === 'invite')) return { subtitle: 'Invite' }
  if (host === 'discord.com' && first === 'channels') return { subtitle: 'Channel' }
  if (host === 't.me' || host === 'telegram.me') {
    if (first.startsWith('+') || first === 'joinchat') return { subtitle: 'Invite' }
    if (segs[0]) return { title: `@${seg(0)}`, subtitle: segs[1] && /^\d+$/.test(seg(1)) ? 'Message' : 'Chat' }
    return null
  }
  if (host === 'wa.me' && segs[0]) return { title: `+${seg(0).replace(/^\+/, '')}`, subtitle: 'Chat' }
  if (host === 'chat.whatsapp.com') return { subtitle: 'Group invite' }
  if (host === 'linktr.ee' && segs[0]) return { title: `@${seg(0)}`, subtitle: 'Profile' }

  // Video and streaming
  if (host === 'twitch.tv' || onHost(host, 'twitch.tv')) {
    if (first === 'videos') return { subtitle: 'Video' }
    if (segs[1] === 'clip' || host === 'clips.twitch.tv') return { subtitle: 'Clip' }
    if (segs[0] && !['directory', 'settings', 'search', 'downloads', 'jobs', 'p'].includes(first)) return { title: seg(0), subtitle: 'Channel' }
    return null
  }
  if (onHost(host, 'netflix.com')) {
    const parts = /^[a-z]{2}(-[a-z]{2})?$/i.test(first) ? segs.slice(1) : segs
    const k = (parts[0] || '').toLowerCase()
    if (k === 'title') return { subtitle: 'Title' }
    if (k === 'watch') return { subtitle: 'Watch' }
    if (k === 'search') return { title: searchQuery(u) || undefined, subtitle: 'Search' }
    return null
  }
  if (host === 'vimeo.com' && segs[0] && /^\d+$/.test(seg(0))) return { subtitle: 'Video' }
  if (onHost(host, 'imdb.com')) {
    if (first === 'title') return { subtitle: 'Title' }
    if (first === 'name') return { subtitle: 'Person' }
    if (first === 'find') return { title: searchQuery(u) || undefined, subtitle: 'Search' }
    return null
  }

  // Shopping
  if (rootMain === 'amazon' || host.startsWith('amazon.')) {
    if (first === 's' && (q('k') || q('field-keywords'))) return { title: (q('k') || q('field-keywords') || '').trim(), subtitle: 'Search' }
    const dp = segs.findIndex((s) => s === 'dp' || s === 'product' || s === 'd')
    if (dp >= 0 || first === 'gp') {
      const slug = dp > 0 ? seg(dp - 1) : ''
      return { title: slug && !isIdLike(slug) ? humanizeSlug(slug) || undefined : undefined, subtitle: 'Product' }
    }
    return null
  }
  if (host === 'flipkart.com') {
    if (first === 'search') return { title: searchQuery(u) || undefined, subtitle: 'Search' }
    const p = segs.indexOf('p')
    if (p > 0) return { title: humanizeSlug(seg(p - 1)) || undefined, subtitle: 'Product' }
    return null
  }

  // AI chats
  if (host === 'chatgpt.com' || host === 'chat.openai.com') {
    if (first === 'c' || (first === 'g' && segs[2] === 'c')) return { subtitle: 'Conversation' }
    if (first === 'share') return { subtitle: 'Shared conversation' }
    if (first === 'g' && segs[1]) {
      const name = seg(1).replace(/^g-[a-z0-9]+-?/i, '')
      return { title: name ? humanizeSlug(name) || undefined : undefined, subtitle: 'GPT' }
    }
    return null
  }
  if (host === 'claude.ai') {
    if (first === 'chat') return { subtitle: 'Chat' }
    if (first === 'share') return { subtitle: 'Shared chat' }
    if (first === 'project') return { subtitle: 'Project' }
    return null
  }
  if (host === 'gemini.google.com') {
    if (first === 'app') return { subtitle: 'Chat' }
    if (first === 'share') return { subtitle: 'Shared chat' }
    if (first === 'gem') return { subtitle: 'Gem' }
    return null
  }

  // Writing platforms
  if (host === 'medium.com' || onHost(host, 'medium.com')) {
    const last = segs.length ? seg(segs.length - 1) : ''
    if (segs.length >= 1 && !last.startsWith('@')) return { title: humanizeSlug(stripSlugId(last)) || undefined, subtitle: 'Article' }
    if (last.startsWith('@')) return { title: last, subtitle: 'Profile' }
    return null
  }
  if (onHost(host, 'substack.com') && first === 'p' && segs[1]) return { title: humanizeSlug(seg(1)) || undefined, subtitle: 'Post' }
  if (host === 'dev.to' && segs.length >= 2) return { title: humanizeSlug(stripSlugId(seg(1))) || undefined, subtitle: 'Article' }

  // Q&A
  if (['stackoverflow.com', 'superuser.com', 'serverfault.com', 'askubuntu.com', 'mathoverflow.net'].includes(host) || onHost(host, 'stackexchange.com')) {
    if ((first === 'questions' || first === 'q') && segs[1]) return { title: segs[2] ? humanizeSlug(seg(2)) || undefined : undefined, subtitle: 'Question' }
    if (first === 'a') return { subtitle: 'Answer' }
    if (first === 'users' && segs[2]) return { title: humanizeSlug(seg(2)) || undefined, subtitle: 'Profile' }
    if (first === 'search') return { title: searchQuery(u) || undefined, subtitle: 'Search' }
    return null
  }
  if (host === 'quora.com' && segs[0]) return { title: humanizeSlug(seg(0)) || undefined, subtitle: 'Question' }
  if (host === 'news.ycombinator.com' && first === 'item') return { subtitle: 'Discussion' }

  // Design and workspace
  if (onHost(host, 'figma.com')) {
    const kinds: Record<string, string> = { file: 'Design', design: 'Design', proto: 'Prototype', board: 'FigJam board', slides: 'Slides', community: 'Community file' }
    if (kinds[first] && segs[2]) return { title: humanizeSlug(seg(2)) || undefined, subtitle: kinds[first] }
    if (kinds[first]) return { subtitle: kinds[first] }
    return null
  }
  if (onHost(host, 'notion.so') || onHost(host, 'notion.site')) {
    if (segs.length >= 1) {
      const name = humanizeSlug(seg(segs.length - 1).replace(/-?[a-f0-9]{32}$/i, ''))
      return { title: name || undefined, subtitle: 'Page' }
    }
    return null
  }
  if (host === 'linear.app' && segs[1] === 'issue' && segs[2]) {
    const name = segs[3] ? humanizeSlug(seg(3)) : ''
    return { title: name ? `${seg(2)} · ${name}` : seg(2), subtitle: 'Issue' }
  }
  if (onHost(host, 'atlassian.net')) {
    if (first === 'browse' && segs[1]) return { serviceName: 'Jira', title: seg(1), subtitle: 'Issue' }
    if (first === 'wiki') {
      const pi = segs.indexOf('pages')
      return { serviceName: 'Confluence', title: pi >= 0 && segs[pi + 2] ? humanizeSlug(seg(pi + 2)) || undefined : undefined, subtitle: 'Page' }
    }
    return null
  }
  if (host === 'trello.com' && (first === 'b' || first === 'c') && segs[1]) {
    return { title: segs[2] ? humanizeSlug(seg(2).replace(/^\d+-/, '')) || undefined : undefined, subtitle: first === 'b' ? 'Board' : 'Card' }
  }
  if (host === 'miro.com' && first === 'app') return { subtitle: 'Board' }
  if (host === 'canva.com' && first === 'design') return { subtitle: 'Design' }
  if (onHost(host, 'dropbox.com') && (first === 's' || first === 'scl')) return { title: humanizeSlug(seg(segs.length - 1)) || undefined, subtitle: 'Shared file' }

  // Packages, papers, models
  if (host === 'npmjs.com' && first === 'package' && segs[1]) return { title: segs.slice(1).map(decodeLoose).join('/'), subtitle: 'Package' }
  if (host === 'pypi.org' && first === 'project' && segs[1]) return { title: seg(1), subtitle: 'Python package' }
  if (host === 'crates.io' && first === 'crates' && segs[1]) return { title: seg(1), subtitle: 'Rust crate' }
  if (host === 'pkg.go.dev' && segs[0]) return { title: segs.map(decodeLoose).join('/'), subtitle: 'Go package' }
  if (host === 'hub.docker.com' && (first === 'r' || first === '_') && segs[1]) return { title: first === '_' ? seg(1) : segs.slice(1, 3).map(decodeLoose).join('/'), subtitle: 'Image' }
  if (host === 'arxiv.org' && (first === 'abs' || first === 'pdf') && segs[1]) return { title: seg(1).replace(/\.pdf$/i, ''), subtitle: 'Paper' }
  if (host === 'doi.org' && segs[0]) return { title: segs.map(decodeLoose).join('/'), subtitle: 'Paper' }
  if (host === 'huggingface.co') {
    if ((first === 'datasets' || first === 'spaces') && segs[2]) return { title: `${seg(1)}/${seg(2)}`, subtitle: first === 'datasets' ? 'Dataset' : 'Space' }
    if (segs.length >= 2 && !['docs', 'blog', 'papers', 'learn', 'tasks', 'models'].includes(first)) return { title: `${seg(0)}/${seg(1)}`, subtitle: 'Model' }
    return null
  }
  if (host === 'leetcode.com' && first === 'problems' && segs[1]) return { title: humanizeSlug(seg(1)) || undefined, subtitle: 'Problem' }
  if ((host === 'store.steampowered.com' || host === 'steamcommunity.com') && first === 'app' && segs[1]) {
    return { title: segs[2] ? humanizeSlug(seg(2)) || undefined : undefined, subtitle: 'Game' }
  }

  return null
}

const cache = new Map<string, UrlPreviewInfo>()
const CACHE_MAX = 400

export function parseUrlPreview(rawUrl: string): UrlPreviewInfo {
  const key = typeof rawUrl === 'string' ? rawUrl : String(rawUrl ?? '')
  const hit = cache.get(key)
  if (hit) return hit
  const info = parse(key, 0)
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string)
  cache.set(key, info)
  return info
}

function parse(raw: string, depth: number): UrlPreviewInfo {
  const url = raw.trim()
  const link = trimLinkText(url)

  // Email and phone links
  const mail = /^mailto:([^?]+)(\?.*)?$/i.exec(link)
  if (mail) {
    const address = decodeLoose(mail[1])
    let subject = ''
    try {
      subject = new URLSearchParams(mail[2] || '').get('subject') || ''
    } catch { /* ignore */ }
    const domain = address.split('@')[1] || ''
    return { url, cleanUrl: link, displayUrl: address, domain, rootDomain: domain, serviceName: 'Email', title: subject || undefined, displayPath: '' }
  }
  const tel = /^tel:(.+)$/i.exec(link)
  if (tel) {
    const number = decodeLoose(tel[1]).trim()
    return { url, cleanUrl: link, displayUrl: number, domain: '', rootDomain: '', serviceName: 'Phone', subtitle: 'Call', displayPath: '' }
  }

  const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(link)
  let u: URL | null = null
  try {
    u = new URL(hasScheme ? link : `https://${link}`)
  } catch {
    u = null
  }
  if (u && u.protocol === 'file:') {
    const segsF = u.pathname.split('/').filter(Boolean)
    const name = decodeLoose(segsF[segsF.length - 1] || '')
    const path = decodeLoose(u.pathname.replace(/^\/(?=[a-z]:)/i, ''))
    return { url, cleanUrl: link, displayUrl: path, domain: 'This computer', rootDomain: '', serviceName: 'File', title: name || undefined, subtitle: 'Local file', displayPath: path }
  }
  if (!u || !u.hostname) {
    const host = link.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '').split(/[/?#]/)[0] || link
    return { url, cleanUrl: link, displayUrl: link, domain: host, rootDomain: host, serviceName: humanizeDomainName(host.split('.')[0] || host), displayPath: '' }
  }

  // Redirect wrappers: show (and clean to) the real destination
  if (depth < 2 && /^https?:$/.test(u.protocol)) {
    const inner = unwrapRedirect(u.href)
    if (inner) {
      const dest = parse(inner, depth + 1)
      return { ...dest, url }
    }
  }

  const asciiHost = u.hostname.toLowerCase().replace(/^\[|\]$/g, '')
  const host = asciiHost.replace(/^www\d?\./, '').replace(/^m\.(?=[^.]+\.[^.]+)/, '')
  const unicodeHost = hostToUnicode(asciiHost.replace(/^www\d?\./, ''))
  const port = u.port ? `:${u.port}` : ''
  const segs = u.pathname.split('/').filter(Boolean)
  const isWeb = /^https?:$/.test(u.protocol)

  // Clean, readable link
  const cleanParams: string[] = []
  u.searchParams.forEach((val, k) => {
    if (!isTrackingParam(k)) cleanParams.push(`${k}${val || u!.search.includes(`${k}=`) ? `=${val}` : ''}`)
  })
  const pathPart = u.pathname === '/' ? '' : u.pathname
  const queryPart = cleanParams.length ? `?${cleanParams.join('&')}` : ''
  const displayPath = `${decodeLoose(pathPart)}${queryPart}${decodeLoose(u.hash)}`
  const displayUrl = `${isWeb ? '' : `${u.protocol}//`}${unicodeHost}${port}${displayPath}`
  const cleanUrl = isWeb ? stripTracking(hasScheme ? link : `https://${link}`) : link

  const base = { url, cleanUrl, displayUrl, domain: `${unicodeHost}${port}`, displayPath }

  // Other schemes
  if (!isWeb && u.protocol !== 'ftp:' && u.protocol !== 'ftps:') {
    return { ...base, rootDomain: host, serviceName: humanizeDomainName(u.protocol.replace(':', '')), title: titleFromSegments(segs) || undefined }
  }

  // This computer / local network / plain IP addresses
  const isIp = /^\d+\.\d+\.\d+\.\d+$/.test(host) || host.includes(':')
  if (host === 'localhost' || host.endsWith('.localhost') || /^127\./.test(host) || host === '::1' || host === '0.0.0.0') {
    return { ...base, rootDomain: host, serviceName: 'This computer', title: titleFromSegments(segs) || undefined, subtitle: port ? `Port ${u.port}` : undefined }
  }
  if (PRIVATE_IPV4.test(host) || host.endsWith('.local') || host.endsWith('.lan') || host.endsWith('.internal') || host.endsWith('.home.arpa')) {
    return { ...base, rootDomain: host, serviceName: 'Local network', title: titleFromSegments(segs) || undefined }
  }
  if (isIp) {
    return { ...base, rootDomain: host, serviceName: host, title: titleFromSegments(segs) || undefined }
  }

  const { rootDomain, mainName } = extractRootDomain(host)
  let serviceName = brandFor(host)

  // you.github.io, app.vercel.app, someone.substack.com: the subdomain is the site
  let hostedOn = ''
  const platform = [...HOSTED_PLATFORMS].find((p) => host.endsWith(`.${p}`))
  if (platform) {
    const sub = host.slice(0, -(platform.length + 1)).split('.').pop() || ''
    if (sub && sub !== 'www') {
      hostedOn = BRAND_DIRECTORY[platform] || humanizeDomainName(platform.split('.')[0])
      serviceName = humanizeDomainName(hostToUnicode(sub))
    }
  }
  if (!serviceName) {
    // a domain that stays encoded (look-alike letters) is named by itself, never "humanized"
    const main = hostToUnicode(mainName)
    serviceName = main.startsWith('xn--') ? hostToUnicode(rootDomain) : humanizeDomainName(main)
  }

  // Short links: nothing more can be known without opening them
  const shortKey = SHORTENERS.has(host) ? host : ''
  if (shortKey) {
    return { ...base, rootDomain, serviceName, subtitle: 'Short link' }
  }

  const page = platformPage(host, mainName, u, segs)
  if (page) {
    return {
      ...base,
      rootDomain,
      serviceName: page.serviceName || serviceName,
      title: page.title || undefined,
      subtitle: page.subtitle || (hostedOn || undefined)
    }
  }

  // Any other site: the most title-like path part, else a search query, else a named parameter
  let title = titleFromSegments(segs)
  let subtitle = hostedOn || undefined
  if (!title) {
    const query = searchQuery(u, ['q', 'query', 'search', 'search_query', 'keywords', 'keyword', 'k', 'term'])
    if (query) {
      title = query
      subtitle = 'Search'
    } else {
      for (const k of ['title', 'name', 'page', 'topic']) {
        const v = u.searchParams.get(k)
        if (v && /\p{L}/u.test(v) && !isIdLike(v)) {
          title = humanizeSlug(v)
          break
        }
      }
    }
  }
  return { ...base, rootDomain, serviceName, title: title || undefined, subtitle }
}
