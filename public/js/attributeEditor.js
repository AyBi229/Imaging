'use strict';

const BYPASS = '{{hoZpjWX3KSZJOLglFxEQafKEYZ6WKr5h}}'

// ── DOM refs ──────────────────────────────────────────────────────────────
const skuInput      = document.getElementById('attrSkuInput');
const lookupBtn     = document.getElementById('attrLookupBtn');
const attrStatus    = document.getElementById('attrStatus');
const productMeta   = document.getElementById('productMeta');
const attributeForm = document.getElementById('attributeForm');
const attrGrid      = document.getElementById('attrGrid');
const saveAttrBtn   = document.getElementById('saveAttrBtn');
const saveStatus    = document.getElementById('saveStatus');

// ── State ─────────────────────────────────────────────────────────────────
let currentProductId = null;

// ── Real API calls ────────────────────────────────────────────────────────
async function fetchProductBySku(sku) {
    const res = await fetch(`/api/attributes/product?sku=${encodeURIComponent(sku)}&x-vercel-protection-bypass=${BYPASS}`);
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.error || 'Lookup failed.');
    return data.product;
}

async function fetchCategoryAttributes(categoryId) {
    const res = await fetch(`/api/attributes/category?id=${categoryId}&x-vercel-protection-bypass=${BYPASS}`);
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.error || 'Could not load attributes.');
    return data.attributes;
}

async function saveProductAttributes(productId, attributes) {
    const res = await fetch(`/api/attributes/save?x-vercel-protection-bypass=${BYPASS}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId, attributes }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.error || 'Save failed.');
}

// ── Helpers ───────────────────────────────────────────────────────────────
function setStatus(msg, isError = false) {
    attrStatus.textContent = msg;
    attrStatus.className   = isError ? 'error' : '';
}

function setSaveStatus(msg, type = '') {
    saveStatus.textContent = msg;
    saveStatus.className   = type;
}

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// ── Render ────────────────────────────────────────────────────────────────
function renderProductMeta(product) {
    productMeta.style.display = 'block';
    productMeta.innerHTML = `
        <strong>${escapeHtml(product.name)}</strong>
        &nbsp;·&nbsp; SKU: <strong>${escapeHtml(product.sku)}</strong>
        &nbsp;·&nbsp; Category: <span class="meta-category">${escapeHtml(product.categoryName)}</span>
        &nbsp;·&nbsp; ID: ${product.id}
    `;
}

function renderAttributeForm(attributes) {
    attrGrid.innerHTML = '';

    attributes.forEach(attr => {
        const field = document.createElement('div');
        field.className = 'attr-field';

        const labelEl = document.createElement('label');
        labelEl.htmlFor = `attr_${attr.id}`;
        labelEl.innerHTML = escapeHtml(attr.label)
            + (attr.required ? ' <span class="badge-required">REQUIRED</span>' : '');

        let inputEl;
        if (attr.type === 'select' && attr.options?.length) {
            inputEl = document.createElement('select');
            inputEl.innerHTML = `<option value="">— select —</option>`
                + attr.options.map(o => `<option value="${escapeHtml(o)}">${escapeHtml(o)}</option>`).join('');
        } else {
            inputEl = document.createElement('input');
            inputEl.type = attr.type === 'number' ? 'number' : 'text';
            if (attr.hint) inputEl.placeholder = attr.hint;
        }

        inputEl.id               = `attr_${attr.id}`;
        inputEl.dataset.attrId   = attr.id;
        inputEl.dataset.required = attr.required ? 'true' : 'false';

        field.appendChild(labelEl);
        field.appendChild(inputEl);

        if (attr.hint) {
            const hint = document.createElement('span');
            hint.className   = 'attr-hint';
            hint.textContent = attr.hint;
            field.appendChild(hint);
        }

        attrGrid.appendChild(field);
    });

    attributeForm.style.display = 'block';
}

// ── Collect form values ───────────────────────────────────────────────────
function collectAttributes() {
    const inputs  = attrGrid.querySelectorAll('[data-attr-id]');
    const result  = [];
    const missing = [];

    inputs.forEach(el => {
        const val = el.value.trim();
        if (!val && el.dataset.required === 'true') {
            missing.push(el.previousElementSibling?.textContent.replace('REQUIRED', '').trim());
        }
        result.push({ id: el.dataset.attrId, options: val ? [val] : [] });
    });

    return { attributes: result, missing };
}

// ── Lookup flow ───────────────────────────────────────────────────────────
async function runLookup() {
    const sku = skuInput.value.trim();
    if (!sku) { setStatus('Enter a SKU first.', true); return; }

    productMeta.style.display   = 'none';
    attributeForm.style.display = 'none';
    attrGrid.innerHTML          = '';
    setSaveStatus('');
    setStatus('Looking up product…');
    lookupBtn.disabled = true;

    try {
        const product = await fetchProductBySku(sku);
        currentProductId = product.id;
        renderProductMeta(product);

        setStatus('Loading category attributes…');
        const attributes = await fetchCategoryAttributes(product.categoryId);

        if (!attributes.length) {
            setStatus('No attributes found for this category.', true);
            return;
        }

        renderAttributeForm(attributes);
        setStatus('');
    } catch (err) {
        setStatus(err.message || 'Lookup failed.', true);
        currentProductId = null;
    } finally {
        lookupBtn.disabled = false;
    }
}

// ── Save flow ─────────────────────────────────────────────────────────────
async function runSave() {
    if (!currentProductId) return;

    const { attributes, missing } = collectAttributes();
    if (missing.length) {
        setSaveStatus(`Fill in required fields: ${missing.join(', ')}`, 'error');
        return;
    }

    setSaveStatus('Saving…');
    saveAttrBtn.disabled = true;

    try {
        await saveProductAttributes(currentProductId, attributes);
        setSaveStatus('Saved successfully.', 'success');
    } catch (err) {
        setSaveStatus(err.message || 'Save failed.', 'error');
    } finally {
        saveAttrBtn.disabled = false;
    }
}

// ── Event listeners ───────────────────────────────────────────────────────
lookupBtn.addEventListener('click', runLookup);
skuInput.addEventListener('keydown', e => { if (e.key === 'Enter') runLookup(); });
saveAttrBtn.addEventListener('click', runSave);
