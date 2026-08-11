const fs = require('fs');
const path = require('path');

const cachePath = path.join(__dirname, '.translate-cache.json');
let cache = {};
if (fs.existsSync(cachePath)) {
  cache = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
}

const masterEn = {
  filters: { all: 'All', text: 'Text', links: 'Links', images: 'Images', files: 'Files' },
  tabs: { behaviour: 'Behaviour', position: 'Position', appearance: 'Appearance' },
  header: { searchPlaceholder: 'Search history...', settings: 'Settings', close: 'Close', whatsNew: "What's New" },
  behaviour: {
    languageTitle: 'Language',
    languageDesc: 'Select UI language for system menus and controls',
    systemDefault: 'System Default (Auto)',
    launchAtLoginTitle: 'Launch at login',
    launchAtLoginDesc: 'Start silently in background when computer boots',
    incognitoTitle: 'Incognito mode',
    incognitoDesc: 'Temporarily pause recording new clipboard items',
    hoverActivationTitle: 'Hover Activation',
    hoverActivationDescOn: 'Slide open shelf when hovering cursor near screen edge',
    hoverActivationDescOff: 'Hover trigger paused. Use Alt + C to open',
    disabledHoverOff: 'Disabled because Hover Activation is turned off',
    fullscreenProtectionTitle: 'Fullscreen Protection',
    fullscreenProtectionDesc: 'Automatically pause edge hover while playing games or watching fullscreen videos',
    clearUnpinnedTitle: 'Clear unpinned on restart',
    clearUnpinnedDesc: 'Wipe unpinned items whenever the app restarts',
    movePastedToTopTitle: 'Move pasted items to top',
    movePastedToTopDesc: 'Re-order unpinned items to the top of Recent whenever you paste them',
    soundEffectsTitle: 'Sound Effects',
    soundEffectsDesc: 'Play tactile audio feedback for toggles, sliders, and button clicks',
    autoUpdatesTitle: 'Automatic updates',
    autoUpdatesDescOn: 'Check for and download app updates automatically in background',
    autoUpdatesDescOff: 'Background update checks paused. Check for updates manually below',
    checkForUpdates: 'Check for updates',
    checkingForUpdates: 'Checking GitHub for updates...',
    isUpToDate: '✓ Edge-Drop is up to date',
    checkAgain: 'Check again',
    tryAgain: 'Try again',
    updateCheckFailed: 'Update check failed',
    updateAvailableTitle: 'Edge-Drop v{version} is available!',
    updateAvailableDesc: 'A newer version is ready on GitHub. Would you like to download and update now?',
    downloadAndUpdate: 'Download & Update',
    skip: 'Skip',
    downloadingUpdate: 'Downloading update package in background...',
    updateReadyTitle: 'Update v{version} Ready',
    updateReadyDesc: 'Click to restart Edge-Drop and apply the update.',
    restartToUpdate: 'Restart to Update',
    restartToUpdateBelow: 'Restart to update below',
    newUpdateAvailableBelow: 'New update available below',
    autoDeleteTitle: 'Auto-delete timer',
    autoDeleteDesc: 'Automatically purge copied items (preserves Pinned)',
    never: 'Never',
    capacityTitle: 'History capacity',
    capacityDesc: 'Maximum unpinned items stored in history'
  },
  position: {
    edgePlacementTitle: 'Edge Placement',
    edgePlacementDesc: 'Choose which screen edge Edge-Drop anchors to',
    leftEdge: 'Left Edge',
    rightEdge: 'Right Edge',
    displayTitle: 'Display Screen',
    displayDesc: 'Choose which monitor Edge-Drop attaches to',
    primaryDisplay: 'Primary Display',
    verticalPositionTitle: 'Vertical Position',
    verticalPositionDesc: 'Adjust vertical alignment along screen edge',
    top: 'Top',
    center: 'Center',
    bottom: 'Bottom',
    triggerZone: 'Trigger Zone',
    edgeLocationHintTitle: 'Edge location hint',
    edgeLocationHintDesc: 'Subtly illuminate beacon on screen edge when touching edge at wrong position',
    edgeTriggerPositionTitle: 'Edge trigger position',
    edgeTriggerPositionDesc: 'Placement of hover trigger strip relative to shelf',
    hoverAreaSizeTitle: 'Hover area size',
    hoverAreaSizeDesc: 'Hover area size on the screen edge',
    medium: 'Medium',
    edgeTriggerThicknessTitle: 'Edge trigger thickness',
    edgeTriggerThicknessDesc: 'Physical thickness of the invisible trigger strip',
    panelHeightTitle: 'Panel height',
    panelHeightDesc: 'Vertical size of the clipboard shelf'
  },
  appearance: {
    copyIndicatorTitle: 'Copy Indicator',
    copyIndicatorDesc: 'Show subtle visual beacon on screen edge when copying',
    indicatorStyleTitle: 'Indicator Style',
    indicatorStyleDesc: 'Choose visual shape style for edge copy indicator',
    typography: 'Typography',
    textSizeTitle: 'Text size',
    textSizeDesc: 'Adjust UI typography scale across Edge-Drop',
    audioAndFeedback: 'Audio & Feedback',
    small: 'Small',
    normal: 'Normal',
    medium: 'Medium',
    large: 'Large',
    cardViewTitle: 'Card Layout',
    cardViewDesc: 'Toggle between modern cards or compact list rows',
    modernCards: 'Modern Cards',
    compactRows: 'Compact Rows',
    logoStyle: 'Logo',
    tickStyle: 'Tick',
    copyStyle: 'Copy',
    sparkleStyle: 'Sparkle'
  },
  item: {
    copy: 'Copy',
    pinned: 'PINNED',
    pin: 'Pin',
    unpin: 'Unpin',
    delete: 'Delete',
    clear: 'Clear',
    dropToSave: 'Drop to save',
    dropToSaveDesc: 'Any file, image, link, or text',
    justNow: 'just now',
    ago: 'ago',
    expand: 'Expand',
    textItem: 'Text',
    imageItem: 'Image',
    fileItem: 'File',
    linkItem: 'Link',
    items: 'items',
    recent: 'RECENT',
    expandPinned: 'Expand pinned items',
    collapsePinned: 'Collapse pinned items',
    screenshot: 'Screenshot',
    ungroup: 'Ungroup from collection',
    copyFilePath: 'Copy file path',
    moreImages: '+{count} more images',
    moreFiles: '+{count} more files',
    singleFile: '1 file',
    scrollToTop: 'Scroll to top'
  },
  fileKinds: {
    pdf: 'PDF',
    word: 'Word',
    excel: 'Excel',
    powerpoint: 'Slides',
    archive: 'Archive',
    text: 'Text',
    code: 'Code',
    audio: 'Audio',
    video: 'Video',
    image: 'Image',
    file: 'File'
  },
  emptyState: {
    shelfEmpty: 'Shelf is empty',
    noResultsFound: 'No results found',
    shelfEmptyHint: 'Copy anything or drop files here to begin',
    noResultsHint: 'Try a different keyword or clear search',
    noClipsFound: 'No {type} found',
    copyTypeHint: 'Copy {type} or switch back to All',
    textClips: 'text clips',
    links: 'links',
    images: 'images',
    files: 'files'
  },
  onboarding: {
    welcomeTitle: 'Welcome to Edge-Drop',
    welcomeDesc: 'Edge-Drop lives hidden on the left edge of your screen. Simply move your mouse to the left edge to open the panel, and move away to hide it.',
    collectTitle: 'Collect Anything',
    collectDesc: 'Whenever you press Ctrl+C to copy text, images, or files, Edge-Drop automatically catches and saves them in the background.',
    dragTitle: 'Drag & Drop Anywhere',
    dragDesc: 'Need to use an item? Just open the panel and drag the card directly into any application, folder, or document.',
    stacksTitle: 'Explore File Stacks',
    stacksDesc: 'Copying multiple files groups them into a stack. You can drag the entire stack, or click it to view and extract individual files.',
    ungroupTitle: 'Ungroup & Split Stacks',
    ungroupDesc: 'Want to separate items in a stack? Click to expand the stack, then drag any subitem to the left edge of the screen. A glowing coral bar will appear—drop the item on it to extract it back into a standalone card.',
    mergeTitle: 'Combine & Merge Items',
    mergeDesc: 'Combine separate file or image cards by dragging them directly onto each other. This organizes your shelf by bundling related assets into a stack.',
    previewTitle: 'Preview Flyout',
    previewDesc: 'Click the preview button on any card to open a side flyout. Inspect high-resolution images, browse file collections, read long text snippets, or drag items directly from the preview.',
    configTitle: 'Configure Your Clipboard',
    configDesc: 'Customize how Edge-Drop works for you.',
    skip: 'Skip',
    back: 'Back',
    next: 'Next',
    getStarted: 'Get Started',
    extractedCard: 'Extracted card',
    dropToExtract: 'Drop to extract back into a standalone card',
    proTips: 'Pro Tips',
    proTip1: 'Press Alt + C to instantly toggle the shelf.',
    proTip2: 'Access settings anytime via the gear icon (top right).',
    proTip3: 'Drag & drop files to the left edge to add them.',
    proTip4: 'Click a text box, then a clipboard item to auto-paste.'
  },
  tray: {
    showClipboard: 'Show Clipboard',
    settings: 'Settings',
    incognito: 'Incognito (pause capture)',
    hoverTrigger: 'Hover Trigger (open on hover)',
    stickTo: 'Stick to',
    left: 'Left',
    right: 'Right',
    display: 'Display',
    quit: 'Quit Edge-Drop',
    welcomeTitle: 'Edge-Drop Clipboard Shelf',
    welcomeBody: 'Hover against the middle-left screen edge, or press Alt+C to slide open your shelf.'
  },
  flyout: {
    copyBeaconStyleTitle: 'Copy Indicator Style',
    openLink: 'Open Link',
    copyContent: 'Copy Content',
    saveFile: 'Save File',
    extractedFromBundle: 'Extracted from file stack',
    itemsCount: '{count} items',
    selectedCount: '{count} Selected',
    selectAll: 'Select All',
    deselectAll: 'Deselect All',
    copySelected: 'Copy Selected',
    pasteSelected: 'Paste Selected',
    paste: 'Paste',
    clearSelection: 'Clear Selection',
    contentTruncated: '… (content truncated)',
    clickToPaste: 'Click to paste',
    copyText: 'Copy Text',
    copyImage: 'Copy Image',
    copyFile: 'Copy File',
    clickToPasteDrag: 'Click to paste · Drag to move',
    openInExplorer: 'Open in File Explorer',
    current: 'Current'
  },
  toast: {
    copiedToClipboard: 'Copied to clipboard',
    itemDeleted: 'Item deleted',
    itemPinned: 'Item pinned',
    itemUnpinned: 'Item unpinned',
    settingsSaved: 'Settings saved'
  },
  footer: {
    communityAndSupport: 'Community & Support',
    feedbackTitle: 'Feedback & Issues',
    feedbackDesc: 'Report a bug or suggest a feature on GitHub',
    submitFeedback: 'Submit Feedback ↗',
    applicationGroup: 'Application',
    quitTitle: 'Quit Edge-Drop',
    quitDesc: 'Exit application and stop background process',
    supportPromo: 'Edge-Drop is 100% free & open-source. If it helps your daily workflow, consider supporting development to make it even better!',
    supportOnKofi: 'Support via Ko-fi / UPI',
    starOnGithub: 'Star on GitHub',
    githubPromo: 'Enjoying Edge-Drop? Show your support by starring the project on GitHub!',
    version: 'Version'
  }
};

const languagesList = [
  { code: 'system', name: 'System Default', nativeName: 'System Default (Auto)' },
  { code: 'en', name: 'English', nativeName: 'English (US)' },
  { code: 'es', name: 'Spanish', nativeName: 'Español' },
  { code: 'fr', name: 'French', nativeName: 'Français' },
  { code: 'de', name: 'German', nativeName: 'Deutsch' },
  { code: 'it', name: 'Italian', nativeName: 'Italiano' },
  { code: 'pt', name: 'Portuguese', nativeName: 'Português' },
  { code: 'ru', name: 'Russian', nativeName: 'Русский' },
  { code: 'ja', name: 'Japanese', nativeName: '日本語' },
  { code: 'ko', name: 'Korean', nativeName: '한국어' },
  { code: 'zh-CN', name: 'Chinese (Simplified)', nativeName: '简体中文' },
  { code: 'zh-TW', name: 'Chinese (Traditional)', nativeName: '繁體中文' },
  { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी' },
  { code: 'ar', name: 'Arabic', nativeName: 'العربية', rtl: true },
  { code: 'fa', name: 'Persian', nativeName: 'فارسی', rtl: true },
  { code: 'bn', name: 'Bengali', nativeName: 'বাংলা' },
  { code: 'tr', name: 'Turkish', nativeName: 'Türkçe' },
  { code: 'vi', name: 'Vietnamese', nativeName: 'Tiếng Việt' },
  { code: 'pl', name: 'Polish', nativeName: 'Polski' },
  { code: 'nl', name: 'Dutch', nativeName: 'Nederlands' },
  { code: 'sv', name: 'Swedish', nativeName: 'Svenska' },
  { code: 'id', name: 'Indonesian', nativeName: 'Bahasa Indonesia' },
  { code: 'uk', name: 'Ukrainian', nativeName: 'Українська' },
  { code: 'el', name: 'Greek', nativeName: 'Ελληνικά' },
  { code: 'cs', name: 'Czech', nativeName: 'Čeština' },
  { code: 'ro', name: 'Romanian', nativeName: 'Română' },
  { code: 'hu', name: 'Hungarian', nativeName: 'Magyar' },
  { code: 'da', name: 'Danish', nativeName: 'Dansk' },
  { code: 'fi', name: 'Finnish', nativeName: 'Suomi' },
  { code: 'th', name: 'Thai', nativeName: 'ไทย' },
  { code: 'he', name: 'Hebrew', nativeName: 'עברית', rtl: true },
  { code: 'no', name: 'Norwegian', nativeName: 'Norsk' }
];

const langCodeToVar = {
  'en': 'en',
  'es': 'es',
  'fr': 'fr',
  'de': 'de',
  'it': 'it',
  'pt': 'pt',
  'ru': 'ru',
  'ja': 'ja',
  'ko': 'ko',
  'zh-CN': 'zhCN',
  'zh-TW': 'zhTW',
  'hi': 'hi',
  'ar': 'ar',
  'fa': 'fa',
  'bn': 'bn',
  'tr': 'tr',
  'vi': 'vi',
  'pl': 'pl',
  'nl': 'nl',
  'sv': 'sv',
  'id': 'id',
  'uk': 'uk',
  'el': 'el',
  'cs': 'cs',
  'ro': 'ro',
  'hu': 'hu',
  'da': 'da',
  'fi': 'fi',
  'th': 'th',
  'he': 'he',
  'no': 'no'
};

// Custom translation overrides
const overrides = {
  pl: {
    filters: { all: 'Wszystko', text: 'Tekst', links: 'Linki', images: 'Obrazy', files: 'Pliki' },
    tabs: { behaviour: 'Zachowanie', position: 'Pozycja', appearance: 'Wygląd' },
    header: { searchPlaceholder: 'Szukaj...', settings: 'Ustawienia', close: 'Zamknij', whatsNew: 'Co nowego' },
    item: { copy: 'Kopiuj', pinned: 'PRZYPIĘTE', pin: 'Przypnij', unpin: 'Odepnij', delete: 'Usuń', clear: 'Wyczyść', expand: 'Rozwiń', textItem: 'Tekst', imageItem: 'Obraz', fileItem: 'Plik', linkItem: 'Link', recent: 'OSTATNIE' }
  },
  nl: {
    filters: { all: 'Alles', text: 'Tekst', links: 'Links', images: "Foto's", files: 'Bestand' },
    tabs: { behaviour: 'Gedrag', position: 'Positie', appearance: 'Uiterlijk' },
    header: { searchPlaceholder: 'Zoek geschiedenis...', settings: 'Instellingen', close: 'Sluiten', whatsNew: 'Wat is nieuw' },
    item: { copy: 'Kopiëren', pinned: 'VASTGEPINND', pin: 'Vastpinnen', unpin: 'Losmaken', delete: 'Verwijderen', clear: 'Wissen', expand: 'Uitvouwen', textItem: 'Tekst', imageItem: 'Afbeelding', fileItem: 'Bestand', linkItem: 'Link', recent: 'RECENT' }
  },
  sv: {
    filters: { all: 'Alla', text: 'Text', links: 'Länkar', images: 'Bilder', files: 'Filer' },
    tabs: { behaviour: 'Beteende', position: 'Position', appearance: 'Utseende' },
    header: { searchPlaceholder: 'Sök historik...', settings: 'Inställningar', close: 'Stäng', whatsNew: 'Nyheter' },
    item: { copy: 'Kopiera', pinned: 'NÅLADE', pin: 'Nåla', unpin: 'Lossa', delete: 'Ta bort', clear: 'Rensa', expand: 'Expandera', textItem: 'Text', imageItem: 'Bild', fileItem: 'Fil', linkItem: 'Länk', recent: 'SENASTE' }
  },
  id: {
    filters: { all: 'Semua', text: 'Teks', links: 'Tautan', images: 'Gambar', files: 'Berkas' },
    tabs: { behaviour: 'Perilaku', position: 'Posisi', appearance: 'Tampilan' },
    header: { searchPlaceholder: 'Cari riwayat...', settings: 'Pengaturan', close: 'Tutup', whatsNew: 'Yang Baru' },
    item: { copy: 'Salin', pinned: 'DISEMATKAN', pin: 'Sematkan', unpin: 'Lepas sematan', delete: 'Hapus', clear: 'Bersihkan', expand: 'Perluas', textItem: 'Teks', imageItem: 'Gambar', fileItem: 'Berkas', linkItem: 'Tautan', recent: 'TERBARU' }
  },
  uk: {
    filters: { all: 'Все', text: 'Текст', links: 'Лінки', images: 'Фото', files: 'Файли' },
    tabs: { behaviour: 'Поведінка', position: 'Позиція', appearance: 'Вигляд' },
    header: { searchPlaceholder: 'Пошук...', settings: 'Налаштування', close: 'Закрити', whatsNew: 'Що нового' },
    item: { copy: 'Копіювати', pinned: 'ЗАКРІПЛЕНІ', pin: 'Закріпити', unpin: 'Відкріпити', delete: 'Видалити', clear: 'Очистити', expand: 'Розгорнути', textItem: 'Текст', imageItem: 'Зображення', fileItem: 'Файл', linkItem: 'Посилання', recent: 'ОСТАННІ' }
  },
  el: {
    filters: { all: 'Όλα', text: 'Κείμενο', links: 'Σύνδ.', images: 'Φωτό', files: 'Αρχεία' },
    tabs: { behaviour: 'Συμπεριφορά', position: 'Θέση', appearance: 'Εμφάνιση' },
    header: { searchPlaceholder: 'Αναζήτηση...', settings: 'Ρυθμίσεις', close: 'Κλείσιμο', whatsNew: 'Τι νέο υπάρχει' },
    item: { copy: 'Αντιγραφή', pinned: 'ΚΑΡΦΙΤΣΩΜΕΝΑ', pin: 'Καρφίτσωμα', unpin: 'Ξεκαρφίτσωμα', delete: 'Διαγραφή', clear: 'Καθαρισμός', expand: 'Επέκταση', textItem: 'Κείμενο', imageItem: 'Εικόνα', fileItem: 'Αρχείο', linkItem: 'Σύνδεσμος', recent: 'ΠΡΟΣΦΑΤΑ' }
  },
  cs: {
    filters: { all: 'Vše', text: 'Text', links: 'Odkazy', images: 'Fotky', files: 'Soubory' },
    tabs: { behaviour: 'Chování', position: 'Pozice', appearance: 'Vzhled' },
    header: { searchPlaceholder: 'Hledat v historii...', settings: 'Nastavení', close: 'Zavřít', whatsNew: 'Co je nového' },
    item: { copy: 'Kopírovat', pinned: 'PŘIPNUTÉ', pin: 'Připnout', unpin: 'Odpnout', delete: 'Smazat', clear: 'Vymazat', expand: 'Rozbalit', textItem: 'Text', imageItem: 'Obrázek', fileItem: 'Soubor', linkItem: 'Odkaz', recent: 'NEDÁVNÉ' }
  },
  ro: {
    filters: { all: 'Toate', text: 'Text', links: 'Linkuri', images: 'Poze', files: 'Fișiere' },
    tabs: { behaviour: 'Comportament', position: 'Poziție', appearance: 'Aspect' },
    header: { searchPlaceholder: 'Caută...', settings: 'Setări', close: 'Închide', whatsNew: 'Ce este nou' },
    item: { copy: 'Copiază', pinned: 'FIXATE', pin: 'Fixează', unpin: 'Deselectează', delete: 'Șterge', clear: 'Curăță', expand: 'Extinde', textItem: 'Text', imageItem: 'Imagine', fileItem: 'Fișier', linkItem: 'Link', recent: 'RECENTE' }
  },
  hu: {
    filters: { all: 'Mind', text: 'Szöveg', links: 'Linkek', images: 'Képek', files: 'Fájlok' },
    tabs: { behaviour: 'Viselkedés', position: 'Pozíció', appearance: 'Megjelenés' },
    header: { searchPlaceholder: 'Keresés...', settings: 'Beállítások', close: 'Bezárás', whatsNew: 'Újdonságok' },
    item: { copy: 'Másolás', pinned: 'RÖGZÍTETT', pin: 'Rögzítés', unpin: 'Feloldás', delete: 'Törlés', clear: 'Törlés', expand: 'Kibontás', textItem: 'Szöveg', imageItem: 'Kép', fileItem: 'Fájl', linkItem: 'Link', recent: 'ELŐZMÉNYEK' }
  },
  da: {
    filters: { all: 'Alle', text: 'Tekst', links: 'Links', images: 'Billeder', files: 'Filer' },
    tabs: { behaviour: 'Adfærd', position: 'Placering', appearance: 'Udseende' },
    header: { searchPlaceholder: 'Søg i historik...', settings: 'Indstillinger', close: 'Luk', whatsNew: 'Hvad er nyt' },
    item: { copy: 'Kopier', pinned: 'FASTGJORT', pin: 'Fastgør', unpin: 'Frigør', delete: 'Slet', clear: 'Ryd', expand: 'Udvid', textItem: 'Tekst', imageItem: 'Billede', fileItem: 'Fil', linkItem: 'Link', recent: 'SENESTE' }
  },
  fi: {
    filters: { all: 'Kaikki', text: 'Teksti', links: 'Linkit', images: 'Kuvat', files: 'Tiedostot' },
    tabs: { behaviour: 'Toiminta', position: 'Sijainti', appearance: 'Ulkoasu' },
    header: { searchPlaceholder: 'Etsi historiasta...', settings: 'Asetukset', close: 'Sulje', whatsNew: 'Uutta' },
    item: { copy: 'Kopioi', pinned: 'KIINNITETYT', pin: 'Kiinnitä', unpin: 'Irrota', delete: 'Poista', clear: 'Tyhjennä', expand: 'Laajenna', textItem: 'Teksti', imageItem: 'Kuva', fileItem: 'Tiedosto', linkItem: 'Linkki', recent: 'VIIMEISIMMÄT' }
  },
  th: {
    filters: { all: 'ทั้งหมด', text: 'ข้อความ', links: 'ลิงก์', images: 'รูปภาพ', files: 'ไฟล์' },
    tabs: { behaviour: 'พฤติกรรม', position: 'ตำแหน่ง', appearance: 'รูปลักษณ์' },
    header: { searchPlaceholder: 'ค้นหาประวัติ...', settings: 'การตั้งค่า', close: 'ปิด', whatsNew: 'มีอะไรใหม่' },
    item: { copy: 'คัดลอก', pinned: 'ปักหมุดแล้ว', pin: 'ปักหมุด', unpin: 'ยกเลิกการปักหมุด', delete: 'ลบ', clear: 'ล้าง', expand: 'ขยาย', textItem: 'ข้อความ', imageItem: 'รูปภาพ', fileItem: 'ไฟล์', linkItem: 'ลิงก์', recent: 'ล่าสุด' }
  },
  he: {
    filters: { all: 'הכל', text: 'טקסט', links: 'קישורים', images: 'תמונות', files: 'קבצים' },
    tabs: { behaviour: 'התנהגות', position: 'מיקום', appearance: 'מראה' },
    header: { searchPlaceholder: 'חפש בהיסטוריה...', settings: 'הגדרות', close: 'סגור', whatsNew: 'מה חדש' },
    item: { copy: 'העתק', pinned: 'נעוצים', pin: 'נעץ', unpin: 'בטל נעיצה', delete: 'מחק', clear: 'נקה', expand: 'הרחב', textItem: 'טקסט', imageItem: 'תמונה', fileItem: 'קובץ', linkItem: 'קישור', recent: 'אחרונים' }
  },
  no: {
    filters: { all: 'Alle', text: 'Tekst', links: 'Lenker', images: 'Bilder', files: 'Filer' },
    tabs: { behaviour: 'Oppførsel', position: 'Posisjon', appearance: 'Utseende' },
    header: { searchPlaceholder: 'Søk i historikk...', settings: 'Innstillinger', close: 'Lukk', whatsNew: 'Hva er nytt' },
    item: { copy: 'Kopier', pinned: 'FESTET', pin: 'Fest', unpin: 'Løsne', delete: 'Slett', clear: 'Tøm', expand: 'Utvid', textItem: 'Tekst', imageItem: 'Bilde', fileItem: 'Fil', linkItem: 'Lenke', recent: 'NYLIGE' }
  }
};

function getFullDict(langCode) {
  const jsonPath = path.join(__dirname, '..', 'edge-drop-translations', `${langCode}.json`);
  let jsonDict = {};
  if (fs.existsSync(jsonPath)) {
    try {
      jsonDict = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    } catch (e) {}
  }
  const c = cache[langCode] || {};
  const ov = overrides[langCode] || {};
  const res = {};
  for (const g of Object.keys(masterEn)) {
    res[g] = {};
    for (const k of Object.keys(masterEn[g])) {
      const val = (jsonDict[g] && jsonDict[g][k]) || (c[g] && c[g][k]) || (ov[g] && ov[g][k]) || masterEn[g][k];
      res[g][k] = val;
    }
  }
  return res;
}

const compiled = {};
for (const [code, varName] of Object.entries(langCodeToVar)) {
  compiled[varName] = getFullDict(code);
}

let fileContent = `export interface TranslationKeys {
  filters: {
    all: string
    text: string
    links: string
    images: string
    files: string
  }
  tabs: {
    behaviour: string
    position: string
    appearance: string
  }
  header: {
    searchPlaceholder: string
    settings: string
    close: string
    whatsNew: string
  }
  behaviour: {
    languageTitle: string
    languageDesc: string
    systemDefault: string
    launchAtLoginTitle: string
    launchAtLoginDesc: string
    incognitoTitle: string
    incognitoDesc: string
    hoverActivationTitle: string
    hoverActivationDescOn: string
    hoverActivationDescOff: string
    disabledHoverOff: string
    fullscreenProtectionTitle: string
    fullscreenProtectionDesc: string
    clearUnpinnedTitle: string
    clearUnpinnedDesc: string
    movePastedToTopTitle: string
    movePastedToTopDesc: string
    soundEffectsTitle: string
    soundEffectsDesc: string
    autoUpdatesTitle: string
    autoUpdatesDescOn: string
    autoUpdatesDescOff: string
    checkForUpdates: string
    checkingForUpdates: string
    isUpToDate: string
    checkAgain: string
    tryAgain: string
    updateCheckFailed: string
    updateAvailableTitle: string
    updateAvailableDesc: string
    downloadAndUpdate: string
    skip: string
    downloadingUpdate: string
    updateReadyTitle: string
    updateReadyDesc: string
    restartToUpdate: string
    restartToUpdateBelow: string
    newUpdateAvailableBelow: string
    autoDeleteTitle: string
    autoDeleteDesc: string
    never: string
    capacityTitle: string
    capacityDesc: string
  }
  position: {
    edgePlacementTitle: string
    edgePlacementDesc: string
    leftEdge: string
    rightEdge: string
    displayTitle: string
    displayDesc: string
    primaryDisplay: string
    verticalPositionTitle: string
    verticalPositionDesc: string
    top: string
    center: string
    bottom: string
    triggerZone: string
    edgeLocationHintTitle: string
    edgeLocationHintDesc: string
    edgeTriggerPositionTitle: string
    edgeTriggerPositionDesc: string
    hoverAreaSizeTitle: string
    hoverAreaSizeDesc: string
    medium: string
    edgeTriggerThicknessTitle: string
    edgeTriggerThicknessDesc: string
    panelHeightTitle: string
    panelHeightDesc: string
  }
  appearance: {
    copyIndicatorTitle: string
    copyIndicatorDesc: string
    indicatorStyleTitle: string
    indicatorStyleDesc: string
    typography: string
    textSizeTitle: string
    textSizeDesc: string
    audioAndFeedback: string
    small: string
    normal: string
    medium: string
    large: string
    cardViewTitle: string
    cardViewDesc: string
    modernCards: string
    compactRows: string
    logoStyle: string
    tickStyle: string
    copyStyle: string
    sparkleStyle: string
  }
  item: {
    copy: string
    pinned: string
    pin: string
    unpin: string
    delete: string
    clear: string
    dropToSave: string
    dropToSaveDesc: string
    justNow: string
    ago: string
    expand: string
    textItem: string
    imageItem: string
    fileItem: string
    linkItem: string
    items: string
    recent: string
    expandPinned: string
    collapsePinned: string
    screenshot: string
    ungroup: string
    copyFilePath: string
    moreImages: string
    moreFiles: string
    singleFile: string
    scrollToTop: string
  }
  fileKinds: {
    pdf: string
    word: string
    excel: string
    powerpoint: string
    archive: string
    text: string
    code: string
    audio: string
    video: string
    image: string
    file: string
  }
  emptyState: {
    shelfEmpty: string
    noResultsFound: string
    shelfEmptyHint: string
    noResultsHint: string
    noClipsFound: string
    copyTypeHint: string
    textClips: string
    links: string
    images: string
    files: string
  }
  onboarding: {
    welcomeTitle: string
    welcomeDesc: string
    collectTitle: string
    collectDesc: string
    dragTitle: string
    dragDesc: string
    stacksTitle: string
    stacksDesc: string
    ungroupTitle: string
    ungroupDesc: string
    mergeTitle: string
    mergeDesc: string
    previewTitle: string
    previewDesc: string
    configTitle: string
    configDesc: string
    skip: string
    back: string
    next: string
    getStarted: string
    extractedCard: string
    dropToExtract: string
    proTips: string
    proTip1: string
    proTip2: string
    proTip3: string
    proTip4: string
  }
  tray: {
    showClipboard: string
    settings: string
    incognito: string
    hoverTrigger: string
    stickTo: string
    left: string
    right: string
    display: string
    quit: string
    welcomeTitle: string
    welcomeBody: string
  }
  flyout: {
    copyBeaconStyleTitle: string
    openLink: string
    copyContent: string
    saveFile: string
    extractedFromBundle: string
    itemsCount: string
    selectedCount: string
    selectAll: string
    deselectAll: string
    copySelected: string
    pasteSelected: string
    paste: string
    clearSelection: string
    contentTruncated: string
    clickToPaste: string
    copyText: string
    copyImage: string
    copyFile: string
    clickToPasteDrag: string
    openInExplorer: string
    current: string
  }
  toast: {
    copiedToClipboard: string
    itemDeleted: string
    itemPinned: string
    itemUnpinned: string
    settingsSaved: string
  }
  footer: {
    communityAndSupport: string
    feedbackTitle: string
    feedbackDesc: string
    submitFeedback: string
    applicationGroup: string
    quitTitle: string
    quitDesc: string
    supportPromo: string
    supportOnKofi: string
    starOnGithub: string
    githubPromo: string
    version: string
  }
}

export interface LanguageMeta {
  code: string
  name: string
  nativeName: string
  rtl?: boolean
}

export const LANGUAGES: LanguageMeta[] = ${JSON.stringify(languagesList, null, 2)}

`;

for (const [code, varName] of Object.entries(langCodeToVar)) {
  fileContent += `export const ${varName}: TranslationKeys = ${JSON.stringify(compiled[varName], null, 2)}\n\n`;
}

fileContent += `export const TRANSLATIONS: Record<string, TranslationKeys> = {\n`;
for (const [code, varName] of Object.entries(langCodeToVar)) {
  fileContent += `  '${code}': ${varName},\n`;
}
fileContent += `}\n`;

const targetPath = path.join(__dirname, '../src/i18n/translations.ts');
fs.writeFileSync(targetPath, fileContent, 'utf8');
console.log('Successfully wrote src/i18n/translations.ts with all configured languages!');

