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
