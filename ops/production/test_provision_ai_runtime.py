#!/usr/bin/env python3

from __future__ import annotations

import contextlib
import fcntl
import importlib.util
import io
import os
from pathlib import Path
import pwd
import stat
import sys
import tempfile
import unittest
from unittest import mock


HERE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("provision_ai_runtime", HERE / "provision-ai-runtime.py")
assert SPEC is not None and SPEC.loader is not None
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)

SYNTHETIC_SECRET = "synthetic-openrouter-credential-for-tests"


class ProvisionAiRuntimeTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.env_file = self.root / ".env.production"
        self.original = b"NODE_ENV=production\nDATABASE_URL=synthetic\nCUSTOM_VALUE=preserve-exactly\n"
        self.env_file.write_bytes(self.original)
        self.env_file.chmod(0o600)
        self.state = self.root / ".ai-runtime-state"
        self.owner = pwd.getpwuid(os.getuid()).pw_name
        self.operator = mock.patch.object(MODULE, "expected_operator", return_value=(os.getuid(), os.getgid()))
        self.operator.start()

    def tearDown(self) -> None:
        self.operator.stop()
        self.temporary.cleanup()

    def provision(self, secret: str = SYNTHETIC_SECRET, *, rotate: bool = False) -> str:
        with mock.patch.object(MODULE, "read_secret", return_value=secret):
            return MODULE.provision(self.env_file, self.state, rotate=rotate)

    def test_provision_verify_and_rollback_are_atomic_and_preserve_non_ai_content(self) -> None:
        self.assertEqual(self.provision(), "CONFIGURED")
        content = self.env_file.read_text(encoding="utf-8")
        self.assertIn("NODE_ENV=production\nDATABASE_URL=synthetic\nCUSTOM_VALUE=preserve-exactly\n", content)
        self.assertIn("AI_RUNTIME_ENABLED=true\n", content)
        self.assertIn("OPENROUTER_BASE_URL=https://openrouter.ai/api/v1\n", content)
        self.assertEqual(stat.S_IMODE(self.env_file.stat().st_mode), 0o600)
        MODULE.verify(self.env_file, self.state)
        pointer = self.state / "last-backup"
        backup = Path(pointer.read_text(encoding="utf-8").strip())
        self.assertEqual((backup / "env").read_bytes(), self.original)
        self.assertNotIn(SYNTHETIC_SECRET.encode(), (backup / "metadata.json").read_bytes())
        MODULE.rollback(self.env_file, self.state)
        self.assertEqual(self.env_file.read_bytes(), self.original)
        self.assertFalse(pointer.exists())

    def test_idempotent_provision_does_not_prompt_duplicate_or_replace_secret(self) -> None:
        self.provision()
        before = self.env_file.read_bytes()
        backups = sorted((self.state / "backups").iterdir())
        with mock.patch.object(MODULE.getpass, "getpass", side_effect=AssertionError("must not prompt")):
            self.assertEqual(MODULE.provision(self.env_file, self.state, rotate=False), "ALREADY_CONFIGURED")
        self.assertEqual(self.env_file.read_bytes(), before)
        self.assertEqual(sorted((self.state / "backups").iterdir()), backups)

    def test_rotation_uses_same_hidden_input_and_can_be_rolled_back(self) -> None:
        self.provision()
        before = self.env_file.read_bytes()
        rotated = "second-synthetic-openrouter-credential-for-tests"
        self.assertEqual(self.provision(rotated, rotate=True), "ROTATED")
        self.assertIn(rotated.encode(), self.env_file.read_bytes())
        MODULE.rollback(self.env_file, self.state)
        self.assertEqual(self.env_file.read_bytes(), before)

    def test_invalid_interactive_secrets_fail_without_changing_env(self) -> None:
        invalid = ("", "short", "a" * 19, "a\nb" + "x" * 30, "a\rb" + "x" * 30, "a\x00b" + "x" * 30, "a$b" + "x" * 30, "x" * 513)
        for value in invalid:
            with self.subTest(value_length=len(value)):
                with self.assertRaisesRegex(MODULE.ProvisionError, "OPENROUTER_CREDENTIAL_INVALID"):
                    self.provision(value)
                self.assertEqual(self.env_file.read_bytes(), self.original)

    def test_duplicate_ai_keys_fail_closed(self) -> None:
        for key in MODULE.AI_KEYS:
            with self.subTest(key=key):
                self.env_file.write_bytes(self.original + f"{key}=first\n{key}=second\n".encode())
                with self.assertRaisesRegex(MODULE.ProvisionError, f"DUPLICATE_{key}"):
                    self.provision()
        self.env_file.write_bytes(self.original)

    def test_wrong_base_url_and_missing_key_fail_verification(self) -> None:
        self.env_file.write_bytes(
            self.original
            + b"AI_RUNTIME_ENABLED=true\nOPENROUTER_API_KEY=synthetic-openrouter-credential-for-tests\nOPENROUTER_BASE_URL=https://attacker.invalid\n"
        )
        with self.assertRaisesRegex(MODULE.ProvisionError, "OPENROUTER_BASE_URL_INVALID"):
            MODULE.verify(self.env_file, self.state)
        self.env_file.write_bytes(self.original + b"AI_RUNTIME_ENABLED=true\nOPENROUTER_BASE_URL=https://openrouter.ai/api/v1\n")
        with self.assertRaisesRegex(MODULE.ProvisionError, "OPENROUTER_CREDENTIAL_INVALID"):
            MODULE.verify(self.env_file, self.state)

    def test_symlink_unsafe_mode_and_wrong_owner_fail(self) -> None:
        target = self.root / "target"
        target.write_bytes(self.original)
        target.chmod(0o600)
        self.env_file.unlink()
        self.env_file.symlink_to(target)
        with self.assertRaisesRegex(MODULE.ProvisionError, "AI_ENV_UNSAFE"):
            self.provision()
        self.env_file.unlink()
        self.env_file.write_bytes(self.original)
        self.env_file.chmod(0o644)
        with self.assertRaisesRegex(MODULE.ProvisionError, "AI_ENV_MODE_INVALID"):
            self.provision()
        self.env_file.chmod(0o600)
        with mock.patch.object(MODULE, "expected_operator", return_value=(os.getuid() + 1, os.getgid())):
            with self.assertRaisesRegex(MODULE.ProvisionError, "ENV_PARENT_PERMISSIONS_UNSAFE|AI_ENV_OWNER_INVALID"):
                MODULE.verify(self.env_file, self.state)

    def test_lock_collision_fails_closed(self) -> None:
        uid, gid = MODULE.expected_operator()
        MODULE.secure_state_directory(self.state, uid, gid)
        lock_path = self.state / "lock"
        descriptor = os.open(lock_path, os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
        fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
        try:
            with self.assertRaisesRegex(MODULE.ProvisionError, "AI_LOCK_UNAVAILABLE"):
                self.provision()
        finally:
            os.close(descriptor)

    def test_backup_atomic_and_post_rename_failures_restore_original(self) -> None:
        for injection in (
            "_TEST_FAIL_BACKUP",
            "_TEST_FAIL_BEFORE_RENAME",
            "_TEST_FAIL_AFTER_RENAME",
        ):
            with self.subTest(injection=injection):
                with mock.patch.object(MODULE, injection, True):
                    with self.assertRaises(MODULE.ProvisionError):
                        self.provision()
                self.assertEqual(self.env_file.read_bytes(), self.original)

    def test_verify_is_read_only_and_mutating_action_recovers_pending_transaction(self) -> None:
        uid, gid = MODULE.expected_operator()
        MODULE.secure_state_directory(self.state, uid, gid)
        details = MODULE.require_env(self.env_file, uid, gid)
        backup = MODULE.create_backup(self.env_file, self.state, details)
        MODULE.atomic_write(self.state / "pending", (str(backup) + "\n").encode(), uid, gid, 0o600)
        self.env_file.write_bytes(self.original + b"AI_RUNTIME_ENABLED=true\nOPENROUTER_API_KEY=incomplete-but-long-enough-value\n")
        self.env_file.chmod(0o600)
        before_state = sorted(path.relative_to(self.state) for path in self.state.rglob("*"))
        with self.assertRaisesRegex(MODULE.ProvisionError, "AI_TRANSACTION_RECOVERY_REQUIRED"):
            MODULE.verify(self.env_file, self.state)
        self.assertNotEqual(self.env_file.read_bytes(), self.original)
        self.assertEqual(sorted(path.relative_to(self.state) for path in self.state.rglob("*")), before_state)
        with self.assertRaisesRegex(MODULE.ProvisionError, "OPENROUTER_CREDENTIAL_INVALID"):
            self.provision("short")
        self.assertEqual(self.env_file.read_bytes(), self.original)
        self.assertFalse((self.state / "pending").exists())

    def test_verify_does_not_create_state_and_mutations_require_operator_identity(self) -> None:
        self.env_file.write_bytes(
            self.original
            + b"AI_RUNTIME_ENABLED=true\nOPENROUTER_API_KEY=synthetic-openrouter-credential-for-tests\nOPENROUTER_BASE_URL=https://openrouter.ai/api/v1\n"
        )
        MODULE.verify(self.env_file, self.state)
        self.assertFalse(self.state.exists())
        with mock.patch.object(MODULE.os, "geteuid", return_value=os.getuid() + 1):
            with self.assertRaisesRegex(MODULE.ProvisionError, "OPERATOR_IDENTITY_REQUIRED"):
                self.provision()
            with self.assertRaisesRegex(MODULE.ProvisionError, "OPERATOR_IDENTITY_REQUIRED"):
                MODULE.rollback(self.env_file, self.state)

    def test_symlinked_backup_root_and_directory_fail_closed(self) -> None:
        uid, gid = MODULE.expected_operator()
        MODULE.secure_state_directory(self.state, uid, gid)
        real_root = self.root / "real-backups"
        real_root.mkdir(mode=0o700)
        (self.state / "backups").symlink_to(real_root, target_is_directory=True)
        with self.assertRaisesRegex(MODULE.ProvisionError, "AI_STATE_DIRECTORY_UNSAFE"):
            self.provision()
        (self.state / "backups").unlink()
        self.provision()
        pointer = self.state / "last-backup"
        backup = Path(pointer.read_text(encoding="utf-8").strip())
        moved = backup.with_name(backup.name + ".real")
        backup.rename(moved)
        backup.symlink_to(moved, target_is_directory=True)
        with self.assertRaisesRegex(MODULE.ProvisionError, "AI_BACKUP_DIRECTORY_UNSAFE"):
            MODULE.rollback(self.env_file, self.state)

    def test_non_tty_input_fails_without_touching_env(self) -> None:
        with mock.patch.object(MODULE.sys.stdin, "isatty", return_value=False):
            with self.assertRaisesRegex(MODULE.ProvisionError, "INTERACTIVE_TTY_REQUIRED"):
                MODULE.read_secret()
        self.assertEqual(self.env_file.read_bytes(), self.original)

    def test_cli_output_and_process_arguments_never_contain_secret(self) -> None:
        argv = ["provision-ai-runtime.py", "provision"]
        stdout = io.StringIO()
        stderr = io.StringIO()
        with mock.patch.object(sys, "argv", argv), mock.patch.object(MODULE, "CANONICAL_ENV", self.env_file), mock.patch.object(
            MODULE, "CANONICAL_STATE", self.state
        ), mock.patch.object(MODULE, "require_trusted_entrypoint"), mock.patch.object(
            MODULE, "read_secret", return_value=SYNTHETIC_SECRET
        ), contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
            MODULE.main()
        combined = stdout.getvalue() + stderr.getvalue() + " ".join(argv)
        self.assertNotIn(SYNTHETIC_SECRET, combined)
        self.assertIn("openRouterCredential=PRESENT", stdout.getvalue())
        self.assertIn("secrets=REDACTED", stdout.getvalue())


if __name__ == "__main__":
    unittest.main()
