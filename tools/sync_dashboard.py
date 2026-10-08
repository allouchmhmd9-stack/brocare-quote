#!/usr/bin/env python3
"""Copy the quoters into the Brocare dashboard so both are the exact same thing.

This repo is the single source of truth. The dashboard serves the same files
under /tools (brocare-agents/tools); every include is relative, so the files
work unchanged in both places.

    python tools/sync_dashboard.py C:/dev/brocare/wt-quoter/tools
    python tools/sync_dashboard.py <dashboard tools dir> --check   # report drift only
"""
import argparse, filecmp, shutil, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FILES = ["index.html", "brocare-theme.css", "shell.js", "users.js", "auth.js", "brocare-logo.png", "camera.js", "paddle-rec.js",
         "models/arabic_PP-OCRv5_mobile_rec.onnx", "models/arabic_PP-OCRv5_mobile_rec.dict.json", "models/README.txt", "models/arabic_PP-OCRv5_mobile_rec.yml",
         "health/index.html", "motor/index.html", "motor/car-listings.js", "docs/index.html"]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("target", help="the dashboard's tools/ directory")
    ap.add_argument("--check", action="store_true", help="only report files that differ")
    a = ap.parse_args()
    target = Path(a.target)
    if not (target / "motor").is_dir():
        sys.exit(f"{target} doesn't look like the dashboard's tools/ directory")
    drift = 0
    for rel in FILES:
        src, dst = ROOT / rel, target / rel
        same = dst.exists() and filecmp.cmp(src, dst, shallow=False)
        if same:
            print(f"  same     {rel}")
            continue
        drift += 1
        if a.check:
            print(f"  DIFFERS  {rel}")
        else:
            dst.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(src, dst)
            print(f"  copied   {rel}")
    print(f"{drift} file(s) {'differ' if a.check else 'updated'}")
    return 1 if (a.check and drift) else 0


if __name__ == "__main__":
    sys.exit(main())
