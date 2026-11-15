#!/usr/bin/env bash
# Synthetic data and disposable test identities only. No host database or credentials.
set +x
set -Eeuo pipefail
umask 077
unset DATABASE_URL PGDATABASE PGSERVICE PGSERVICEFILE PGPASSFILE PGPASSWORD PGOPTIONS
work_root="${BACKUP_WORK_ROOT:-/work}"
output_root="${BACKUP_OUTPUT_ROOT:-/encrypted}"
backup_script="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/backup.sh"
work="$(mktemp -d "$work_root/encryption-test.XXXXXXXX")"
as_postgres() { if [[ "$(id -u)" == 0 ]]; then gosu postgres "$@"; else "$@"; fi; }
stage="initialization"
cleanup() {
  result=$?
  if [[ "$result" != 0 ]]; then printf 'FAIL: isolated backup test stage: %s\n' "$stage" >&2; fi
  as_postgres pg_ctl -D "$work/pgdata" -m immediate stop >/dev/null 2>&1 || true
  rm -rf -- "$work"
}
trap cleanup EXIT
if [[ "$(id -u)" == 0 ]]; then chown postgres:postgres "$work"; fi
mkdir "$work/socket"
if [[ "$(id -u)" == 0 ]]; then chown postgres:postgres "$work/socket"; fi
as_postgres initdb -D "$work/pgdata" --auth=trust --username=postgres --no-instructions > /dev/null
as_postgres pg_ctl -D "$work/pgdata" -l "$work/postgres.log" \
  -o "-k $work/socket -c listen_addresses='' -c neon.project_id=isolated-project -c neon.branch_id=isolated-branch" -w start > /dev/null
export PGHOST="$work/socket" PGUSER=postgres PGDATABASE=postgres
psql -Xq --set=ON_ERROR_STOP=1 --command="CREATE TABLE backup_fixture (id integer PRIMARY KEY, label text NOT NULL); INSERT INTO backup_fixture VALUES (1, 'synthetic encryption fixture');" > /dev/null
# Only disposable test identities; production private identities are never created.
age-keygen -o "$work/fixture.identity" 2> /dev/null
BACKUP_AGE_RECIPIENT="$(age-keygen -y "$work/fixture.identity")"
export BACKUP_AGE_RECIPIENT
export DATABASE_URL="host=$work/socket user=postgres dbname=postgres"
export BACKUP_EXPECTED_DATABASE=postgres BACKUP_EXPECTED_NEON_PROJECT=isolated-project BACKUP_EXPECTED_NEON_BRANCH=isolated-branch
export BACKUP_NAME=crm-postgres-20000101T000000Z.dump.age
mkdir "$work/encrypted"
# /encrypted is supplied as tmpfs by the test command; publish no test artifacts.
stage="production backup pipeline"
bash "$backup_script" > "$work/success.log" 2>&1
[[ -s "$output_root/$BACKUP_NAME" ]]
stage="existing ciphertext protection"
original_digest=$(sha256sum "$output_root/$BACKUP_NAME")
if bash "$backup_script" > "$work/failure.log" 2>&1; then exit 1; fi
[[ "$(sha256sum "$output_root/$BACKUP_NAME")" == "$original_digest" ]]
[[ "$(find "$output_root" -maxdepth 1 -type f | wc -l)" -eq 1 ]]
[[ -z "$(find "$work_root" -maxdepth 1 -type d -name 'crm-backup.*' -print -quit)" ]]
stage="decryption and archive validation"
age --decrypt --identity "$work/fixture.identity" --output "$work/restored.dump" "$output_root/$BACKUP_NAME" 2> /dev/null
[[ "$(head -c 5 "$work/restored.dump")" == PGDMP ]]
pg_restore --list "$work/restored.dump" > /dev/null
# Restore only to a new synthetic database on this Unix-socket-only test server.
stage="restore synthetic database"
createdb recovered_fixture
pg_restore --no-owner --no-privileges --exit-on-error --single-transaction --dbname=recovered_fixture "$work/restored.dump" > /dev/null
[[ "$(psql -XAt --dbname=recovered_fixture --command='SELECT count(*) FROM backup_fixture')" == 1 ]]
[[ "$(psql -XAt --dbname=recovered_fixture --command='SELECT label FROM backup_fixture WHERE id=1')" == 'synthetic encryption fixture' ]]
stage="wrong key and ciphertext integrity"
age-keygen -o "$work/wrong.identity" 2> /dev/null
if age --decrypt --identity "$work/wrong.identity" --output /dev/null "$output_root/$BACKUP_NAME" > /dev/null 2>&1; then exit 1; fi
# Tampering and truncation must fail authentication; do not expose decrypted data.
cp "$output_root/$BACKUP_NAME" "$work/tampered.age"
last_byte=$(tail -c 1 "$work/tampered.age" | od -An -tu1)
printf -v flipped '\\%03o' "$((last_byte ^ 1))"
printf '%b' "$flipped" | dd of="$work/tampered.age" bs=1 seek="$(($(stat -c %s "$work/tampered.age") - 1))" conv=notrunc status=none
if age --decrypt --identity "$work/fixture.identity" --output /dev/null "$work/tampered.age" > /dev/null 2>&1; then exit 1; fi
head -c 100 "$output_root/$BACKUP_NAME" > "$work/truncated.age"
if age --decrypt --identity "$work/fixture.identity" --output /dev/null "$work/truncated.age" > /dev/null 2>&1; then exit 1; fi
export BACKUP_NAME=crm-postgres-20000101T000001Z.dump.age
stage="configuration and connection failures"
for failure in missing_recipient invalid_recipient wrong_target outage; do
  case "$failure" in
    missing_recipient) if BACKUP_AGE_RECIPIENT='' bash "$backup_script" > "$work/failure.log" 2>&1; then exit 1; fi ;;
    invalid_recipient) if BACKUP_AGE_RECIPIENT=age1invalid bash "$backup_script" > "$work/failure.log" 2>&1; then exit 1; fi ;;
    wrong_target) if BACKUP_EXPECTED_NEON_BRANCH=shared-branch bash "$backup_script" > "$work/failure.log" 2>&1; then exit 1; fi ;;
    outage) if DATABASE_URL='host=/nonexistent user=postgres dbname=postgres password=fixture-secret' bash "$backup_script" > "$work/failure.log" 2>&1; then exit 1; fi ;;
  esac
  [[ ! -e "$output_root/$BACKUP_NAME" && ! -e "$output_root/$BACKUP_NAME.partial" ]]
  if grep -q 'fixture-secret\|AGE-SECRET-KEY-' "$work/failure.log"; then exit 1; fi
done
stage="dump and archive validation failures"
# Injected into a child Bash process.
# shellcheck disable=SC2329
pg_dump() { return 1; }
export -f pg_dump
if bash "$backup_script" > "$work/failure.log" 2>&1; then exit 1; fi
unset -f pg_dump
[[ ! -e "$output_root/$BACKUP_NAME" && ! -e "$output_root/$BACKUP_NAME.partial" ]]
# Injected into a child Bash process.
# shellcheck disable=SC2329
pg_dump() { for arg in "$@"; do case "$arg" in --file=*) printf 'invalid synthetic archive' > "${arg#--file=}" ;; esac; done; }
export -f pg_dump
if bash "$backup_script" > "$work/failure.log" 2>&1; then exit 1; fi
unset -f pg_dump
[[ ! -e "$output_root/$BACKUP_NAME" && ! -e "$output_root/$BACKUP_NAME.partial" ]]
# Simulate a failure on the real encryption call after a successful preflight/dump.
stage="post-dump encryption failure"
BACKUP_TEST_AGE_BINARY="$(command -v age)"
export BACKUP_TEST_AGE_BINARY
# Injected into a child Bash process.
# shellcheck disable=SC2329
age() {
  case "$*" in
    *probe.age*) "$BACKUP_TEST_AGE_BINARY" "$@" ;;
    *) for ((i=1; i<=$#; i++)); do if [[ "${!i}" == --output ]]; then j=$((i+1)); printf 'partial' > "${!j}"; fi; done; return 1 ;;
  esac
}
export -f age
if bash "$backup_script" > "$work/failure.log" 2>&1; then exit 1; fi
unset -f age
[[ ! -e "$output_root/$BACKUP_NAME" && ! -e "$output_root/$BACKUP_NAME.partial" ]]
[[ -z "$(find "$work_root" -maxdepth 1 -type d -name 'crm-backup.*' -print -quit)" ]]
if grep -q 'AGE-SECRET-KEY-\|synthetic encryption fixture' "$work/success.log"; then exit 1; fi
printf '%s\n' 'PASS: encrypted custom archive decrypts/restores synthetic data; wrong key/tampering/truncation rejected; missing/invalid recipient, wrong target, outage and encryption failure publish nothing and clean temporary files.'
