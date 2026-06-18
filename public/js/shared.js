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
