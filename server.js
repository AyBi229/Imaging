require('dotenv').config();
const { put } = require('@vercel/blob');

const express = require('express');
const multer  = require('multer');
const path    = require('path');

const { uploadToWp }          = require('./routes/upload');
const { searchProductImages } = require('./routes/searchImages');
const { proxyImage }          = require('./routes/proxyImage');

const app    = express();
const upload = multer({ storage: multer.memoryStorage() });

// Parse JSON bodies (needed for the new search endpoint)
app.use(express.json());
app.use(express.static('public'));

// ── Existing routes ──────────────────────────────────────────
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/index.html'));
});

app.post('/upload-to-wp', upload.single('image'), uploadToWp);

// ── New: SKU image search (calls Anthropic API with web search) ──
app.post('/search-product-images', searchProductImages);

// ── New: Image proxy (avoids CORS when loading third-party images) ──
app.get('/proxy-image', proxyImage);

app.post('/check-image-exists', checkImageExists);


// app.listen removed for Render
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});