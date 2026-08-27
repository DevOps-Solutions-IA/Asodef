#!/usr/bin/python3
"""Provision, verify, rotate, or roll back the production AI runtime secret."""

from __future__ import annotations

import fcntl
import getpass
import json
import os
from pathlib import Path
import pwd
import re
import stat
import sys
import tempfile
import time
import warnings


CANONICAL_ENV = Path("/opt/asodef/public-platform/shared/.env.production")
CANONICAL_STATE = Path("/opt/asodef/public-platform/shared/.ai-runtime-state")
AI_KEYS = ("AI_RUNTIME_ENABLED", "OPENROUTER_API_KEY", "OPENROUTER_BASE_URL")
PINNED_BASE_URL = "https://openrouter.ai/api/v1"
MINIMUM_SECRET_LENGTH = 20
MAXIMUM_SECRET_LENGTH = 512
KEY_LINE = re.compile(r"^([A-Z][A-Z0-9_]*)=(.*)$")
_TEST_FAIL_BACKUP = False
_TEST_FAIL_BEFORE_RENAME = False
_TEST_FAIL_AFTER_RENAME = False


class ProvisionError(Exception):
    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


def fail(code: str) -> None:
    raise ProvisionError(code)


def fsync_directory(path: Path) -> None:
    descriptor = os.open(path, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def expected_operator() -> tuple[int, int]:
    try:
        account = pwd.getpwnam("asodefadmin")
    except KeyError:
        fail("OPERATOR_OWNER_UNAVAILABLE")
    return account.pw_uid, account.pw_gid


def require_mutating_operator(uid: int) -> None:
    if os.geteuid() != uid:
        fail("OPERATOR_IDENTITY_REQUIRED")


def require_trusted_entrypoint() -> None:
    path = Path(__file__)
    details = path.lstat()
    if path.is_symlink() or not stat.S_ISREG(details.st_mode):
        fail("ENTRYPOINT_UNSAFE")
    if details.st_uid != 0 or stat.S_IMODE(details.st_mode) != 0o555:
        fail("ENTRYPOINT_NOT_IMMUTABLE")


def require_safe_parent(path: Path, uid: int, gid: int) -> None:
    parent = path.parent
    details = parent.lstat()
    if parent.is_symlink() or not stat.S_ISDIR(details.st_mode):
        fail("ENV_PARENT_UNSAFE")
    if details.st_uid != uid or details.st_gid != gid or stat.S_IMODE(details.st_mode) & 0o022:
        fail("ENV_PARENT_PERMISSIONS_UNSAFE")


def require_env(path: Path, uid: int, gid: int) -> os.stat_result:
    require_safe_parent(path, uid, gid)
    try:
        details = path.lstat()
    except FileNotFoundError:
        fail("AI_ENV_UNAVAILABLE")
    if path.is_symlink() or not stat.S_ISREG(details.st_mode):
        fail("AI_ENV_UNSAFE")
    if details.st_uid != uid or details.st_gid != gid:
        fail("AI_ENV_OWNER_INVALID")
    if stat.S_IMODE(details.st_mode) != 0o600:
        fail("AI_ENV_MODE_INVALID")
    return details


def secure_state_directory(path: Path, uid: int, gid: int) -> None:
    if path.exists():
        details = path.lstat()
        if path.is_symlink() or not stat.S_ISDIR(details.st_mode):
            fail("AI_STATE_DIRECTORY_UNSAFE")
        if details.st_uid != uid or details.st_gid != gid or stat.S_IMODE(details.st_mode) != 0o700:
            fail("AI_STATE_DIRECTORY_PERMISSIONS_INVALID")
        return
    path.mkdir(mode=0o700)
    os.chown(path, uid, gid)
    fsync_directory(path.parent)


def require_state_directory(path: Path, uid: int, gid: int) -> None:
    try:
        details = path.lstat()
    except FileNotFoundError:
        fail("AI_STATE_DIRECTORY_UNAVAILABLE")
    if path.is_symlink() or not stat.S_ISDIR(details.st_mode):
        fail("AI_STATE_DIRECTORY_UNSAFE")
    if details.st_uid != uid or details.st_gid != gid or stat.S_IMODE(details.st_mode) != 0o700:
        fail("AI_STATE_DIRECTORY_PERMISSIONS_INVALID")


def parse_env(content: bytes) -> tuple[list[bytes], dict[str, str]]:
    try:
        text = content.decode("utf-8")
    except UnicodeDecodeError:
        fail("AI_ENV_ENCODING_INVALID")
    values: dict[str, str] = {}
    lines = content.splitlines(keepends=True)
    for raw in text.splitlines():
        candidate = raw.lstrip()
        if not candidate or candidate.startswith("#"):
            continue
        match = KEY_LINE.fullmatch(candidate)
        if match is None:
            continue
        key, value = match.groups()
        if key in AI_KEYS:
            if key in values:
                fail(f"DUPLICATE_{key}")
            values[key] = value.removesuffix("\r")
    return lines, values


def valid_secret(value: str) -> bool:
    return (
        MINIMUM_SECRET_LENGTH <= len(value) <= MAXIMUM_SECRET_LENGTH
        and "\x00" not in value
        and "\r" not in value
        and "\n" not in value
        and all(0x21 <= ord(character) <= 0x7E for character in value)
        and not any(character in value for character in "'\"\\$")
    )


def read_secret() -> str:
    if not sys.stdin.isatty():
        fail("INTERACTIVE_TTY_REQUIRED")
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", getpass.GetPassWarning)
            return getpass.getpass("OpenRouter API key: ")
    except (EOFError, OSError, getpass.GetPassWarning):
        fail("INTERACTIVE_SECRET_INPUT_REQUIRED")


def configuration_valid(values: dict[str, str]) -> bool:
    return (
        values.get("AI_RUNTIME_ENABLED") == "true"
        and valid_secret(values.get("OPENROUTER_API_KEY", ""))
        and values.get("OPENROUTER_BASE_URL") == PINNED_BASE_URL
    )


def render(lines: list[bytes], secret: str) -> bytes:
    retained: list[bytes] = []
    for line in lines:
        try:
            candidate = line.decode("utf-8").rstrip("\r\n").lstrip()
        except UnicodeDecodeError:
            fail("AI_ENV_ENCODING_INVALID")
        match = KEY_LINE.fullmatch(candidate)
        if match is not None and match.group(1) in AI_KEYS:
            continue
        retained.append(line)
    if retained and not retained[-1].endswith((b"\n", b"\r")):
        retained[-1] += b"\n"
    retained.extend(
        (
            b"AI_RUNTIME_ENABLED=true\n",
            f"OPENROUTER_API_KEY={secret}\n".encode("ascii"),
            f"OPENROUTER_BASE_URL={PINNED_BASE_URL}\n".encode("ascii"),
        )
    )
    return b"".join(retained)


def atomic_write(path: Path, content: bytes, uid: int, gid: int, mode: int) -> None:
    descriptor, temporary_name = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    temporary = Path(temporary_name)
    try:
        os.fchmod(descriptor, mode)
        os.fchown(descriptor, uid, gid)
        with os.fdopen(descriptor, "wb", closefd=True) as stream:
            stream.write(content)
            stream.flush()
            os.fsync(stream.fileno())
        if _TEST_FAIL_BEFORE_RENAME:
            fail("INJECTED_ATOMIC_FAILURE")
        os.replace(temporary, path)
        fsync_directory(path.parent)
    finally:
        temporary.unlink(missing_ok=True)


def create_backup(env_file: Path, state_dir: Path, details: os.stat_result) -> Path:
    backup_root = state_dir / "backups"
    secure_state_directory(backup_root, details.st_uid, details.st_gid)
    if _TEST_FAIL_BACKUP:
        fail("INJECTED_BACKUP_FAILURE")
    backup = Path(tempfile.mkdtemp(prefix=f"{time.strftime('%Y%m%dT%H%M%SZ', time.gmtime())}-{os.getpid()}.", dir=backup_root))
    backup.chmod(0o700)
    os.chown(backup, details.st_uid, details.st_gid)
    atomic_write(backup / "env", env_file.read_bytes(), details.st_uid, details.st_gid, 0o600)
    metadata = {"uid": details.st_uid, "gid": details.st_gid, "mode": stat.S_IMODE(details.st_mode)}
    atomic_write(
        backup / "metadata.json",
        (json.dumps(metadata, sort_keys=True) + "\n").encode("ascii"),
        details.st_uid,
        details.st_gid,
        0o600,
    )
    fsync_directory(backup)
    return backup


def validate_backup(backup: Path, state_dir: Path, uid: int, gid: int) -> tuple[bytes, int, int, int]:
    backup_root = state_dir / "backups"
    for path, code in ((backup_root, "AI_BACKUP_ROOT_UNSAFE"), (backup, "AI_BACKUP_DIRECTORY_UNSAFE")):
        details = path.lstat()
        if path.is_symlink() or not stat.S_ISDIR(details.st_mode) or details.st_uid != uid or details.st_gid != gid or stat.S_IMODE(details.st_mode) != 0o700:
            fail(code)
    try:
        backup.resolve().relative_to(backup_root.resolve())
    except (OSError, ValueError):
        fail("AI_BACKUP_POINTER_INVALID")
    if backup.is_symlink() or not backup.is_dir() or backup.parent != backup_root:
        fail("AI_BACKUP_POINTER_INVALID")
    env_backup = backup / "env"
    metadata_file = backup / "metadata.json"
    protected: dict[Path, bytes] = {}
    for path in (env_backup, metadata_file):
        try:
            descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC)
        except OSError:
            fail("AI_BACKUP_UNSAFE")
        try:
            details = os.fstat(descriptor)
            if not stat.S_ISREG(details.st_mode) or details.st_uid != uid or details.st_gid != gid or stat.S_IMODE(details.st_mode) != 0o600:
                fail("AI_BACKUP_UNSAFE")
            chunks = []
            while chunk := os.read(descriptor, 64 * 1024):
                chunks.append(chunk)
            protected[path] = b"".join(chunks)
        finally:
            os.close(descriptor)
    try:
        metadata = json.loads(protected[metadata_file].decode("ascii"))
    except (OSError, UnicodeError, json.JSONDecodeError):
        fail("AI_BACKUP_METADATA_INVALID")
    if set(metadata) != {"uid", "gid", "mode"} or metadata != {"uid": uid, "gid": gid, "mode": 0o600}:
        fail("AI_BACKUP_METADATA_INVALID")
    return protected[env_backup], uid, gid, 0o600


def read_pointer(pointer: Path, state_dir: Path, uid: int, gid: int) -> Path:
    try:
        descriptor = os.open(pointer, os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC)
    except (FileNotFoundError, OSError):
        fail("AI_BACKUP_POINTER_UNAVAILABLE")
    try:
        details = os.fstat(descriptor)
        if not stat.S_ISREG(details.st_mode) or details.st_uid != uid or details.st_gid != gid or stat.S_IMODE(details.st_mode) != 0o600:
            fail("AI_BACKUP_POINTER_UNSAFE")
        raw = os.read(descriptor, 4096)
        if os.read(descriptor, 1):
            fail("AI_BACKUP_POINTER_INVALID")
    finally:
        os.close(descriptor)
    try:
        return Path(raw.decode("utf-8").strip())
    except UnicodeError:
        fail("AI_BACKUP_POINTER_INVALID")


def recover_pending(env_file: Path, state_dir: Path, uid: int, gid: int) -> bool:
    pending = state_dir / "pending"
    try:
        pending.lstat()
    except FileNotFoundError:
        return False
    backup = read_pointer(pending, state_dir, uid, gid)
    content, backup_uid, backup_gid, backup_mode = validate_backup(backup, state_dir, uid, gid)
    atomic_write(env_file, content, backup_uid, backup_gid, backup_mode)
    recovered = pending.with_name(f"pending.recovered.{time.strftime('%Y%m%dT%H%M%SZ', time.gmtime())}")
    os.replace(pending, recovered)
    fsync_directory(state_dir)
    return True


def acquire_lock(state_dir: Path, uid: int, gid: int) -> int:
    secure_state_directory(state_dir, uid, gid)
    lock = state_dir / "lock"
    descriptor = os.open(lock, os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    details = os.fstat(descriptor)
    if details.st_uid != uid or details.st_gid != gid or stat.S_IMODE(details.st_mode) != 0o600:
        os.close(descriptor)
        fail("AI_LOCK_PERMISSIONS_INVALID")
    try:
        fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        os.close(descriptor)
        fail("AI_LOCK_UNAVAILABLE")
    return descriptor


def acquire_read_lock_if_managed(state_dir: Path, uid: int, gid: int) -> int | None:
    try:
        state_dir.lstat()
    except FileNotFoundError:
        return None
    require_state_directory(state_dir, uid, gid)
    pending = state_dir / "pending"
    try:
        pending.lstat()
    except FileNotFoundError:
        pass
    else:
        fail("AI_TRANSACTION_RECOVERY_REQUIRED")
    lock = state_dir / "lock"
    try:
        descriptor = os.open(lock, os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC)
    except OSError:
        fail("AI_LOCK_UNAVAILABLE")
    details = os.fstat(descriptor)
    if not stat.S_ISREG(details.st_mode) or details.st_uid != uid or details.st_gid != gid or stat.S_IMODE(details.st_mode) != 0o600:
        os.close(descriptor)
        fail("AI_LOCK_PERMISSIONS_INVALID")
    try:
        fcntl.flock(descriptor, fcntl.LOCK_SH | fcntl.LOCK_NB)
    except BlockingIOError:
        os.close(descriptor)
        fail("AI_LOCK_UNAVAILABLE")
    return descriptor


def provision(env_file: Path, state_dir: Path, *, rotate: bool) -> str:
    uid, gid = expected_operator()
    require_mutating_operator(uid)
    require_safe_parent(env_file, uid, gid)
    lock = acquire_lock(state_dir, uid, gid)
    try:
        recover_pending(env_file, state_dir, uid, gid)
        details = require_env(env_file, uid, gid)
        original = env_file.read_bytes()
        lines, values = parse_env(original)
        configured = configuration_valid(values)
        if configured and not rotate:
            return "ALREADY_CONFIGURED"
        if rotate and not configured:
            fail("AI_RUNTIME_NOT_CONFIGURED")
        secret = read_secret()
        if not valid_secret(secret):
            fail("OPENROUTER_CREDENTIAL_INVALID")
        rendered = render(lines, secret)
        backup = create_backup(env_file, state_dir, details)
        pending = state_dir / "pending"
        atomic_write(pending, (str(backup) + "\n").encode("utf-8"), uid, gid, 0o600)
        try:
            require_env(env_file, uid, gid)
            atomic_write(env_file, rendered, details.st_uid, details.st_gid, stat.S_IMODE(details.st_mode))
            if _TEST_FAIL_AFTER_RENAME:
                fail("INJECTED_POST_RENAME_FAILURE")
            _, written = parse_env(env_file.read_bytes())
            if not configuration_valid(written):
                fail("AI_ENV_POST_WRITE_INVALID")
            os.replace(pending, state_dir / "last-backup")
            fsync_directory(state_dir)
        except Exception:
            atomic_write(env_file, original, details.st_uid, details.st_gid, stat.S_IMODE(details.st_mode))
            if pending.exists():
                aborted = pending.with_name(f"pending.aborted.{time.strftime('%Y%m%dT%H%M%SZ', time.gmtime())}")
                os.replace(pending, aborted)
                fsync_directory(state_dir)
            raise
        finally:
            secret = ""
        return "ROTATED" if rotate else "CONFIGURED"
    finally:
        os.close(lock)


def verify(env_file: Path, state_dir: Path) -> None:
    uid, gid = expected_operator()
    require_safe_parent(env_file, uid, gid)
    lock = acquire_read_lock_if_managed(state_dir, uid, gid)
    try:
        require_env(env_file, uid, gid)
        _, values = parse_env(env_file.read_bytes())
        if values.get("AI_RUNTIME_ENABLED") != "true":
            fail("AI_RUNTIME_NOT_ENABLED")
        if not valid_secret(values.get("OPENROUTER_API_KEY", "")):
            fail("OPENROUTER_CREDENTIAL_INVALID")
        if values.get("OPENROUTER_BASE_URL") != PINNED_BASE_URL:
            fail("OPENROUTER_BASE_URL_INVALID")
    finally:
        if lock is not None:
            os.close(lock)


def rollback(env_file: Path, state_dir: Path) -> None:
    uid, gid = expected_operator()
    require_mutating_operator(uid)
    require_safe_parent(env_file, uid, gid)
    lock = acquire_lock(state_dir, uid, gid)
    try:
        if recover_pending(env_file, state_dir, uid, gid):
            return
        require_env(env_file, uid, gid)
        pointer = state_dir / "last-backup"
        backup = read_pointer(pointer, state_dir, uid, gid)
        content, backup_uid, backup_gid, backup_mode = validate_backup(backup, state_dir, uid, gid)
        atomic_write(env_file, content, backup_uid, backup_gid, backup_mode)
        used = pointer.with_name(f"last-backup.used.{time.strftime('%Y%m%dT%H%M%SZ', time.gmtime())}")
        os.replace(pointer, used)
        fsync_directory(state_dir)
    finally:
        os.close(lock)


def main() -> None:
    if len(sys.argv) != 2 or sys.argv[1] not in {"provision", "rotate", "verify", "rollback"}:
        raise SystemExit("Usage: provision-ai-runtime.py provision|rotate|verify|rollback")
    require_trusted_entrypoint()
    env_file = CANONICAL_ENV
    state_dir = CANONICAL_STATE
    action = sys.argv[1]
    if action in {"provision", "rotate"}:
        state = provision(env_file, state_dir, rotate=action == "rotate")
        print(f"status=ok action={action} state={state} aiRuntime=ENABLED openRouterCredential=PRESENT openRouterBaseUrl=VALID backup={'UNCHANGED' if state == 'ALREADY_CONFIGURED' else 'RECORDED'} secrets=REDACTED")
    elif action == "verify":
        verify(env_file, state_dir)
        print("status=ok action=verify aiRuntime=ENABLED openRouterCredential=PRESENT openRouterBaseUrl=VALID secrets=REDACTED")
    else:
        rollback(env_file, state_dir)
        print("status=ok action=rollback restored=YES secrets=REDACTED")


if __name__ == "__main__":
    try:
        main()
    except ProvisionError as error:
        print(f"status=error code={error.code}", file=sys.stderr)
        raise SystemExit(1)
