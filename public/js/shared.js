/**
 * shared.js — globals shared across all pipeline modules.
 *
 * Exposes:
 *   window.pasteActiveZone     — 'pipeline' | 'crop'
 *   window.getOutputResolution() — always returns 1000
 */

window.pasteActiveZone = 'pipeline';

window.getOutputResolution = function () { return 1000; };
