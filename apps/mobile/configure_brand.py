#!/usr/bin/env python3
"""Set human-readable OS app names on generated Flutter scaffolds.
Preserves Android applicationId, iOS bundle id and app signing identity.
"""
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parent
NAME = "아세아 이음"

manifest = ROOT / "android/app/src/main/AndroidManifest.xml"
if manifest.exists():
    text = manifest.read_text(encoding="utf-8")
    text, n = re.subn(r'android:label="[^"]*"', f'android:label="{NAME}"', text, count=1)
    if n != 1:
        raise SystemExit("Android application label missing")
    manifest.write_text(text, encoding="utf-8")
    print("Android label configured")

info = ROOT / "ios/Runner/Info.plist"
if info.exists():
    text = info.read_text(encoding="utf-8")
    for key in ("CFBundleDisplayName", "CFBundleName"):
        pattern = r"(<key>" + key + r"</key>\s*<string>)[^<]*(</string>)"
        text, n = re.subn(pattern, lambda m: m.group(1) + NAME + m.group(2), text, count=1)
        if n != 1:
            raise SystemExit(key + " missing in iOS Info.plist")
    info.write_text(text, encoding="utf-8")
    print("iOS display name configured")
