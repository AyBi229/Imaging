const fs = require('fs');
const { Client } = require('ssh2');
const { SSH_CONFIG, WP_PATH, UPLOADS_SUBDIR } = require('../config');
const { buildSqlCmd } = require('../ssh/buildSqlCmd');

function handleError(res, conn, err) {
    conn.end();
    return res.status(500).json({ success: false, error: err.message });
}

function uploadToWp(req, res) {
    const file = req.file;
    const sku  = req.body.sku;

    if (!file || !sku) {
        return res.status(400).json({ success: false, error: 'Missing file or SKU data.' });
    }

    const conn = new Client();

    conn.on('ready', () => {
        const fileName       = `${sku}.webp`;
        const remoteDestPath = `${WP_PATH}/${UPLOADS_SUBDIR}/${fileName}`;  // full absolute path for SFTP
        const relativeWpPath = fileName;                                     // just the filename for _wp_attached_file
        const postSlug       = sku.toLowerCase();

        conn.sftp((err, sftp) => {
            if (err) return handleError(res, conn, err);

            // Step 1: upload the file via SFTP
            sftp.fastPut(file.path, remoteDestPath, (sftpErr) => {
                if (sftpErr) return handleError(res, conn, sftpErr);

                // Step 2: insert attachment + link to product via raw SQL
                const sqlCmd = buildSqlCmd(sku, postSlug, relativeWpPath);

                conn.exec(sqlCmd, (execErr, stream) => {
                    if (execErr) return handleError(res, conn, execErr);

                    let sqlOutput = '';
                    stream.on('data', d => { sqlOutput += d.toString(); });
                    stream.stderr.on('data', d => { sqlOutput += d.toString(); });

                    stream.on('close', (code) => {
                        // Clean up local temp file regardless of outcome
                        if (fs.existsSync(file.path)) fs.unlinkSync(file.path);

                        if (code !== 0 || sqlOutput.includes('ERROR')) {
                            conn.end();
                            return res.status(500).json({ success: false, error: sqlOutput.trim() });
                        }

                        // Step 3: generate _wp_attachment_metadata via PHP directly —
                        // avoids WP-CLI deprecation noise and exit code issues.
                        // _wp_attached_file is just the filename, so get_attached_file()
                        // correctly resolves to basedir/filename without doubling the path.
                        const regenCmd = `php -r '
define("ABSPATH", "${WP_PATH}/");
require "${WP_PATH}/wp-load.php";
$att_id = (int) $wpdb->get_var($wpdb->prepare(
    "SELECT ID FROM wp_posts WHERE post_name = %s AND post_type = \\"attachment\\" ORDER BY ID DESC LIMIT 1",
    "${postSlug}"
));
if (!$att_id) { echo "ERROR: attachment not found\\n"; exit(1); }
$file = get_attached_file($att_id);
if (!file_exists($file)) { echo "ERROR: file not found at $file\\n"; exit(1); }
require_once ABSPATH . "wp-admin/includes/image.php";
$meta = wp_generate_attachment_metadata($att_id, $file);
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
                                });
                            });
                        });
                    });
                });
            });
        });
    }).connect(SSH_CONFIG);
}

module.exports = { uploadToWp };