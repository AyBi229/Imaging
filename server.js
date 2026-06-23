const { checkImageExists } = require('./routes/checkImageExists');
require('dotenv').config();
const { put } = require('@vercel/blob');
const express = require('express');
const multer  = require('multer');
const path    = require('path');
const { uploadToWp }          = require('./routes/upload');
const { proxyImage }          = require('./routes/proxyImage');
const { searchProductImages } = require('./routes/searchImages');
const { searchProductDocs }   = require('./routes/searchDocs');
const { uploadDocToStore }    = require('./routes/uploadDocToStore');
const { getProductBySku }     = require('./routes/getProductBySku');
const { getCategoryAttributes } = require('./routes/getCategoryAttributes');
const { saveAttributes }      = require('./routes/saveAttributes');

const app    = express();
const upload = multer({ storage: multer.memoryStorage() });

// Parse JSON bodies (needed for the new search endpoint)
app.use(express.json());
app.use(express.static('public'));

// ── Existing routes ──────────────────────────────────────────
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/index.html'));
});

app.post('/upload-to-wp',          upload.single('image'), uploadToWp);
app.post('/search-product-images', searchProductImages);
app.get('/proxy-image',            proxyImage);
app.post('/check-image-exists',    checkImageExists);
app.post('/search-product-docs',   searchProductDocs);
app.post('/upload-doc-to-store',   upload.single('file'), uploadDocToStore);

// ── Attribute routes ─────────────────────────────────────────
app.get('/api/attributes/product',  getProductBySku);
app.get('/api/attributes/category', getCategoryAttributes);
app.put('/api/attributes/save',     saveAttributes);

const PORT = process.env.PORT || 3000;
// app.listen(PORT, () => {
//     console.log(`Server running on port ${PORT}`);
// });
module.exports = app;