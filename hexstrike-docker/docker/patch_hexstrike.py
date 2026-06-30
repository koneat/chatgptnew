#!/usr/bin/env python3
"""
Small Docker-only patcher for upstream HexStrike.

API key protection is intentionally disabled in this Docker wrapper.
The service should stay bound to 127.0.0.1 unless you put it behind a trusted tunnel,
VPN, reverse proxy, or access-control layer.

This patcher is kept as a build hook so future non-auth Docker compatibility patches
can be added without changing the Dockerfile.
"""
from __future__ import annotations

import sys
from pathlib import Path


def patch_server(root: Path) -> None:
    path = root / "hexstrike_server.py"
    if not path.exists():
        raise RuntimeError("Cannot find hexstrike_server.py")
    print("[OK] API key guard disabled; upstream server left unchanged")


def patch_mcp(root: Path) -> None:
    path = root / "hexstrike_mcp.py"
    if not path.exists():
        raise RuntimeError("Cannot find hexstrike_mcp.py")
    print("[OK] MCP API key header injection disabled; upstream MCP left unchanged")


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("Usage: patch_hexstrike.py /opt/hexstrike")

    root = Path(sys.argv[1]).resolve()
    if not root.exists():
        raise SystemExit(f"Path not found: {root}")

    patch_server(root)
    patch_mcp(root)


if __name__ == "__main__":
    main()
