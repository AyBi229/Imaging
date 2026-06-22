#!/usr/bin/env zsh
set -e

TARGET="public/js/skuFinder.js"

if [ ! -f "$TARGET" ]; then
    echo "❌  $TARGET not found. Run this from your project root."
    exit 1
fi

if [ ! -w "$TARGET" ]; then
    echo "❌  $TARGET is not writable by you. Check ownership:"
    echo "    ls -la $TARGET"
    echo "    (if it shows root, run: sudo chown \$(whoami):\$(whoami) $TARGET — then re-run this script WITHOUT sudo)"
    exit 1
fi

cp "$TARGET" "$TARGET.bak"
echo "📦  Backed up to $TARGET.bak"

python3 - "$TARGET" << 'PYEOF'
import re
import sys

path = sys.argv[1]
with open(path, 'r') as f:
    src = f.read()

old_marker_start = "function renderDocList(docs) {"
old_marker_end = "function escapeHtml(str) {"

start_idx = src.find(old_marker_start)
end_idx = src.find(old_marker_end)

if start_idx == -1:
    print("❌  Could not find 'function renderDocList(docs) {' in the file. No changes made.")
    sys.exit(1)
if end_idx == -1:
    print("❌  Could not find 'function escapeHtml(str) {' in the file. No changes made.")
    sys.exit(1)
if end_idx <= start_idx:
    print("❌  Unexpected ordering of markers. No changes made.")
    sys.exit(1)

new_block = '''function renderDocList(docs) {
        docList.innerHTML = '';

        if (!docs.length) {
            const empty = document.createElement('p');
            empty.className   = 'sku-doc-empty';
            empty.textContent = 'No documents found for this SKU.';
            docList.appendChild(empty);
            return;
        }

        docs.forEach((doc, i) => {
            // Support both { name, url } objects and bare URL strings
            const url  = typeof doc === 'string' ? doc : doc.url;
            const name = typeof doc === 'string'
                ? decodeURIComponent(url.split('/').pop() || `Document ${i + 1}`)
                : (doc.name || decodeURIComponent(url.split('/').pop() || `Document ${i + 1}`));

            const isPdf = /\\.pdf$/i.test(url) || /pdf/i.test(name);
            const icon  = isPdf ? '📄' : '📎';

            const item = document.createElement('div');
            item.className = 'sku-doc-item';
            item.innerHTML = `
                <span class="sku-doc-icon">${icon}</span>
                <span class="sku-doc-name">${escapeHtml(name)}</span>
                <a class="sku-doc-open" href="${url}" target="_blank" rel="noopener noreferrer">Open ↗</a>
                <button type="button" class="sku-doc-upload">Upload to Store</button>
            `;

            const uploadBtn = item.querySelector('.sku-doc-upload');
            uploadBtn.addEventListener('click', () => uploadDocToStore(url, name, uploadBtn));

            docList.appendChild(item);
        });
    }

    async function uploadDocToStore(url, name, btn) {
        const sku = skuInput.value.trim();
        if (!sku) {
            setStatus('Enter a SKU before uploading a document.', '#dc3545');
            return;
        }

        btn.disabled    = true;
        btn.textContent = 'Uploading…';

        try {
            const res = await fetch('/upload-doc-to-store', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sku, url, name }),
            });
            const data = await res.json();

            if (!data.success) {
                throw new Error(data.error || 'Upload failed.');
            }

            btn.textContent = '✅ Uploaded';
            setStatus(data.message || `Linked document to SKU ${sku}.`, '#28a745');
        } catch (err) {
            btn.textContent = '⚠️ Failed — retry';
            btn.disabled     = false;
            setStatus(`Document upload failed: ${err.message}`, '#dc3545');
        }
    }

    '''

new_src = src[:start_idx] + new_block + src[end_idx:]

with open(path, 'w') as f:
    f.write(new_src)

print("✅  renderDocList replaced and uploadDocToStore added.")
PYEOF

echo ""
echo "── Verifying syntax ──"
if node --check "$TARGET" 2>&1; then
    echo "✅  $TARGET parses cleanly"
else
    echo "❌  Syntax error after patch. Restoring backup."
    cp "$TARGET.bak" "$TARGET"
    exit 1
fi

echo ""
echo "── Diff summary ──"
diff "$TARGET.bak" "$TARGET" | head -50 || true

echo ""
echo "Done. Backup kept at $TARGET.bak — delete it once you've confirmed the Docs tab"
echo "shows the new 'Upload to Store' button:"
echo "    rm $TARGET.bak"
