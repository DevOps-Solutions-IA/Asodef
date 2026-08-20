#!/usr/bin/env python3
"""Exercise TLS transaction success, failures and crash recovery in temp dirs."""

import hashlib
import os
import shutil
import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent
HOSTNAME = "smtp.asodef.com.co"


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def generate_pair(directory: Path) -> None:
    subprocess.run(
        ["openssl", "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "30",
         "-subj", f"/CN={HOSTNAME}", "-addext", f"subjectAltName=DNS:{HOSTNAME}",
         "-keyout", str(directory / "privkey.pem"), "-out", str(directory / "fullchain.pem")],
        check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )


def run_hook(target: Path, lineage: Path, failure: str) -> subprocess.CompletedProcess[bytes]:
    return subprocess.run(
        [str(ROOT / "cert-renew-hook.sh")],
        env={**os.environ, "ASODEF_MAIL_TLS_TEST_MODE": "YES",
             "ASODEF_MAIL_TLS_TEST_TARGET_DIR": str(target),
             "ASODEF_MAIL_TLS_TEST_LINEAGE": str(lineage),
             "ASODEF_MAIL_TLS_TEST_RECOVERY_SCRIPT": str(ROOT / "recover-tls-transaction.sh"),
             "ASODEF_MAIL_TLS_TEST_FAILURE": failure},
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False,
    )


with tempfile.TemporaryDirectory(prefix="asodef-tls-transaction-test.") as raw:
    base = Path(raw)
    original = base / "original"
    renewed = base / "renewed"
    original.mkdir()
    renewed.mkdir()
    generate_pair(original)
    generate_pair(renewed)

    for scenario in ("check", "reload", "live"):
        target = base / f"target-{scenario}"
        shutil.copytree(original, target)
        before = (digest(target / "fullchain.pem"), digest(target / "privkey.pem"))
        result = run_hook(target, renewed, scenario)
        if result.returncode == 0:
            raise SystemExit(f"tls_{scenario}_failure_not_propagated")
        after = (digest(target / "fullchain.pem"), digest(target / "privkey.pem"))
        if after != before or (target / ".renewal-transaction").exists():
            raise SystemExit(f"tls_{scenario}_rollback_failed")

    target = base / "target-success"
    shutil.copytree(original, target)
    result = run_hook(target, renewed, "success")
    if result.returncode != 0:
        raise SystemExit("tls_success_failed")
    if (digest(target / "fullchain.pem"), digest(target / "privkey.pem")) != (
        digest(renewed / "fullchain.pem"), digest(renewed / "privkey.pem")
    ) or (target / ".renewal-transaction").exists():
        raise SystemExit("tls_success_not_committed")

    target = base / "target-crash"
    shutil.copytree(renewed, target)
    transaction = target / ".renewal-transaction"
    transaction.mkdir(mode=0o700)
    shutil.copy2(original / "fullchain.pem", transaction / "previous-fullchain.pem")
    shutil.copy2(original / "privkey.pem", transaction / "previous-privkey.pem")
    recovery = subprocess.run(
        [str(ROOT / "recover-tls-transaction.sh")],
        env={**os.environ, "ASODEF_MAIL_TLS_TEST_MODE": "YES",
             "ASODEF_MAIL_TLS_TEST_TARGET_DIR": str(target)},
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False,
    )
    if recovery.returncode != 0 or transaction.exists():
        raise SystemExit("tls_crash_recovery_failed")
    if (digest(target / "fullchain.pem"), digest(target / "privkey.pem")) != (
        digest(original / "fullchain.pem"), digest(original / "privkey.pem")
    ):
        raise SystemExit("tls_crash_recovery_pair_mismatch")

print("status=ok tls_success=pass check_failure=rollback reload_failure=rollback live_failure=rollback crash_recovery=pass")
