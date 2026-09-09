# Edge-Drop macOS port

This branch keeps the Electron/React interface and adds native macOS adapters for the OS-specific behavior.

## Run from source

Requirements:

- macOS 12 or newer
- Node.js 22
- Xcode Command Line Tools (`xcode-select --install`)

```bash
cd /path/to/Edge-Drop
npm install
npm run dev:mac
```

The app runs as a menu-bar utility and does not appear in the Dock. Hover at the configured left or right screen edge, press the global shortcut, or use the menu-bar icon.

## Permissions

Clipboard history, file drag-in/out, and edge hover require no special macOS permission. The first click-to-paste action asks for **Accessibility** permission because macOS protects synthesized Command+V keyboard events. Grant it under **System Settings → Privacy & Security → Accessibility**. Copy-only actions work without it.

Edge-Drop respects common macOS concealed/sensitive pasteboard types used by password managers.

## Build an installable image

```bash
npm run typecheck
npm test
npm run build:mac
```

Artifacts are written to `dist/` as an ARM64 DMG and ZIP. This local build is unsigned. Public distribution should use `npm run build:mac:release` with an Apple Developer ID certificate and notarization credentials configured for electron-builder.

## Native macOS implementation

- `resources/macos/EdgeDropMacHelper.swift` reads and writes Finder file URLs through `NSPasteboard`, writes image-plus-file payloads atomically, detects full-screen foreground windows, and sends Command+V through Core Graphics.
- The panel is an accessory/menu-bar app, hidden from Mission Control, and visible across Spaces and full-screen Spaces.
- Launch at login uses Electron's macOS login-item API rather than Windows registry keys.
- The menu-bar icon is a macOS template image and adapts automatically to light/dark menu bars.

## Current distribution note

Automatic updating is disabled on macOS until this fork has a signed and notarized release feed. Windows behavior remains unchanged.
