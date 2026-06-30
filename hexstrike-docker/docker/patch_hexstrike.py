#!/usr/bin/env python3
from __future__ import annotations

import sys
from pathlib import Path


def patch_server(root: Path) -> None:
    path = root / "hexstrike_server.py"
    if not path.exists():
        raise RuntimeError("Cannot find hexstrike_server.py")

    text = path.read_text(encoding="utf-8")
    original = text

    text = text.replace(
        "API_HOST = os.environ.get('HEXSTRIKE_HOST', '127.0.0.1')",
        "API_HOST = os.environ.get('HEXSTRIKE_HOST', '0.0.0.0')",
    )
    text = text.replace(
        'API_HOST = os.environ.get("HEXSTRIKE_HOST", "127.0.0.1")',
        'API_HOST = os.environ.get("HEXSTRIKE_HOST", "0.0.0.0")',
    )
    text = text.replace("app.run(host='127.0.0.1'", "app.run(host='0.0.0.0'")
    text = text.replace('app.run(host="127.0.0.1"', 'app.run(host="0.0.0.0"')

    if text != original:
        path.write_text(text, encoding="utf-8")
        print("[OK] patched server bind address to 0.0.0.0")
    else:
        print("[OK] server bind address already uses env or 0.0.0.0")


def patch_mcp(root: Path) -> None:
    path = root / "hexstrike_mcp.py"
    if not path.exists():
        raise RuntimeError("Cannot find hexstrike_mcp.py")
    print("[OK] mcp unchanged")


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("Usage: patch_hexstrike.py /opt/hexstrike")
    root = Path(sys.argv[1]).resolve()
    patch_server(root)
    patch_mcp(root)


if __name__ == "__main__":
    main()
