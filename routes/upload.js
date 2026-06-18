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

                    // Step 3: Regenerate WordPress metadata
                                        // Step 3: Generate WordPress attachment metadata by fetching the remote image
                    const regenCmd = `php -r '
                        define("ABSPATH", "${WP_PATH}/");
                        require "${WP_PATH}/wp-load.php";
                        $att_id = (int) $wpdb->get_var($wpdb->prepare(
                            "SELECT ID FROM wp_posts WHERE post_name = %s AND post_type = \"attachment\" ORDER BY ID DESC LIMIT 1",
                            "${postSlug}"
                        ));
                        if (!$att_id) { echo "ERROR: attachment not found\\n"; exit(1); }

                        // Get the actual file path registered in the DB
                        $file_path = get_attached_file($att_id);
                        if (!$file_path) { echo "ERROR: file path missing\\n"; exit(1); }

                        // Make sure directories exist
                        if (!file_exists(dirname($file_path))) {
                            mkdir(dirname($file_path), 0755, true);
                        }

                        // Download a temporary local copy from Vercel so PHP can read its dimensions
                        $image_data = file_get_contents("${blobUrl}");
                        if (!$image_data) { echo "ERROR: could not download image from Vercel\\n"; exit(1); }
                        file_put_contents($file_path, $image_data);

                        require_once ABSPATH . "wp-admin/includes/image.php";
                        $meta = wp_generate_attachment_metadata($att_id, $file_path);
                        wp_update_attachment_metadata($att_id, $meta);

                        echo "OK:$att_id\\n";
                        ' 2>/dev/null`;

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