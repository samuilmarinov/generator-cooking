#!/usr/bin/env python3
import argparse
import getpass
import os
import socket
import sys
import threading
import time
import traceback
from dataclasses import dataclass
from pathlib import Path
from typing import Optional, List

import paramiko

# ---------- Data model ----------

@dataclass
class TunnelSpec:
    remote_bind_host: str
    remote_bind_port: int
    local_host: str
    local_port: int
    # Pretty label for logs
    label: str = ""

# ---------- Helpers ----------

def read_password(path: Path) -> Optional[str]:
    try:
        return path.read_text(encoding="utf-8").strip()
    except FileNotFoundError:
        return None

def write_password(path: Path, password: str):
    path.parent.mkdir(parents=True, exist_ok=True)
    # Write with 0o600 perms
    if path.exists():
        path.unlink()
    with os.fdopen(os.open(path, os.O_WRONLY | os.O_CREAT, 0o600), "w", encoding="utf-8") as f:
        f.write(password + "\n")

def prompt_password(prompt: str) -> str:
    return getpass.getpass(prompt)

def secure_password(path: Path, prompt_text: str) -> str:
    pw = read_password(path)
    if not pw:
        pw = prompt_password(prompt_text)
        write_password(path, pw)
        print(f"Saved password to {path} with 600 permissions.")
    else:
        # Fix permissions if needed
        try:
            st = path.stat()
            if (st.st_mode & 0o777) != 0o600:
                os.chmod(path, 0o600)
        except Exception:
            pass
    return pw

def pipe(src, dst):
    """Copy bytes from src to dst until EOF."""
    try:
        while True:
            data = src.recv(65536)
            if not data:
                break
            dst.sendall(data)
    except Exception:
        pass
    finally:
        try:
            dst.shutdown(socket.SHUT_WR)
        except Exception:
            pass

def forward_channel(channel, target_host, target_port, label=""):
    """Bridge a paramiko channel to a local TCP socket."""
    sock = socket.socket()
    try:
        sock.connect((target_host, target_port))
    except Exception as e:
        print(f"[{label}] [!] Could not connect to local {target_host}:{target_port}: {e}")
        try:
            channel.close()
        except Exception:
            pass
        return

    # Start bidirectional piping
    t1 = threading.Thread(target=pipe, args=(channel, sock), daemon=True)
    t2 = threading.Thread(target=pipe, args=(sock, channel), daemon=True)
    t1.start()
    t2.start()
    t1.join()
    t2.join()
    try:
        sock.close()
    except Exception:
        pass
    try:
        channel.close()
    except Exception:
        pass

# ---------- Core loop (single tunnel) ----------

def run_tunnel(
    remote_host: str,
    remote_port: int,
    username: str,
    password_file: Path,
    keepalive: int,
    backoff_start: int,
    backoff_max: int,
    verbose: bool,
    spec: TunnelSpec,
):
    """
    Maintain ONE reverse tunnel (spec) with reconnect logic.
    """
    host = remote_host
    port = remote_port
    user = username

    backoff = backoff_start
    label = spec.label or f"{spec.remote_bind_host}:{spec.remote_bind_port}->{spec.local_host}:{spec.local_port}"

    while True:
        client = paramiko.SSHClient()
        client.set_missing_host_key_policy(paramiko.AutoAddPolicy())

        password = secure_password(password_file, f"Password for {user}@{host}: ")

        try:
            print(f"[{label}] [*] Connecting to {host}:{port} as {user} ...")
            client.connect(
                hostname=host,
                port=port,
                username=user,
                password=password,
                allow_agent=False,
                look_for_keys=False,
                timeout=15,
                banner_timeout=15,
                auth_timeout=15,
            )
            transport = client.get_transport()
            if not transport:
                raise RuntimeError("No transport after connect().")

            # Keepalives (like ServerAliveInterval)
            transport.set_keepalive(keepalive)

            # Request remote port forward: remote_bind_host:remote_bind_port → (local_host, local_port)
            print(f"[{label}] [*] Requesting remote forward {spec.remote_bind_host}:{spec.remote_bind_port} -> {spec.local_host}:{spec.local_port}")
            transport.request_port_forward(spec.remote_bind_host, spec.remote_bind_port)

            print(f"[{label}] [✓] Tunnel up. Waiting for connections...")
            backoff = backoff_start  # reset backoff after success

            # Accept incoming channels and bridge them
            while True:
                chan = transport.accept(timeout=60)
                if chan is None:
                    # no channel in 60s, just loop; keepalive handles liveness
                    continue
                threading.Thread(
                    target=forward_channel,
                    args=(chan, spec.local_host, spec.local_port, label),
                    daemon=True
                ).start()

        except paramiko.AuthenticationException:
            print(f"[{label}] [!] Authentication failed. Prompting for password again...")
            # Nuke the saved password and reprompt
            try:
                if password_file.exists():
                    password_file.unlink()
            except Exception:
                pass
            time.sleep(1)
            continue
        except KeyboardInterrupt:
            print(f"\n[{label}] [~] Ctrl+C received. Exiting.")
            try:
                client.close()
            except Exception:
                pass
            sys.exit(0)
        except Exception as e:
            print(f"[{label}] [!] Tunnel error: {e}")
            if verbose:
                traceback.print_exc()
        finally:
            try:
                client.close()
            except Exception:
                pass

        # Reconnect with backoff
        print(f"[{label}] [*] Reconnecting in {backoff} seconds...")
        time.sleep(backoff)
        backoff = min(backoff * 2, backoff_max)

# ---------- CLI / Multi-tunnel orchestration ----------

def parse_map_flag(raw: str, default_bind_host: str) -> TunnelSpec:
    """
    Parse --map flag:
      [REMOTE_BIND_HOST:]REMOTE_PORT:LOCAL_HOST:LOCAL_PORT
    """
    parts = raw.split(":")
    if len(parts) == 3:
        # REMOTE_PORT : LOCAL_HOST : LOCAL_PORT
        r_host = default_bind_host
        r_port, l_host, l_port = parts
    elif len(parts) == 4:
        # REMOTE_BIND_HOST : REMOTE_PORT : LOCAL_HOST : LOCAL_PORT
        r_host, r_port, l_host, l_port = parts
    else:
        raise ValueError(f"Invalid --map value: {raw}")

    try:
        r_port_i = int(r_port)
        l_port_i = int(l_port)
    except ValueError:
        raise ValueError(f"Ports must be integers in --map: {raw}")

    label = f"{r_host}:{r_port_i}->{l_host}:{l_port_i}"
    return TunnelSpec(
        remote_bind_host=r_host,
        remote_bind_port=r_port_i,
        local_host=l_host,
        local_port=l_port_i,
        label=label,
    )

def main():
    parser = argparse.ArgumentParser(
        description="Keep one or more reverse SSH tunnels alive, storing password securely in a file."
    )
    parser.add_argument("--remote-host", default="77.68.25.135")
    parser.add_argument("--remote-port", type=int, default=22)
    parser.add_argument("--username", default="root")

    # Legacy single-tunnel flags (still supported)
    parser.add_argument("--remote-bind-host", default="127.0.0.1",
                        help="Default remote interface to bind (used if --map omits the host).")
    parser.add_argument("--remote-bind-port", type=int, default=15292,
                        help="Legacy: remote port to expose on the server (ignored if --map is used).")
    parser.add_argument("--local-host", default="127.0.0.1",
                        help="Legacy: local host to forward to on THIS machine (ignored if --map is used).")
    parser.add_argument("--local-port", type=int, default=3000,
                        help="Legacy: local port to forward to on THIS machine (ignored if --map is used).")

    # New multi-tunnel flag (repeatable)
    parser.add_argument(
        "--map",
        action="append",
        help="Add a reverse tunnel: [REMOTE_BIND_HOST:]REMOTE_PORT:LOCAL_HOST:LOCAL_PORT (repeatable).",
    )

    parser.add_argument("--password-file", default="~/.ssh/77.68.25.135.pw")
    parser.add_argument("--keepalive", type=int, default=30)
    parser.add_argument("--backoff-start", type=int, default=2)
    parser.add_argument("--backoff-max", type=int, default=60)
    parser.add_argument("-v", "--verbose", action="store_true")
    args = parser.parse_args()

    password_path = Path(args.password_file).expanduser()

    # Build tunnel list
    specs: List[TunnelSpec] = []
    if args.map:
        for raw in args.map:
            specs.append(parse_map_flag(raw, args.remote_bind_host))
    else:
        # Legacy single tunnel
        specs.append(
            TunnelSpec(
                remote_bind_host=args.remote_bind_host,
                remote_bind_port=args.remote_bind_port,
                local_host=args.local_host,
                local_port=args.local_port,
                label=f"{args.remote_bind_host}:{args.remote_bind_port}->{args.local_host}:{args.local_port}",
            )
        )

    # Spin up one thread per tunnel (separate SSH connections for simplicity/reliability)
    threads = []
    for spec in specs:
        t = threading.Thread(
            target=run_tunnel,
            kwargs=dict(
                remote_host=args.remote_host,
                remote_port=args.remote_port,
                username=args.username,
                password_file=password_path,
                keepalive=args.keepalive,
                backoff_start=args.backoff_start,
                backoff_max=args.backoff_max,
                verbose=args.verbose,
                spec=spec,
            ),
            daemon=True,
        )
        t.start()
        threads.append(t)
        print(f"[{spec.label}] launched.")

    # Keep main thread alive; join workers
    try:
        while True:
            for t in threads:
                t.join(timeout=1.0)
            time.sleep(1.0)
    except KeyboardInterrupt:
        print("\n[~] Exiting.")
        sys.exit(0)

if __name__ == "__main__":
    main()
