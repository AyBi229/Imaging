'use strict';

const BYPASS = '{{hoZpjWX3KSZJOLglFxEQafKEYZ6WKr5h}}'

// ── DOM refs ──────────────────────────────────────────────────────────────
const skuInput        = document.getElementById('attrSkuInput');
const lookupBtn       = document.getElementById('attrLookupBtn');
const attrStatus      = document.getElementById('attrStatus');
const productMeta     = document.getElementById('productMeta');
const childrenSection = document.getElementById('childrenSection');

// ── State ─────────────────────────────────────────────────────────────────
let currentProduct    = null;
let currentAttributes = [];
// Map of childId -> saved attributes array
const savedChildAttrs = {};

// ── API ───────────────────────────────────────────────────────────────────
async function fetchProductBySku(sku) {
    const res  = await fetch(`/api/attributes/product?sku=${encodeURIComponent(sku)}&x-vercel-protection-bypass=${BYPASS}`);
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.error || 'Lookup failed.');
    return data.product;
}

async function fetchCategoryAttributes(categoryId) {
    const res  = await fetch(`/api/attributes/category?id=${categoryId}&x-vercel-protection-bypass=${BYPASS}`);
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.error || 'Could not load attributes.');
    return data.attributes;
}

async function apiSave(productIds, attributes) {
    const res  = await fetch(`/api/attributes/save?x-vercel-protection-bypass=${BYPASS}`, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ productIds, attributes }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.error || 'Save failed.');
    return data;
}

// ── Helpers ───────────────────────────────────────────────────────────────
function setStatus(msg, isError = false) {
    attrStatus.textContent = msg;
    attrStatus.className   = isError ? 'error' : '';
}

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function buildAttrFields(attributes, prefix) {
    const grid = document.createElement('div');
    grid.className = 'attr-grid';

    attributes.forEach(attr => {
        const field    = document.createElement('div');
        field.className = 'attr-field';

        const labelEl  = document.createElement('label');
        labelEl.htmlFor = `${prefix}_${attr.id}`;
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

        inputEl.id               = `${prefix}_${attr.id}`;
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

        grid.appendChild(field);
    });

    return grid;
}

function collectFromGrid(grid) {
    const inputs  = grid.querySelectorAll('[data-attr-id]');
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

// ── Merge all saved children's attributes for parent ─────────────────────
function buildParentAttributes() {
    // For each attribute id, collect all unique options across all saved children
    const merged = {};

    Object.values(savedChildAttrs).forEach(attrs => {
        attrs.forEach(attr => {
            if (!merged[attr.id]) merged[attr.id] = new Set();
            attr.options.forEach(o => { if (o) merged[attr.id].add(o); });
        });
    });

    return Object.entries(merged).map(([id, opts]) => ({
        id,
        options: Array.from(opts),
    }));
}

// ── Render ────────────────────────────────────────────────────────────────
function renderProductMeta(product) {
    productMeta.style.display = 'flex';
    productMeta.innerHTML = `
        <span>
            <strong>${escapeHtml(product.name)}</strong>
            &nbsp;·&nbsp; SKU: <strong>${escapeHtml(product.sku)}</strong>
            &nbsp;·&nbsp; Category: <span class="meta-category">${escapeHtml(product.categoryName)}</span>
            &nbsp;·&nbsp; ID: ${product.id}
        </span>
        <button id="copyAttrsBtn" onclick="copyAttributeLabels()">Copy attributes</button>
    `;
}

function renderChildrenSection(product, attributes) {
    childrenSection.innerHTML = '';
    childrenSection.style.display = 'block';

    const children = product.children || [];

    // ── One card per child ────────────────────────────────────────────────
    children.forEach(child => {
        const card = document.createElement('div');
        card.className = 'child-card';
        card.id        = `child-card-${child.id}`;

        const header = document.createElement('div');
        header.className = 'child-card-header';
        header.innerHTML = `
            <span class="child-card-title">
                <strong>${escapeHtml(child.name)}</strong>
                <span class="child-sku">${escapeHtml(child.sku)}</span>
            </span>
            <span class="child-status pending" id="child-status-${child.id}">unsaved</span>
        `;

        const grid    = buildAttrFields(attributes, `child_${child.id}`);
        grid.id       = `child-grid-${child.id}`;

        const saveBar = document.createElement('div');
        saveBar.className = 'save-bar';

        const btn = document.createElement('button');
        btn.className   = 'child-save-btn';
        btn.textContent = 'Save child';
        btn.dataset.childId = child.id;
        btn.addEventListener('click', () => saveChild(child.id, btn));

        const statusEl = document.createElement('span');
        statusEl.className = 'child-save-status';
        statusEl.id        = `child-save-status-${child.id}`;

        saveBar.appendChild(btn);
        saveBar.appendChild(statusEl);

        card.appendChild(header);
        card.appendChild(grid);
        card.appendChild(saveBar);
        childrenSection.appendChild(card);
    });

    // ── Parent save button (disabled until at least one child saved) ──────
    const parentBar = document.createElement('div');
    parentBar.className = 'parent-save-bar';
    parentBar.id        = 'parentSaveBar';

    const parentBtn = document.createElement('button');
    parentBtn.id        = 'saveParentBtn';
    parentBtn.className = 'save-parent-btn';
    parentBtn.textContent = 'Save to parent';
    parentBtn.disabled  = true;
    parentBtn.addEventListener('click', saveParent);

    const parentStatus = document.createElement('span');
    parentStatus.id        = 'parentSaveStatus';
    parentStatus.className = 'parent-save-status';

    parentBar.appendChild(parentBtn);
    parentBar.appendChild(parentStatus);
    childrenSection.appendChild(parentBar);
}

// ── Save a single child ───────────────────────────────────────────────────
async function saveChild(childId, btn) {
    const grid = document.getElementById(`child-grid-${childId}`);
    const statusEl = document.getElementById(`child-save-status-${childId}`);
    const badgeEl  = document.getElementById(`child-status-${childId}`);

    const { attributes, missing } = collectFromGrid(grid);

    if (missing.length) {
        statusEl.textContent = `Fill in: ${missing.join(', ')}`;
        statusEl.className   = 'child-save-status error';
        return;
    }

    btn.disabled         = true;
    statusEl.textContent = 'Saving…';
    statusEl.className   = 'child-save-status';
    badgeEl.textContent  = 'saving…';
    badgeEl.className    = 'child-status saving';

    try {
        await apiSave([childId], attributes);

        savedChildAttrs[childId] = attributes;

        badgeEl.textContent  = 'saved ✓';
        badgeEl.className    = 'child-status saved';
        statusEl.textContent = 'Saved.';
        statusEl.className   = 'child-save-status success';

        // Enable parent save button
        document.getElementById('saveParentBtn').disabled = false;

    } catch (err) {
        badgeEl.textContent  = 'failed';
        badgeEl.className    = 'child-status failed';
        statusEl.textContent = err.message || 'Save failed.';
        statusEl.className   = 'child-save-status error';
        btn.disabled         = false;
    }
}

// ── Save parent with merged terms ─────────────────────────────────────────
async function saveParent() {
    const btn      = document.getElementById('saveParentBtn');
    const statusEl = document.getElementById('parentSaveStatus');

    const mergedAttrs = buildParentAttributes();
    if (!mergedAttrs.length) {
        statusEl.textContent = 'No saved child attributes to merge.';
        statusEl.className   = 'parent-save-status error';
        return;
    }

    btn.disabled         = true;
    statusEl.textContent = 'Saving to parent…';
    statusEl.className   = 'parent-save-status';

    try {
        await apiSave([currentProduct.id], mergedAttrs);
        statusEl.textContent = 'Parent saved ✓';
        statusEl.className   = 'parent-save-status success';
    } catch (err) {
        statusEl.textContent = err.message || 'Save failed.';
        statusEl.className   = 'parent-save-status error';
        btn.disabled         = false;
    }
}

// ── Copy attribute labels ─────────────────────────────────────────────────
function copyAttributeLabels() {
    const text = currentAttributes.map(a => a.label).join(', ');
    navigator.clipboard.writeText(text).then(() => {
        const btn  = document.getElementById('copyAttrsBtn');
        const orig = btn.textContent;
        btn.textContent = 'Copied!';
        setTimeout(() => { btn.textContent = orig; }, 1500);
    });
}

// ── Lookup flow ───────────────────────────────────────────────────────────
async function runLookup() {
    const sku = skuInput.value.trim();
    if (!sku) { setStatus('Enter a SKU first.', true); return; }

    productMeta.style.display    = 'none';
    childrenSection.style.display = 'none';
    childrenSection.innerHTML    = '';
    Object.keys(savedChildAttrs).forEach(k => delete savedChildAttrs[k]);
    setStatus('Looking up product…');
    lookupBtn.disabled = true;

    try {
        const product    = await fetchProductBySku(sku);
        currentProduct   = product;

        renderProductMeta(product);

        setStatus('Loading category attributes…');
        const attributes = await fetchCategoryAttributes(product.categoryId);

        if (!attributes.length) {
            setStatus('No attributes found for this category.', true);
            return;
        }

        currentAttributes = attributes;
        renderChildrenSection(product, attributes);
        setStatus('');
    } catch (err) {
        setStatus(err.message || 'Lookup failed.', true);
        currentProduct = null;
    } finally {
        lookupBtn.disabled = false;
    }
}

// ── Event listeners ───────────────────────────────────────────────────────
lookupBtn.addEventListener('click', runLookup);
skuInput.addEventListener('keydown', e => { if (e.key === 'Enter') runLookup(); });
