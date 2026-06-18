const https = require('https');

const SERPAPI_KEY = process.env.SERPAPI_KEY;

/**
 * POST /search-product-images
 * Body: { sku: string }
 * Returns: { images: string[] } — up to 5 public image URLs
 */
async function searchProductImages(req, res) {
    const { sku } = req.body;

    if (!sku || typeof sku !== 'string' || !sku.trim()) {
        return res.status(400).json({ success: false, error: 'Missing or invalid SKU.' });
    }

    if (!SERPAPI_KEY) {
        return res.status(500).json({ success: false, error: 'SerpApi credentials not configured.' });
    }

    try {
        const query = encodeURIComponent(sku.trim());
        const url   = `https://serpapi.com/search.json?engine=google_images&q=${query}&api_key=${SERPAPI_KEY}`;

        const data = await fetchJson(url);

        if (!data.images_results || data.images_results.length === 0) {
            return res.json({ success: true, images: [] });
        }

        const images = data.images_results
            .slice(0, 5)
            .map(item => item.original)
            .filter(Boolean);

        return res.json({ success: true, images });

    } catch (err) {
        console.error('[searchProductImages]', err);
        return res.status(500).json({ success: false, error: err.message });
    }
}

function fetchJson(url) {
    return new Promise((resolve, reject) => {
        https.get(url, (response) => {
            let raw = '';
            response.on('data', chunk => raw += chunk);
            response.on('end', () => {
                try {
                    const parsed = JSON.parse(raw);
                    if (parsed.error) reject(new Error(parsed.error));
                    else resolve(parsed);
                } catch (e) {
                    reject(new Error('Failed to parse SerpApi response'));
                }
            });
        }).on('error', reject);
    });
}

module.exports = { searchProductImages };