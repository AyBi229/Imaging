const { put } = require('@vercel/blob');
const { Client } = require('ssh2');
const { SSH_CONFIG, WP_PATH } = require('../config');
const { buildSqlCmd } = require('../ssh/buildSqlCmd');

function handleError(res, conn, err) {
    if (conn) conn.end();
    return res.status(500).json({ success: false, error: err.message });
}

async function uploadToWp(req, res) {
    const file = req.file;
    const sku = req.body.sku;

    if (!file || !sku) {
        return res.status(400).json({ success: false, error: 'Missing file or SKU data.' });
    }

    try {
        // Step 1: Upload image to Vercel Blob
        const blob = await put(file.originalname, file.buffer, {
            access: 'public',
  allowOverwrite: true
        });

        const fileName = `${sku}.webp`;
        const postSlug = sku.toLowerCase();
        const blobUrl = blob.url;

        // Step 2: Connect to WordPress server and register attachment
        const conn = new Client();

        conn.on('ready', () => {
            // Insert attachment + link to product via raw SQL
            const sqlCmd = buildSqlCmd(sku, postSlug, blobUrl);

            conn.exec(sqlCmd, (execErr, stream) => {
                if (execErr) return handleError(res, conn, execErr);

                let sqlOutput = '';
                stream.on('data', d => { sqlOutput += d.toString(); });
                stream.stderr.on('data', d => { sqlOutput += d.toString(); });

                stream.on('close', (code) => {
                    if (code !== 0 || sqlOutput.includes('ERROR')) {
                        conn.end();
                        return res.status(500).json({ success: false, error: sqlOutput.trim() });
                    }

                                        // Step 3: Regenerate metadata using built-in WP-CLI
                    const regenCmd = `cd ${WP_PATH} && wp media regenerate $(wp post list --post_type=attachment --name="${postSlug}" --format=ids) --yes`;

                    conn.exec(regenCmd, (regenErr, regenStream) => {
                        if (regenErr) {
                            conn.end();
                            return res.status(500).json({ success: false, error: regenErr.message });
                        }

                        let regenOutput = '';
                        regenStream.on('data', d => { regenOutput += d.toString(); });
                        regenStream.stderr.on('data', d => { regenOutput += d.toString(); });

                        regenStream.on('close', (regenCode) => {
                            conn.end();

                            if (regenCode !== 0 || regenOutput.includes('ERROR')) {
                                return res.status(500).json({
                                    success: false,
                                    error: `SQL succeeded but metadata generation failed: ${regenOutput.trim()}`,
                                });
                            }

                            res.json({
                                success: true,
                                message: `Successfully linked image to product SKU: ${sku}`,
                                imageUrl: blobUrl,
                            });
                        });
                    });
                });
            });
        }).connect(SSH_CONFIG);

    } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
}

module.exports = { uploadToWp };