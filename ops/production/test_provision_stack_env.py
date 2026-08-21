#!/usr/bin/env python3

from __future__ import annotations

import os
import fcntl
from pathlib import Path
import stat
import subprocess
import tempfile
import unittest


SCRIPT = Path(__file__).with_name("provision-stack-env.py")
SECRET = "synthetic-test-only-smtp-password-0123456789"


class ProvisionStackEnvTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.shared = self.root / "shared"
        self.shared.mkdir()
        self.stack = self.shared / ".stack.env"
        self.app = self.shared / ".env.production"
        self.mail = self.root / "mail-platform.env"
        self.password = self.root / "smtp-password"
        self.lock = self.root / "stack.lock"
        self.state = self.root / "state"
        self.stack.write_text(
            "POSTGRES_DB=asodef\n"
            "POSTGRES_PASSWORD=synthetic-db-only\n"
            "POSTGRES_USER=asodef\n"
            "REDIS_PASSWORD=synthetic-redis-only\n",
            encoding="utf-8",
        )
        self.app.write_text("ENCRYPTION_KEY=" + "0" * 64 + "\nIGNORED_APPLICATION_KEY=value\n", encoding="utf-8")
        self.password.write_text(SECRET + "\n", encoding="ascii")
        os.chmod(self.stack, 0o600)
        os.chmod(self.app, 0o600)
        os.chmod(self.password, 0o600)
        self.write_mail()

    def tearDown(self) -> None:
        self.temporary.cleanup()

    def write_mail(self, *, extra: str = "") -> None:
        self.mail.write_text(
            "MAIL_DOMAIN=asodef.com.co\n"
            "MAIL_HOSTNAME=smtp.asodef.com.co\n"
            "MAIL_NETWORK_NAME=asodef_mail_submission\n"
            "MAIL_GATEWAY=172.25.52.1\n"
            "MAIL_API_ADDRESS=172.25.52.2\n"
            "MAIL_SMTP_USER=asodef-api\n"
            "MAIL_SMTP_FROM=no-reply@asodef.com.co\n"
            f"MAIL_SMTP_PASSWORD_FILE={self.password}\n"
            + extra,
            encoding="utf-8",
        )
        os.chmod(self.mail, 0o600)

    def command(self, action: str = "provision") -> list[str]:
        base = [str(SCRIPT), action, "--stack-env", str(self.stack)]
        if action == "provision":
            base += ["--app-env", str(self.app), "--mail-config", str(self.mail), "--expected-mfa", "false"]
        return base + ["--lock-file", str(self.lock), "--state-dir", str(self.state)]

    def execute(self, action: str = "provision", *, extra_env: dict[str, str] | None = None) -> subprocess.CompletedProcess[str]:
        environment = os.environ.copy()
        environment["ASODEF_PROVISION_TEST_MODE"] = "1"
        environment.update(extra_env or {})
        return subprocess.run(self.command(action), text=True, capture_output=True, env=environment, check=False)

    def test_first_provision_is_atomic_restricted_and_redacted(self) -> None:
        result = self.execute()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertNotIn(SECRET, result.stdout + result.stderr)
        self.assertEqual(stat.S_IMODE(self.stack.stat().st_mode), 0o600)
        values = dict(line.split("=", 1) for line in self.stack.read_text(encoding="utf-8").splitlines())
        self.assertEqual(len(values), 23)
        self.assertEqual(values["SMTP_PASSWORD"], SECRET)
        self.assertEqual(values["ADMIN_ACCOUNT_EMAIL"], "admin@asodef.com.co")
        self.assertEqual(values["ADMIN_RECOVERY_EMAIL"], "asodefsas@gmail.com")
        self.assertEqual(values["MAIL_API_ADDRESS"], "172.25.52.2")
        self.assertTrue((self.state / "stack-env-last-backup").is_file())
        self.assertFalse(any(path.name.startswith("..stack.env.") for path in self.shared.iterdir()))

    def test_reprovision_is_idempotent(self) -> None:
        self.assertEqual(self.execute().returncode, 0)
        first = self.stack.read_bytes()
        backups = list((self.state / "stack-env-backups").iterdir())
        second = self.execute()
        self.assertEqual(second.returncode, 0, second.stderr)
        self.assertIn("changed=NO", second.stdout)
        self.assertEqual(self.stack.read_bytes(), first)
        self.assertEqual(list((self.state / "stack-env-backups").iterdir()), backups)

    def test_rollback_restores_original_content_and_mode(self) -> None:
        original = self.stack.read_bytes()
        self.assertEqual(self.execute().returncode, 0)
        rollback = self.execute("rollback")
        self.assertEqual(rollback.returncode, 0, rollback.stderr)
        self.assertEqual(self.stack.read_bytes(), original)
        self.assertEqual(stat.S_IMODE(self.stack.stat().st_mode), 0o600)
        self.assertFalse((self.state / "stack-env-last-backup").exists())

    def test_failure_after_backup_never_replaces_target_or_leaks_secret(self) -> None:
        original = self.stack.read_bytes()
        result = self.execute(extra_env={"ASODEF_PROVISION_TEST_FAIL_AFTER_BACKUP": "1"})
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.stack.read_bytes(), original)
        self.assertNotIn(SECRET, result.stdout + result.stderr)
        self.assertFalse((self.state / "stack-env-last-backup").exists())
        self.assertFalse(any(path.name.startswith("..stack.env.") for path in self.shared.iterdir()))

    def test_missing_secret_and_malformed_sources_fail_closed(self) -> None:
        self.password.unlink()
        missing = self.execute()
        self.assertNotEqual(missing.returncode, 0)
        self.password.write_text(SECRET + "\n", encoding="ascii")
        os.chmod(self.password, 0o600)
        self.write_mail(extra="UNKNOWN_MAIL_KEY=value\n")
        unknown_mail = self.execute()
        self.assertNotEqual(unknown_mail.returncode, 0)
        self.write_mail()
        self.stack.write_text(self.stack.read_text(encoding="utf-8") + "UNKNOWN_STACK_KEY=value\n", encoding="utf-8")
        unknown_stack = self.execute()
        self.assertNotEqual(unknown_stack.returncode, 0)
        self.stack.write_text(
            "POSTGRES_DB=asodef\nPOSTGRES_PASSWORD=synthetic-db-only\nPOSTGRES_USER=asodef\nREDIS_PASSWORD=synthetic-redis-only\n",
            encoding="utf-8",
        )
        self.app.write_text("ENCRYPTION_KEY=" + "0" * 64 + "\nmalformed-line\n", encoding="utf-8")
        malformed_app = self.execute()
        self.assertNotEqual(malformed_app.returncode, 0)

    def test_partial_or_duplicate_input_is_rejected(self) -> None:
        self.stack.write_text("POSTGRES_DB=asodef\nPOSTGRES_DB=duplicate\n", encoding="utf-8")
        result = self.execute()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("ENV_DUPLICATE_KEY", result.stderr)

    def test_concurrent_provision_fails_closed_on_lock(self) -> None:
        descriptor = os.open(self.lock, os.O_CREAT | os.O_RDWR, 0o600)
        try:
            fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
            result = self.execute()
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("LOCK_UNAVAILABLE", result.stderr)
        finally:
            os.close(descriptor)


if __name__ == "__main__":
    unittest.main()
