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
