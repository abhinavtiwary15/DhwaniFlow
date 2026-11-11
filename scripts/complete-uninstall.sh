#!/usr/bin/env bash

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "This script will stop DhwaniFlow, remove the installed app, and delete caches, databases, and preferences."
read -r -p "Continue with the full uninstall? [y/N]: " confirm
if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
  echo "Aborted."
  exit 0
fi

remove_target() {
  local target="$1"
  if [[ -e "$target" ]]; then
    echo "Removing $target"
    rm -rf "$target" 2>/dev/null || sudo rm -rf "$target"
  fi
}

echo "Stopping running DhwaniFlow/Electron processes..."
pkill -f "DhwaniFlow" 2>/dev/null || true
pkill -f "dhwaniflow" 2>/dev/null || true
pkill -f "Electron Helper.*DhwaniFlow" 2>/dev/null || true
pkill -f "OpenWhispr" 2>/dev/null || true
pkill -f "open-whispr" 2>/dev/null || true

echo "Removing /Applications/DhwaniFlow.app (requires admin)..."
remove_target "/Applications/DhwaniFlow.app"
remove_target "/Applications/OpenWhispr.app"

echo "Purging Application Support data..."
remove_target "$HOME/Library/Application Support/DhwaniFlow"
remove_target "$HOME/Library/Application Support/dhwaniflow"
remove_target "$HOME/Library/Application Support/DhwaniFlow-dev"
remove_target "$HOME/Library/Application Support/io.github.abhinavtiwary15.dhwaniflow"
remove_target "$HOME/Library/Application Support/OpenWhispr"
remove_target "$HOME/Library/Application Support/open-whispr"
remove_target "$HOME/Library/Application Support/OpenWhispr-dev"
remove_target "$HOME/Library/Application Support/com.openwhispr"
remove_target "$HOME/Library/Application Support/com.openwhispr.OpenWhispr"

echo "Removing caches, logs, and saved state..."
remove_target "$HOME/Library/Caches/dhwaniflow"
remove_target "$HOME/Library/Caches/io.github.abhinavtiwary15.dhwaniflow"
remove_target "$HOME/Library/Preferences/io.github.abhinavtiwary15.dhwaniflow.plist"
remove_target "$HOME/Library/Logs/DhwaniFlow"
remove_target "$HOME/Library/Caches/open-whispr"
remove_target "$HOME/Library/Caches/com.openwhispr.OpenWhispr"
remove_target "$HOME/Library/Preferences/com.openwhispr.OpenWhispr.plist"
remove_target "$HOME/Library/Preferences/com.openwhispr.helper.plist"
remove_target "$HOME/Library/Logs/OpenWhispr"
remove_target "$HOME/Library/Saved Application State/com.openwhispr.OpenWhispr.savedState"

echo "Cleaning temporary files..."
shopt -s nullglob
for tmp in /tmp/dhwaniflow* /tmp/openwhispr*; do
  remove_target "$tmp"
done
for crash in "$HOME/Library/Application Support/CrashReporter"/DhwaniFlow_* "$HOME/Library/Application Support/CrashReporter"/OpenWhispr_*; do
  remove_target "$crash"
done
shopt -u nullglob

read -r -p "Remove downloaded Whisper models and caches (~/.cache/whisper, ~/Library/Application Support/whisper)? [y/N]: " wipe_models
if [[ "$wipe_models" =~ ^[Yy]$ ]]; then
  remove_target "$HOME/.cache/whisper"
  remove_target "$HOME/Library/Application Support/whisper"
  remove_target "$HOME/Library/Application Support/OpenWhispr/models"
fi

ENV_FILE="$PROJECT_ROOT/.env"
if [[ -f "$ENV_FILE" ]]; then
  read -r -p "Remove the local environment file at $ENV_FILE? [y/N]: " wipe_env
  if [[ "$wipe_env" =~ ^[Yy]$ ]]; then
    echo "Removing $ENV_FILE"
    rm -f "$ENV_FILE"
  fi
fi

cat <<'EOF'
macOS keeps microphone, screen recording, and accessibility approvals even after files are removed.
Reset them if you want a truly fresh start:
  tccutil reset Microphone com.openwhispr.app
  tccutil reset Accessibility com.openwhispr.app
  tccutil reset ScreenCapture com.openwhispr.app

Full uninstall complete. Reboot if you removed permissions, then reinstall or run npm scripts on a clean tree.
EOF
