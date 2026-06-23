const { Client } = require('ssh2');
const { SSH_CONFIG, WP_PATH } = require('../config');

function handleError(res, conn, err) {
    if (conn) conn.end();
    return res.status(500).json({ success: false, error: err.message });
}

async function getProductBySku(req, res) {
    const { sku } = req.query;
    if (!sku) return res.status(400).json({ success: false, error: 'Missing SKU.' });

    const conn = new Client();

    conn.on('ready', () => {
        const cmd = `php -r '
            require "${WP_PATH}/wp-load.php";

            $args = array(
                "post_type"      => "product",
                "post_status"    => "any",
                "posts_per_page" => 1,
                "meta_query"     => array(array(
                    "key"   => "_sku",
                    "value" => "${sku.replace(/'/g, "\\'")}",
                )),
            );
            $query = new WP_Query($args);
            if (!$query->have_posts()) {
                echo json_encode(["error" => "No product found with SKU: ${sku.replace(/'/g, "\\'")}"]);
                exit(1);
            }

            $post    = $query->posts[0];
            $product = wc_get_product($post->ID);
            if (!$product || $product->get_type() !== "grouped") {
                echo json_encode(["error" => "Product is not a grouped product."]);
                exit(1);
            }

            $categories = get_the_terms($post->ID, "product_cat");
            $cat = ($categories && !is_wp_error($categories)) ? $categories[0] : null;

            // Fetch children
            $child_ids = $product->get_children();
            $children  = array();
            foreach ($child_ids as $child_id) {
                $child = wc_get_product($child_id);
                if (!$child) continue;
                $children[] = array(
                    "id"   => $child_id,
                    "name" => $child->get_name(),
                    "sku"  => $child->get_sku(),
                );
            }

            echo json_encode([
                "id"           => $post->ID,
                "name"         => $post->post_title,
                "sku"          => $product->get_sku(),
                "categoryId"   => $cat ? $cat->term_id : null,
                "categoryName" => $cat ? $cat->name    : "Uncategorized",
                "children"     => $children,
            ]);
        ' 2>&1`;

        conn.exec(cmd, (err, stream) => {
            if (err) return handleError(res, conn, err);

            let output = '';
            stream.on('data', d => { output += d.toString(); });
            stream.stderr.on('data', d => { output += d.toString(); });

            stream.on('close', () => {
                conn.end();
                try {
                    const parsed = JSON.parse(output.trim());
                    if (parsed.error) return res.status(404).json({ success: false, error: parsed.error });
                    res.json({ success: true, product: parsed });
                } catch (e) {
                    res.status(500).json({ success: false, error: `Unexpected output: ${output.trim()}` });
                }
            });
        });
    }).on('error', err => handleError(res, null, err))
      .connect(SSH_CONFIG);
}

module.exports = { getProductBySku };
