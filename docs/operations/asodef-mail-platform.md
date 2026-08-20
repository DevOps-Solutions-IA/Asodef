# ASODEF mail platform operator runbook

## Verified discovery baseline (2026-08-20)

| Control | Observed state |
| --- | --- |
| `smtp.asodef.com.co` | NXDOMAIN; not ready |
| VPS IPv4 | `169.58.36.138` |
| VPS hostname/PTR | `vmi3448457.contaboserver.net`; not aligned |
| Existing MX | GoDaddy `smtp.secureserver.net` and `mailstore1.secureserver.net` |
| Existing SPF | authorizes `secureserver.net` only |
| Existing DMARC | present with `p=quarantine`, relaxed alignment |
| DKIM selector | not discovered; unknown |
| Outbound TCP/25 | reachable from VPS to Gmail, Outlook and GoDaddy |
| Host MTA/listeners | no MTA and no host/Docker listeners on 25/465/587 |
| SMTP TLS certificate | absent; HTTPS certificate covers only apex and `www` |
| Host firewall detail | privileged operator inspection required |

The public network completed TCP handshakes on 25/465/587 but returned neither
an SMTP banner nor TLS while the VPS had no matching socket. That is not an
inbound SMTP PASS. Retest from an independent network after activation.

## Target topology and trust boundaries

```text
ASODEF API 172.25.52.2/29
  -> dedicated internal network asodef_mail_submission / asodef-mail0
  -> TCP/587 STARTTLS + SASL
  -> Postfix 172.25.52.1:587 (private bind; smtp.asodef.com.co TLS identity)
  -> OpenDKIM on loopback 127.0.0.1:8891
  -> remote recipient MX on outbound TCP/25

Internet -> TCP/587 DENY
Internet -> TCP/465 DENY
Internet -> TCP/25 DENY while GoDaddy remains MX
```

PostgreSQL, Redis, Master/Firebird, R3, Bold, payments and the protected
WhatsApp stack are outside this topology and must not be modified.

The `/29` is a proposed dedicated contract and must pass the repository overlap
gate against every Docker network and host route before creation. It must never
reuse `asodef_master_tunnel`, `data` or `egress`. The API-only Compose overlay
adds a fixed `.2` member and maps the SMTP hostname internally to host `.1`,
preserving TLS hostname verification without a public submission listener.

## DNS plan (operator/provider actions)

Use a versioned selector such as `asodef2026a`; substitute only values verified
from the generated public key and provider control panel.

1. Add `A smtp.asodef.com.co <MAIL_PUBLIC_IPV4>`.
2. Provider sets PTR `<MAIL_PUBLIC_IPV4> -> smtp.asodef.com.co`.
3. Keep both current MX records unchanged. This relay is outbound-only.
4. Replace SPF atomically with an additive record equivalent to
   `v=spf1 ip4:<MAIL_PUBLIC_IPV4> include:secureserver.net -all`. Never publish
   a second SPF record.
   The managed relay remains IPv4-only while this policy is active. Enabling
   IPv6 delivery additionally requires an aligned IPv6 PTR and an explicit
   `ip6:` SPF mechanism before changing `inet_protocols`.
5. Publish `<SELECTOR>._domainkey.asodef.com.co` from the on-host `.txt` public
   key output. Never copy the `.private` file.
6. Preserve the current DMARC record and `p=quarantine` during coexistence.
   Do not change policy or reporting destination without domain-owner approval.
7. Confirm A, PTR, SPF, DKIM and DMARC from at least two independent resolvers.

All seven actions are `REQUIRES_OPERATOR_APPROVAL`. DNS rollback removes only
the new A, DKIM selector and VPS SPF mechanism after application rollback; it
must not remove the existing GoDaddy include, MX or DMARC record.

## Startup and verification order

1. Freeze exact application release SHA and capture current production state.
2. Obtain DNS/PTR ownership confirmation.
3. Create root-owned, non-symlink `0600` config and password files outside Git.
4. Validate/create the dedicated network and attach only the public API through
   the overlay during an authorized API-only recreate.
5. Issue the public certificate through the existing ACME webroot.
6. Prepare host configuration and generate DKIM on-host with services stopped.
7. Publish/verify DNS using two independent resolvers.
8. Apply exact owned UFW rules, then activate services.
9. Run host, network, loopback-relay, bad-HELO, auth, spoof, oversize and TLS tests.
10. Send controlled Gmail and Outlook deliveries from the approved From address.
11. Verify `SPF=pass`, `DKIM=pass`, `DMARC=pass`, aligned From, TLS and sane
   rendering from full headers without publishing recipient PII.
12. Only after mail certification, configure ASODEF Outbox SMTP secrets and run
    recovery E2E through the durable job path.

## Failure and recovery

- DNS/PTR/TLS mismatch: keep Postfix/OpenDKIM stopped; do not send.
- Open-relay or sender-spoof test failure: stop Postfix immediately and preserve
  logs/config for diagnosis.
- SMTP temporary failure: Outbox owns bounded retry/backoff.
- SMTP permanent failure: classify without blind retry.
- Unknown SMTP acceptance result: preserve `UNKNOWN_RESULT`; never retry blindly.
- Certificate renewal failure: existing certificate remains in use; alert before
  expiry and never substitute a self-signed certificate.
- DKIM failure: stop new delivery, restore the previous selector/key and retain
  both public selectors through the documented overlap.

Rollback sequence: stop application dispatch, stop mail services, execute the
exact host rollback, validate public relay is unavailable, restore application
SMTP configuration, detach only the public API from the mail overlay, remove the
empty mail network, then perform DNS rollback. Host rollback deletes only UFW
rules carrying this run's ownership comments; pre-existing rules are preserved.
Generated DKIM/SASL material is archived under the root-only immutable backup,
not printed. Do not delete queued/unknown or dead-letter Outbox records.
