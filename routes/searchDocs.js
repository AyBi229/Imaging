const https = require('https');

const SERPAPI_KEY = process.env.SERPAPI_KEY;

/**
 * POST /search-product-docs
 * Body: { sku: string }
 * Returns: { success: true, docs: [{ name, url }] } — up to 5 PDF/doc links
 *
 * Uses SerpApi's regular Google search restricted to filetype:pdf,
 * since Google Images search (used for /search-product-images) doesn't
 * return document results.
 */
async function searchProductDocs(req, res) {
    const { sku } = req.body;

    if (!sku || typeof sku !== 'string' || !sku.trim()) {
        return res.status(400).json({ success: false, error: 'Missing or invalid SKU.' });
    }

    if (!SERPAPI_KEY) {
        return res.status(500).json({ success: false, error: 'SerpApi credentials not configured.' });
    }

    try {
        const query = encodeURIComponent(`${sku.trim()} filetype:pdf`);
        const url   = `https://serpapi.com/search.json?engine=google&q=${query}&api_key=${SERPAPI_KEY}`;

        const data = await fetchJson(url);

        const results = data.organic_results || [];

        const docs = results
            .slice(0, 5)
            .map(item => ({
                name: item.title || item.link,
                url:  item.link,
            }))
            .filter(doc => Boolean(doc.url));

        return res.json({ success: true, docs });

    } catch (err) {
        console.error('[searchProductDocs]', err);
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

module.exports = { searchProductDocs };
