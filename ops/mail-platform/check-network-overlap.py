#!/usr/bin/env python3
"""Fail if a proposed subnet overlaps existing Docker networks or host routes."""

import argparse
import ipaddress
import json
import sys


def fail(detail: str) -> None:
    print(f"status=error code=mail_subnet_overlap detail={detail}", file=sys.stderr)
    raise SystemExit(1)


parser = argparse.ArgumentParser()
parser.add_argument("--subnet", required=True)
parser.add_argument("--source", choices=("docker", "route"), required=True)
args = parser.parse_args()
target = ipaddress.ip_network(args.subnet, strict=True)
payload = json.load(sys.stdin)

if args.source == "docker":
    candidates = []
    for network in payload:
        name = network.get("Name", "unknown")
        for entry in network.get("IPAM", {}).get("Config", []) or []:
            if entry.get("Subnet"):
                candidates.append((name, entry["Subnet"]))
else:
    candidates = [(entry.get("dev", "route"), entry.get("dst")) for entry in payload]

for name, raw_subnet in candidates:
    if not raw_subnet or raw_subnet == "default":
        continue
    try:
        existing = ipaddress.ip_network(raw_subnet, strict=False)
    except ValueError:
        continue
    if target.overlaps(existing):
        fail(f"{args.source}:{name}:{existing}")

print(f"status=ok source={args.source} overlap=none")
