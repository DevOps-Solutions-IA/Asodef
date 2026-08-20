#!/usr/bin/env python3
"""Validate the dedicated mail network values without contacting Docker."""

import argparse
import ipaddress
import sys


def fail(code: str) -> None:
    print(f"status=error code={code}", file=sys.stderr)
    raise SystemExit(1)


parser = argparse.ArgumentParser()
parser.add_argument("--subnet", required=True)
parser.add_argument("--gateway", required=True)
parser.add_argument("--api", required=True)
args = parser.parse_args()

try:
    subnet = ipaddress.ip_network(args.subnet, strict=True)
    gateway = ipaddress.ip_address(args.gateway)
    api = ipaddress.ip_address(args.api)
except ValueError:
    fail("invalid_network_contract")

if subnet.version != 4 or subnet.prefixlen != 29:
    fail("mail_network_must_be_ipv4_29")
if gateway not in subnet or api not in subnet:
    fail("address_outside_mail_subnet")
if gateway in (subnet.network_address, subnet.broadcast_address):
    fail("invalid_gateway_address")
if api in (subnet.network_address, subnet.broadcast_address) or api == gateway:
    fail("invalid_api_address")
