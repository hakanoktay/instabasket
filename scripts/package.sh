#!/usr/bin/env bash
# Builds the Chrome Web Store upload: dist/keepkeep-<version>.zip, with
# manifest.json at the root of the ZIP as the store requires.
#
#   ./scripts/package.sh
#
# Checks the manifest first (version, description length, icons), and leaves
# out files that must not ship (macOS metadata, editor leftovers).
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
src="$root/extension"
manifest="$src/manifest.json"
dist="$root/dist"

fail() { echo "✗ $*" >&2; exit 1; }

[ -f "$manifest" ] || fail "extension/manifest.json not found"
command -v zip >/dev/null || fail "the zip command is needed"

# Plain grep/sed, so nothing beyond a standard shell is needed.
field() { sed -n "s/^  \"$1\": \"\(.*\)\",\{0,1\}$/\1/p" "$manifest" | head -n 1; }
# Length in characters, not bytes (the name has an en dash): UTF-8
# continuation bytes are dropped, one byte per character is left.
chars() { printf '%s' "$1" | LC_ALL=C tr -d '\200-\277' | wc -c | tr -d ' '; }
name="$(field name)"
version="$(field version)"
description="$(field description)"

[ -n "$name" ] || fail "no name in manifest.json"
echo "$version" | grep -Eq '^[0-9]+(\.[0-9]+){0,3}$' || fail "version \"$version\" must be 1 to 4 numbers separated by dots"
[ "$(chars "$name")" -le 75 ] || fail "name is $(chars "$name") characters; the store allows 75"
[ "$(chars "$description")" -le 132 ] || fail "description is $(chars "$description") characters; the store allows 132"
# Trademark: "Instagram" only as a descriptor at the very end ("KeepKeep – … for
# Instagram"), never "Insta" or "Gram" anywhere else in the name.
brand="$(printf '%s' "${name% for Instagram}" | tr '[:upper:]' '[:lower:]')"
case "$brand" in *insta*|*gram*) fail "\"Instagram\" may only end the name, as \"… for Instagram\"; never \"Insta\" or \"Gram\"";; esac
grep -q '"key"' "$manifest" && fail "remove the \"key\" field from manifest.json before uploading"
for size in 16 32 48 128; do
  [ -f "$src/icons/icon$size.png" ] || fail "icons/icon$size.png is missing"
done

mkdir -p "$dist"
out="$dist/keepkeep-$version.zip"
rm -f "$out"
(
  cd "$src"
  zip -q -r -X "$out" . \
    -x '*.DS_Store' -x '__MACOSX/*' -x '*~' -x '*.swp' -x '.*'
)

files="$(unzip -Z1 "$out" | grep -vc '/$')"
size="$(du -h "$out" | cut -f1)"
echo "✓ $name $version → ${out#$root/} ($files files, $size)"
echo "  Upload it at https://chrome.google.com/webstore/devconsole"
