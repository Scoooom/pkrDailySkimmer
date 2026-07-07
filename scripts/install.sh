#!/usr/bin/env bash
#
# install.sh — sets up pkr-daily-skimmer end to end.
#
# 1. Deletes any existing ./pokerogue and clones a fresh copy of the live
#    `main` branch
# 2. Applies every patch in patches/pokerogue/, in filename order
# 3. Installs npm dependencies for both pokerogue and this project
#
# pokerogue/ is a plain directory here, NOT a git submodule. Every run
# starts from a clean slate, so it's always safe to just run this again.
#
# Exit codes:
#   0  success
#   1  a patch failed to apply — almost always means pokerogue's upstream
#      source moved out from under the patch; needs manual review/updating
#   2  any other setup failure (clone, npm install, etc.)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
POKEROGUE_DIR="$ROOT_DIR/pokerogue"
POKEROGUE_REPO="https://github.com/pagefaultgames/pokerogue.git"
POKEROGUE_BRANCH="main"
PATCH_DIR="$ROOT_DIR/patches/pokerogue"

log()  { printf '\n\033[1m==> %s\033[0m\n' "$1"; }
info() { printf '    %s\n' "$1"; }
fail() { printf '\n\033[1;31mERROR: %s\033[0m\n' "$1" >&2; exit "${2:-2}"; }

# ── 1. Fresh clone every time ─────────────────────────────────────────────────
if [ -d "$POKEROGUE_DIR" ]; then
  log "Removing existing pokerogue/ directory"
  rm -rf "$POKEROGUE_DIR"
fi

log "Cloning pokerogue ($POKEROGUE_BRANCH)"
git clone --branch "$POKEROGUE_BRANCH" --single-branch "$POKEROGUE_REPO" "$POKEROGUE_DIR" \
  || fail "git clone failed — check your network connection"

POKEROGUE_COMMIT="$(git -C "$POKEROGUE_DIR" rev-parse --short HEAD)"
info "pokerogue is at commit $POKEROGUE_COMMIT"

# ── 2. Apply patches ──────────────────────────────────────────────────────────
PATCHES_APPLIED=0

if [ -d "$PATCH_DIR" ] && compgen -G "$PATCH_DIR"/*.patch > /dev/null; then
  log "Applying patches from patches/pokerogue/"
  for patch in "$PATCH_DIR"/*.patch; do
    patch_name="$(basename "$patch")"

    if ! git -C "$POKEROGUE_DIR" apply --check "$patch" 2>/dev/null; then
      fail "Patch '$patch_name' does not apply cleanly against pokerogue @ $POKEROGUE_COMMIT.
    This almost always means pokerogue's upstream source has changed in a
    way that conflicts with this patch. The patch needs to be manually
    reviewed and updated against the current pokerogue source before
    install.sh can proceed." 1
    fi

    git -C "$POKEROGUE_DIR" apply "$patch" \
      || fail "Patch '$patch_name' passed --check but failed to apply. This should not happen — please report it." 1

    info "OK    $patch_name"
    PATCHES_APPLIED=$((PATCHES_APPLIED + 1))
  done
else
  info "No patches found in patches/pokerogue/ — nothing to apply"
fi

# ── 3. Install dependencies ───────────────────────────────────────────────────
log "Installing pokerogue dependencies"
( cd "$POKEROGUE_DIR" && npm install ) || fail "npm install failed inside pokerogue/"

log "Installing pkr-daily-skimmer dependencies"
( cd "$ROOT_DIR" && npm install ) || fail "npm install failed in project root"

# ── Summary ────────────────────────────────────────────────────────────────────
log "Setup complete"
info "pokerogue commit : $POKEROGUE_COMMIT"
info "patches applied  : $PATCHES_APPLIED"
info ""
info "Run with:  PKR_SEED=\"<daily seed>\" npm run run"
