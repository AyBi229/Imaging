const { Client } = require('ssh2');
const { SSH_CONFIG, WP_PATH } = require('../config');

function handleError(res, conn, err) {
    if (conn) conn.end();
    return res.status(500).json({ success: false, error: err.message });
}

async function saveAttributes(req, res) {
    const { productIds, attributes } = req.body;

    if (!Array.isArray(productIds) || !productIds.length || !Array.isArray(attributes) || !attributes.length) {
        return res.status(400).json({ success: false, error: 'Missing productIds or attributes.' });
    }

    const phpIdsArray = 'array(' + productIds.map(id => parseInt(id, 10)).join(',') + ')';

    const phpAttrsArray = 'array(' + attributes.map(attr => {
        const escapedId   = attr.id.replace(/'/g, "\\'");
        const escapedOpts = (attr.options || [])
            .map(o => `"${String(o).replace(/"/g, '\\"')}"`)
            .join(',');
        return `array("id" => "${escapedId}", "options" => array(${escapedOpts}))`;
    }).join(',') + ')';

    const conn = new Client();

    conn.on('ready', () => {
        const cmd = `php -r '
            require "${WP_PATH}/wp-load.php";

            $product_ids = ${phpIdsArray};
            $incoming    = ${phpAttrsArray};
            $saved       = array();
            $errors      = array();

            foreach ($product_ids as $pid) {
                $product = wc_get_product($pid);
                if (!$product) {
                    $errors[] = "Product $pid not found.";
                    continue;
                }

                $existing = $product->get_attributes();

                foreach ($incoming as $item) {
                    $taxonomy = $item["id"];
                    $options  = $item["options"];

                    if (empty($options) || $options === array("")) continue;

                    if (taxonomy_exists($taxonomy)) {
                        $term_ids = array();
                        foreach ($options as $opt) {
                            $term = get_term_by("name", $opt, $taxonomy);
                            if (!$term) {
                                $new = wp_insert_term($opt, $taxonomy);
                                if (!is_wp_error($new)) $term_ids[] = $new["term_id"];
                            } else {
                                $term_ids[] = $term->term_id;
                            }
                        }
                        wp_set_object_terms($pid, $term_ids, $taxonomy);

                        $attr = isset($existing[$taxonomy])
                            ? $existing[$taxonomy]
                            : new WC_Product_Attribute();

                        $attr->set_id(wc_attribute_taxonomy_id_by_name($taxonomy));
                        $attr->set_name($taxonomy);
                        $attr->set_options($term_ids);
                        $attr->set_visible(true);
                        $attr->set_variation(false);
                        $existing[$taxonomy] = $attr;

                    } else {
                        $attr = isset($existing[$taxonomy])
                            ? $existing[$taxonomy]
                            : new WC_Product_Attribute();

                        $attr->set_name($taxonomy);
                        $attr->set_options($options);
                        $attr->set_visible(true);
                        $attr->set_variation(false);
                        $existing[$taxonomy] = $attr;
                    }
                }

                $product->set_attributes($existing);
                $product->save();
                $saved[] = $pid;
            }

            echo json_encode(["saved" => $saved, "errors" => $errors]);
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
                    if (parsed.error) return res.status(500).json({ success: false, error: parsed.error });
                    res.json({ success: true, saved: parsed.saved, errors: parsed.errors });
                } catch (e) {
                    res.status(500).json({ success: false, error: `Unexpected output: ${output.trim()}` });
                }
            });
        });
    }).on('error', err => handleError(res, null, err))
      .connect(SSH_CONFIG);
}

module.exports = { saveAttributes };
