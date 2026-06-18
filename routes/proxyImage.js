const https = require('https');
const http  = require('http');
const { URL } = require('url');

/**
 * GET /proxy-image?url=<encoded-url>
 * Fetches the remote image server-side and pipes it back to the browser.
 * This avoids CORS restrictions when loading third-party images.
 *
 * Security: only allows http/https schemes and caps response at 10 MB.
 */
function proxyImage(req, res) {
    const rawUrl = req.query.url;

    if (!rawUrl) {
        return res.status(400).send('Missing url parameter.');
    }

    let parsed;
    try {
        parsed = new URL(rawUrl);
    } catch {
        return res.status(400).send('Invalid URL.');
    }

    if (!['http:', 'https:'].includes(parsed.protocol)) {
        return res.status(400).send('Only http/https URLs are allowed.');
    }

    const transport = parsed.protocol === 'https:' ? https : http;
    const options = {
        hostname: parsed.hostname,
        port:     parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
        path:     parsed.pathname + parsed.search,
        method:   'GET',
        headers: {
            // Mimic a browser to avoid bot-blocking
            'User-Agent': 'Mozilla/5.0 (compatible; ImageProxy/1.0)',
            'Accept':     'image/*,*/*;q=0.8'
        },
        timeout: 10000
    };

    const upstream = transport.request(options, (upstreamRes) => {
        // Follow one level of redirect
        if ([301, 302, 303, 307, 308].includes(upstreamRes.statusCode) && upstreamRes.headers.location) {
            return proxyImage(
                { query: { url: upstreamRes.headers.location } },
                res
            );
        }

        const contentType = upstreamRes.headers['content-type'] || 'application/octet-stream';

        if (!contentType.startsWith('image/')) {
            return res.status(502).send('Remote resource is not an image.');
        }

        res.setHeader('Content-Type', contentType);
        res.setHeader('Cache-Control', 'public, max-age=86400'); // cache 24h in browser
        res.setHeader('X-Content-Type-Options', 'nosniff');

        let bytesReceived = 0;
        const MAX_BYTES = 10 * 1024 * 1024; // 10 MB cap

        upstreamRes.on('data', (chunk) => {
            bytesReceived += chunk.length;
            if (bytesReceived > MAX_BYTES) {
                res.destroy();
                return upstream.destroy();
            }
            res.write(chunk);
        });

        upstreamRes.on('end', () => res.end());
        upstreamRes.on('error', (err) => {
            console.error('[proxyImage] upstream read error:', err.message);
            if (!res.headersSent) res.status(502).send('Error reading upstream image.');
        });
    });

    upstream.on('error', (err) => {
        console.error('[proxyImage] request error:', err.message);
        if (!res.headersSent) res.status(502).send('Could not reach image source.');
    });

    upstream.on('timeout', () => {
        upstream.destroy();
        if (!res.headersSent) res.status(504).send('Image fetch timed out.');
    });

    upstream.end();
}

module.exports = { proxyImage };