<p align="center">
  <img src="public/Logo.gif" alt="Edge-Drop Logo" width="220" style="max-width: 100%; height: auto;" />
</p>

<h1 align="center">Edge-Drop</h1>

<p align="center">
  <strong>A zero-click, hover-activated clipboard shelf and desktop file-transfer hub with native OS integration.</strong><br/>
  Lives invisibly on the screen edge. Approach it, and it opens. Drag anything out — into Photoshop, Word, Slack, Explorer, anywhere.
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> ·
  <a href="#demos">Demos</a> ·
  <a href="#features">Features</a> ·
  <a href="#codebase-architecture">Codebase & Architecture</a> ·
  <a href="#security">Security</a> ·
  <a href="#roadmap">Roadmap</a> ·
  <a href="#contributing">Contributing</a>
</p>

<p align="center">
  <sub>Built with Electron · React · TypeScript · Framer Motion · Zustand</sub><br/>
  <sub>License: Apache-2.0 &nbsp;·&nbsp; Status: Public Beta</sub>
</p>

---

## Why

Every clipboard manager on the market breaks your flow. You copy something, switch apps, paste, then hunt through `Win+V` history with arrow keys or dig into a tray menu. Multi-step. Modal. Slow.

**Edge-Drop removes the friction.** It anchors to the screen edge of your monitor as a transparent, always-on-top, click-through surface. When your cursor approaches the edge, the shelf springs open. Drag images, file stacks, rich text, and HTML bundles *out* of it — directly into whatever desktop app you're already using. No shortcuts. No window switching. No modal dialogs.

It is built for the developer and creative workflow where you constantly juggle screenshots, code snippets, file paths, design assets, and reference links between many windows at once.

---

## Demos

> All demos are silent autoplay loops. Hover to scrub, right-click → open in new tab for full size.

<table>
  <tr>
    <td width="50%" align="center"><b>1. Welcome to Edge-Drop</b><br/><br/>
      <video src="https://github.com/user-attachments/assets/118d59cc-9821-4da1-9424-ea9bc1b6e548" width="100%" autoplay loop muted playsinline></video>
    </td>
    <td width="50%" align="center"><b>2. Collect Anything</b><br/><br/>
      <video src="https://github.com/user-attachments/assets/8daa18a7-d023-4e93-9f17-c30791a7c41c" width="100%" autoplay loop muted playsinline></video>
    </td>
  </tr>
  <tr>
    <td width="50%" align="center"><b>3. Drag & Drop Anywhere</b><br/><br/>
      <video src="https://github.com/user-attachments/assets/ac8bc411-0827-460c-828c-0799f4cee4d8" width="100%" autoplay loop muted playsinline></video>
    </td>
    <td width="50%" align="center"><b>4. Explore File Stacks</b><br/><br/>
      <video src="https://github.com/user-attachments/assets/b1e47a2b-41d2-4958-8e42-4fefcaa8b26b" width="100%" autoplay loop muted playsinline></video>
    </td>
  </tr>
  <tr>
    <td width="50%" align="center"><b>5. Ungroup & Split Stacks</b><br/><br/>
      <video src="https://github.com/user-attachments/assets/e41eb9f8-62b0-4525-a28a-2bacafd0bb8c" width="100%" autoplay loop muted playsinline></video>
    </td>
    <td width="50%" align="center"><b>6. Combine & Merge Items</b><br/><br/>
      <video src="https://github.com/user-attachments/assets/cee7d5f7-658b-433a-9fa0-6592a5a75fa4" width="100%" autoplay loop muted playsinline></video>
    </td>
  </tr>
  <tr>
    <td width="50%" align="center"><b>7. Preview Flyout</b><br/><br/>
      <video src="https://github.com/user-attachments/assets/fe5a8b47-08c6-4d32-92b6-bb4e0446a82a" width="100%" autoplay loop muted playsinline></video>
    </td>
  </tr>
</table>

---

## Support & Sponsor

<p align="center">
  <strong>Edge-Drop is 100% free and open-source forever.</strong><br/>
  If Edge-Drop speeds up your daily workflow, consider supporting ongoing development!
</p>

<table align="center" border="0" style="border-collapse: collapse; border: none;">
  <tr>
    <th align="center" width="50%" style="border: none; padding: 10px 15px 5px;">
      <h3>🌍 International (Ko-fi)</h3>
    </th>
    <th align="center" width="50%" style="border: none; padding: 10px 15px 5px;">
      <h3>🇮🇳 India (UPI)</h3>
    </th>
  </tr>
  <tr>
    <td align="center" style="border: none; padding: 5px 15px 15px; vertical-align: middle;">
      <a href="https://ko-fi.com/deepender" target="_blank">
        <img src="public/kofi-qr.png" alt="Scan or Click for Ko-fi Support" width="160" style="border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.3);" />
      </a>
    </td>
    <td align="center" style="border: none; padding: 5px 15px 15px; vertical-align: middle;">
      <a href="https://www.edgedrop.app/supportedgedrop/upi" target="_blank">
        <img src="public/upi-sponsor-qr.png" alt="Scan or Click for UPI Donation Page" width="160" style="border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.3);" />
      </a>
    </td>
  </tr>
  <tr>
    <td align="center" style="border: none; padding: 0 15px 15px; vertical-align: middle;">
      <a href="https://ko-fi.com/deepender" target="_blank">
        <img src="https://ko-fi.com/img/githubbutton_sm.svg" alt="Buy Me a Coffee on Ko-fi" height="36" />
      </a>
    </td>
    <td align="center" style="border: none; padding: 0 15px 15px; vertical-align: middle;">
      <a href="https://www.edgedrop.app/supportedgedrop/upi" target="_blank">
        <img src="https://img.shields.io/badge/Donate%20via-UPI-128856?style=for-the-badge&logo=googlepay&logoColor=white" alt="Donate via UPI" height="36" />
      </a>
    </td>
  </tr>
  <tr>
    <td colspan="2" align="center" style="border: none; padding: 5px 15px 10px;">
      <sub><i>* Note: Scanning or clicking the UPI card opens the <a href="https://www.edgedrop.app/supportedgedrop/upi" target="_blank">UPI Donation Page</a> (GPay, PhonePe, Paytm, or any UPI app).</i></sub>
    </td>
  </tr>
</table>

### Project Sponsors & Featured Products

A huge thank you to the incredible sponsors and products actively sponsoring Edge-Drop!

| Sponsor / Product | Links | Description |
| :--- | :--- | :--- |
| <a href="https://elitistreview.com/" target="_blank"><img src="https://unavatar.io/x/Elitistreview" width="32" height="32" style="border-radius: 50%; vertical-align: middle;" alt="Elitistreview" /></a> &nbsp; **[Elitistreview](https://elitistreview.com/)** | [Website](https://elitistreview.com/) &nbsp;·&nbsp; [X](https://x.com/Elitistreview) &nbsp;·&nbsp; [Bluesky](https://bsky.app/profile/elitistreview.com) | *When it comes to wine, there is an objective reality out there, and it is on Elitistreview.com.* |

<p align="center">
  <sub>💡 <em>Want your product, startup, or website featured here and seen by developers? <a href="https://ko-fi.com/deepender" target="_blank">Sponsor Edge-Drop on Ko-fi</a> or <a href="https://www.edgedrop.app/supportedgedrop/upi" target="_blank">UPI</a> and share your link!</em></sub>
</p>

---

## Quick Start

### Prerequisites
- **Node.js** v18 or higher
- **OS**: Windows 10/11 (uses Win32 OLE drag pipelines and transparent-window cursor polling)

### Run from source
```bash
git clone https://github.com/Deepender25/Edge-Drop.git
cd Edge-Drop
npm install
npm run dev          # launches Electron + Vite HMR
```

### Type-check
```bash
npm run typecheck    # runs tsc --noEmit against both node and web configs
```

### Build Windows installers
```bash
npm run build:github # outputs an NSIS .exe for GitHub releases
npm run build:store  # outputs an MSIX .appx for Microsoft Store submission
```

> [!NOTE]
> On Windows, if packaging fails with `EBUSY: resource busy or locked`, close any running Edge-Drop instances first: `taskkill /F /IM electron.exe /T`.

---

## Features

**Zero-click edge hover**
- Frameless, transparent, always-on-top `BrowserWindow` anchored at `x=0` or right screen edge
- 100% click-through when collapsed — desktop stays fully usable
- Configurable hot-zone height (25% / 40% / 60% of screen) and blade height (50% – 80%)
- **Edge Trigger Proximity Slider:** Range slider (1px – 7px) allowing precise pixel calibration of the edge sensor region.
- **Independent Edge Trigger Placement:** Choose exact trigger strip alignment (**Top**, **Center**, or **Bottom**) relative to the shelf, with dynamic CSS `clipPath` calculation matching the exact sensor region.
- **Edge Location Hint (Proximity Beacon):** Subtle 1.5px hairline gradient pulse that flashes once on the screen edge when cursor touches the edge at a misaligned vertical position, guiding users to the shelf.
- **Multi-monitor support:** Pick exactly which display the panel sticks to, with options for Left or Right screen edges. Features a single source of truth multi-display engine (`getDisplayListOptions()`) with real-time physical resolution calculation (3840×2160, 2560×1440, 1920×1080) across all High-DPI Windows display scaling factors.
- **Cross-Reboot Display Persistence:** Edge-Drop remembers your chosen monitor across device restarts. A 4-tier resolution pipeline silently re-identifies the correct physical monitor after Windows re-assigns numeric display IDs on reboot.
- **Smart Windows Fullscreen Game Detection:** Native Win32 `SHQueryUserNotificationState` OS detection (`fullscreen.ts`) combined with `GetForegroundWindow` + `GetClassNameA` filtering (`Progman`, `WorkerW`, `Shell_TrayWnd`) automatically suppresses edge hover during Direct3D games (*VALORANT*, *Cyberpunk*, *PowerPoint*) while allowing Edge-Drop to open smoothly on the Windows Home Screen / Desktop.
- **Self-Healing Launch at Login:** Automatic Windows Registry synchronization (`HKCU\Software\Microsoft\Windows\CurrentVersion\Run`) ensures autostart entries update cleanly with live binary paths and `--hidden` launch flags after every app update.
- **RAM Footprint Stabilization (~130 MB):** Large text entries (>300 chars) are stored as disk payload files (`payloads/<id>.txt`), holding only 300-char preview snippets in memory. Locks operational RAM to ~130 MB–160 MB with a V8 ceiling cap of 512 MB.
- **High-Performance Image Thumbnailing Protocol (`edgelocal://thumb/`):** Custom Electron protocol streams 240px thumbnails for history cards instead of loading multi-megapixel raw image files into memory, preventing GPU memory bloat.

**Synthesized Web Audio Haptic Suite**
- **Zero-Asset Audio Engine (`soundEffects.ts`):** Real-time synthesized Web Audio API sound suite providing tactile audio feedback for UI micro-interactions without audio file assets.
- **Mechanical Dial Ticks:** High-frequency 1800Hz → 900Hz micro-ticks (`playDialTickSound`) when sliding position controls.
- **Mechanical Delete Haptic:** Dual-stage downward pitch sweep (1400Hz → 250Hz in 14ms + 150Hz → 40Hz thud) when deleting items (`playDeleteSound`).
- **Tactile Switches & Buttons:** Resonant pops for toggle switches (`playToggleSound`) and crisp clicks for buttons (`playButtonClickSound`).
- **Global Audio Control:** Global `Sound effects` toggle switch in Settings (ON by default) with `isSoundEnabled()` guard across all synthesis routines. Eager `AudioContext` auto-unlock on initial interaction (`pointerdown`/`mouseenter`/`keydown`).

**Segmented Settings Architecture**
- **Stationary 3-Category Navigation Bar:** Organized into three clean, emoji-free tabs: **`Behaviour`** (1st), **`Position`** (2nd), and **`Appearance`** (3rd).
- **Stationary Header & Independent Scroll Area:** Fixed top tab bar (`.settings-fixed-header`) stays 100% stationary while settings controls scroll independently underneath it.
- **Independent Scroll Position Memory:** Each category section maintains its own separate `scrollTop` state across tab switches (`tabScrollPositions`).
- **Pure CSS Selection Synchronization:** Native CSS active tab styling (`.settings-tab-btn.active`) eliminating layout projection glitches during panel position adjustments.
- **5% Magnetic Tick Slider:** Smooth `0.002` real-time 1-to-1 continuous tracking during drag with 60fps/120fps precision, featuring 21 visual tick dashes, live percentage badge (`50%`), percentage quick-jump buttons (`0%`, `50%`, `100%`), and magnetic 5% snapping on pointer release.
- **Position & Display Switch Preview:** 1.75s temporary interactive preview window when changing `Stick position` (`Left` / `Right`) or `Display` monitor in settings.
- **CPU Performance Optimization & Zero Blur Jank:** Replaced heavy `backdrop-filter: blur()` calls across UI components with high-performance solid/semi-transparent dark fills, eliminating CPU rasterization overhead for 60fps/120fps butter-smooth panel opening and scrolling.
- **Prominent Support Section & Matching Pill Buttons:** Re-ordered settings footer placing the Support & Sponsor card prominently above the Quit button, linking to official domain `www.edgedrop.app`. Features matching 40px height pill buttons for Support and GitHub Star.
- **Low-Profile Bottom Quit Pill:** Compact, subtle Quit pill button (`.subtle-quit-btn`) centered at the very bottom of the settings view without noisy header text.

**Silent Background Auto-Updates**
- **Zero-Friction Updates (`electron-updater`):** GitHub releases feature background downloading and a single-click "Restart to Update" button.
- **Monochrome Glassmorphic Banner:** Prominently positioned at the top of the scrollable content area across all category tabs. Styled with a dark-mode glassmorphic 4% white card fill (`rgba(255, 255, 255, 0.04)`), 12% white border, and high-contrast white button.
- **Microsoft Store Isolation:** Isolated build pipelines ensure Microsoft Store (MSIX) builds remain 100% compliant with Store terms and conditions without integrated update mechanisms (`isStoreBuild()`).

**Multi-format clipboard engine**
- Captures plain text, URLs, rich HTML, raw images, and multi-file selections
- Win32 `FileNameW` / HDROP parsing via PowerShell to bypass Electron's single-file limit
- Respects password-manager and dictation-tool privacy flags (case-insensitive matching)
- Smart deduplication — re-copies bump `hitCount` and move the item to the top
- **Move Pasted Items to Top Toggle:** Optional setting to move unpinned items to the top of Recent upon pasting.
- Incognito mode — one click suspends polling for sensitive data
- Auto-delete timer options (Never / 1h / 6h / 24h / 7d) and clear unpinned on restart

**Offline Rich URL Previews & One-Click Launch**
- **Zero-Cost Offline URL Previews:** Automatically parses website domain names, titles, and site favicons for copied URLs without external API overhead.
- **Quick Action Links & Browser Launch:** Clicking the external link launcher button on URL cards or flyouts opens links directly in your default web browser.

**Universal Native OS Drag & Drop Vault**
- **Universal Drag-in Vault:** Drag text, web images, links, and local files directly into the Edge-Drop shelf.
- **Native Drag-out:** Drag items out of the shelf into Photoshop, Word, Explorer, Slack, or any desktop application using real OS file handles and vector drag ghosts.

**Fluid collections & stacks**
- Auto-group multi-file drag-ins and multi-image copies into 3D card stacks (max 10)
- **Preview Flyout Drag-to-Stack**: Drag any shelf item directly onto an open Preview Flyout to stack and merge them seamlessly
- Expand stacks with a single click on the Expand action button or Preview Flyout; drag a sub-item to the screen edge to split it back out

**Complete 30+ Language Internationalization & Smart Selector**
- **100% Native Localization**: Fully translated dictionaries for 31 global languages with 100% section & key coverage (`en`, `es`, `fr`, `de`, `it`, `pt`, `ru`, `ja`, `ko`, `zh-CN`, `zh-TW`, `hi`, `ar`, `bn`, `tr`, `vi`, `pl`, `nl`, `sv`, `id`, `uk`, `el`, `cs`, `ro`, `hu`, `da`, `fi`, `th`, `he`, `no`, `fa`).
- **Native Right-to-Left (RTL) Support**: Automatic text direction and layout mirror switching for Arabic (`ar`), Hebrew (`he`), and Persian (`fa`).
- **Auto-Scroll Language Viewport**: Language selector anchors `System Default (Auto)` at index 0 while auto-scrolling to bring the active selected language directly into view on open.
- **Haptic Sound Feedback**: Integrated audio dial ticks (`playDialTickSound()`) during dropdown item hover and scroll.

**Laptop Sleep/Wake Guard (`powerMonitor`)**
- Native `powerMonitor` event handlers (`suspend`, `lock-screen`, `resume`, `unlock-screen`) pause clipboard polling on system sleep and re-seed the clipboard signature on wake.
- Eliminates false Copy Indicator beacon flares when opening the laptop lid or unlocking the screen.

**Customizable Text Size Scale Setting**
- Select between **Small**, **Normal**, **Medium**, and **Large** typography scaling in Settings (`Appearance` tab), dynamically driving `--font-scale` across all components.

**Multi-File Selection & Obsidian Glass Action Bar**
- Tap-to-toggle multi-select mode in Preview Flyout with vector checkmarks (`✓`).
- Integrated Obsidian Glass action bar for batch operations: Select All, Copy Selected, Paste Selected, Clear Selection.

**Adaptive Battery Power Optimization**
- Battery-aware cursor polling interval (`powerMonitor.isOnBatteryPower()`) reduces CPU draw and conserves laptop battery life.

**UI / UX**
- **macOS Segmented Control 5-Category Filter Suite**: Integrated 5-type filter bar (**`All`**, **`Text`**, **`Links`**, **`Images`**, **`Files`**) with a single persistent sliding spring indicator pill (`stiffness: 500`, `damping: 35`) and zero shape distortion.
- **Independent Pinned Section State per Filter**: Each filter category tab maintains its own independent pinned section collapse/expand state (`collapsedMap`), persisted across sessions in `localStorage`.
- **Unified Image Entity Classification**: Native screenshots (`Win + Shift + S`) and copied image files (`.png`, `.jpg`, `.webp`, `.svg`) are unified under the **`Images`** filter tab with visual thumbnail cards.
- **HD Anti-Aliased Curved Edges**: GPU layer promotion (`transform: translateZ(0)`), `-webkit-background-clip: padding-box`, and smooth vector rasterization delivering 100% HD anti-aliased curved borders across all display scales.
- **Tactile Micro-Interactions & Spring Motion**: Card hover 2px lift with ambient backlight glow, micro radial copy ripple effect, and smooth Framer Motion `layoutId` spring list reflow (`stiffness: 500`, `damping: 32`).
- **Refined Obsidian Aesthetics & Multi-Layer Depth**: Dual-layer 3D glass hairline highlights (`inset 0 1px 0 rgba(255, 255, 255, 0.12)`) and dual typography hierarchy (monospaced *JetBrains Mono* metadata + *Inter/SF Pro* system title font stack).
- **Ergonomic Card Action Bar & Safety Guard**: Re-ordered card actions (`Pin`, `Expand`, `Copy`, `Open Link`, `Divider`, `Delete`) with a physical safety hairline divider and 100% layout consistency across normal hover and preview mode.
- **What's New Release History View**: Integrated in-app release notes timeline viewer (`ChangelogView.tsx`) connected to live GitHub Releases API with pure formatted text highlights and zero-lag offline fallbacks.
- **Lucide-React Vector Icon Suite**: Powered by official `lucide-react` vector icons for crisp graphics across headers, item cards, and settings.
- **Dynamic Preview Flyout**: Responsive layout for single files and multi-file collections with calibrated hover boundary tracking.
- **Customizable Copy Indicator Styles**: Select from 4 vector copy indicators (**Edge-Drop Logo**, **Tick**, **Copy**, and **Sparkle**) in a 2x2 grid flyout selector.
- **Universal Click-to-Paste**: Click any text snippet, image thumbnail, or file tile inside Preview Flyout to instantly paste into active desktop applications.
- Minimalist macOS aesthetic — deep black obsidian surface, hairline borders, and adaptive spring physics (`useAdaptiveSpring`).

---

## Codebase & Architecture

### Process Isolation & IPC Contract
Edge-Drop is organized into three strictly isolated layers:

1. **Main Process (`electron/main/`)**: Node.js runtime handling OS integrations, Win32 OLE drag pipelines, Windows DPAPI encryption (`safeStorage`), native `ClipboardWatcher` polling, and background auto-updates (`updater.ts`).
2. **Preload Sandbox (`electron/preload/`)**: Context-isolated bridge (`contextBridge.exposeInMainWorld('edge', api)`). Consumes single-source-of-truth contracts in `shared/ipc.ts` (`InvokeMap`, `EventMap`, `SendMap`) and `shared/bridge.ts` (`EdgeApi`).
3. **Renderer Process (`src/`)**: React 18 UI powered by Zustand state management (`appStore.ts`), Web Audio synthesis (`soundEffects.ts`), and Framer Motion spring physics (`useAdaptiveSpring.ts`).

### Key Engine Components
- **`ClipboardWatcher.ts`**: Polls system clipboard every 600ms. Computes cheap FNV-1a hashes over BGRA bitmap bytes for zero-overhead image deduplication.
- **`ItemStore.ts`**: Atomic JSON persistence with `safeStorage` DPAPI encryption, automatic duplicate bumping, and stack merging/splitting.
- **`soundEffects.ts`**: Synthesized Web Audio API sound suite (dial ticks, button clicks, toggle pops, delete thuds) with global toggle controls.
- **`updater.ts`**: Singleton `autoUpdater` module handling background downloading and single-click restart installation for GitHub builds, gated behind `!isStoreBuild()`.
- **`drag.ts`**: Server-side SVG → PNG icon rendering via `@resvg/resvg-js` for stacked drag ghosts.

---

## Security

Edge-Drop touches the OS clipboard, the filesystem, and the Win32 OLE drag pipeline — so the security posture is intentional, not optional.

| Control | Implementation |
|---|---|
| Modern Runtime | **Electron 34.2.0+** — Patches EOL Chromium memory corruption and RCE vectors |
| Encrypted Storage | **Windows DPAPI `safeStorage`** — Plaintext history (`items.json`) encrypted at rest with user-session DPAPI keys & zero-data-loss auto-migration (`.bak` backups) |
| Process Isolation | `contextIsolation: true` · `nodeIntegration: false` · `sandbox: true` on all browser windows |
| PowerShell Hardening | Absolute executable path `${SystemRoot}\System32\WindowsPowerShell\v1.0\powershell.exe`, non-blocking `execFile`, strict path validation (`pathValidation.ts`), and queue deadlock protection |
| Protocol Confinement | `edgelocal://` canonical path resolution (`path.resolve()`) strictly confined within `%APPDATA%/Edge-Drop/images/` and SHA-256 ETag revalidation |
| Detector Teardown | Static `resources/detector.html` (zero `data:` URL inline scripts) with explicit `closed` lifecycle memory dereferencing |
| Typed IPC | `shared/ipc.ts` defines `InvokeMap`, `EventMap`, `SendMap` — channel names and payload types are statically checked on both sides |
| Privacy-Aware Clipboard | Honors `ExcludeClipboardContentFromMonitorProcessing`, `ClipboardViewerIgnore`, `CanIncludeInClipboardHistory`, `CanUploadToCloudClipboard`, plus 1Password / Bitwarden / KeePass concealed formats |
| Atomic Persistence | JSON index written via temp-file + rename; image bytes stored as per-id PNG files |
| Dev-Safe Startup | `app.setLoginItemSettings` is gated by `app.isPackaged` — dev builds never touch the Windows Registry |
| External Links | `setWindowOpenHandler` forces all window-open requests to `shell.openExternal` — no in-app navigation |

---

## Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Desktop runtime | **Electron 34+** | Only way to access Win32 OLE drag pipelines and native clipboard formats from JS |
| Build tooling | **electron-vite** | Separate Main / Preload / Renderer builds with Vite HMR |
| UI | **React 18 + TypeScript** | Strongly typed component hierarchy |
| Audio | **Web Audio API** | Synthesized haptic audio feedback (ticks, clicks, pops, thuds) with 0 audio asset overhead |
| Animation | **Framer Motion** | Adaptive spring physics (`useAdaptiveSpring`), layout transitions, gesture animations |
| State | **Zustand** | Selector-optimized, zero cascading re-renders during drags |
| Drag icons | **@resvg/resvg-js** | Server-side SVG → PNG rendering for custom drag ghosts |
| Auto-Updates | **electron-updater** | Background downloading and single-click installation for GitHub builds |

---

## Project Structure

```
Edge-Drop/
├─ shared/                 Typed IPC contracts & domain models
│  ├─ types.ts             ClipboardItem, Bundle, Settings, DragRequest DTOs
│  ├─ bridge.ts            EdgeApi preload interface
│  └─ ipc.ts               InvokeMap / EventMap / SendMap channel definitions
├─ electron/               Node.js backend & OS integrations
│  ├─ main/
│  │  ├─ index.ts          Single-instance lock, IPC registration, startup
│  │  ├─ window.ts         Frameless window, setIgnoreMouseEvents, cursor poll
│  │  ├─ updater.ts        Background auto-update engine (electron-updater)
│  │  ├─ tray.ts           System tray icon & context menus
│  │  ├─ fullscreen.ts     Windows SHQueryUserNotificationState game detection
│  │  └─ drag.ts           OLE startDrag, temp-file staging, icon generation
│  ├─ preload/             Sandbox bridge exposing window.edge
│  ├─ clipboard/
│  │  ├─ ClipboardWatcher.ts   600ms poll loop, transient-copy rejection
│  │  └─ formats.ts        FNV-1a signatures, Win32 HDROP, privacy-flag detection
│  └─ store/
│     ├─ ItemStore.ts      Atomic JSON persistence, DPAPI encryption, dedup
│     ├─ settings.ts       User config & startup registration
│     └─ paths.ts          AppData + temp directory resolution
├─ src/                    React renderer
│  ├─ components/          Panel, ItemList, ClipboardItem, SearchBar, Settings, ChangelogView, Icons
│  ├─ hooks/               useEdgeHover (hysteresis), useDragOut, useFilteredItems
│  ├─ lib/                 soundEffects (Web Audio API), theme tokens, format helpers
│  ├─ store/               Zustand appStore
│  └─ styles/              tokens.css, panel.css, settings.css, item.css, global.css
```

---

## Roadmap

Edge-Drop is in **public beta**. The following are planned, in rough priority order:

- [ ] **AI semantic self-organization** — embed text/URL/HTML items, auto-cluster into named groups, replace manual pinning
- [ ] **AI summarization** — condense multi-file bundles and long HTML copies into one-line summaries + tags
- [x] **Multi-monitor support** — anchor to any display edge, not just primary
- [x] **Silent background auto-updates** — background download and 1-click update installation
- [x] **Synthesized Web Audio Haptic Suite** — real-time sound effects for ticks, toggles, clicks, and deletes
- [x] **Segmented Settings Architecture** — 3 stationary category tabs with independent scroll positions
- [ ] **Linux port** — replace Win32-specific paths with cross-platform equivalents
- [ ] **Plugin SDK** — let users write custom format readers and drag-out targets
- [ ] **Cloud sync (opt-in, E2E encrypted)** — sync pinned items across machines
- [ ] **Search across full history** — currently capped at `historyLimit` (default 500)

---

## Contributing

Edge-Drop is Apache-2.0 licensed and open to contributions. As a solo-maintained project in active beta, the best ways to help right now are:

1. **File issues** for bugs, crashes, or privacy-edge-cases you hit (especially around clipboard format detection on different apps)
2. **macOS porting** — Currently Edge-Drop only supports Windows; contributions for a macOS port are welcome
3. **Suggest format readers** — if you copy from an app whose content Edge-Drop mis-categorizes, open an issue with the available formats list (`clipboard.availableFormats()` output)
4. **Pick up a roadmap item** — open an issue first to discuss scope, then send a PR against a feature branch

### Development workflow
```bash
npm install
npm run dev          # Electron + Vite HMR
npm run typecheck    # tsc --noEmit (node + web configs)
npm run build:github # build Windows NSIS installer for GitHub
npm run build:store  # build Windows AppX package for Microsoft Store
```

---

## License

Apache License 2.0 — see [LICENSE](LICENSE). Commercial and non-commercial use, modification, and distribution all permitted with attribution.

---

<p align="center">
  <sub>Support Edge-Drop on <a href="https://ko-fi.com/deepender" target="_blank">Ko-fi ☕</a> &nbsp;·&nbsp; Star on <a href="https://github.com/Deepender25/Edge-Drop" target="_blank">GitHub ⭐</a></sub>
</p>
