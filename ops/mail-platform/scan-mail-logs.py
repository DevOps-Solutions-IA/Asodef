#!/usr/bin/env python3
"""Fail if sanitized mail logs contain protected runtime material."""

import argparse
import sys
from pathlib import Path


def fail(code: str) -> None:
    print(f"status=error code={code}", file=sys.stderr)
    raise SystemExit(1)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--password-file", required=True)
    args = parser.parse_args()

    password_path = Path(args.password_file)
    if password_path.is_symlink() or not password_path.is_file() or password_path.stat().st_uid != 0 or password_path.stat().st_mode & 0o077:
        fail("password_file_unusable")
    password = password_path.read_text(encoding="utf-8").strip()
    if not password:
        fail("password_file_empty")

    private_marker = "".join(("BEGIN PRIVATE", " KEY"))
    for line in sys.stdin:
        if password in line:
            fail("smtp_password_found_in_log")
        if private_marker in line:
            fail("private_key_found_in_log")
    print("status=ok log_secret_scan=pass")


if __name__ == "__main__":
    main()
