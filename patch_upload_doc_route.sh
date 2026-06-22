#!/usr/bin/env zsh
set -e

TARGET="routes/uploadDocToStore.js"

if [ ! -f "$TARGET" ]; then
    echo "❌  $TARGET not found. Run this from your project root."
    exit 1
fi

if [ ! -w "$TARGET" ]; then
    echo "❌  $TARGET is not writable. Check ownership."
    exit 1
fi

cp "$TARGET" "$TARGET.bak"
echo "📦  Backed up to $TARGET.bak"

python3 - "$TARGET" << 'PYEOF'
import sys

path = sys.argv[1]
with open(path, 'r') as f:
    src = f.read()

OLD = "async function uploadDocToStore(req, res) {"
END = "module.exports"

start = src.find(OLD)
end   = src.find(END)

if start == -1:
    print("❌  Could not find uploadDocToStore function.")
    sys.exit(1)
if end == -1:
    print("❌  Could not find module.exports.")
    sys.exit(1)

NEW = '''async function uploadDocToStore(req, res) {
    const { sku, url, name } = req.body || {};
    if (!sku || !url) {
        return res.status(400).json({ success: false, error: 'Missing file or SKU data.' });
    }

    // Fetch the PDF bytes server-side (avoids browser CORS issues, mirrors /proxy-image pattern)
    let fileBuffer;
    let fileName;
    try {
        const https = require('https');
        const http  = require('http');
        const { URL } = require('url');
        const parsed = new URL(url);
        const transport = parsed.protocol === 'https:' ? https : http;
        fileBuffer = await new Promise((resolve, reject) => {
            transport.get(url, (resp) => {
                if (resp.statusCode !== 200) {
                    return reject(new Error(`Fetch failed: HTTP ${resp.statusCode}`));
                }
                const chunks = [];
                resp.on('data', d => chunks.push(d));
                resp.on('end', () => resolve(Buffer.concat(chunks)));
                resp.on('error', reject);
            }).on('error', reject);
        });
        fileName = (name || decodeURIComponent(parsed.pathname.split('/').pop()) || 'document.pdf')
            .replace(/[^\w.\-]/g, '_');
    } catch (fetchErr) {
        return res.status(502).json({ success: false, error: `Could not fetch PDF: ${fetchErr.message}` });
    }

    const conn = new Client();
    const runId = Date.now();
    const remoteDir = `/home/teledyne/tmp/doc-upload-${runId}`;
    const remoteFilePath = `${remoteDir}/${fileName}`;
    const remoteMapPath  = `${remoteDir}/file-map.tsv`;

    conn.on('ready', async () => {
        try {
            // Step 1: look up the WooCommerce product ID for this SKU
            const lookup = await execPromise(conn, buildSkuLookupCmd(sku));
            const productId = lookup.output.trim();
            if (lookup.code !== 0 || !productId || !/^\d+$/.test(productId)) {
                conn.end();
                return res.status(404).json({
                    success: false,
                    error: `No WooCommerce product found for SKU '${sku}'.`,
                });
            }

            // Step 2: stage the remote directory + push the PDF bytes over SFTP
            const mkdir = await execPromise(conn, `mkdir -p ${remoteDir}`);
            if (mkdir.code !== 0) {
                conn.end();
                return res.status(500).json({ success: false, error: `Could not create remote dir: ${mkdir.output.trim()}` });
            }

            conn.sftp(async (sftpErr, sftp) => {
                if (sftpErr) return handleError(res, conn, sftpErr);
                try {
                    await sftpWriteBuffer(sftp, remoteFilePath, fileBuffer);

                    // Step 3: write the TSV map the script expects
                    const tsv = buildTsvRow(fileName, productId, sku, url);
                    await sftpWriteBuffer(sftp, remoteMapPath, Buffer.from(tsv, 'utf8'));

                    // Step 4: run the existing registration script
                    const phpCmd = `php ${REGISTER_SCRIPT_PATH} ${remoteDir} ${remoteMapPath}`;
                    const result = await execPromise(conn, phpCmd);

                    // Step 5: clean up regardless of outcome
                    await execPromise(conn, `rm -rf ${remoteDir}`);
                    conn.end();

                    const linked   = /New product document links written: ([1-9]\\d*)/.exec(result.output);
                    const inserted = /Inserted attachments: ([1-9]\\d*)/.exec(result.output);
                    const reused   = /Reused attachments: ([1-9]\\d*)/.exec(result.output);
                    const missing  = /Missing target products: ([1-9]\\d*)/.exec(result.output);

                    if (result.code !== 0 || missing || (!linked && !inserted && !reused)) {
                        return res.status(500).json({
                            success: false,
                            error: 'Document registration did not complete as expected.',
                            log: result.output.trim(),
                        });
                    }

                    return res.json({
                        success: true,
                        message: `Linked "${fileName}" to product SKU: ${sku} (product #${productId}).`,
                        log: result.output.trim(),
                    });
                } catch (innerErr) {
                    await execPromise(conn, `rm -rf ${remoteDir}`).catch(() => {});
                    return handleError(res, conn, innerErr);
                }
            });
        } catch (outerErr) {
            return handleError(res, conn, outerErr);
        }
    });

    conn.on('error', (err) => handleError(res, null, err));
    conn.connect(SSH_CONFIG);
}

'''

new_src = src[:start] + NEW + src[end:]

with open(path, 'w') as f:
    f.write(new_src)

print("✅  uploadDocToStore rewritten to accept JSON + fetch PDF server-side.")
PYEOF

echo ""
echo "── Verifying syntax ──"
if node --check "$TARGET" 2>&1; then
    echo "✅  $TARGET parses cleanly"
else
    echo "❌  Syntax error. Restoring backup."
    cp "$TARGET.bak" "$TARGET"
    exit 1
fi

echo ""
echo "── Diff summary ──"
diff "$TARGET.bak" "$TARGET" | head -60 || true

echo ""
echo "Done. Backup at $TARGET.bak — remove once confirmed working:"
echo "    rm $TARGET.bak"
