#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BUILD_DIR="$SCRIPT_DIR/build"
OUTPUT_DIR="$SCRIPT_DIR/bin"
SDK_PATH="$(xcrun --sdk macosx --show-sdk-path)"

mkdir -p "$BUILD_DIR" "$OUTPUT_DIR"

swiftc -O -sdk "$SDK_PATH" -target arm64-apple-macos12.0 \
  "$SCRIPT_DIR/EdgeDropMacHelper.swift" -o "$BUILD_DIR/EdgeDropMacHelper-arm64"
swiftc -O -sdk "$SDK_PATH" -target x86_64-apple-macos12.0 \
  "$SCRIPT_DIR/EdgeDropMacHelper.swift" -o "$BUILD_DIR/EdgeDropMacHelper-x64"
lipo -create \
  "$BUILD_DIR/EdgeDropMacHelper-arm64" \
  "$BUILD_DIR/EdgeDropMacHelper-x64" \
  -output "$OUTPUT_DIR/EdgeDropMacHelper"

codesign --force --sign - "$OUTPUT_DIR/EdgeDropMacHelper"
