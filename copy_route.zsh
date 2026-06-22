#!/usr/bin/zsh

# Define the target file requested by Claude
target="server.js"

if [[ ! -f "$target" ]]; then
    echo "❌ Error: $target could not be found in the current directory." >&2
    exit 1
fi

# Detect clipboard utility and copy
if command -v wl-copy &> /dev/null; then
    wl-copy < "$target"
    echo "🎯 Copied $target to clipboard using wl-copy."
elif command -v xclip &> /dev/null; then
    xclip -selection clipboard < "$target"
    echo "🎯 Copied $target to clipboard using xclip."
elif command -v xsel &> /dev/null; then
    xsel --clipboard --input < "$target"
    echo "🎯 Copied $target to clipboard using xsel."
else
    echo "❌ Error: No clipboard utility found. Please install xclip or wl-clipboard." >&2
    exit 1
fi