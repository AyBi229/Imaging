const { Client } = require('ssh2');
const { SSH_CONFIG, WP_PATH } = require('../config');

function handleError(res, conn, err) {
    if (conn) conn.end();
    return res.status(500).json({ success: false, error: err.message });
}

async function getCategoryAttributes(req, res) {
    const categoryId = parseInt(req.query.id, 10);
    if (!categoryId) return res.status(400).json({ success: false, error: 'Missing or invalid category ID.' });

    const conn = new Client();

    conn.on('ready', () => {
        // Fetches all global WooCommerce product attributes (pa_*) and checks
        // which ones are linked to products in this category via term relationships.
        // WooCommerce doesn't store category→attribute assignments natively, so we
        // derive them by looking at which attributes appear on products in that category.
        const cmd = `php -r '
            require "${WP_PATH}/wp-load.php";

            // Get all products in this category
            $product_ids = get_posts(array(
                "post_type"      => "product",
                "post_status"    => "publish",
                "posts_per_page" => -1,
                "fields"         => "ids",
                "tax_query"      => array(array(
                    "taxonomy" => "product_cat",
                    "field"    => "term_id",
                    "terms"    => ${categoryId},
                )),
            ));

            if (empty($product_ids)) {
                echo json_encode([]);
                exit(0);
            }

            // Collect all attribute taxonomies used by products in this category
            $attr_slugs = array();
            foreach ($product_ids as $pid) {
                $product = wc_get_product($pid);
                if (!$product) continue;
                foreach ($product->get_attributes() as $attr) {
                    if ($attr->is_taxonomy()) {
                        $attr_slugs[$attr->get_name()] = true;
                    }
                }
            }

            // Build attribute definitions
            $result = array();
            foreach (array_keys($attr_slugs) as $taxonomy) {
                $attr_obj = wc_get_attribute(wc_attribute_taxonomy_id_by_name($taxonomy));
                if (!$attr_obj) continue;

                $terms = get_terms(array("taxonomy" => $taxonomy, "hide_empty" => false));
                $options = array();
                if (!is_wp_error($terms)) {
                    foreach ($terms as $term) { $options[] = $term->name; }
                }

                $result[] = array(
                    "id"       => $taxonomy,
                    "label"    => $attr_obj->name,
                    "type"     => count($options) ? "select" : "text",
                    "options"  => $options,
                    "required" => false,
                );
            }

            echo json_encode($result);
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
                    res.json({ success: true, attributes: parsed });
                } catch (e) {
                    res.status(500).json({ success: false, error: `Unexpected output: ${output.trim()}` });
                }
            });
        });
    }).on('error', err => handleError(res, null, err))
      .connect(SSH_CONFIG);
}

module.exports = { getCategoryAttributes };
