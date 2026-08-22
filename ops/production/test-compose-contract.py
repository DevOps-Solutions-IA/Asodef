#!/usr/bin/env python3
import ipaddress
import json
import sys

document = json.load(sys.stdin)
api = document["services"]["api"]
networks = api["networks"]
expected = {"data", "egress", "master_tunnel", "mail_submission"}
if set(networks) != expected:
    raise SystemExit(f"unexpected api networks: {sorted(networks)}")
if networks["mail_submission"].get("ipv4_address") != "172.25.52.2":
    raise SystemExit("mail static address missing")
if networks["master_tunnel"].get("ipv4_address") != "172.25.51.2":
    raise SystemExit("master static address changed")

extra_hosts = api.get("extra_hosts", [])
if isinstance(extra_hosts, list):
    host_ok = any(str(value).replace("=", ":") == "smtp.asodef.com.co:172.25.52.1" for value in extra_hosts)
else:
    host_ok = extra_hosts.get("smtp.asodef.com.co") == "172.25.52.1"
if not host_ok:
    raise SystemExit("private SMTP hostname mapping missing")
if api.get("environment", {}).get("SMTP_CONNECT_HOST") != "172.25.52.1":
    raise SystemExit("private SMTP connect host missing")

mail = document["networks"]["mail_submission"]
if not mail.get("external") or mail.get("name") != "asodef_mail_submission":
    raise SystemExit("mail network must remain external")

subnets = [ipaddress.ip_network(value) for value in ("172.22.0.0/16", "172.23.0.0/16", "172.25.51.0/29", "172.25.52.0/29")]
for index, left in enumerate(subnets):
    for right in subnets[index + 1 :]:
        if left.overlaps(right):
            raise SystemExit(f"network overlap: {left} {right}")

if api["image"] != "asodef-public-platform-api:0000000000000000000000000000000000000000":
    raise SystemExit("API release image override missing")
if document["services"]["web"]["image"] != "asodef-public-platform-web:0000000000000000000000000000000000000000":
    raise SystemExit("Web release image override missing")
print("status=ok mergedCompose=PASS masterPreserved=true mailPersistent=true")
