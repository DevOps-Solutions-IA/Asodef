#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
# shellcheck source=lib.sh
. "$SCRIPT_DIR/lib.sh"

load_config "${1:-}"
require_command dig
require_command python3

for mail_resolver in 1.1.1.1 8.8.8.8; do
  mail_a=$(dig @"$mail_resolver" +short A "$MAIL_HOSTNAME")
  [ "$(printf '%s\n' "$mail_a" | sed '/^$/d' | wc -l)" -eq 1 ] && [ "$mail_a" = "$MAIL_PUBLIC_IPV4" ] || die "dns_a_mismatch_$mail_resolver"

  mail_ptr=$(dig @"$mail_resolver" +short -x "$MAIL_PUBLIC_IPV4" | sed 's/\.$//')
  [ "$(printf '%s\n' "$mail_ptr" | sed '/^$/d' | wc -l)" -eq 1 ] && [ "$mail_ptr" = "$MAIL_HOSTNAME" ] || die "ptr_mismatch_$mail_resolver"

  mail_spf=$(dig @"$mail_resolver" +short TXT "$MAIL_DOMAIN" | sed 's/" "//g; s/^"//; s/"$//' | grep '^v=spf1 ' || true)
  [ "$(printf '%s\n' "$mail_spf" | sed '/^$/d' | wc -l)" -eq 1 ] || die "spf_record_count_invalid_$mail_resolver"

  mail_dmarc=$(dig @"$mail_resolver" +short TXT "_dmarc.$MAIL_DOMAIN" | sed 's/" "//g; s/^"//; s/"$//' | grep '^v=DMARC1;' || true)
  [ "$(printf '%s\n' "$mail_dmarc" | sed '/^$/d' | wc -l)" -eq 1 ] || die "dmarc_record_count_invalid_$mail_resolver"
  python3 "$SCRIPT_DIR/validate-dns-policy.py" --public-ip "$MAIL_PUBLIC_IPV4" --spf "$mail_spf" --dmarc "$mail_dmarc" >/dev/null

  mail_dkim=$(dig @"$mail_resolver" +short TXT "$MAIL_DKIM_SELECTOR._domainkey.$MAIL_DOMAIN" | sed 's/" "//g; s/^"//; s/"$//')
  [ "$(printf '%s\n' "$mail_dkim" | sed '/^$/d' | wc -l)" -eq 1 ] || die "dkim_record_count_invalid_$mail_resolver"
  printf '%s' "$mail_dkim" | grep -Eq '(^|;[[:space:]]*)p=[A-Za-z0-9+/]{300,}={0,2}([;[:space:]]|$)' || die "dkim_public_key_invalid_$mail_resolver"
  echo "resolver=$mail_resolver status=ok a=pass ptr=pass spf=pass dkim=pass dmarc=pass"
done

echo 'status=ok dns_resolvers=2'
