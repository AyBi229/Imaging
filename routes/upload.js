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
const imageRole = req.body.imageRole || 'featured';

    if (!file || !sku) {
        return res.status(400).json({ success: false, error: 'Missing file or SKU data.' });
    }

    try {
        // Step 1: Upload image to Vercel Blob
        const blob = await put(file.originalname, file.buffer, {
            access: 'public',
            allowOverwrite: true,
        });

        const postSlug = sku.toLowerCase();
        const blobUrl = blob.url;

        // Step 2: Connect to WordPress server and register attachment via SQL
        const conn = new Client();

        conn.on('ready', () => {
            const fileName = file.originalname;
            const sqlCmd = buildSqlCmd(sku, postSlug, fileName, imageRole);

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

                    // Step 3: Generate WordPress attachment metadata
                    //
                    // Notes on what changed vs the previous version:
                    //   - Removed `define("ABSPATH", ...)` — wp-load.php defines it internally;
                    //     redefining it beforehand can cause a fatal "cannot redefine constant" error.
                    //   - Replaced file_get_contents() with curl — many hosts disable
                    //     allow_url_fopen, which silently makes file_get_contents return false
                    //     for remote URLs.
                    //   - Changed 2>/dev/null → 2>&1 so PHP fatal errors surface in regenOutput
                    //     instead of being swallowed.
                    const regenCmd = `php -r '
                        require "${WP_PATH}/wp-load.php";

                        $att_id = (int) $wpdb->get_var($wpdb->prepare(
                            "SELECT ID FROM wp_posts WHERE post_name = %s AND post_type = \\"attachment\\" ORDER BY ID DESC LIMIT 1",
                            "${postSlug}"
                        ));
                        if (!$att_id) { echo "ERROR: attachment not found\\n"; exit(1); }

                        $file_path = get_attached_file($att_id);
                        if (!$file_path) { echo "ERROR: file path missing\\n"; exit(1); }

                        if (!file_exists(dirname($file_path))) {
                            mkdir(dirname($file_path), 0755, true);
                        }

                        $ch = curl_init("${blobUrl}");
                        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
                        curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
                        curl_setopt($ch, CURLOPT_TIMEOUT, 30);
                        $image_data = curl_exec($ch);
                        $curl_error = curl_error($ch);
                        curl_close($ch);

                        if (!$image_data) {
                            echo "ERROR: could not download image from Vercel: $curl_error\\n";
                            exit(1);
                        }

                        file_put_contents($file_path, $image_data);

                        require_once ABSPATH . "wp-admin/includes/image.php";
                        $meta = wp_generate_attachment_metadata($att_id, $file_path);
                        wp_update_attachment_metadata($att_id, $meta);

                        echo "OK:$att_id\\n";
                    ' 2>&1`;

                    conn.exec(regenCmd, (regenErr, regenStream) => {
                        if (regenErr) return handleError(res, conn, regenErr);

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