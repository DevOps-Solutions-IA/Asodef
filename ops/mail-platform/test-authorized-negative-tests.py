#!/usr/bin/env python3
"""Unit tests for SMTP negative-probe decision logic."""

import importlib.util
import io
from pathlib import Path
import sys
import unittest
from contextlib import redirect_stderr


MODULE_PATH = Path(__file__).with_name("authorized-negative-tests.py")
sys.dont_write_bytecode = True
SPEC = importlib.util.spec_from_file_location("authorized_negative_tests", MODULE_PATH)
assert SPEC is not None and SPEC.loader is not None
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class FakeSmtp:
    def __init__(self, mail_code: int, rcpt_code: int | None = None) -> None:
        self.mail_code = mail_code
        self.rcpt_code = rcpt_code
        self.rcpt_calls = 0

    def mail(self, _sender: str) -> tuple[int, bytes]:
        return self.mail_code, b"probe"

    def rcpt(self, _recipient: str) -> tuple[int, bytes]:
        self.rcpt_calls += 1
        assert self.rcpt_code is not None
        return self.rcpt_code, b"probe"


class ForgedSenderProbeTests(unittest.TestCase):
    def test_accepts_immediate_mail_rejection(self) -> None:
        client = FakeSmtp(553)
        MODULE.require_forged_sender_rejected(client, "unauthorized@example.net")
        self.assertEqual(client.rcpt_calls, 0)

    def test_accepts_rejection_deferred_until_rcpt(self) -> None:
        client = FakeSmtp(250, 553)
        MODULE.require_forged_sender_rejected(client, "unauthorized@example.net")
        self.assertEqual(client.rcpt_calls, 1)

    def test_rejects_sender_bypass_at_mail_and_rcpt(self) -> None:
        client = FakeSmtp(250, 250)
        with redirect_stderr(io.StringIO()):
            with self.assertRaises(SystemExit):
                MODULE.require_forged_sender_rejected(client, "unauthorized@example.net")
        self.assertEqual(client.rcpt_calls, 1)


if __name__ == "__main__":
    unittest.main()
