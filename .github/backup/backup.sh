#!/usr/bin/env bash
# Production private identities are never required by or passed to this script.
set +x
set -Eeuo pipefail
umask 077

fail() { printf '%s\n' "::error::$1" >&2; exit 1; }
[[ -n "${DATABASE_URL:-}" ]] || fail "Backup database connection is not configured."
[[ -n "${BACKUP_AGE_RECIPIENT:-}" ]] || fail "Backup age public recipient is not configured."
[[ "$BACKUP_AGE_RECIPIENT" =~ ^age1[0-9a-z]+$ ]] || fail "Configure one native age public recipient, never a private identity."
[[ -n "${BACKUP_EXPECTED_DATABASE:-}" && -n "${BACKUP_EXPECTED_NEON_PROJECT:-}" && -n "${BACKUP_EXPECTED_NEON_BRANCH:-}" ]] || fail "Expected backup target identity is not configured."
[[ "${BACKUP_NAME:-}" =~ ^crm-postgres-[0-9]{8}T[0-9]{6}Z\.dump\.age$ ]] || fail "Encrypted backup filename is invalid."

# /work must be a disposable private filesystem (tmpfs in workflow/test), not the checkout.
work_root="${BACKUP_WORK_ROOT:-/work}"
output_root="${BACKUP_OUTPUT_ROOT:-/encrypted}"
partial="$output_root/${BACKUP_NAME}.partial"
final="$output_root/${BACKUP_NAME}"
[[ ! -e "$partial" && ! -e "$final" ]] || fail "Backup output already exists."
work_dir="$(mktemp -d "$work_root/crm-backup.XXXXXXXX")"
completed=false
cleanup() {
  rm -rf -- "$work_dir"
  if [[ "$completed" != true ]]; then rm -f -- "$partial" "$final"; fi
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

# Validate the recipient before connecting to any database. Suppress raw tool errors.
if ! printf 'recipient preflight' | age --encrypt --recipient "$BACKUP_AGE_RECIPIENT" --output "$work_dir/probe.age" 2>"$work_dir/diagnostic"; then
  fail "The configured age recipient could not be used. No dump was created."
fi

# The runner passes the secret only through the container environment.
# DB clients receive it inside this disposable container; never trace commands or print diagnostics.
export PGOPTIONS='-c default_transaction_read_only=on'
if ! identity="$(psql --dbname="$DATABASE_URL" -XAt --no-password --set=ON_ERROR_STOP=1 --command="SELECT current_database() || '|' || coalesce(current_setting('neon.project_id', true), '') || '|' || coalesce(current_setting('neon.branch_id', true), '')" 2>"$work_dir/diagnostic")"; then
  fail "Backup target could not be verified. Connection details suppressed."
fi
[[ "$identity" == "$BACKUP_EXPECTED_DATABASE|$BACKUP_EXPECTED_NEON_PROJECT|$BACKUP_EXPECTED_NEON_BRANCH" ]] || fail "Backup target identity does not match the approved database/project/branch."
printf 'Verified backup target: database=%s project=%s branch=%s\n' "$BACKUP_EXPECTED_DATABASE" "$BACKUP_EXPECTED_NEON_PROJECT" "$BACKUP_EXPECTED_NEON_BRANCH"

if ! pg_dump --dbname="$DATABASE_URL" --no-password --format=custom --file="$work_dir/plain.dump" 2>"$work_dir/diagnostic"; then
  fail "PostgreSQL dump failed. Connection details suppressed."
fi
unset DATABASE_URL
[[ -s "$work_dir/plain.dump" ]] || fail "PostgreSQL dump was empty."
# Listing checks the TOC; emitting SQL to /dev/null also reads the archived data sections.
if ! pg_restore --list "$work_dir/plain.dump" > /dev/null 2>"$work_dir/diagnostic" \
  || ! pg_restore --file=/dev/null "$work_dir/plain.dump" 2>"$work_dir/diagnostic"; then
  fail "PostgreSQL archive validation failed. No artifact is available."
fi
if ! age --encrypt --recipient "$BACKUP_AGE_RECIPIENT" --output "$partial" "$work_dir/plain.dump" 2>"$work_dir/diagnostic"; then
  fail "Backup encryption failed. No artifact is available."
fi
[[ -s "$partial" ]] || fail "Encryption produced an empty file."
[[ "$(head -n 1 "$partial")" == 'age-encryption.org/v1' ]] || fail "Encrypted output has an unexpected format."
mv -- "$partial" "$final"
# Remove plaintext before reporting success; the EXIT trap is a second cleanup path.
rm -rf -- "$work_dir"
completed=true
printf 'Validated and encrypted backup: %s\n' "$BACKUP_NAME"
