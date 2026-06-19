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

    function dataURLtoBlob(dataURL) {
        const [header, data] = dataURL.split(',');
        const mime = header.match(/:(.*?);/)[1];
        const binary = atob(data);
        const arr = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i);
        return new Blob([arr], { type: mime });
    }

    function loadFile(file) {
        cropStatus.textContent = '';
        const reader = new FileReader();
        reader.onload = ev => {
            const img = new Image();
            img.onload = () => {
                const iw = img.naturalWidth;
                const ih = img.naturalHeight;
                const shortSide = Math.min(iw, ih);
                const isSquare = iw === ih;

                if (isSquare && iw >= MIN_PX) {
                    setStatus(`This image is already 1:1 (${iw}×${ih}) and ready to use — sending it directly to the pipeline.`, '#28a745');
                    sendToPipeline(file instanceof Blob ? file : dataURLtoBlob(ev.target.result), file.name || 'image.png');
                    return;
                }
                if (isSquare && iw < MIN_PX) {
                    setStatus(`Already 1:1 but too small (${iw}×${ih}) — must be ≥ ${MIN_PX}px.`, '#dc3545');
                    return;
                }
                if (shortSide < MIN_PX) {
                    setStatus(`Rejected: shortest side is ${shortSide}px — must be ≥ ${MIN_PX}px.`, '#dc3545');
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
