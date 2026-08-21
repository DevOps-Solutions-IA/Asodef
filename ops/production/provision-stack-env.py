#!/usr/bin/env python3
"""Atomically provision or roll back the protected production Compose env."""

from __future__ import annotations

import argparse
import fcntl
import json
import os
from pathlib import Path
import re
import shutil
import stat
import sys
import tempfile
import time


BASE_KEYS = ("POSTGRES_DB", "POSTGRES_PASSWORD", "POSTGRES_USER", "REDIS_PASSWORD")
MANAGED_KEYS = (
    "MAIL_HOSTNAME",
    "MAIL_GATEWAY",
    "MAIL_API_ADDRESS",
    "MAIL_NETWORK_NAME",
    "ADMIN_ACCOUNT_EMAIL",
    "ADMIN_RECOVERY_EMAIL",
    "ADMIN_MFA_REQUIRED",
    "ADMIN_MFA_CHALLENGE_TTL_SECONDS",
    "ADMIN_MFA_ENROLLMENT_TTL_SECONDS",
    "ADMIN_STEP_UP_TTL_SECONDS",
    "ADMIN_STEP_UP_MAX_FAILED_ATTEMPTS",
    "ADMIN_STEP_UP_RATE_LIMIT_WINDOW_SECONDS",
    "ENCRYPTION_KEY",
    "SMTP_HOST",
    "SMTP_PORT",
    "SMTP_SECURE",
    "SMTP_USER",
    "SMTP_PASSWORD",
    "SMTP_FROM",
)
ALLOWED_STACK_KEYS = frozenset(BASE_KEYS + MANAGED_KEYS)
MAIL_CONFIG_KEYS = frozenset(
    {
        "MAIL_DOMAIN",
        "MAIL_HOSTNAME",
        "MAIL_PUBLIC_IPV4",
        "MAIL_PUBLIC_INTERFACE",
        "MAIL_NETWORK_NAME",
        "MAIL_BRIDGE_NAME",
        "MAIL_SUBNET",
        "MAIL_GATEWAY",
        "MAIL_API_ADDRESS",
        "MAIL_LISTEN_ADDRESS",
        "MAIL_API_CONTAINER",
        "MAIL_DKIM_SELECTOR",
        "MAIL_TLS_CERT_FILE",
        "MAIL_TLS_KEY_FILE",
        "MAIL_ACME_WEBROOT",
        "MAIL_ACME_EMAIL",
        "MAIL_SMTP_USER",
        "MAIL_SMTP_FROM",
        "MAIL_MESSAGE_SIZE_LIMIT",
        "MAIL_OPERATOR_APPROVAL",
        "MAIL_CERTIFICATE_ISSUANCE_BREAK_GLASS",
        "MAIL_SMTP_PASSWORD_FILE",
    }
)
SAFE_VALUE = re.compile(r"^[\x21-\x7e]+$")


class ProvisionError(Exception):
    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


def fail(code: str) -> None:
    raise ProvisionError(code)


def require_regular(path: Path, code: str, *, root_owned: bool = False, mode: int | None = None) -> os.stat_result:
    try:
        details = path.lstat()
    except FileNotFoundError:
        fail(f"{code}_UNAVAILABLE")
    if not stat.S_ISREG(details.st_mode) or path.is_symlink():
        fail(f"{code}_UNSAFE")
    if root_owned and details.st_uid != 0 and os.environ.get("ASODEF_PROVISION_TEST_MODE") != "1":
        fail(f"{code}_OWNER_INVALID")
    if mode is not None and stat.S_IMODE(details.st_mode) != mode:
        fail(f"{code}_MODE_INVALID")
    return details


def parse_dotenv(path: Path, *, allowed: frozenset[str] | None = None) -> dict[str, str]:
    values: dict[str, str] = {}
    try:
        text = path.read_text(encoding="utf-8")
    except (OSError, UnicodeError):
        fail("ENV_READ_FAILED")
    for raw in text.splitlines():
        if not raw or raw.startswith("#"):
            continue
        if "=" not in raw:
            fail("ENV_SYNTAX_INVALID")
        key, value = raw.split("=", 1)
        if not re.fullmatch(r"[A-Z][A-Z0-9_]*", key):
            fail("ENV_KEY_INVALID")
        if key in values:
            fail("ENV_DUPLICATE_KEY")
        if allowed is not None and key not in allowed:
            fail("ENV_UNKNOWN_KEY")
        if not value or not SAFE_VALUE.fullmatch(value) or any(character in value for character in "'\"\\"):
            fail("ENV_VALUE_INVALID")
        values[key] = value
    return values


def read_app_encryption_key(path: Path) -> str:
    found: str | None = None
    seen: set[str] = set()
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except (OSError, UnicodeError):
        fail("APP_ENV_READ_FAILED")
    for raw in lines:
        if not raw or raw.startswith("#"):
            continue
        if "=" not in raw:
            fail("APP_ENV_SYNTAX_INVALID")
        key, value = raw.split("=", 1)
        if not re.fullmatch(r"[A-Z][A-Z0-9_]*", key) or key in seen:
            fail("APP_ENV_SYNTAX_INVALID")
        seen.add(key)
        if key != "ENCRYPTION_KEY":
            continue
        if len(value) < 32 or not SAFE_VALUE.fullmatch(value) or any(character in value for character in "'\"\\"):
            fail("APP_ENV_REQUIRED_VALUE_MISSING")
        found = value
    if found is None:
        fail("APP_ENV_REQUIRED_VALUE_MISSING")
    return found


def read_password(path: Path) -> str:
    require_regular(path, "SMTP_PASSWORD", root_owned=True, mode=0o600)
    try:
        raw = path.read_bytes()
    except OSError:
        fail("SMTP_PASSWORD_READ_FAILED")
    password = raw.rstrip(b"\r\n")
    if len(password) < 32 or len(password) > 512 or b"\n" in password or b"\r" in password:
        fail("SMTP_PASSWORD_INVALID")
    try:
        value = password.decode("ascii")
    except UnicodeDecodeError:
        fail("SMTP_PASSWORD_INVALID")
    if not SAFE_VALUE.fullmatch(value) or any(character in value for character in "'\"\\"):
        fail("SMTP_PASSWORD_INVALID")
    return value


def fsync_directory(path: Path) -> None:
    descriptor = os.open(path, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def atomic_write(path: Path, content: bytes, uid: int, gid: int, mode: int) -> None:
    descriptor, temporary_name = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    temporary = Path(temporary_name)
    try:
        os.fchmod(descriptor, mode)
        if os.geteuid() == 0:
            os.fchown(descriptor, uid, gid)
        with os.fdopen(descriptor, "wb", closefd=True) as stream:
            stream.write(content)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
        fsync_directory(path.parent)
    finally:
        temporary.unlink(missing_ok=True)


def secure_directory(path: Path) -> None:
    if path.exists():
        details = path.lstat()
        if not stat.S_ISDIR(details.st_mode) or path.is_symlink():
            fail("BACKUP_DIRECTORY_UNSAFE")
        if os.environ.get("ASODEF_PROVISION_TEST_MODE") != "1" and details.st_uid != 0:
            fail("BACKUP_DIRECTORY_OWNER_INVALID")
        if stat.S_IMODE(details.st_mode) != 0o700:
            fail("BACKUP_DIRECTORY_MODE_INVALID")
        return
    path.mkdir(mode=0o700)
    if os.geteuid() == 0:
        os.chown(path, 0, 0)
    fsync_directory(path.parent)


def render(values: dict[str, str]) -> bytes:
    expected = set(BASE_KEYS + MANAGED_KEYS)
    if set(values) != expected:
        fail("OUTPUT_KEY_SET_INVALID")
    return ("".join(f"{key}={values[key]}\n" for key in BASE_KEYS + MANAGED_KEYS)).encode("utf-8")


def managed_values(encryption_key: str, mail: dict[str, str], password: str, mfa_required: str) -> dict[str, str]:
    for key in ("MAIL_DOMAIN", "MAIL_HOSTNAME", "MAIL_NETWORK_NAME", "MAIL_GATEWAY", "MAIL_API_ADDRESS", "MAIL_SMTP_USER", "MAIL_SMTP_FROM"):
        if key not in mail:
            fail("MAIL_CONFIG_REQUIRED_VALUE_MISSING")
    if mail["MAIL_DOMAIN"] != "asodef.com.co" or mail["MAIL_HOSTNAME"] != "smtp.asodef.com.co":
        fail("MAIL_IDENTITY_MISMATCH")
    if mail["MAIL_NETWORK_NAME"] != "asodef_mail_submission" or mail["MAIL_GATEWAY"] != "172.25.52.1" or mail["MAIL_API_ADDRESS"] != "172.25.52.2":
        fail("MAIL_NETWORK_MISMATCH")
    if mail["MAIL_SMTP_USER"] != "asodef-api" or mail["MAIL_SMTP_FROM"] != "no-reply@asodef.com.co":
        fail("SMTP_IDENTITY_MISMATCH")
    return {
        "MAIL_HOSTNAME": mail["MAIL_HOSTNAME"],
        "MAIL_GATEWAY": mail["MAIL_GATEWAY"],
        "MAIL_API_ADDRESS": mail["MAIL_API_ADDRESS"],
        "MAIL_NETWORK_NAME": mail["MAIL_NETWORK_NAME"],
        "ADMIN_ACCOUNT_EMAIL": "admin@asodef.com.co",
        "ADMIN_RECOVERY_EMAIL": "asodefsas@gmail.com",
        "ADMIN_MFA_REQUIRED": mfa_required,
        "ADMIN_MFA_CHALLENGE_TTL_SECONDS": "300",
        "ADMIN_MFA_ENROLLMENT_TTL_SECONDS": "900",
        "ADMIN_STEP_UP_TTL_SECONDS": "300",
        "ADMIN_STEP_UP_MAX_FAILED_ATTEMPTS": "5",
        "ADMIN_STEP_UP_RATE_LIMIT_WINDOW_SECONDS": "300",
        "ENCRYPTION_KEY": encryption_key,
        "SMTP_HOST": mail["MAIL_HOSTNAME"],
        "SMTP_PORT": "587",
        "SMTP_SECURE": "false",
        "SMTP_USER": f'{mail["MAIL_SMTP_USER"]}@{mail["MAIL_DOMAIN"]}',
        "SMTP_PASSWORD": password,
        "SMTP_FROM": mail["MAIL_SMTP_FROM"],
    }


def provision(args: argparse.Namespace) -> None:
    stack_env = Path(args.stack_env)
    details = require_regular(stack_env, "STACK_ENV")
    if stat.S_IMODE(details.st_mode) & 0o022:
        fail("STACK_ENV_PERMISSIONS_UNSAFE")
    app_details = require_regular(Path(args.app_env), "APP_ENV")
    if stat.S_IMODE(app_details.st_mode) & 0o022:
        fail("APP_ENV_PERMISSIONS_UNSAFE")
    require_regular(Path(args.mail_config), "MAIL_CONFIG", root_owned=True, mode=0o600)
    current = parse_dotenv(stack_env, allowed=ALLOWED_STACK_KEYS)
    if any(key not in current for key in BASE_KEYS):
        fail("STACK_ENV_BASE_KEY_MISSING")
    encryption_key = read_app_encryption_key(Path(args.app_env))
    mail = parse_dotenv(Path(args.mail_config), allowed=MAIL_CONFIG_KEYS)
    password_file = mail.get("MAIL_SMTP_PASSWORD_FILE")
    if not password_file or not Path(password_file).is_absolute():
        fail("SMTP_PASSWORD_PATH_INVALID")
    desired = {key: current[key] for key in BASE_KEYS}
    desired.update(managed_values(encryption_key, mail, read_password(Path(password_file)), args.expected_mfa))
    rendered = render(desired)
    expected_uid = 0 if os.geteuid() == 0 else os.geteuid()
    expected_gid = 0 if os.geteuid() == 0 else os.getegid()
    if stack_env.read_bytes() == rendered and details.st_uid == expected_uid and details.st_gid == expected_gid and stat.S_IMODE(details.st_mode) == 0o600:
        print(f"status=ok action=provision changed=NO keys={len(desired)} secrets=REDACTED")
        return

    state_dir = Path(args.state_dir)
    secure_directory(state_dir)
    backup_root = state_dir / "stack-env-backups"
    secure_directory(backup_root)
    backup = backup_root / f"{time.strftime('%Y%m%dT%H%M%SZ', time.gmtime())}-{os.getpid()}"
    backup.mkdir(mode=0o700)
    if os.geteuid() == 0:
        os.chown(backup, 0, 0)
    original = backup / "stack.env"
    shutil.copyfile(stack_env, original, follow_symlinks=False)
    os.chmod(original, 0o600)
    metadata = {"uid": details.st_uid, "gid": details.st_gid, "mode": stat.S_IMODE(details.st_mode)}
    atomic_write(backup / "metadata.json", (json.dumps(metadata, sort_keys=True) + "\n").encode(), 0, 0, 0o600)
    fsync_directory(backup)
    if os.environ.get("ASODEF_PROVISION_TEST_FAIL_AFTER_BACKUP") == "1":
        fail("INJECTED_FAILURE_AFTER_BACKUP")

    atomic_write(stack_env, rendered, 0, 0, 0o600)
    pointer = state_dir / "stack-env-last-backup"
    atomic_write(pointer, (str(backup) + "\n").encode(), 0, 0, 0o600)
    print(f"status=ok action=provision changed=YES keys={len(desired)} secrets=REDACTED backup=RECORDED")


def rollback(args: argparse.Namespace) -> None:
    stack_env = Path(args.stack_env)
    require_regular(stack_env, "STACK_ENV")
    state_dir = Path(args.state_dir)
    secure_directory(state_dir)
    pointer = state_dir / "stack-env-last-backup"
    require_regular(pointer, "BACKUP_POINTER", root_owned=True, mode=0o600)
    backup = Path(pointer.read_text(encoding="utf-8").strip())
    backup_root = state_dir / "stack-env-backups"
    try:
        backup.relative_to(backup_root)
    except ValueError:
        fail("BACKUP_POINTER_INVALID")
    if backup.parent != backup_root or backup.is_symlink() or not backup.is_dir():
        fail("BACKUP_POINTER_INVALID")
    original = backup / "stack.env"
    metadata_path = backup / "metadata.json"
    require_regular(original, "BACKUP_FILE", root_owned=True, mode=0o600)
    require_regular(metadata_path, "BACKUP_METADATA", root_owned=True, mode=0o600)
    try:
        metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        fail("BACKUP_METADATA_INVALID")
    if set(metadata) != {"uid", "gid", "mode"} or not all(isinstance(metadata[key], int) for key in metadata):
        fail("BACKUP_METADATA_INVALID")
    if metadata["mode"] & 0o022:
        fail("BACKUP_METADATA_UNSAFE")
    atomic_write(stack_env, original.read_bytes(), metadata["uid"], metadata["gid"], metadata["mode"])
    used = pointer.with_name(f"{pointer.name}.used.{time.strftime('%Y%m%dT%H%M%SZ', time.gmtime())}")
    os.replace(pointer, used)
    fsync_directory(pointer.parent)
    print("status=ok action=rollback restored=YES secrets=REDACTED")


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser()
    subparsers = result.add_subparsers(dest="action", required=True)
    provision_parser = subparsers.add_parser("provision")
    provision_parser.add_argument("--stack-env", required=True)
    provision_parser.add_argument("--app-env", required=True)
    provision_parser.add_argument("--mail-config", required=True)
    provision_parser.add_argument("--expected-mfa", choices=("true", "false"), required=True)
    rollback_parser = subparsers.add_parser("rollback")
    rollback_parser.add_argument("--stack-env", required=True)
    for subparser in (provision_parser, rollback_parser):
        subparser.add_argument("--lock-file", default="/run/lock/asodef-stack-env.lock")
        subparser.add_argument("--state-dir", default="/var/lib/asodef-production")
    return result


def main() -> None:
    args = parser().parse_args()
    if os.geteuid() != 0 and os.environ.get("ASODEF_PROVISION_TEST_MODE") != "1":
        fail("ROOT_REQUIRED")
    lock_path = Path(args.lock_file)
    lock_path.parent.mkdir(parents=True, exist_ok=True)
    descriptor = os.open(lock_path, os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    try:
        fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        os.close(descriptor)
        fail("LOCK_UNAVAILABLE")
    try:
        if args.action == "provision":
            provision(args)
        else:
            rollback(args)
    finally:
        os.close(descriptor)


if __name__ == "__main__":
    try:
        main()
    except ProvisionError as error:
        print(f"status=error code={error.code}", file=sys.stderr)
        raise SystemExit(1)
