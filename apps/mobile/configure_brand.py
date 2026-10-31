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

# Separate beta identity prevents a collision with historical disposable CI debug signatures.
# Keep this identifier stable for the ASEA IEUM beta installation line.
beta_id = "kr.ac.asea.ieum.beta"
for gradle in (ROOT / "android/app/build.gradle.kts", ROOT / "android/app/build.gradle"):
    if gradle.exists():
        text = gradle.read_text(encoding="utf-8")
        import re
        text, count = re.subn(r'(applicationId\\s*[= ]\\s*["\\\'])[^"\\\']+(["\\\'])',
                              lambda match: match.group(1) + beta_id + match.group(2), text, count=1)
        if count != 1:
            raise SystemExit("Android applicationId missing; refuse unsafe build")
        gradle.write_text(text, encoding="utf-8")
        print("Android beta applicationId configured:", beta_id)
        break
else:
    raise SystemExit("Android Gradle app config missing")
