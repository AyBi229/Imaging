/**
 * attributeEditor.js
 *
 * Flow:
 *  1. User enters a grouped product SKU → lookupProductBySku()
 *  2. Fetch product → get its category ID
 *  3. Fetch category attributes → renderAttributeForm()
 *  4. User fills in values → saveAttributes()
 *
 * ── API stubs ──────────────────────────────────────────────────────────────
 * Replace the three STUB functions below with real WooCommerce REST calls.
 * All three are async and must resolve to the shapes described in their JSDoc.
 * ──────────────────────────────────────────────────────────────────────────
 */

'use strict';

// ── Config ────────────────────────────────────────────────────────────────
const WC_BASE   = 'https://store.local/wp-json/wc/v3';   // adjust if needed
const WC_KEY    = 'ck_YOUR_KEY';                          // consumer key
const WC_SECRET = 'cs_YOUR_SECRET';                       // consumer secret

/** Basic-auth header for WooCommerce REST API */
function wcHeaders() {
    const token = btoa(`${WC_KEY}:${WC_SECRET}`);
    return { Authorization: `Basic ${token}`, 'Content-Type': 'application/json' };
}

// ── DOM refs ──────────────────────────────────────────────────────────────
const skuInput       = document.getElementById('attrSkuInput');
const lookupBtn      = document.getElementById('attrLookupBtn');
const attrStatus     = document.getElementById('attrStatus');
const productMeta    = document.getElementById('productMeta');
const attributeForm  = document.getElementById('attributeForm');
const attrGrid       = document.getElementById('attrGrid');
const saveAttrBtn    = document.getElementById('saveAttrBtn');
const saveStatus     = document.getElementById('saveStatus');

// ── State ─────────────────────────────────────────────────────────────────
let currentProductId = null;   // WooCommerce product ID resolved from SKU

// ═══════════════════════════════════════════════════════════════════════════
//  STUB 1 — Fetch product by SKU
//  Replace with: GET /wp-json/wc/v3/products?sku=<sku>&type=grouped
// ═══════════════════════════════════════════════════════════════════════════
/**
 * @param {string} sku
 * @returns {Promise<{id: number, name: string, sku: string, categoryId: number, categoryName: string}>}
 */
async function fetchProductBySku(sku) {
    // ── REAL IMPLEMENTATION (uncomment when ready) ─────────────────────
    // const res = await fetch(
    //   `${WC_BASE}/products?sku=${encodeURIComponent(sku)}&type=grouped`,
    //   { headers: wcHeaders() }
    // );
    // if (!res.ok) throw new Error(`WooCommerce error: ${res.status}`);
    // const products = await res.json();
    // if (!products.length) throw new Error('No grouped product found with that SKU.');
    // const p = products[0];
    // return {
    //   id:           p.id,
    //   name:         p.name,
    //   sku:          p.sku,
    //   categoryId:   p.categories[0]?.id,
    //   categoryName: p.categories[0]?.name ?? 'Unknown',
    // };
    // ── STUB (remove when real impl is active) ─────────────────────────
    await delay(600);
    if (sku.toLowerCase() === 'error') throw new Error('No grouped product found with that SKU.');
    return {
        id:           1042,
        name:         'Demo Grouped Product',
        sku:          sku,
        categoryId:   7,
        categoryName: 'Cable Assemblies',
    };
}

// ═══════════════════════════════════════════════════════════════════════════
//  STUB 2 — Fetch attributes for a category
//  WooCommerce doesn't have a native "category → attributes" endpoint.
//  Options: custom REST endpoint, ACF, or a local mapping object.
// ═══════════════════════════════════════════════════════════════════════════
/**
 * @param {number} categoryId
 * @returns {Promise<Array<{
 *   id:       string,   // attribute slug / WC attribute id
 *   label:    string,   // human-readable name shown in the UI
 *   type:     'text'|'select'|'number',
 *   options?: string[], // only for type === 'select'
 *   required: boolean,
 *   hint?:    string,   // optional helper text shown below the field
 * }>>}
 */
async function fetchCategoryAttributes(categoryId) {
    // ── REAL IMPLEMENTATION (uncomment when ready) ─────────────────────
    // Example: call a custom endpoint you've registered in WP
    // const res = await fetch(
    //   `${WC_BASE}/category-attributes?category_id=${categoryId}`,
    //   { headers: wcHeaders() }
    // );
    // if (!res.ok) throw new Error(`Could not load attributes: ${res.status}`);
    // return res.json();
    // ── STUB ───────────────────────────────────────────────────────────
    await delay(400);
    const map = {
        7: [   // Cable Assemblies
            { id: 'pa_connector-a',  label: 'Connector A',    type: 'select',
              options: ['SMA', 'BNC', 'N-Type', 'TNC', 'MCX'], required: true },
            { id: 'pa_connector-b',  label: 'Connector B',    type: 'select',
              options: ['SMA', 'BNC', 'N-Type', 'TNC', 'MCX'], required: true },
            { id: 'pa_cable-type',   label: 'Cable Type',     type: 'text',   required: true,
              hint: 'e.g. RG-58, LMR-400' },
            { id: 'pa_length-cm',    label: 'Length (cm)',     type: 'number', required: true },
            { id: 'pa_impedance',    label: 'Impedance (Ω)',   type: 'select',
              options: ['50', '75'], required: false },
            { id: 'pa_color',        label: 'Jacket Colour',  type: 'text',   required: false,
              hint: 'e.g. Black, Grey' },
        ],
    };
    return map[categoryId] ?? [
        { id: 'pa_generic', label: 'Attribute', type: 'text', required: false },
    ];
}

// ═══════════════════════════════════════════════════════════════════════════
//  STUB 3 — Save attributes to product
//  PUT /wp-json/wc/v3/products/<id>  { attributes: [...] }
// ═══════════════════════════════════════════════════════════════════════════
/**
 * @param {number} productId
 * @param {Array<{id: string, options: string[]}>} attributes
 * @returns {Promise<void>}
 */
async function saveProductAttributes(productId, attributes) {
    // ── REAL IMPLEMENTATION (uncomment when ready) ─────────────────────
    // const res = await fetch(`${WC_BASE}/products/${productId}`, {
    //   method: 'PUT',
    //   headers: wcHeaders(),
    //   body: JSON.stringify({ attributes }),
    // });
    // if (!res.ok) throw new Error(`Save failed: ${res.status}`);
    // ── STUB ───────────────────────────────────────────────────────────
    await delay(700);
    console.log('STUB save — productId:', productId, 'attributes:', attributes);
}

// ── Helpers ───────────────────────────────────────────────────────────────
const delay = ms => new Promise(r => setTimeout(r, ms));

function setStatus(msg, isError = false) {
    attrStatus.textContent   = msg;
    attrStatus.className     = isError ? 'error' : '';
}

function setSaveStatus(msg, type = '') {
    saveStatus.textContent = msg;
    saveStatus.className   = type;
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
            + (attr.required ? '<span class="badge-required">required</span>' : '');

        let inputEl;
        if (attr.type === 'select' && attr.options?.length) {
            inputEl = document.createElement('select');
            inputEl.innerHTML = `<option value="">— select —</option>`
                + attr.options.map(o => `<option value="${escapeHtml(o)}">${escapeHtml(o)}</option>`).join('');
        } else {
            inputEl = document.createElement('input');
            inputEl.type = attr.type === 'number' ? 'number' : 'text';
            inputEl.placeholder = attr.hint ?? '';
        }
        inputEl.id = `attr_${attr.id}`;
        inputEl.dataset.attrId = attr.id;
        inputEl.dataset.required = attr.required ? 'true' : 'false';

        field.appendChild(labelEl);
        field.appendChild(inputEl);

        if (attr.hint && attr.type !== 'number') {
            const hint = document.createElement('span');
            hint.className = 'attr-hint';
            hint.textContent = attr.hint;
            field.appendChild(hint);
        }

        attrGrid.appendChild(field);
    });

    attributeForm.style.display = 'block';
}

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// ── Collect form values ───────────────────────────────────────────────────
function collectAttributes() {
    const inputs  = attrGrid.querySelectorAll('[data-attr-id]');
    const result  = [];
    let   missing = [];

    inputs.forEach(el => {
        const val = el.value.trim();
        if (!val && el.dataset.required === 'true') {
            missing.push(el.previousElementSibling?.textContent.replace('required', '').trim());
        }
        result.push({ id: el.dataset.attrId, options: val ? [val] : [] });
    });

    return { attributes: result, missing };
}

// ── Main lookup flow ──────────────────────────────────────────────────────
async function runLookup() {
    const sku = skuInput.value.trim();
    if (!sku) { setStatus('Enter a SKU first.', true); return; }

    // Reset
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
            setStatus('No attributes are assigned to this category.', true);
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
