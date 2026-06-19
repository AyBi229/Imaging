const { DB_CONFIG } = require('../config');

function buildSqlCmd(sku, postSlug, relativeWpPath) {
    return `
MYCNF=$(mktemp /tmp/my.cnf.XXXXXX)
cat > "$MYCNF" << 'MYCNF_EOF'
[client]
user=${DB_CONFIG.user}
password=${DB_CONFIG.password}
MYCNF_EOF
chmod 600 "$MYCNF"

MYSQL="mysql --defaults-file=$MYCNF ${DB_CONFIG.database} -se"

# Find the Product ID via SKU
PRODUCT_ID=$($MYSQL "SELECT post_id FROM wp_postmeta WHERE meta_key='_sku' AND meta_value='${sku}' LIMIT 1;")

if [ -z "$PRODUCT_ID" ]; then
    rm -f "$MYCNF"
    echo "ERROR: Product with SKU '${sku}' not found in database."
    exit 1
fi

# Delete any existing attachment with this post_name to avoid duplicates
$MYSQL "DELETE FROM wp_posts WHERE post_name='${postSlug}' AND post_type='attachment';"

# Insert the attachment row — all NOT NULL fields provided explicitly
$MYSQL "INSERT INTO wp_posts (post_author, post_date, post_date_gmt, post_content, post_excerpt, post_title, post_status, comment_status, ping_status, post_name, to_ping, pinged, post_modified, post_modified_gmt, post_content_filtered, post_type, post_mime_type) VALUES (1, NOW(), NOW(), '', '', '${sku}', 'inherit', 'closed', 'closed', '${postSlug}', '', '', NOW(), NOW(), '', 'attachment', 'image/webp');"

# Fetch the attachment ID by post_name — avoids LAST_INSERT_ID() cross-session issues
ATTACHMENT_ID=$($MYSQL "SELECT ID FROM wp_posts WHERE post_name='${postSlug}' AND post_type='attachment' ORDER BY ID DESC LIMIT 1;")

if [ -z "$ATTACHMENT_ID" ] || [ "$ATTACHMENT_ID" -eq 0 ]; then
    rm -f "$MYCNF"
    echo "ERROR: Failed to register image in wp_posts table."
    exit 1
fi

# Save the file path metadata
$MYSQL "INSERT INTO wp_postmeta (post_id, meta_key, meta_value) VALUES ($ATTACHMENT_ID, '_wp_attached_file', '${relativeWpPath}') ON DUPLICATE KEY UPDATE meta_value='${relativeWpPath}';"

# THE FIX: Wipe out any old duplicate zombie thumbnail links for this product first
$MYSQL "DELETE FROM wp_postmeta WHERE post_id = $PRODUCT_ID AND meta_key = '_thumbnail_id';"

# Now bind the clean, solitary thumbnail image reference safely
$MYSQL "INSERT INTO wp_postmeta (post_id, meta_key, meta_value) VALUES ($PRODUCT_ID, '_thumbnail_id', '$ATTACHMENT_ID');"

rm -f "$MYCNF"
echo "SUCCESS:$PRODUCT_ID"
`;
}

module.exports = { buildSqlCmd };
