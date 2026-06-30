#!/usr/bin/env python3
"""
Small Docker-only patcher for upstream HexStrike.

It does not fork upstream logic. It only adds:
1. Optional API key guard for Flask API.
2. Automatic API key header injection for hexstrike_mcp.py.
"""
from __future__ import annotations

import sys
from pathlib import Path


SERVER_MARKER = "# --- HexStrike Docker API key guard ---"
MCP_MARKER = "# --- HexStrike Docker API key client header ---"


def patch_server(root: Path) -> None:
    path = root / "hexstrike_server.py"
    text = path.read_text(encoding="utf-8")
    if SERVER_MARKER in text:
        print("[OK] server already patched")
        return

    needle = "API_HOST = os.environ.get('HEXSTRIKE_HOST', '127.0.0.1')\n"
    if needle not in text:
        raise RuntimeError("Cannot find API_HOST config block in hexstrike_server.py")

    block = needle + f'''
{SERVER_MARKER}
# Set HEXSTRIKE_API_KEY to enable simple shared-secret protection.
# Accepted formats:
#   X-HexStrike-Api-Key: <key>
#   Authorization: Bearer <key>
#   ?api_key=<key>
API_KEY = os.environ.get("HEXSTRIKE_API_KEY", "").strip()
API_KEY_HEADER = os.environ.get("HEXSTRIKE_API_KEY_HEADER", "X-HexStrike-Api-Key")
API_KEY_ALLOW_HEALTH = os.environ.get("HEXSTRIKE_API_KEY_ALLOW_HEALTH", "true").lower() in ("1", "true", "yes", "on")

@app.before_request
def _hexstrike_docker_api_key_guard():
    if not API_KEY:
        return None

    if API_KEY_ALLOW_HEALTH and request.path in ("/health", "/api/health"):
        return None

    supplied = request.headers.get(API_KEY_HEADER, "").strip()
    authz = request.headers.get("Authorization", "").strip()
    if not supplied and authz.lower().startswith("bearer "):
        supplied = authz.split(" ", 1)[1].strip()
    if not supplied:
        supplied = request.args.get("api_key", "").strip()

    try:
        import hmac
        valid = hmac.compare_digest(supplied, API_KEY)
    except Exception:
        valid = supplied == API_KEY

    if not valid:
        return jsonify({{
            "success": False,
            "error": "missing_or_invalid_api_key",
            "hint": f"send {{API_KEY_HEADER}} header or Authorization: Bearer token"
        }}), 401

    return None
# --- End HexStrike Docker API key guard ---
'''

    text = text.replace(needle, block, 1)
    path.write_text(text, encoding="utf-8")
    print("[OK] patched hexstrike_server.py with API key guard")


def patch_mcp(root: Path) -> None:
    path = root / "hexstrike_mcp.py"
    text = path.read_text(encoding="utf-8")
    if MCP_MARKER in text:
        print("[OK] mcp already patched")
        return

    needle = "        self.session = requests.Session()\n"
    if needle not in text:
        raise RuntimeError("Cannot find requests.Session() block in hexstrike_mcp.py")

    block = needle + f'''{MCP_MARKER}
        self.api_key = os.environ.get("HEXSTRIKE_API_KEY", "").strip()
        self.api_key_header = os.environ.get("HEXSTRIKE_API_KEY_HEADER", "X-HexStrike-Api-Key")
        if self.api_key:
            self.session.headers.update({{self.api_key_header: self.api_key}})
# --- End HexStrike Docker API key client header ---
'''

    text = text.replace(needle, block, 1)
    path.write_text(text, encoding="utf-8")
    print("[OK] patched hexstrike_mcp.py with API key header support")


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
