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
            echo $id > 0 ? "EXISTS" : "NOT_FOUND";
        ' 2>/dev/null`;

        conn.exec(cmd, (err, stream) => {
            if (err) { conn.end(); return res.json({ exists: false }); }

            let out = '';
            stream.on('data', d => { out += d.toString(); });
            stream.on('close', () => {
                conn.end();
                res.json({ exists: out.includes('EXISTS') });
            });
        });
    }).connect(SSH_CONFIG);
}

module.exports = { checkImageExists };