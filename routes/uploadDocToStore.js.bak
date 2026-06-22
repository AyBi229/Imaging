const { Client } = require('ssh2');
const { SSH_CONFIG, DB_CONFIG } = require('../config');

// Path to the proven PHP script on store.local (the 20260603 copy — all three on-disk
// copies are identical, this one's just the canonical location).
const REGISTER_SCRIPT_PATH = '/home/teledyne/tmp/official-pdf-docs-20260603/register-downloaded-official-product-documents.php';

function handleError(res, conn, err) {
    if (conn) conn.end();
    return res.status(500).json({ success: false, error: err.message });
}

function execPromise(conn, cmd) {
    return new Promise((resolve, reject) => {
        conn.exec(cmd, (err, stream) => {
            if (err) return reject(err);
            let output = '';
            stream.on('data', d => { output += d.toString(); });
            stream.stderr.on('data', d => { output += d.toString(); });
            stream.on('close', (code) => resolve({ code, output }));
        });
    });
}

function sftpWriteBuffer(sftp, remotePath, buffer) {
    return new Promise((resolve, reject) => {
        const stream = sftp.createWriteStream(remotePath);
        stream.on('close', resolve);
        stream.on('error', reject);
        stream.end(buffer);
    });
}

// Same mktemp-my.cnf pattern as buildSqlCmd, just a single lookup instead of a write.
function buildSkuLookupCmd(sku) {
    const safeSku = String(sku).replace(/'/g, "'\\''");
    return `
MYCNF=$(mktemp /tmp/my.cnf.XXXXXX)
cat > "$MYCNF" << 'MYCNF_EOF'
[client]
user=${DB_CONFIG.user}
password=${DB_CONFIG.password}
MYCNF_EOF
chmod 600 "$MYCNF"
mysql --defaults-file="$MYCNF" ${DB_CONFIG.database} -se "SELECT post_id FROM wp_postmeta WHERE meta_key='_sku' AND meta_value='${safeSku}' LIMIT 1;"
rm -f "$MYCNF"
`;
}

function buildTsvRow(localPath, productId, sku, sourceUrl) {
    // Columns expected by the script: local_path, target_ids, target_slugs, source_url, (+1 unused 5th col)
    const cols = ['local_path', 'target_ids', 'target_slugs', 'source_url', 'note'];
    const row = [localPath, String(productId), sku, sourceUrl || '', ''];
    return cols.join('\t') + '\n' + row.join('\t') + '\n';
}

async function uploadDocToStore(req, res) {
    const file = req.file;
    const sku = req.body.sku;
    const sourceUrl = req.body.sourceUrl || '';

    if (!file || !sku) {
        return res.status(400).json({ success: false, error: 'Missing file or SKU data.' });
    }

    const conn = new Client();
    const runId = Date.now();
    const remoteDir = `/home/teledyne/tmp/doc-upload-${runId}`;
    const safeFileName = file.originalname.replace(/[^\w.\-]/g, '_');
    const remoteFilePath = `${remoteDir}/${safeFileName}`;
    const remoteMapPath = `${remoteDir}/file-map.tsv`;

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
                    await sftpWriteBuffer(sftp, remoteFilePath, file.buffer);

                    // Step 3: write the TSV map the script expects
                    const tsv = buildTsvRow(safeFileName, productId, sku, sourceUrl);
                    await sftpWriteBuffer(sftp, remoteMapPath, Buffer.from(tsv, 'utf8'));

                    // Step 4: run the existing, trusted registration script
                    const phpCmd = `php ${REGISTER_SCRIPT_PATH} ${remoteDir} ${remoteMapPath}`;
                    const result = await execPromise(conn, phpCmd);

                    // Step 5: clean up the temp dir regardless of outcome
                    await execPromise(conn, `rm -rf ${remoteDir}`);
                    conn.end();

                    const linked = /New product document links written: ([1-9]\d*)/.exec(result.output);
                    const inserted = /Inserted attachments: ([1-9]\d*)/.exec(result.output);
                    const reused = /Reused attachments: ([1-9]\d*)/.exec(result.output);
                    const missing = /Missing target products: ([1-9]\d*)/.exec(result.output);

                    if (result.code !== 0 || missing || (!linked && !inserted && !reused)) {
                        return res.status(500).json({
                            success: false,
                            error: `Document registration did not complete as expected.`,
                            log: result.output.trim(),
                        });
                    }

                    return res.json({
                        success: true,
                        message: `Linked "${file.originalname}" to product SKU: ${sku} (product #${productId}).`,
                        log: result.output.trim(),
                    });
                } catch (innerErr) {
                    return handleError(res, conn, innerErr);
                }
            });
        } catch (err) {
            return handleError(res, conn, err);
        }
    }).connect(SSH_CONFIG);
}

module.exports = { uploadDocToStore };
