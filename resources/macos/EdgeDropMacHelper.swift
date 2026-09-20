import AppKit
import ApplicationServices
import Foundation

private func emitJSON(_ value: Any) throws {
    let data = try JSONSerialization.data(withJSONObject: value)
    FileHandle.standardOutput.write(data)
}

private func readFiles() throws {
    let options: [NSPasteboard.ReadingOptionKey: Any] = [
        .urlReadingFileURLsOnly: true
    ]
    let objects = NSPasteboard.general.readObjects(
        forClasses: [NSURL.self],
        options: options
    ) as? [URL] ?? []
    try emitJSON(objects.filter(\.isFileURL).map(\.path))
}

@discardableResult
private func writeFiles(_ paths: ArraySlice<String>) -> Bool {
    let urls = paths.map { NSURL(fileURLWithPath: $0) }
    guard !urls.isEmpty else { return false }
    let pasteboard = NSPasteboard.general
    pasteboard.clearContents()
    return pasteboard.writeObjects(urls)
}

@discardableResult
private func writeImage(imagePath: String, filePaths: ArraySlice<String>) -> Bool {
    guard let image = NSImage(contentsOfFile: imagePath) else { return false }
    var objects: [NSPasteboardWriting] = [image]
    objects.append(contentsOf: filePaths.map { NSURL(fileURLWithPath: $0) })
    let pasteboard = NSPasteboard.general
    pasteboard.clearContents()
    return pasteboard.writeObjects(objects)
}

private func requestAccessibilityIfNeeded() -> Bool {
    let key = kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String
    return AXIsProcessTrustedWithOptions([key: true] as CFDictionary)
}

private func paste() -> Bool {
    guard requestAccessibilityIfNeeded() else { return false }
    guard
        let source = CGEventSource(stateID: .combinedSessionState),
        let down = CGEvent(keyboardEventSource: source, virtualKey: 9, keyDown: true),
        let up = CGEvent(keyboardEventSource: source, virtualKey: 9, keyDown: false)
    else { return false }

    down.flags = .maskCommand
    up.flags = .maskCommand
    down.post(tap: .cghidEventTap)
    usleep(20_000)
    up.post(tap: .cghidEventTap)
    return true
}

private func frontmostAppIsFullscreen() -> Bool {
    guard let app = NSWorkspace.shared.frontmostApplication else { return false }
    guard let windows = CGWindowListCopyWindowInfo(
        [.optionOnScreenOnly, .excludeDesktopElements],
        kCGNullWindowID
    ) as? [[String: Any]] else { return false }

    let tolerance: CGFloat = 3
    for window in windows {
        guard (window[kCGWindowOwnerPID as String] as? pid_t) == app.processIdentifier else { continue }
        guard (window[kCGWindowLayer as String] as? Int) == 0 else { continue }
        guard let boundsDictionary = window[kCGWindowBounds as String] as? NSDictionary,
              let bounds = CGRect(dictionaryRepresentation: boundsDictionary) else { continue }

        for screen in NSScreen.screens {
            guard let screenNumber = screen.deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")] as? NSNumber else { continue }
            let frame = CGDisplayBounds(CGDirectDisplayID(screenNumber.uint32Value))
            let sameOrigin = abs(bounds.minX - frame.minX) <= tolerance &&
                abs(bounds.minY - frame.minY) <= tolerance
            let sameSize = abs(bounds.width - frame.width) <= tolerance &&
                abs(bounds.height - frame.height) <= tolerance
            if sameOrigin && sameSize { return true }
        }
    }
    return false
}

do {
    let args = CommandLine.arguments
    guard args.count >= 2 else { throw NSError(domain: "EdgeDropMacHelper", code: 2) }

    let ok: Bool
    switch args[1] {
    case "read-files":
        try readFiles()
        ok = true
    case "write-files":
        ok = writeFiles(args.dropFirst(2))
    case "write-image":
        guard args.count >= 3 else { throw NSError(domain: "EdgeDropMacHelper", code: 2) }
        ok = writeImage(imagePath: args[2], filePaths: args.dropFirst(3))
    case "paste":
        ok = paste()
    case "frontmost-fullscreen":
        print(frontmostAppIsFullscreen() ? "1" : "0")
        ok = true
    default:
        throw NSError(domain: "EdgeDropMacHelper", code: 2)
    }

    if !ok { exit(1) }
} catch {
    FileHandle.standardError.write(Data("\(error)\n".utf8))
    exit(1)
}
