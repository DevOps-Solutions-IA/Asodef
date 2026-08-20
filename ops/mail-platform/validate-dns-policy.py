#!/usr/bin/env python3
"""Validate the deliberately narrow SPF/DMARC coexistence policy."""

import argparse
import ipaddress
import sys


def fail(code: str) -> None:
    print(f"status=error code={code}", file=sys.stderr)
    raise SystemExit(1)


parser = argparse.ArgumentParser()
parser.add_argument("--public-ip", required=True)
parser.add_argument("--spf", required=True)
parser.add_argument("--dmarc", required=True)
args = parser.parse_args()

try:
    public_ip = ipaddress.ip_address(args.public_ip)
except ValueError:
    fail("invalid_public_ip")

spf_tokens = args.spf.split()
required_spf = {f"ip4:{public_ip}", "include:secureserver.net"}
if len(spf_tokens) != 4 or spf_tokens[0] != "v=spf1" or spf_tokens[-1] != "-all":
    fail("invalid_spf_shape")
if set(spf_tokens[1:-1]) != required_spf:
    fail("invalid_spf_authorization")

dmarc_tags: dict[str, str] = {}
for raw_tag in args.dmarc.split(";"):
    raw_tag = raw_tag.strip()
    if not raw_tag:
        continue
    if "=" not in raw_tag:
        fail("invalid_dmarc_tag")
    key, value = (part.strip() for part in raw_tag.split("=", 1))
    key = key.lower()
    if key in dmarc_tags:
        fail("duplicate_dmarc_tag")
    dmarc_tags[key] = value

if dmarc_tags.get("v") != "DMARC1":
    fail("invalid_dmarc_version")
if dmarc_tags.get("p") not in {"none", "quarantine"}:
    fail("unsafe_dmarc_policy_for_pre_certification")
if dmarc_tags.get("adkim", "r") not in {"r", "s"} or dmarc_tags.get("aspf", "r") not in {"r", "s"}:
    fail("invalid_dmarc_alignment")

print(f"status=ok spf=exact dmarc_policy={dmarc_tags['p']}")
