#!/usr/bin/zsh

# Check if at least one file was provided
if [[ $# -eq 0 ]]; then
    echo "❌ Error: Please specify at least one file path." >&2
    echo "Usage: $0 file1.js [file2.js file3.js ...]" >&2
    exit 1
fi

combined_output=""
found_any_file=false

# Loop through all positional arguments ($1, $2, etc.)
for target in "$@"; do
    if [[ -f "$target" ]]; then
        # Append the formatted layout to our master string
        combined_output+="<$target>\n$(cat "$target")\n\n"
        echo "✅ Added $target to queue"
        found_any_file=true
    else
        echo "⚠️  Warning: $target could not be found. Skipping..." >&2
    fi
done

# Check if we actually found something to copy
if [[ "$found_any_file" = false ]]; then
    echo "❌ Error: None of the requested files were found." >&2
    exit 1
fi

# Strip the very last trailing newline characters
combined_output="${combined_output%\\n\\n}"

# Detect clipboard utility and copy the entire string block
if command -v wl-copy &> /dev/null; then
    print -rn "$combined_output" | wl-copy
    echo "🎯 Copied all files to clipboard using wl-copy."
elif command -v xclip &> /dev/null; then
    print -rn "$combined_output" | xclip -selection clipboard
    echo "🎯 Copied all files to clipboard using xclip."
elif command -v xsel &> /dev/null; then
    print -rn "$combined_output" | xsel --clipboard --input
    echo "🎯 Copied all files to clipboard using xsel."
else
    echo "❌ Error: No clipboard utility found." >&2
    exit 1
fi