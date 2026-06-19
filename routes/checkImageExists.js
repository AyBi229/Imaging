const { Client } = require('ssh2');
const { SSH_CONFIG, WP_PATH } = require('../config');

async function checkImageExists(req, res) {
    const { sku } = req.body;
    if (!sku) return res.status(400).json({ error: 'Missing SKU.' });

    const postSlug = sku.toLowerCase();
    const conn = new Client();

    conn.on('ready', () => {
        const cmd = `php -r '
            require "${WP_PATH}/wp-load.php";
            $id = (int) $wpdb->get_var($wpdb->prepare(
                "SELECT ID FROM wp_posts WHERE post_name = %s AND post_type = \\"attachment\\" LIMIT 1",
                "${postSlug}"
            ));
            if ($id === 0) { echo "NOT_FOUND"; exit; }
            $file_path = get_attached_file($id);
            if (!$file_path || !file_exists($file_path) || filesize($file_path) === 0) {
                echo "CORRUPT";
            } else {
                echo "EXISTS";
            }
        ' 2>/dev/null`;

        conn.exec(cmd, (err, stream) => {
            if (err) { conn.end(); return res.json({ exists: false, corrupt: false }); }

            let out = '';
            stream.on('data', d => { out += d.toString(); });
            stream.on('close', () => {
                conn.end();
                const trimmed = out.trim();
                res.json({
                    exists:  trimmed === 'EXISTS' || trimmed === 'CORRUPT',
                    corrupt: trimmed === 'CORRUPT',
                });
            });
        });
    }).connect(SSH_CONFIG);
}

module.exports = { checkImageExists };