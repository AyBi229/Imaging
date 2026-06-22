#!/usr/bin/zsh

if [[ -z "$1" ]]; then
    echo "❌ Error: Please specify a target file." >&2
    echo "Usage: ./paste_to_file.zsh <filename>" >&2
    exit 1
fi

target_file="$1"
clipboard_content=""

# 1. Fetch content from clipboard
if command -v wl-paste &> /dev/null; then
    clipboard_content=$(wl-paste)
elif command -v xclip &> /dev/null; then
    clipboard_content=$(xclip -selection clipboard -o)
elif command -v xsel &> /dev/null; then
    clipboard_content=$(xsel --clipboard --output)
else
    echo "❌ Error: No clipboard utility found." >&2
    exit 1
fi

if [[ -z "$clipboard_content" ]]; then
    echo "⚠️  Clipboard is empty. Operation aborted."
    exit 1
fi

# 2. Confirmation Prompt
echo "⚠️  WARNING: You are about to OVERWRITE '$target_file' with root privileges."
if [[ -f "$target_file" ]]; then
    echo "   (Current file size: $(wc -c < "$target_file" | tr -d ' ') bytes)"
else
    echo "   (File does not exist yet. It will be created.)"
fi
echo "--------------------------------------------------"

# Read confirmation cleanly from the terminal control device (/dev/tty)
print -n "Are you sure you want to proceed? [y/N]: "
read -r response < /dev/tty

if [[ "${response:l}" != "y" ]]; then
    echo "❌ Operation cancelled. File left untouched."
    exit 0
fi

# 3. Kill the sudo cache to FORCE the password prompt right now
sudo -k

# 4. Apply changes
echo "$clipboard_content" | sudo tee "$target_file" > /dev/null

if [[ $? -eq 0 ]]; then
    echo "⚡ Successfully updated '$target_file' with root privileges!"
else
    echo "❌ Error: Failed to write to file." >&2
    exit 1
fi