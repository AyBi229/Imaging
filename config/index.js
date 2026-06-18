const fs = require('fs');
const path = require('path');

const SSH_CONFIG = {
    host: '51.77.102.88',
    username: 'teledyne',
    privateKey: fs.readFileSync(path.join(__dirname, '../keys/id_ed25519')),
};

const WP_PATH = '/home/teledyne/domains/store.local/public_html';
const UPLOADS_SUBDIR = 'wp-content/uploads';

const DB_CONFIG = {
    user: 'teledyne3',
    password: '3zSYNLMzOcSbUxL',
    database: 'ecommerce_wordpress'
};

module.exports = { SSH_CONFIG, WP_PATH, UPLOADS_SUBDIR, DB_CONFIG };
