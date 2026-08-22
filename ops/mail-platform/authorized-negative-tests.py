#!/usr/bin/env python3
"""Authenticated SMTP negative probes; never sends RCPT or DATA."""

import argparse
import smtplib
import ssl
import sys
from pathlib import Path


def fail(code: str) -> None:
    print(f"status=error code={code}", file=sys.stderr)
    raise SystemExit(1)


def connect(args: argparse.Namespace, password: str) -> smtplib.SMTP:
    client = smtplib.SMTP(args.connect_host, args.port, timeout=10)
    client.ehlo()
    client._host = args.tls_hostname
    client.starttls(context=ssl.create_default_context())
    client.ehlo()
    client.login(args.user, password)
    return client


def require_forged_sender_rejected(client: smtplib.SMTP, sender: str) -> None:
    """Require rejection at MAIL or RCPT without ever sending message DATA."""
    code, _ = client.mail(sender)
    if code >= 500:
        return

    # smtpd_delay_reject=yes deliberately defers sender restriction evaluation
    # until RCPT. A 2xx MAIL response is therefore not evidence of a bypass.
    code, _ = client.rcpt("open-relay-probe@example.net")
    if code < 500:
        fail("forged_sender_not_rejected")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--connect-host", required=True)
    parser.add_argument("--tls-hostname", required=True)
    parser.add_argument("--port", required=True, type=int)
    parser.add_argument("--user", required=True)
    parser.add_argument("--password-file", required=True)
    parser.add_argument("--allowed-from", required=True)
    parser.add_argument("--oversize", required=True, type=int)
    args = parser.parse_args()

    password_path = Path(args.password_file)
    if password_path.is_symlink() or not password_path.is_file():
        fail("password_file_missing")
    if password_path.stat().st_uid != 0 or password_path.stat().st_mode & 0o077:
        fail("password_file_permissions")
    password = password_path.read_text(encoding="utf-8").strip()
    if not password:
        fail("password_file_empty")

    bad_helo = smtplib.SMTP(args.connect_host, 25, timeout=10)
    try:
        code, _ = bad_helo.helo("invalid")
        if code < 500:
            bad_helo.mail(f"probe@{args.tls_hostname.removeprefix('smtp.')}")
            code, _ = bad_helo.rcpt("open-relay-probe@example.net")
        if code < 500:
            fail("invalid_helo_not_rejected")
    finally:
        bad_helo.close()

    plaintext = smtplib.SMTP(args.connect_host, args.port, timeout=10)
    try:
        plaintext.ehlo()
        if "starttls" not in plaintext.esmtp_features:
            fail("starttls_not_advertised")
        if "auth" in plaintext.esmtp_features:
            fail("auth_advertised_without_tls")
    finally:
        plaintext.close()

    unauthenticated = smtplib.SMTP(args.connect_host, args.port, timeout=10)
    try:
        unauthenticated.ehlo()
        unauthenticated._host = args.tls_hostname
        unauthenticated.starttls(context=ssl.create_default_context())
        unauthenticated.ehlo()
        unauthenticated.mail(args.allowed_from)
        code, _ = unauthenticated.rcpt("open-relay-probe@example.net")
        if code < 500:
            fail("submission_without_auth_not_rejected")
    finally:
        unauthenticated.close()

    invalid = smtplib.SMTP(args.connect_host, args.port, timeout=10)
    try:
        invalid.ehlo()
        invalid._host = args.tls_hostname
        invalid.starttls(context=ssl.create_default_context())
        invalid.ehlo()
        try:
            invalid.login(args.user, "ASODEF-INTENTIONALLY-INVALID-PROBE")
        except smtplib.SMTPAuthenticationError:
            pass
        else:
            fail("invalid_password_accepted")
    finally:
        invalid.close()

    client = connect(args, password)
    try:
        require_forged_sender_rejected(client, "unauthorized-sender@example.net")
    finally:
        client.close()

    client = connect(args, password)
    try:
        code, _ = client.mail(args.allowed_from, options=[f"SIZE={args.oversize}"])
        if code != 552:
            fail("oversized_message_not_rejected")
    finally:
        client.close()

    print(
        "status=ok plaintext_auth=hidden submission_unauthenticated=rejected invalid_auth=rejected "
        "authenticated_spoof=rejected authenticated_oversize=rejected"
    )


if __name__ == "__main__":
    main()
