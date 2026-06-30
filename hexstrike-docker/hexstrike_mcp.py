#!/usr/bin/env python3
"""HexStrike MCP launcher.

Default flow for the packaged Docker setup:
  MCP client -> this launcher -> docker exec -i hexstrike-ai /entrypoint.sh mcp

The HexStrike API server can run inside Docker while the MCP client starts this
small launcher on the host. The launcher prefers the Docker MCP runtime because
it already contains the upstream HexStrike MCP file and Python dependencies.
"""
from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Dict, Iterable, List

ROOT_DIR = Path(__file__).resolve().parent
ENV_FILE = ROOT_DIR / ".env"
DEFAULT_UPSTREAM_MCP = ROOT_DIR / "upstream" / "hexstrike-ai" / "hexstrike_mcp.py"


def load_dotenv(path: Path) -> Dict[str, str]:
    env: Dict[str, str] = {}
    if not path.exists():
        return env

    for raw_line in path.read_text(encoding="utf-8", errors="ignore").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key:
            env[key] = value
    return env


def merged_env() -> Dict[str, str]:
    env = os.environ.copy()
    for key, value in load_dotenv(ENV_FILE).items():
        env.setdefault(key, value)

    env.setdefault("HEXSTRIKE_CONTAINER_NAME", "hexstrike-ai")
    env.setdefault("HEXSTRIKE_CONTAINER_PORT", "8888")
    env.setdefault("HEXSTRIKE_HOST_PORT", "8888")
    env.setdefault("HEXSTRIKE_SERVER", "http://127.0.0.1:8888")
    return env


def docker_available() -> bool:
    return shutil.which("docker") is not None


def container_running(container_name: str, env: Dict[str, str]) -> bool:
    if not docker_available():
        return False
    try:
        result = subprocess.run(
            ["docker", "inspect", "-f", "{{.State.Running}}", container_name],
            stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            text=True,
            env=env,
            timeout=10,
        )
        return result.returncode == 0 and result.stdout.strip().lower() == "true"
    except Exception:
        return False


def build_docker_exec(env: Dict[str, str], extra_args: Iterable[str]) -> List[str]:
    container = env.get("HEXSTRIKE_CONTAINER_NAME", "hexstrike-ai")
    container_port = env.get("HEXSTRIKE_CONTAINER_PORT", "8888")
    server = env.get("HEXSTRIKE_SERVER_IN_CONTAINER", f"http://127.0.0.1:{container_port}")

    cmd = [
        "docker", "exec", "-i",
        "-e", f"HEXSTRIKE_SERVER={server}",
        container,
        "/entrypoint.sh", "mcp",
    ]
    cmd.extend(extra_args)
    return cmd


def build_physical_exec(env: Dict[str, str], extra_args: Iterable[str]) -> List[str]:
    upstream_mcp = env.get("HEXSTRIKE_UPSTREAM_MCP", "").strip() or str(DEFAULT_UPSTREAM_MCP)
    mcp_path = Path(upstream_mcp).expanduser()
    if not mcp_path.exists():
        raise SystemExit(
            "Physical MCP files are not installed. Use --mode docker, or install the upstream MCP files first."
        )

    server = env.get("HEXSTRIKE_SERVER", "http://127.0.0.1:8888")
    cmd = [sys.executable, str(mcp_path), "--server", server]
    cmd.extend(extra_args)
    return cmd


def resolve_mode(requested_mode: str, env: Dict[str, str]) -> str:
    if requested_mode != "auto":
        return requested_mode

    container = env.get("HEXSTRIKE_CONTAINER_NAME", "hexstrike-ai")
    if container_running(container, env):
        return "docker"
    if DEFAULT_UPSTREAM_MCP.exists():
        return "physical"
    return "docker"


def main() -> int:
    parser = argparse.ArgumentParser(description="HexStrike MCP launcher")
    parser.add_argument(
        "--mode",
        choices=("auto", "docker", "physical", "local"),
        default=os.environ.get("HEXSTRIKE_MCP_MODE", "auto"),
        help="auto prefers Docker when the hexstrike-ai container is running",
    )
    parser.add_argument("--server", default=None, help="Host-side HexStrike API URL for physical mode")
    parser.add_argument("--container", default=None, help="Docker container name, default hexstrike-ai")
    parser.add_argument("--print-command", action="store_true", help="Print resolved command and exit")
    args, unknown = parser.parse_known_args()

    env = merged_env()
    if args.server:
        env["HEXSTRIKE_SERVER"] = args.server
    if args.container:
        env["HEXSTRIKE_CONTAINER_NAME"] = args.container

    mode = resolve_mode(args.mode, env)

    if mode == "docker":
        if not docker_available():
            print("[hexstrike_mcp] docker command not found", file=sys.stderr)
            return 127
        container = env.get("HEXSTRIKE_CONTAINER_NAME", "hexstrike-ai")
        if not container_running(container, env):
            print(
                f"[hexstrike_mcp] container '{container}' is not running. Start it first.",
                file=sys.stderr,
            )
            return 2
        cmd = build_docker_exec(env, unknown)
    else:
        cmd = build_physical_exec(env, unknown)

    if args.print_command:
        print(" ".join(cmd))
        return 0

    completed = subprocess.run(cmd, env=env)
    return completed.returncode


if __name__ == "__main__":
    raise SystemExit(main())
