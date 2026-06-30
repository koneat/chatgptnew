#!/usr/bin/env python3
from __future__ import annotations

import argparse
import os
import subprocess
import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent
UPSTREAM_MCP = ROOT_DIR / "upstream" / "hexstrike-ai" / "hexstrike_mcp.py"
ENV_FILE = ROOT_DIR / ".env"


def load_env_file() -> dict[str, str]:
    env: dict[str, str] = {}
    if not ENV_FILE.exists():
        return env
    for raw in ENV_FILE.read_text(encoding="utf-8", errors="ignore").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        env[key.strip()] = value.strip().strip('"').strip("'")
    return env


def main() -> int:
    parser = argparse.ArgumentParser(description="HexStrike physical MCP launcher")
    parser.add_argument("--server", default=None, help="HexStrike API URL")
    parser.add_argument("--print-command", action="store_true")
    args, unknown = parser.parse_known_args()

    env = os.environ.copy()
    for key, value in load_env_file().items():
        env.setdefault(key, value)

    server = args.server or env.get("HEXSTRIKE_SERVER") or "http://127.0.0.1:8888"

    if not UPSTREAM_MCP.exists():
        print(
            "[hexstrike_mcp] missing upstream/hexstrike-ai/hexstrike_mcp.py. "
            "Install physical MCP first with the README commands.",
            file=sys.stderr,
        )
        return 2

    cmd = [sys.executable, str(UPSTREAM_MCP), "--server", server]
    cmd.extend(unknown)

    if args.print_command:
        print(" ".join(cmd))
        return 0

    return subprocess.run(cmd, env=env).returncode


if __name__ == "__main__":
    raise SystemExit(main())
