#!/usr/bin/env python3
"""Fetch licensed Pretendard static fonts for deterministic Flutter builds.
Do not commit binary font files; bundle fonts into APK/IPA at build time.
"""
from pathlib import Path
from urllib.request import urlopen
import hashlib
base="https://raw.githubusercontent.com/orioncactus/pretendard/main/packages/pretendard/dist/public/static/"
root=Path(__file__).resolve().parent/"assets"/"fonts"
root.mkdir(parents=True,exist_ok=True)
for style in ("Regular","Medium","SemiBold","Bold"):
 name=f"Pretendard-{style}.otf"
 dst=root/name
 if dst.exists() and dst.stat().st_size>100000:
  continue
 with urlopen(base+name,timeout=45) as response:
  data=response.read()
 if len(data)<100000 or data[:4] not in (b"OTTO",b"\x00\x01\x00\x00"):
  raise RuntimeError("Font download invalid: "+name)
 dst.write_bytes(data)
 print(name,len(data),hashlib.sha256(data).hexdigest())
