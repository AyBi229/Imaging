/**
 * skuFinder.js — Module 1: SKU Image Finder
 *
 * Searches for product images by SKU via /search-product-images,
 * and product PDFs via /search-product-docs.
 * Results are shown in two tabs: Images (top 5) and Docs (top 5).
 * Selecting an image copies it to the clipboard for the paste pipeline.
 * Selecting a doc opens it in a new tab.
 *
 * Depends on: shared.js (window.pasteActiveZone)
 */

(function () {
    const skuInput = document.getElementById('skuSearchInput');
    const searchBtn = document.getElementById('searchBtn');
    const searchStatus = document.getElementById('searchStatus');
    const imageGrid = document.getElementById('imageGrid');
    const gridWrap = document.getElementById('gridWrap');
    const confirmBar = document.getElementById('confirmBar');
    const confirmThumb = document.getElementById('confirmThumb');
    const confirmBtn = document.getElementById('confirmBtn');
    const copyImageBtn = document.getElementById('copyImageBtn');

    let selectedUrl = null;
    let activeTab = 'images'; // 'images' | 'docs'
    let cachedImages = [];
    let cachedDocs = [];

    /* ── Inject tab bar + doc list container (once) ── */
    const tabBar = document.createElement('div');
    tabBar.id = 'skuTabBar';
    tabBar.innerHTML = `
        <button class="sku-tab active" data-tab="images">🖼 Images</button>
        <button class="sku-tab"        data-tab="docs">📄 Docs</button>
    `;
    tabBar.style.cssText = `
        gap: 0;
        margin-bottom: 12px;
        border-bottom: 2px solid #dee2e6;
    `;
    imageGrid.parentNode.insertBefore(tabBar, imageGrid);

    const docList = document.createElement('div');
    docList.id = 'skuDocList';
    docList.style.cssText = 'display:none;';
    imageGrid.parentNode.insertBefore(docList, imageGrid.nextSibling);

    /* Tab button styles injected once */
    const style = document.createElement('style');
    style.textContent = `
        #skuTabBar {
            display: none;
            flex-direction: row;
        }
        #skuTabBar.visible {
            display: flex;
        }
        .sku-tab {
            flex: 1;
            padding: 8px 16px;
            border: none;
            background: transparent;
            font-size: 0.9rem;
            font-weight: 500;
            color: #6c757d;
            cursor: pointer;
            border-bottom: 3px solid transparent;
            margin-bottom: -2px;
            transition: color 0.15s, border-color 0.15s;
        }
        .sku-tab:hover {
            color: #343a40;
        }
        .sku-tab.active {
            color: #0d6efd;
            border-bottom-color: #0d6efd;
        }

        /* Doc list */
        #skuDocList {
            list-style: none;
            margin: 0;
            padding: 0;
        }
        .sku-doc-item {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 10px 12px;
            border: 1px solid #dee2e6;
            border-radius: 6px;
            margin-bottom: 8px;
            cursor: pointer;
            background: #fff;
            transition: background 0.12s, border-color 0.12s;
            text-decoration: none;
            color: inherit;
        }
        .sku-doc-item:hover {
            background: #f0f4ff;
            border-color: #0d6efd;
        }
        .sku-doc-icon {
            font-size: 1.4rem;
            flex-shrink: 0;
        }
        .sku-doc-name {
            font-size: 0.85rem;
            color: #212529;
            word-break: break-all;
            flex: 1;
        }
        .sku-doc-open {
            font-size: 0.78rem;
            color: #0d6efd;
            white-space: nowrap;
        }
        .sku-doc-empty {
            color: #6c757d;
            font-size: 0.875rem;
            padding: 12px 0;
            text-align: center;
        }
        .sku-doc-manual-upload {
            width: 100%;
            margin-top: 8px;
            padding: 8px 10px;
            background: #fff8e1;
            border: 1px dashed #ffc107;
            border-radius: 6px;
            font-size: 0.8rem;
            color: #6c757d;
        }
        .sku-doc-manual-label {
            display: flex;
            flex-direction: column;
            gap: 6px;
            cursor: pointer;
        }
        .sku-doc-manual-input {
            font-size: 0.8rem;
}
    `;
    document.head.appendChild(style);

    /* ── Helpers ── */
    function setStatus(msg, color) {
        searchStatus.textContent = msg;
        searchStatus.style.color = color || '#6c757d';
    }

    function resetAll() {
        gridWrap.innerHTML = '';
        docList.innerHTML = '';
        confirmBar.style.display = 'none';
        copyImageBtn.style.display = 'none';
        copyImageBtn.classList.remove('copied');
        selectedUrl = null;
        cachedImages = [];
        cachedDocs = [];
        imageGrid.style.display = 'none';
        docList.style.display = 'none';
        tabBar.classList.remove('visible');
    }

    /* ── Tab switching ── */
    tabBar.addEventListener('click', e => {
        const btn = e.target.closest('.sku-tab');
        if (!btn) return;
        activeTab = btn.dataset.tab;
        tabBar.querySelectorAll('.sku-tab').forEach(b => b.classList.toggle('active', b === btn));
        showActiveTab();
    });

    function showActiveTab() {
        if (activeTab === 'images') {
            imageGrid.style.display = cachedImages.length ? 'block' : 'none';
            docList.style.display = 'none';
            // Re-sync confirm bar visibility
            confirmBar.style.display = selectedUrl ? 'flex' : 'none';
        } else {
            imageGrid.style.display = 'none';
            docList.style.display = 'block';
            confirmBar.style.display = 'none';
            copyImageBtn.style.display = 'none';
        }
    }

    /* ── Search — fires both endpoints in parallel ── */
    async function searchAll(sku) {
        resetAll();
        setStatus('Searching…');
        searchBtn.disabled = true;

        const [imagesResult, docsResult] = await Promise.allSettled([
            fetchImages(sku),
            fetchDocs(sku),
        ]);

        searchBtn.disabled = false;

        cachedImages = imagesResult.status === 'fulfilled' ? imagesResult.value : [];
        cachedDocs = docsResult.status === 'fulfilled' ? docsResult.value : [];

        const hasImages = cachedImages.length > 0;
        const hasDocs = cachedDocs.length > 0;

        if (!hasImages && !hasDocs) {
            setStatus('No images or documents found for this SKU.', '#dc3545');
            return;
        }

        tabBar.classList.add('visible');

        if (hasImages) renderImageGrid(cachedImages);
        if (hasDocs) renderDocList(cachedDocs);

        // Default to the tab that has results; prefer images
        activeTab = hasImages ? 'images' : 'docs';
        tabBar.querySelectorAll('.sku-tab').forEach(b =>
            b.classList.toggle('active', b.dataset.tab === activeTab)
        );
        showActiveTab();

        const imgLabel = hasImages ? `${cachedImages.length} image${cachedImages.length !== 1 ? 's' : ''}` : 'no images';
        const docLabel = hasDocs ? `${cachedDocs.length} doc${cachedDocs.length !== 1 ? 's' : ''}` : 'no docs';
        setStatus(`Found ${imgLabel} and ${docLabel} — click a tab to browse.`);
    }

    async function fetchImages(sku) {
        const res = await fetch('/search-product-images', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sku }),
        });
        if (!res.ok) throw new Error(`Images: server error ${res.status}`);
        const data = await res.json();
        return (data.images || []).slice(0, 5);
    }

    async function fetchDocs(sku) {
        const res = await fetch('/search-product-docs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sku }),
        });
        if (!res.ok) throw new Error(`Docs: server error ${res.status}`);
        const data = await res.json();
        // Expects data.docs: [{ name, url }] or data.docs: [string url, …]
        return (data.docs || []).slice(0, 5);
    }

    /* ── Image grid ── */
    function renderImageGrid(images) {
        gridWrap.innerHTML = '';
        images.forEach((imgUrl, i) => {
            const thumb = document.createElement('div');
            thumb.className = 'grid-thumb';
            thumb.title = `Image ${i + 1}`;

            const check = document.createElement('span');
            check.className = 'check';
            check.textContent = '✓';

            const img = document.createElement('img');
            img.alt = `Result ${i + 1}`;
            img.loading = 'lazy';
            img.src = `/proxy-image?url=${encodeURIComponent(imgUrl)}`;
            img.onerror = () => {
                img.src = `https://placehold.co/200x200/dee2e6/868e96?text=${i + 1}`;
            };

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
        confirmThumb.src = `/proxy-image?url=${encodeURIComponent(url)}`;
        confirmThumb.onerror = () => { confirmThumb.src = ''; };
        confirmBar.style.display = 'flex';
        copyImageBtn.style.display = 'none';
        copyImageBtn.classList.remove('copied');
    }

    /* ── Doc list ── */
    function renderDocList(docs) {
        docList.innerHTML = '';

        if (!docs.length) {
            const empty = document.createElement('p');
            empty.className = 'sku-doc-empty';
            empty.textContent = 'No documents found for this SKU.';
            docList.appendChild(empty);
            return;
        }

        docs.forEach((doc, i) => {
            // Support both { name, url } objects and bare URL strings
            const url = typeof doc === 'string' ? doc : doc.url;
            const name = typeof doc === 'string'
                ? decodeURIComponent(url.split('/').pop() || `Document ${i + 1}`)
                : (doc.name || decodeURIComponent(url.split('/').pop() || `Document ${i + 1}`));

            const isPdf = /\.pdf$/i.test(url) || /pdf/i.test(name);
            const icon = isPdf ? '📄' : '📎';

            const item = document.createElement('div');
            item.className = 'sku-doc-item';
            item.innerHTML = `
                <span class="sku-doc-icon">${icon}</span>
                <span class="sku-doc-name">${escapeHtml(name)}</span>
                <a class="sku-doc-open" href="${url}" target="_blank" rel="noopener noreferrer">Open ↗</a>
                <button type="button" class="sku-doc-upload">Upload to Store</button>
            `;

            const uploadBtn = item.querySelector('.sku-doc-upload');
            uploadBtn.addEventListener('click', () => uploadDocToStore(url, name, uploadBtn));

            docList.appendChild(item);
        });
    }

    async function uploadDocToStore(url, name, btn) {
        const sku = skuInput.value.trim();
        if (!sku) {
            setStatus('Enter a SKU before uploading a document.', '#dc3545');
            return;
        }

        btn.disabled = true;
        btn.textContent = 'Uploading…';

        try {
            const res = await fetch('/upload-doc-to-store', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sku, url, name }),
            });
            const data = await res.json();

            if (!data.success) {
                throw new Error(data.error || 'Upload failed.');
            }

            btn.textContent = '✅ Uploaded';
            setStatus(data.message || `Linked document to SKU ${sku}.`, '#28a745');
        } catch (err) {
            btn.textContent = '⚠️ Failed — retry';
            btn.disabled = false;
            setStatus(`Document upload failed: ${err.message}`, '#dc3545');

            // Show manual upload fallback
            const existing = btn.parentElement.querySelector('.sku-doc-manual-upload');
            if (!existing) {
                const fallback = document.createElement('div');
                fallback.className = 'sku-doc-manual-upload';
                fallback.innerHTML = `
            <label class="sku-doc-manual-label">
                Can't fetch automatically — download it manually then upload here:
                <input type="file" accept="application/pdf" class="sku-doc-manual-input" />
            </label>
        `;
                btn.parentElement.appendChild(fallback);

                fallback.querySelector('.sku-doc-manual-input').addEventListener('change', async (e) => {
                    const file = e.target.files[0];
                    if (!file) return;
                    const sku = skuInput.value.trim();
                    btn.textContent = 'Uploading…';
                    btn.disabled = true;
                    try {
                        const formData = new FormData();
                        formData.append('file', file);
                        formData.append('sku', sku);
                        formData.append('name', file.name);
                        formData.append('url', url); // preserve source url for the TSV
                        const res = await fetch('/upload-doc-to-store', {
                            method: 'POST',
                            body: formData,
                        });
                        const data = await res.json();
                        if (!data.success) throw new Error(data.error || 'Upload failed.');
                        btn.textContent = '✅ Uploaded';
                        fallback.remove();
                        setStatus(data.message || `Linked document to SKU ${sku}.`, '#28a745');
                    } catch (uploadErr) {
                        btn.textContent = '⚠️ Failed — retry';
                        btn.disabled = false;
                        setStatus(`Manual upload failed: ${uploadErr.message}`, '#dc3545');
                    }
                });
            }
        }
    }

    function escapeHtml(str) {
        return str.replace(/[&<>"']/g, c => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
        }[c]));
    }

    /* ── Confirm: send image straight to the crop pipeline ── */
    confirmBtn.addEventListener('click', async () => {
        if (!selectedUrl) return;
        confirmBtn.disabled = true;
        confirmBtn.textContent = 'Loading…';
        try {
            // Pre-check dimensions via a quick Image load through the proxy
            const proxied = `/proxy-image?url=${encodeURIComponent(selectedUrl)}`;
            await new Promise((resolve, reject) => {
                const img = new Image();
                img.onload = () => {
                    const shortSide = Math.min(img.naturalWidth, img.naturalHeight);
                    if (shortSide < 1000) {
                        reject(new Error(`Image too small (${img.naturalWidth}×${img.naturalHeight}) — shortest side must be ≥ 1000px.`));
                    } else {
                        resolve();
                    }
                };
                img.onerror = () => reject(new Error('Could not load image for size check.'));
                img.src = proxied;
            });

            const sku = skuInput.value.trim();
            if (sku) document.getElementById('customFileName').value = sku;

            if (typeof window.loadImageIntoCrop === 'function') {
                window.loadImageIntoCrop(selectedUrl);
                setStatus('Image sent to the crop pipeline below ↓', '#28a745');
                document.getElementById('cropDropZone').scrollIntoView({ behavior: 'smooth', block: 'start' });
            } else {
                throw new Error('Crop module not ready.');
            }
        } catch (err) {
            setStatus(`Failed: ${err.message}`, '#dc3545');
        } finally {
            confirmBtn.disabled = false;
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
                canvas.width = img.naturalWidth;
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
        searchAll(sku);
    });
    skuInput.addEventListener('keydown', e => { if (e.key === 'Enter') searchBtn.click(); });
})();
