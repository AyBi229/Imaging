#!/usr/bin/env bash
set -euo pipefail

# ── Create new directories ────────────────────────────────────────────────────
mkdir -p public/js

# ── public/index.html ────────────────────────────────────────────────────────
cat > public/index.html << 'HTMLEOF'
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>WooCommerce SKU Image Pipeline</title>
    <link rel="stylesheet" href="/css/styles.css">
</head>
<body>

    <h2>WooCommerce SKU Image Pipeline</h2>

    <!-- MODULE 1: SKU Image Finder -->
    <div class="finder-section">
        <h3>Find Product Image by SKU</h3>
        <p>Search the web for the best matching product image, pick one, then load it directly into the pipeline below.</p>
        <div class="finder-row">
            <input type="text" id="skuSearchInput" placeholder="e.g. CRD-TC5A-2SC1B-B" autocomplete="off" spellcheck="false">
            <button id="searchBtn">Search</button>
        </div>
        <div id="searchStatus"></div>
        <div id="imageGrid">
            <div class="grid-label">Top results — click to select</div>
            <div class="grid-wrap" id="gridWrap"></div>
            <div id="confirmBar">
                <img id="confirmThumb" class="preview-thumb" src="" alt="Selected">
                <div class="confirm-text">Use this image? It will be loaded into the paste pipeline below.</div>
                <button id="confirmBtn">Use this image ↓</button>
            </div>
            <button id="copyImageBtn">📋 Copy Image to Clipboard</button>
        </div>
    </div>

    <hr class="divider">

    <!-- MODULE 2: Smart Crop to 1:1 -->
    <div class="crop-section">
        <h3>Crop Non-Square Image to 1:1</h3>
        <p>Upload, drag &amp; drop, or paste (Ctrl+V) any image ≥1000px on its shortest side. Either draw a square crop area, or use "Fit without cropping" to keep the whole image and pad it to a square instead.</p>

        <div class="output-settings">
            <label for="outputResolution">Output canvas size (px)</label>
            <div class="output-settings-row">
                <input type="number" id="outputResolution" value="1000" min="1000" step="50">
                <span class="output-settings-hint">
                    Used by "Fit without cropping" below, and as the final size for anything sent to the pipeline.
                    Minimum 1000px. Larger images are scaled down to fit; smaller ones are kept at full quality
                    and centered on a white background.
                </span>
            </div>
        </div>

        <div id="cropDropZone" tabindex="0">
            <strong>Click to upload</strong>, drag &amp; drop, or paste (Ctrl+V) an image here
            <br><small style="color:#adb5bd; margin-top:6px; display:block;">JPG, PNG, WebP — shortest side must be ≥ 1000 px</small>
        </div>
        <input type="file" id="cropFileInput" accept="image/*">

        <div id="cropWorkspace">
            <div id="cropInfo">Original: <span id="cropOrigDims">—</span> &nbsp;|&nbsp; Selection: <span id="cropSelDims">none</span></div>
            <div id="cropContainer">
                <canvas id="cropCanvas"></canvas>
                <div id="cropSelection">
                    <div class="crop-handle tl" data-handle="tl"></div>
                    <div class="crop-handle tr" data-handle="tr"></div>
                    <div class="crop-handle bl" data-handle="bl"></div>
                    <div class="crop-handle br" data-handle="br"></div>
                    <div id="cropSizeLabel">0 × 0</div>
                </div>
            </div>
            <div id="cropControls">
                <span class="crop-hint">Drag to draw a crop area. Hold <kbd>Shift</kbd> to force square.</span>
                <button id="cropFitBtn">Fit without cropping →</button>
                <button id="cropResetBtn">Reset</button>
                <button id="cropApplyBtn" disabled>Preview Crop →</button>
            </div>
            <div id="cropPreviewPanel">
                <div class="preview-header">⚠ Confirm crop — review before applying</div>
                <div class="crop-compare">
                    <div class="crop-compare-item">
                        <canvas id="cropBeforeThumb"></canvas>
                        <div class="compare-label">Original (crop highlighted)</div>
                    </div>
                    <div class="crop-compare-arrow">→</div>
                    <div class="crop-compare-item">
                        <canvas id="cropAfterThumb"></canvas>
                        <div class="compare-label">Cropped 1:1 result</div>
                    </div>
                </div>
                <div class="crop-confirm-btns">
                    <button id="cropConfirmYes">✓ Apply &amp; send to pipeline</button>
                    <button id="cropConfirmNo">✗ Go back &amp; adjust</button>
                </div>
            </div>
            <div id="cropStatus"></div>
        </div>
    </div>

    <hr class="divider">

    <!-- MODULE 3: Paste Pipeline -->
    <p>Paste a 1:1 image. The input field text is used as the product SKU to locate and update items on <code>store.local</code> automatically.</p>

    <div class="paste-zone" id="pasteZone">
        <strong>Click to upload</strong> or drag &amp; drop — or press <strong>Ctrl+V</strong> / <strong>Cmd+V</strong> to paste.
        <br><br>
        <small style="color: #666;">Requirements: Exactly 1:1 aspect ratio &amp; minimum 1000×1000 pixels.</small>
    </div>

    <input type="file" id="myFileInput" accept="image/*" style="display:none">
    <div id="error-msg"></div>

    <div class="download-controls" id="downloadControls">
        <div class="input-group">
            <label for="customFileName">Product SKU Target:</label>
            <input type="text" id="customFileName" value="CRD-TC5A-2SC1B-B">
        </div>
        <div class="btn-group">
            <a id="downloadLink" class="btn">Download WebP</a>
            <button id="uploadBtn" class="btn">Upload to store.local</button>
        </div>
    </div>

    <div id="statusDisplay"></div>

    <!-- Scripts (order matters: shared → modules) -->
    <script src="/js/shared.js"></script>
    <script src="/js/skuFinder.js"></script>
    <script src="/js/cropModule.js"></script>
    <script src="/js/pipeline.js"></script>
</body>
</html>
HTMLEOF

# ── public/css/styles.css ────────────────────────────────────────────────────
mkdir -p public/css
cat > public/css/styles.css << 'CSSEOF'
body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    max-width: 600px;
    margin: 40px auto;
    padding: 0 20px;
    color: #333;
}

/* ── SKU Image Finder ─────────────────────────────── */
.finder-section {
    background: #f8f9fa;
    border: 1px solid #dee2e6;
    border-radius: 8px;
    padding: 20px;
    margin-bottom: 28px;
}
.finder-section h3 { margin: 0 0 4px 0; font-size: 1em; color: #495057; }
.finder-section p  { margin: 0 0 14px 0; font-size: 0.85em; color: #868e96; }

.finder-row { display: flex; gap: 8px; }
.finder-row input {
    flex: 1;
    padding: 9px 12px;
    border: 1px solid #ccc;
    border-radius: 4px;
    font-size: 1em;
    font-family: inherit;
}
.finder-row input:focus {
    outline: none;
    border-color: #007bff;
    box-shadow: 0 0 0 2px rgba(0,123,255,0.15);
}
#searchBtn {
    padding: 9px 18px;
    background: #007bff;
    color: white;
    border: none;
    border-radius: 4px;
    font-size: 1em;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
}
#searchBtn:hover    { background: #0056b3; }
#searchBtn:disabled { background: #6ea8fe; cursor: not-allowed; }

#searchStatus { margin-top: 10px; font-size: 0.88em; color: #6c757d; min-height: 18px; }

#imageGrid { display: none; margin-top: 16px; }
.grid-label {
    font-size: 0.82em;
    font-weight: 600;
    color: #495057;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    margin-bottom: 8px;
}
.grid-wrap { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; }
.grid-thumb {
    aspect-ratio: 1;
    border-radius: 5px;
    overflow: hidden;
    cursor: pointer;
    border: 2px solid transparent;
    transition: border-color 0.15s, transform 0.15s;
    background: #e9ecef;
    position: relative;
}
.grid-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
.grid-thumb:hover  { border-color: #007bff; transform: scale(1.04); }
.grid-thumb.selected { border-color: #007bff; box-shadow: 0 0 0 2px rgba(0,123,255,0.3); }
.grid-thumb .check {
    display: none;
    position: absolute;
    top: 4px; right: 4px;
    background: #007bff;
    color: white;
    border-radius: 50%;
    width: 20px; height: 20px;
    font-size: 12px;
    align-items: center;
    justify-content: center;
}
.grid-thumb.selected .check { display: flex; }

#confirmBar {
    display: none;
    margin-top: 12px;
    padding: 12px;
    background: #e7f3ff;
    border: 1px solid #b3d4ff;
    border-radius: 6px;
    align-items: center;
    gap: 10px;
}
#confirmBar .preview-thumb {
    width: 48px; height: 48px;
    border-radius: 4px;
    object-fit: cover;
    flex-shrink: 0;
    border: 1px solid #b3d4ff;
}
#confirmBar .confirm-text { flex: 1; font-size: 0.88em; color: #004085; }
#confirmBtn {
    padding: 8px 16px;
    background: #007bff;
    color: white;
    border: none;
    border-radius: 4px;
    font-weight: 600;
    cursor: pointer;
    font-size: 0.9em;
}
#confirmBtn:hover { background: #0056b3; }

#copyImageBtn {
    display: none;
    width: 100%;
    margin-top: 10px;
    padding: 10px;
    background: #28a745;
    color: white;
    border: none;
    border-radius: 4px;
    font-size: 0.95em;
    font-weight: 600;
    cursor: pointer;
    text-align: center;
}
#copyImageBtn:hover  { background: #218838; }
#copyImageBtn.copied { background: #155724; }

/* ── Crop Module ─────────────────────────────── */
.crop-section {
    background: #f8f9fa;
    border: 1px solid #dee2e6;
    border-radius: 8px;
    padding: 20px;
    margin-bottom: 28px;
}
.crop-section h3  { margin: 0 0 4px 0; font-size: 1em; color: #495057; }
.crop-section > p { margin: 0 0 14px 0; font-size: 0.85em; color: #868e96; }

#cropDropZone {
    border: 2px dashed #adb5bd;
    border-radius: 6px;
    padding: 28px 20px;
    text-align: center;
    cursor: pointer;
    transition: background 0.2s, border-color 0.2s;
    color: #6c757d;
    font-size: 0.9em;
}
#cropDropZone:hover,
#cropDropZone.drag-over,
#cropDropZone:focus-visible {
    background: #e9f5ff;
    border-color: #007bff;
    color: #007bff;
    outline: none;
}
#cropDropZone strong { color: #495057; }
#cropFileInput { display: none; }

#cropWorkspace { display: none; margin-top: 16px; }
#cropInfo { font-size: 0.82em; color: #6c757d; margin-bottom: 8px; }
#cropInfo span { font-weight: 600; color: #495057; }

#cropContainer {
    position: relative;
    display: inline-block;
    cursor: crosshair;
    line-height: 0;
    border: 1px solid #dee2e6;
    border-radius: 4px;
    overflow: hidden;
    width: 100%;
    max-width: 560px;
}
#cropCanvas { display: block; width: 100%; height: auto; }
#cropSelection {
    position: absolute;
    border: 2px solid #007bff;
    background: rgba(0,123,255,0.08);
    box-shadow: 0 0 0 9999px rgba(0,0,0,0.38);
    display: none;
    pointer-events: none;
}
.crop-handle {
    position: absolute;
    width: 10px; height: 10px;
    background: #007bff;
    border: 2px solid white;
    border-radius: 2px;
}
.crop-handle.tl { top: -5px; left: -5px;   cursor: nwse-resize; pointer-events: all; }
.crop-handle.tr { top: -5px; right: -5px;  cursor: nesw-resize; pointer-events: all; }
.crop-handle.bl { bottom: -5px; left: -5px;  cursor: nesw-resize; pointer-events: all; }
.crop-handle.br { bottom: -5px; right: -5px; cursor: nwse-resize; pointer-events: all; }
#cropSizeLabel {
    position: absolute;
    bottom: 4px; left: 50%;
    transform: translateX(-50%);
    background: rgba(0,0,0,0.6);
    color: white;
    font-size: 11px;
    padding: 2px 6px;
    border-radius: 3px;
    white-space: nowrap;
    pointer-events: none;
}

#cropControls {
    display: flex;
    gap: 8px;
    margin-top: 10px;
    align-items: center;
    flex-wrap: wrap;
}
#cropControls .crop-hint { font-size: 0.82em; color: #6c757d; flex: 1; }
#cropApplyBtn {
    padding: 8px 18px;
    background: #007bff;
    color: white;
    border: none;
    border-radius: 4px;
    font-weight: 600;
    cursor: pointer;
    font-size: 0.9em;
}
#cropApplyBtn:hover    { background: #0056b3; }
#cropApplyBtn:disabled { background: #6ea8fe; cursor: not-allowed; }
#cropFitBtn {
    padding: 8px 18px;
    background: white;
    color: #0d9488;
    border: 1px solid #0d9488;
    border-radius: 4px;
    font-weight: 600;
    cursor: pointer;
    font-size: 0.9em;
}
#cropFitBtn:hover { background: #f0fdfa; }
#cropResetBtn {
    padding: 8px 14px;
    background: transparent;
    color: #6c757d;
    border: 1px solid #ced4da;
    border-radius: 4px;
    font-size: 0.9em;
    cursor: pointer;
}
#cropResetBtn:hover { background: #f1f3f5; }

#cropPreviewPanel {
    display: none;
    margin-top: 14px;
    padding: 14px;
    background: #fff8e1;
    border: 1px solid #ffc107;
    border-radius: 6px;
}
#cropPreviewPanel .preview-header {
    font-size: 0.88em;
    font-weight: 600;
    color: #856404;
    margin-bottom: 10px;
}
.crop-compare {
    display: flex;
    gap: 12px;
    align-items: flex-start;
    margin-bottom: 12px;
}
.crop-compare-item { flex: 1; text-align: center; }
.crop-compare-item canvas {
    width: 100%;
    aspect-ratio: 1;
    object-fit: contain;
    border-radius: 4px;
    border: 1px solid #dee2e6;
    background: #fff;
    display: block;
}
.crop-compare-item .compare-label { font-size: 0.78em; color: #6c757d; margin-top: 4px; }
.crop-compare-arrow {
    display: flex;
    align-items: center;
    padding-top: 30%;
    color: #adb5bd;
    font-size: 1.4em;
    flex-shrink: 0;
}
.crop-confirm-btns { display: flex; gap: 8px; }
#cropConfirmYes {
    flex: 1;
    padding: 9px;
    background: #28a745;
    color: white;
    border: none;
    border-radius: 4px;
    font-weight: 600;
    cursor: pointer;
    font-size: 0.92em;
}
#cropConfirmYes:hover { background: #218838; }
#cropConfirmNo {
    padding: 9px 16px;
    background: transparent;
    color: #6c757d;
    border: 1px solid #ced4da;
    border-radius: 4px;
    font-size: 0.92em;
    cursor: pointer;
}
#cropConfirmNo:hover { background: #f1f3f5; }
#cropStatus { margin-top: 10px; font-size: 0.88em; color: #6c757d; min-height: 18px; }

/* ── Paste Pipeline ─────────────────────────────── */
.paste-zone {
    border: 2px dashed #007bff;
    padding: 40px 20px;
    text-align: center;
    margin: 20px 0;
    background: #f4f9ff;
    border-radius: 8px;
    cursor: pointer;
    transition: background 0.2s ease;
}
.paste-zone:hover     { background: #e6f2ff; }
.paste-zone.highlight { background: #e0f0ff; border-color: #0056b3; }

#myFileInput { margin: 15px 0; display: none; }
#error-msg   { color: #dc3545; font-weight: bold; margin: 15px 0; min-height: 20px; }

.download-controls {
    display: none;
    background: #f8f9fa;
    padding: 20px;
    border-radius: 6px;
    border: 1px solid #ddd;
    margin-top: 15px;
}
.input-group { margin-bottom: 15px; }
.input-group label { display: block; margin-bottom: 5px; font-weight: bold; }
.input-group input {
    width: 100%;
    padding: 8px;
    box-sizing: border-box;
    border: 1px solid #ccc;
    border-radius: 4px;
    font-size: 1em;
}
.btn-group { display: flex; gap: 10px; }
.btn {
    display: inline-block;
    padding: 12px 24px;
    color: white;
    text-decoration: none;
    border-radius: 4px;
    font-weight: bold;
    text-align: center;
    cursor: pointer;
    border: none;
    flex: 1;
    font-size: 1em;
}
#downloadLink        { background: #007bff; }
#downloadLink:hover  { background: #0056b3; }
#uploadBtn           { background: #28a745; }
#uploadBtn:hover     { background: #218838; }
#statusDisplay {
    margin-top: 15px;
    font-weight: bold;
    color: #17a2b8;
    font-size: 1.1em;
}

hr.divider { border: none; border-top: 1px solid #dee2e6; margin: 28px 0 24px; }

/* ── Output resolution control ─────────────────────── */
.output-settings {
    background: #f8f9fa;
    border: 1px solid #dee2e6;
    border-radius: 8px;
    padding: 16px 20px;
    margin: 0 0 16px 0;
}
.output-settings label {
    display: block;
    font-size: 0.85em;
    font-weight: 700;
    color: #495057;
    margin-bottom: 8px;
}
.output-settings-row { display: flex; align-items: flex-start; gap: 14px; flex-wrap: wrap; }
#outputResolution {
    width: 110px;
    padding: 8px 10px;
    border: 1px solid #ccc;
    border-radius: 4px;
    font-size: 1em;
    flex-shrink: 0;
}
#outputResolution:focus {
    outline: none;
    border-color: #007bff;
    box-shadow: 0 0 0 2px rgba(0,123,255,0.15);
}
#outputResolution.clamped { border-color: #dc3545; }
.output-settings-hint { font-size: 0.8em; color: #868e96; flex: 1; min-width: 200px; }
CSSEOF

# ── public/js/shared.js ───────────────────────────────────────────────────────
cat > public/js/shared.js << 'JSEOF'
/**
 * shared.js — globals shared across all three pipeline modules.
 *
 * Exposes:
 *   window.pasteActiveZone   — 'pipeline' | 'crop'
 *   window.getOutputResolution()
 */

window.pasteActiveZone = 'pipeline';

(function () {
    const input       = document.getElementById('outputResolution');
    const MIN_RES     = 1000;

    function getOutputResolution() {
        let val = parseInt(input.value, 10);
        if (isNaN(val) || val < MIN_RES) {
            val = MIN_RES;
            input.value = MIN_RES;
            input.classList.add('clamped');
            setTimeout(() => input.classList.remove('clamped'), 800);
        }
        return val;
    }

    input.addEventListener('change', getOutputResolution);
    input.addEventListener('blur',   getOutputResolution);

    window.getOutputResolution = getOutputResolution;
})();
JSEOF

# ── public/js/skuFinder.js ────────────────────────────────────────────────────
cat > public/js/skuFinder.js << 'JSEOF'
/**
 * skuFinder.js — Module 1: SKU Image Finder
 *
 * Searches for product images by SKU via /search-product-images,
 * lets the user pick one, then copies it to the clipboard so it can
 * be pasted straight into the paste pipeline.
 *
 * Depends on: shared.js (window.pasteActiveZone)
 */

(function () {
    const skuInput     = document.getElementById('skuSearchInput');
    const searchBtn    = document.getElementById('searchBtn');
    const searchStatus = document.getElementById('searchStatus');
    const imageGrid    = document.getElementById('imageGrid');
    const gridWrap     = document.getElementById('gridWrap');
    const confirmBar   = document.getElementById('confirmBar');
    const confirmThumb = document.getElementById('confirmThumb');
    const confirmBtn   = document.getElementById('confirmBtn');
    const copyImageBtn = document.getElementById('copyImageBtn');

    let selectedUrl = null;

    /* ── Helpers ── */
    function setStatus(msg, color) {
        searchStatus.textContent = msg;
        searchStatus.style.color = color || '#6c757d';
    }

    function resetGrid() {
        gridWrap.innerHTML = '';
        confirmBar.style.display   = 'none';
        copyImageBtn.style.display = 'none';
        copyImageBtn.classList.remove('copied');
        selectedUrl = null;
        imageGrid.style.display = 'none';
    }

    /* ── Search ── */
    async function searchImages(sku) {
        resetGrid();
        setStatus('Searching for product images…');
        searchBtn.disabled = true;
        try {
            const res = await fetch('/search-product-images', {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ sku }),
            });
            if (!res.ok) throw new Error(`Server error ${res.status}`);
            const data = await res.json();
            if (!data.images || data.images.length === 0) {
                setStatus('No images found for this SKU. Try a different query.', '#dc3545');
                return;
            }
            renderGrid(data.images);
            setStatus(`Found ${data.images.length} result${data.images.length !== 1 ? 's' : ''} — click one to select.`);
        } catch (err) {
            setStatus(`Error: ${err.message}`, '#dc3545');
        } finally {
            searchBtn.disabled = false;
        }
    }

    /* ── Grid rendering ── */
    function renderGrid(images) {
        imageGrid.style.display = 'block';
        gridWrap.innerHTML = '';
        images.slice(0, 5).forEach((imgUrl, i) => {
            const thumb = document.createElement('div');
            thumb.className = 'grid-thumb';
            thumb.title = `Image ${i + 1}`;

            const check    = document.createElement('span');
            check.className = 'check';
            check.textContent = '✓';

            const img  = document.createElement('img');
            img.alt     = `Result ${i + 1}`;
            img.loading = 'lazy';
            img.src     = `/proxy-image?url=${encodeURIComponent(imgUrl)}`;
            img.onerror = () => { img.src = `https://placehold.co/200x200/dee2e6/868e96?text=${i + 1}`; };

            thumb.appendChild(img);
            thumb.appendChild(check);
            thumb.addEventListener('click', () => selectImage(imgUrl, thumb));
            gridWrap.appendChild(thumb);
        });
    }

    function selectImage(url, thumbEl) {
        document.querySelectorAll('.grid-thumb').forEach(t => t.classList.remove('selected'));
        thumbEl.classList.add('selected');
        selectedUrl = url;
        confirmThumb.src     = `/proxy-image?url=${encodeURIComponent(url)}`;
        confirmThumb.onerror = () => { confirmThumb.src = ''; };
        confirmBar.style.display   = 'flex';
        copyImageBtn.style.display = 'none';
        copyImageBtn.classList.remove('copied');
    }

    /* ── Confirm: fetch the full image blob ── */
    confirmBtn.addEventListener('click', async () => {
        if (!selectedUrl) return;
        confirmBtn.disabled    = true;
        confirmBtn.textContent = 'Loading…';
        try {
            const res = await fetch(`/proxy-image?url=${encodeURIComponent(selectedUrl)}`);
            if (!res.ok) throw new Error('Could not fetch image');
            confirmBtn._blob           = await res.blob();
            copyImageBtn.style.display = 'block';
            setStatus('Image ready. Copy it, then paste it into the pipeline below.', '#28a745');
            const sku = skuInput.value.trim();
            if (sku) document.getElementById('customFileName').value = sku;
        } catch (err) {
            setStatus(`Failed to load image: ${err.message}`, '#dc3545');
        } finally {
            confirmBtn.disabled    = false;
            confirmBtn.textContent = 'Use this image ↓';
        }
    });

    /* ── Copy to clipboard ── */
    copyImageBtn.addEventListener('click', async () => {
        const blob = confirmBtn._blob;
        if (!blob) return;
        try {
            const pngBlob = await convertToPng(blob);
            await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob })]);
            copyImageBtn.textContent = '✅ Copied! Now paste into the pipeline below.';
            copyImageBtn.classList.add('copied');
            window.pasteActiveZone = 'pipeline';
            highlightPasteZone();
        } catch (err) {
            copyImageBtn.textContent = '⚠️ Copy failed — paste manually or try another browser.';
            setStatus(`Clipboard error: ${err.message}`, '#dc3545');
        }
    });

    function highlightPasteZone() {
        const pz = document.getElementById('pasteZone');
        pz.classList.add('highlight');
        setTimeout(() => pz.classList.remove('highlight'), 2000);
    }

    function convertToPng(blob) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            const url = URL.createObjectURL(blob);
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width  = img.naturalWidth;
                canvas.height = img.naturalHeight;
                canvas.getContext('2d').drawImage(img, 0, 0);
                URL.revokeObjectURL(url);
                canvas.toBlob(
                    b => (b ? resolve(b) : reject(new Error('PNG conversion failed'))),
                    'image/png'
                );
            };
            img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image load failed')); };
            img.src = url;
        });
    }

    /* ── Event wiring ── */
    searchBtn.addEventListener('click', () => {
        const sku = skuInput.value.trim();
        if (!sku) { setStatus('Enter a SKU first.', '#dc3545'); return; }
        searchImages(sku);
    });
    skuInput.addEventListener('keydown', e => { if (e.key === 'Enter') searchBtn.click(); });
})();
JSEOF

# ── public/js/cropModule.js ───────────────────────────────────────────────────
cat > public/js/cropModule.js << 'JSEOF'
/**
 * cropModule.js — Module 2: Smart Crop to 1:1
 *
 * Accepts images via file picker, drag-and-drop, or clipboard paste.
 * Lets the user draw a freehand square crop area with resize handles,
 * previews the result before committing, or uses "Fit without cropping"
 * to pad the whole image onto a white square.
 *
 * Depends on: shared.js (window.pasteActiveZone, window.getOutputResolution)
 * Calls:      window.processAndValidateImage() — defined in pipeline.js
 */

(function () {
    /* ── DOM references ── */
    const dropZone      = document.getElementById('cropDropZone');
    const fileInput     = document.getElementById('cropFileInput');
    const workspace     = document.getElementById('cropWorkspace');
    const cropCanvas    = document.getElementById('cropCanvas');
    const cropContainer = document.getElementById('cropContainer');
    const cropSelection = document.getElementById('cropSelection');
    const cropSizeLabel = document.getElementById('cropSizeLabel');
    const cropOrigDims  = document.getElementById('cropOrigDims');
    const cropSelDims   = document.getElementById('cropSelDims');
    const applyBtn      = document.getElementById('cropApplyBtn');
    const fitBtn        = document.getElementById('cropFitBtn');
    const resetBtn      = document.getElementById('cropResetBtn');
    const previewPanel  = document.getElementById('cropPreviewPanel');
    const beforeThumb   = document.getElementById('cropBeforeThumb');
    const afterThumb    = document.getElementById('cropAfterThumb');
    const confirmYes    = document.getElementById('cropConfirmYes');
    const confirmNo     = document.getElementById('cropConfirmNo');
    const cropStatus    = document.getElementById('cropStatus');

    const MIN_PX = 1000;

    let sourceImg    = null;
    let displayScale = 1; // source pixels per CSS pixel

    let sel  = { x: 0, y: 0, w: 0, h: 0, active: false };
    let drag = { active: false, mode: null, startX: 0, startY: 0, origSel: null };

    /* ── File loading ── */
    dropZone.addEventListener('click', () => {
        window.pasteActiveZone = 'crop';
        fileInput.click();
    });
    dropZone.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            window.pasteActiveZone = 'crop';
            fileInput.click();
        }
    });
    fileInput.addEventListener('change', e => { if (e.target.files[0]) loadFile(e.target.files[0]); });

    dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
    dropZone.addEventListener('drop', e => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        window.pasteActiveZone = 'crop';
        const f = e.dataTransfer.files[0];
        if (f && f.type.startsWith('image/')) loadFile(f);
    });

    /* Clicking anywhere in the crop section routes paste here. */
    document.querySelector('.crop-section').addEventListener('click', () => {
        window.pasteActiveZone = 'crop';
    });

    function loadFile(file) {
        cropStatus.textContent = '';
        const reader = new FileReader();
        reader.onload = ev => {
            const img = new Image();
            img.onload = () => {
                const shortSide = Math.min(img.naturalWidth, img.naturalHeight);
                if (shortSide < MIN_PX) {
                    setStatus(`Rejected: shortest side is ${shortSide}px — must be ≥ ${MIN_PX}px.`, '#dc3545');
                    return;
                }
                if (img.naturalWidth === img.naturalHeight) {
                    setStatus(
                        `This image is already 1:1 (${img.naturalWidth}×${img.naturalHeight}). ` +
                        `Use it directly in the paste pipeline below.`,
                        '#856404'
                    );
                    return;
                }
                sourceImg = img;
                initCropUI();
            };
            img.src = ev.target.result;
        };
        reader.readAsDataURL(file);
    }

    function setStatus(msg, color) {
        cropStatus.textContent  = msg;
        cropStatus.style.color  = color || '#6c757d';
    }

    /* ── Crop UI init ── */
    function initCropUI() {
        const iw   = sourceImg.naturalWidth;
        const ih   = sourceImg.naturalHeight;
        cropOrigDims.textContent = `${iw} × ${ih}`;

        const maxW   = cropContainer.clientWidth || 560;
        displayScale = iw / maxW;

        cropCanvas.width  = iw;
        cropCanvas.height = ih;
        cropCanvas.style.width  = maxW + 'px';
        cropCanvas.style.height = Math.round(ih / displayScale) + 'px';
        cropCanvas.getContext('2d').drawImage(sourceImg, 0, 0);

        /* Default: centred square using the short side */
        const squareCss = Math.min(iw, ih) / displayScale;
        const offX      = (iw / displayScale - squareCss) / 2;
        const offY      = (ih / displayScale - squareCss) / 2;
        sel = { x: offX, y: offY, w: squareCss, h: squareCss, active: true };

        workspace.style.display      = 'block';
        previewPanel.style.display   = 'none';
        applyBtn.disabled            = false;
        applyBtn._crop               = null;
        dropZone.style.display       = 'none';

        renderSelection();
    }

    /* ── Selection overlay ── */
    function renderSelection() {
        if (!sel.active) {
            cropSelection.style.display = 'none';
            cropSelDims.textContent     = 'none';
            applyBtn.disabled           = true;
            return;
        }
        cropSelection.style.display = 'block';
        cropSelection.style.left    = sel.x + 'px';
        cropSelection.style.top     = sel.y + 'px';
        cropSelection.style.width   = sel.w + 'px';
        cropSelection.style.height  = sel.h + 'px';

        const srcW = Math.round(sel.w * displayScale);
        const srcH = Math.round(sel.h * displayScale);
        cropSizeLabel.textContent = `${srcW} × ${srcH}`;
        cropSelDims.textContent   = `${srcW} × ${srcH}`;
        applyBtn.disabled         = (sel.w < 10 || sel.h < 10);
    }

    /* ── Pointer helpers ── */
    function getRelPos(clientX, clientY) {
        const rect = cropCanvas.getBoundingClientRect();
        return {
            x: Math.max(0, Math.min(clientX - rect.left, rect.width)),
            y: Math.max(0, Math.min(clientY - rect.top,  rect.height)),
        };
    }

    function onMouseDown(e) {
        e.preventDefault();
        const handle = e.target && e.target.dataset.handle;
        const pos    = getRelPos(e.clientX, e.clientY);

        if (handle) {
            drag = { active: true, mode: 'resize-' + handle,
                     startX: pos.x, startY: pos.y, origSel: { ...sel } };
        } else if (e.target === cropSelection) {
            drag = { active: true, mode: 'move',
                     startX: pos.x, startY: pos.y, origSel: { ...sel } };
        } else {
            drag = { active: true, mode: 'draw',
                     startX: pos.x, startY: pos.y, origSel: null };
            sel  = { x: pos.x, y: pos.y, w: 0, h: 0, active: false };
        }
    }

    function onMouseMove(e) {
        if (!drag.active) return;
        const pos  = getRelPos(e.clientX, e.clientY);
        const dx   = pos.x - drag.startX;
        const dy   = pos.y - drag.startY;
        const canW = cropCanvas.getBoundingClientRect().width;
        const canH = cropCanvas.getBoundingClientRect().height;

        if (drag.mode === 'draw') {
            let w = pos.x - drag.startX;
            let h = pos.y - drag.startY;
            if (e.shiftKey) {
                const s = Math.min(Math.abs(w), Math.abs(h));
                w = w < 0 ? -s : s;
                h = h < 0 ? -s : s;
            }
            sel.x = w < 0 ? drag.startX + w : drag.startX;
            sel.y = h < 0 ? drag.startY + h : drag.startY;
            sel.w = Math.abs(w);
            sel.h = Math.abs(h);
            sel.active = (sel.w > 4 && sel.h > 4);

        } else if (drag.mode === 'move') {
            const o = drag.origSel;
            sel.x = Math.max(0, Math.min(o.x + dx, canW - o.w));
            sel.y = Math.max(0, Math.min(o.y + dy, canH - o.h));

        } else if (drag.mode.startsWith('resize-')) {
            const handle = drag.mode.replace('resize-', '');
            let { x, y, w, h } = drag.origSel;
            if (handle === 'br') { w = Math.max(20, w + dx); h = Math.max(20, h + dy); }
            if (handle === 'bl') { x = Math.min(x + dx, x + w - 20); w = drag.origSel.w - (x - drag.origSel.x); h = Math.max(20, h + dy); }
            if (handle === 'tr') { w = Math.max(20, w + dx); y = Math.min(y + dy, y + h - 20); h = drag.origSel.h - (y - drag.origSel.y); }
            if (handle === 'tl') {
                x = Math.min(x + dx, x + w - 20);
                y = Math.min(y + dy, y + h - 20);
                w = drag.origSel.w - (x - drag.origSel.x);
                h = drag.origSel.h - (y - drag.origSel.y);
            }
            x = Math.max(0, x); y = Math.max(0, y);
            w = Math.min(w, canW - x); h = Math.min(h, canH - y);
            sel = { x, y, w, h, active: true };
        }
        renderSelection();
    }

    function onMouseUp() {
        if (!drag.active) return;
        drag.active = false;
        if (sel.w < 0) { sel.x += sel.w; sel.w = -sel.w; }
        if (sel.h < 0) { sel.y += sel.h; sel.h = -sel.h; }
        sel.active = (sel.w > 10 && sel.h > 10);
        renderSelection();
    }

    cropContainer.addEventListener('mousedown', () => { window.pasteActiveZone = 'crop'; });
    cropContainer.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup',   onMouseUp);

    /* Touch */
    cropContainer.addEventListener('touchstart', e => {
        const t = e.touches[0];
        onMouseDown({
            clientX: t.clientX, clientY: t.clientY,
            target:  document.elementFromPoint(t.clientX, t.clientY),
            preventDefault: () => e.preventDefault(),
            shiftKey: false,
        });
    }, { passive: false });
    window.addEventListener('touchmove', e => {
        if (!drag.active) return;
        e.preventDefault();
        onMouseMove({ clientX: e.touches[0].clientX, clientY: e.touches[0].clientY, shiftKey: false });
    }, { passive: false });
    window.addEventListener('touchend', () => { if (drag.active) onMouseUp(); });

    /* ── Preview crop ── */
    applyBtn.addEventListener('click', () => {
        if (!sel.active || !sourceImg) return;

        const srcX = Math.round(sel.x * displayScale);
        const srcY = Math.round(sel.y * displayScale);
        const srcW = Math.round(sel.w * displayScale);
        const srcH = Math.round(sel.h * displayScale);
        const size = Math.min(srcW, srcH);
        const adjX = srcX + Math.round((srcW - size) / 2);
        const adjY = srcY + Math.round((srcH - size) / 2);

        /* Before thumb */
        beforeThumb.width = 200; beforeThumb.height = 200;
        const bCtx  = beforeThumb.getContext('2d');
        const scale = Math.min(200 / sourceImg.naturalWidth, 200 / sourceImg.naturalHeight);
        const bW    = Math.round(sourceImg.naturalWidth  * scale);
        const bH    = Math.round(sourceImg.naturalHeight * scale);
        const bOX   = (200 - bW) / 2;
        const bOY   = (200 - bH) / 2;
        bCtx.drawImage(sourceImg, bOX, bOY, bW, bH);
        bCtx.fillStyle = 'rgba(0,0,0,0.45)';
        bCtx.fillRect(0, 0, 200, 200);
        const hx = bOX + adjX * scale;
        const hy = bOY + adjY * scale;
        const hs = size * scale;
        bCtx.drawImage(sourceImg, adjX, adjY, size, size, hx, hy, hs, hs);
        bCtx.strokeStyle = '#007bff';
        bCtx.lineWidth   = 2;
        bCtx.strokeRect(hx, hy, hs, hs);

        /* After thumb */
        afterThumb.width = 200; afterThumb.height = 200;
        afterThumb.getContext('2d').drawImage(sourceImg, adjX, adjY, size, size, 0, 0, 200, 200);

        applyBtn._crop = { x: adjX, y: adjY, size };
        previewPanel.style.display = 'block';
        previewPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });

    /* ── Confirm crop → pipeline ── */
    confirmYes.addEventListener('click', () => {
        const c = applyBtn._crop;
        if (!c || !sourceImg) return;

        const res         = window.getOutputResolution();
        const finalCanvas = document.createElement('canvas');
        finalCanvas.width = res; finalCanvas.height = res;
        finalCanvas.getContext('2d').drawImage(sourceImg, c.x, c.y, c.size, c.size, 0, 0, res, res);

        finalCanvas.toBlob(blob => {
            if (!blob) { setStatus('Crop failed — please try again.', '#dc3545'); return; }
            sendToPipeline(blob, 'cropped.png');
            setStatus('✓ Cropped image sent to the pipeline below.', '#28a745');
            previewPanel.style.display = 'none';
        }, 'image/png');
    });

    confirmNo.addEventListener('click', () => { previewPanel.style.display = 'none'; });

    /* ── Fit without cropping ── */
    fitBtn.addEventListener('click', () => {
        if (!sourceImg) return;

        const res      = window.getOutputResolution();
        const iw       = sourceImg.naturalWidth;
        const ih       = sourceImg.naturalHeight;
        const longSide = Math.max(iw, ih);
        const scale    = longSide > res ? res / longSide : 1; // shrink-only, never upscale
        const drawW    = Math.round(iw * scale);
        const drawH    = Math.round(ih * scale);
        const offX     = Math.round((res - drawW) / 2);
        const offY     = Math.round((res - drawH) / 2);

        const finalCanvas = document.createElement('canvas');
        finalCanvas.width = res; finalCanvas.height = res;
        const ctx = finalCanvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, res, res);
        ctx.drawImage(sourceImg, 0, 0, iw, ih, offX, offY, drawW, drawH);

        finalCanvas.toBlob(blob => {
            if (!blob) { setStatus('Fit failed — please try again.', '#dc3545'); return; }
            sendToPipeline(blob, 'fitted.png');
            setStatus(`✓ Whole image fitted to ${res}×${res} — nothing cropped — and sent to the pipeline below.`, '#28a745');
            previewPanel.style.display = 'none';
        }, 'image/png');
    });

    function sendToPipeline(blob, filename) {
        if (typeof window.processAndValidateImage === 'function') {
            window.processAndValidateImage(new File([blob], filename, { type: 'image/png' }));
        }
        window.pasteActiveZone = 'pipeline';
        const pz = document.getElementById('pasteZone');
        pz.classList.add('highlight');
        setTimeout(() => pz.classList.remove('highlight'), 2000);
        pz.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    /* ── Reset ── */
    resetBtn.addEventListener('click', () => {
        if (sourceImg) { initCropUI(); } else {
            sel = { x: 0, y: 0, w: 0, h: 0, active: false };
            renderSelection();
        }
        previewPanel.style.display = 'none';
        applyBtn._crop             = null;
        cropStatus.textContent     = '';
    });

    /* ── Paste routing: only handle when this module is active ── */
    window.addEventListener('paste', e => {
        if (window.pasteActiveZone !== 'crop') return;
        const items = e.clipboardData && e.clipboardData.items;
        if (!items) return;
        for (let i = 0; i < items.length; i++) {
            if (items[i].kind === 'file' && items[i].type.startsWith('image/')) {
                e.preventDefault();
                e.stopImmediatePropagation();
                loadFile(items[i].getAsFile());
                dropZone.classList.add('drag-over');
                setTimeout(() => dropZone.classList.remove('drag-over'), 300);
                break;
            }
        }
    });
})();
JSEOF

# ── public/js/pipeline.js ────────────────────────────────────────────────────
cat > public/js/pipeline.js << 'JSEOF'
/**
 * pipeline.js — Module 3: Paste Pipeline
 *
 * Accepts a 1:1 ≥1000px image via clipboard paste (or injected by
 * the crop module), converts it to WebP at the configured output
 * resolution, then offers a download link or a direct WP upload.
 *
 * Exposes:  window.processAndValidateImage(file)
 * Depends on: shared.js (window.pasteActiveZone, window.getOutputResolution)
 */

(function () {
    const fileInput           = document.getElementById('myFileInput');
    const errorMsg            = document.getElementById('error-msg');
    const downloadControls    = document.getElementById('downloadControls');
    const customFileNameInput = document.getElementById('customFileName');
    const downloadLink        = document.getElementById('downloadLink');
    const uploadBtn           = document.getElementById('uploadBtn');
    const statusDisplay       = document.getElementById('statusDisplay');

    let activeBlob = null;

    const pasteZone = document.getElementById('pasteZone');

    /* ── Click to upload ── */
    pasteZone.addEventListener('click', () => {
        window.pasteActiveZone = 'pipeline';
        fileInput.click();
    });
    fileInput.addEventListener('change', e => {
        if (e.target.files[0]) processAndValidateImage(e.target.files[0]);
        fileInput.value = ''; // reset so same file can be re-picked
    });

    /* ── Drag and drop ── */
    pasteZone.addEventListener('dragover', e => {
        e.preventDefault();
        window.pasteActiveZone = 'pipeline';
        pasteZone.classList.add('highlight');
    });
    pasteZone.addEventListener('dragleave', () => pasteZone.classList.remove('highlight'));
    pasteZone.addEventListener('drop', e => {
        e.preventDefault();
        pasteZone.classList.remove('highlight');
        window.pasteActiveZone = 'pipeline';
        const f = e.dataTransfer.files[0];
        if (f && f.type.startsWith('image/')) processAndValidateImage(f);
    });

    window.addEventListener('paste', e => {
        if (window.pasteActiveZone === 'crop') return;
        const items = e.clipboardData.items;
        for (let i = 0; i < items.length; i++) {
            if (items[i].kind === 'file' && items[i].type.startsWith('image/')) {
                processAndValidateImage(items[i].getAsFile());
                break;
            }
        }
    });

    /* ── Validation → conversion ── */
    function processAndValidateImage(file) {
        errorMsg.textContent             = '';
        downloadControls.style.display   = 'none';
        statusDisplay.textContent        = '';
        activeBlob                       = null;

        const img = new Image();
        img.src = URL.createObjectURL(file);

        img.onload = function () {
            // FIX: use naturalWidth/naturalHeight, not layout width/height
            const width  = img.naturalWidth;
            const height = img.naturalHeight;

            if (width !== height) {
                errorMsg.textContent = `Rejected: Image must be a perfect 1:1 square. Detected: ${width}×${height}`;
                URL.revokeObjectURL(img.src);
                return;
            }
            if (width < 1000) {
                errorMsg.textContent = `Rejected: Resolution must be at least 1000×1000. Detected: ${width}×${height}`;
                URL.revokeObjectURL(img.src);
                return;
            }
            convertToWebP(img);
        };
    }

    function convertToWebP(img) {
        const res    = window.getOutputResolution();
        const canvas = document.createElement('canvas');
        canvas.width = res; canvas.height = res;
        const ctx    = canvas.getContext('2d');

        /* White base — visible as padding when source is smaller than res. */
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, res, res);

        const srcSize = img.naturalWidth; // already validated square

        if (srcSize >= res) {
            ctx.drawImage(img, 0, 0, res, res);
        } else {
            /* Keep native resolution, center on white background. */
            const offset = Math.round((res - srcSize) / 2);
            ctx.drawImage(img, offset, offset, srcSize, srcSize);
        }

        canvas.toBlob(blob => {
            if (!blob) return;
            activeBlob = blob;
            updateDownloadAttributes();
            downloadControls.style.display = 'block';
            URL.revokeObjectURL(img.src);
        }, 'image/webp', 0.92);
    }

    /* ── Download link management ── */
    function updateDownloadAttributes() {
        if (!activeBlob) return '';
        let name = customFileNameInput.value.trim().replace(/\.webp$/i, '');
        if (!name) name = 'download_1000x1000';
        const fullName = `${name}.webp`;

        const webpFile = new File([activeBlob], fullName, { type: 'image/webp' });
        const dt       = new DataTransfer();
        dt.items.add(webpFile);
        fileInput.files = dt.files;

        if (downloadLink.href) URL.revokeObjectURL(downloadLink.href);
        downloadLink.href     = URL.createObjectURL(activeBlob);
        downloadLink.download = fullName;
        return name;
    }

    customFileNameInput.addEventListener('input', updateDownloadAttributes);

    downloadLink.addEventListener('click', () => {
        const name = updateDownloadAttributes();
        const res  = window.getOutputResolution();
        statusDisplay.style.color = '#17a2b8';
        statusDisplay.textContent = `Downloaded File: ${name}.webp (${res}×${res})`;
    });

    /* ── WP upload ── */
    uploadBtn.addEventListener('click', async () => {
        const sku = updateDownloadAttributes();
        statusDisplay.style.color = '#17a2b8';
        statusDisplay.textContent = 'Connecting via SSH and executing WP pipeline…';

        const formData = new FormData();
        formData.append('image', activeBlob, `${sku}.webp`);
        formData.append('sku', sku);

        try {
            const res    = await fetch('/upload-to-wp', { method: 'POST', body: formData });
            const result = await res.json();
            if (result.success) {
                statusDisplay.style.color = 'green';
                statusDisplay.textContent = `Success! ${result.message}`;
            } else {
                statusDisplay.style.color = 'red';
                statusDisplay.textContent = `Server Error: ${result.error}`;
            }
        } catch (err) {
            statusDisplay.style.color = 'red';
            statusDisplay.textContent = `Network Connection Error: ${err.message}`;
        }
    });

    /* Expose so cropModule.js can call it directly. */
    window.processAndValidateImage = processAndValidateImage;
})();
JSEOF

echo ""
echo "✅  Done. New structure:"
echo ""
echo "  public/"
echo "  ├── index.html"
echo "  ├── css/"
echo "  │   └── styles.css"
echo "  └── js/"
echo "      ├── shared.js      ← output resolution + pasteActiveZone"
echo "      ├── skuFinder.js   ← Module 1: SKU image search"
echo "      ├── cropModule.js  ← Module 2: smart crop / fit"
echo "      └── pipeline.js    ← Module 3: paste → WebP → upload"
echo ""
echo "  Make sure your Express server serves static files from ./public, e.g.:"
echo "    app.use(express.static('public'));"
echo ""
echo "  Also verify server.js serves /css and /js — express.static covers both."