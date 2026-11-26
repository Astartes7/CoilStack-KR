const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const core = require('../assets/js/field-core.js');
const app = readFileSync(require.resolve('../assets/js/app.js'), 'utf8');

const marker = { noCoil: true, picName: 'Audit', shift: 'Shift 1', updatedAt: '2026-11-25T02:00:00.000Z' };
const coil = id => ({ id, heatNumber: '001', weight: '1200', supplier: 'A', status: 'AKTIF' });

function setup() {
    const elements = { 'pic-name-input': { value: 'Audit' }, 'shift-select': { value: 'Shift 1' } };
    const ctx = vm.createContext({ CoilField: core, document: { readyState: 'loading', addEventListener() {},
        getElementById: id => elements[id], querySelector: () => ({ value: 'overwrite' }) } });
    vm.runInContext(app, ctx);
    const state = vm.runInContext('appState', ctx);
    const bay = ctx.createLocationRecord('a', 'A', { totalLayers: 2 });
    Object.assign(state, { locations: { a: bay }, activeLocationId: 'a' });
    ctx.loadLocationIntoActiveState('a');
    let saved;
    Object.assign(ctx, { showToast() {}, renderAll() {}, focusQuickSlotInput() {}, closeImportSyncModal() {},
        saveState() { saved = core.clone(state); return true; } });
    return { ctx, state, bay, elements, saved: () => saved };
}

function setupCopyForm() {
    const env = setup();
    const form = { classList: { toggle() {} } };
    for (const id of ['coil-paste-bar', 'coil-paste-data', 'coil-paste-source', 'coil-no-coil', 'coil-no-coil-note',
        'coil-details-fields', 'coil-no-label', 'coil-copy-previous', 'coil-nomor-input', 'coil-id-input',
        'coil-heat-input', 'coil-diameter-input', 'coil-grade-input', 'coil-weight-input', 'coil-weight-unit',
        'coil-supplier-input', 'coil-status-input', 'qr-raw-input', 'quick-save-action']) {
        env.elements[id] = { form, classList: { toggle() {} }, checked: false, value: '', focus() {} };
    }
    env.elements['quick-save-action'].value = 'save';
    let confirmation;
    env.ctx.showConfirmModal = (title, _message, callback) => {
        assert.equal(title, 'Koreksi Posisi Coil?');
        confirmation = callback;
    };
    env.submit = () => {
        confirmation = undefined;
        env.ctx.handleQuickSubmit({ preventDefault() {} });
        return confirmation;
    };
    return env;
}

test('Salin Data stages a correction and only moves the record after confirmation', () => {
    const { ctx, state, bay, elements, submit, saved } = setupCopyForm();
    bay.coils.ATAS_1 = { ...coil('0005'), nomor: '99', diameter: '6.5', grade: 'A', weightUnit: 'mt', fieldVerification: { sessionId: 'old' } };
    bay.coils.BAWAH_KIRI_2 = marker;
    ctx.copyPyramidCoilData('ATAS', 1);
    assert.equal(elements['coil-paste-data'].disabled, true);
    state.activePosition = 'BAWAH_KIRI';
    state.selectedLayer = 2;
    ctx.populateFormForCurrentSlot();
    const targetNomor = elements['coil-nomor-input'].value;
    ctx.pastePyramidCoilData();
    assert.equal(elements['coil-no-coil'].checked, false);
    assert.equal(elements['coil-id-input'].value, '0005');
    assert.equal(elements['coil-heat-input'].value, '001');
    assert.equal(elements['coil-weight-unit'].value, 'mt');
    const confirm = submit();
    assert.equal(typeof confirm, 'function');
    assert.equal(bay.coils.ATAS_1.id, '0005');
    assert.equal(bay.coils.BAWAH_KIRI_2, marker);
    assert.equal(saved(), undefined);

    confirm();
    assert.equal(bay.coils.ATAS_1, undefined);
    assert.equal(saved().locations.a.coils.BAWAH_KIRI_2.id, '0005');
    assert.equal(bay.coils.BAWAH_KIRI_2.nomor, targetNomor);
    assert.equal(bay.coils.BAWAH_KIRI_2.fieldVerification, undefined);
    assert.equal(state.coilHistory.length, 0);
});

test('NO LABEL correction across bays keeps its reference and restores both slots if save fails', () => {
    const { ctx, state, bay, submit } = setupCopyForm();
    const source = { noLabel: true, inventoryRef: 'NL-1234567890ABCDEF', status: 'AKTIF' };
    bay.coils.ATAS_1 = source;
    state.locations.b = ctx.createLocationRecord('b', 'B', { coils: { ATAS_1: marker } });
    ctx.copyPyramidCoilData('ATAS', 1);
    ctx.loadLocationIntoActiveState('b');
    ctx.populateFormForCurrentSlot();
    ctx.pastePyramidCoilData();
    const confirm = submit();
    assert.equal(typeof confirm, 'function');
    const save = ctx.saveState;
    ctx.saveState = () => false;
    confirm();
    assert.equal(bay.coils.ATAS_1, source);
    assert.equal(state.coils.ATAS_1, marker);

    ctx.saveState = save;
    submit()();
    assert.equal(bay.coils.ATAS_1, undefined);
    assert.equal(state.coils.ATAS_1.noLabel, true);
    assert.equal(state.coils.ATAS_1.inventoryRef, source.inventoryRef);
});

test('a pending correction cannot overwrite a filled destination or use a changed source', () => {
    const { ctx, state, bay, submit } = setupCopyForm();
    bay.coils.ATAS_1 = coil('SOURCE');
    ctx.copyPyramidCoilData('ATAS', 1);
    state.selectedLayer = 2;
    ctx.populateFormForCurrentSlot();
    ctx.pastePyramidCoilData();
    const confirm = submit();
    const occupant = coil('OCCUPIED');
    bay.coils.ATAS_2 = occupant;
    confirm();
    assert.equal(bay.coils.ATAS_2, occupant);
    assert.equal(bay.coils.ATAS_1.id, 'SOURCE');

    delete bay.coils.ATAS_2;
    bay.coils.ATAS_1.weight = '1500';
    confirm();
    assert.equal(bay.coils.ATAS_2, undefined);
    assert.equal(bay.coils.ATAS_1.weight, '1500');
});

test('empty-slot checkbox saves without coil data and skips recorded slots when selecting a position', () => {
    const { ctx, state, bay, elements, saved } = setup();
    elements['coil-no-coil'] = { checked: true };
    elements['quick-save-action'] = { value: 'next' };
    state.activePosition = 'ATAS';
    state.selectedLayer = 1;
    ctx.handleQuickSubmit({ preventDefault() {} });
    const item = bay.coils.ATAS_1;
    assert.deepEqual(core.clone(item), { ...marker, updatedAt: item.updatedAt });
    assert.equal(saved().locations.a.coils.ATAS_1.noCoil, true);
    assert.equal(state.selectedLayer, 2);
    assert.equal(ctx.getFirstEmptyLayerForPosition('ATAS'), 2);
    assert.equal(core.records(state, pattern => ctx.generatePositionsList(pattern).positions).length, 0);

    bay.coils.ATAS_2 = coil('PROTECTED');
    ctx.handleQuickSubmit({ preventDefault() {} });
    assert.equal(bay.coils.ATAS_2.id, 'PROTECTED');
});

test('failed marker save leaves the current slot and position unchanged; clearing a marker is explicit', () => {
    const { ctx, state, bay } = setup();
    state.activePosition = 'ATAS';
    state.selectedLayer = 1;
    ctx.saveState = () => false;
    ctx.saveNoCoilSlot('ATAS_1', 'next');
    assert.equal(bay.coils.ATAS_1, undefined);
    assert.equal(state.selectedLayer, 1);

    bay.coils.ATAS_1 = marker;
    let confirm;
    ctx.showConfirmModal = (_title, _message, callback) => { confirm = callback; };
    ctx.clearNoCoilMarker('ATAS', 1);
    assert.equal(bay.coils.ATAS_1, marker);
    confirm();
    assert.equal(bay.coils.ATAS_1, marker);
    ctx.saveState = () => true;
    confirm();
    assert.equal(bay.coils.ATAS_1, undefined);
});

test('CSV and WhatsApp preserve marked-empty slots but never overwrite stock with a marker', () => {
    const src = setup();
    src.bay.coils.ATAS_2 = marker;
    const csv = src.ctx.buildInventoryCsv([src.bay], false, false);
    const report = src.ctx.buildLocationReportLines(src.bay).join('\n');
    assert.match(report, /Tidak ada Coil \| Tim:Audit/);
    assert.match(report, /\(Belum diisi\)/);
    for (const [text, apply] of [
        [csv, (dest, text) => dest.ctx.importFromCsvText(text, true)],
        [report, (dest, text) => { dest.elements['import-text-area'] = { value: text }; dest.ctx.processImportSync(); }]
    ]) {
        const dest = setup();
        apply(dest, text);
        assert.deepEqual(core.clone(dest.bay.coils.ATAS_2), marker);
        assert.equal(dest.bay.coils.ATAS_1, undefined);
        dest.bay.coils.ATAS_2 = coil('REAL');
        apply(dest, text);
        assert.equal(dest.bay.coils.ATAS_2.id, 'REAL');
    }
    src.bay.coils.ATAS_2 = coil('NEW');
    const dest = setup();
    dest.bay.coils.ATAS_2 = marker;
    dest.ctx.importFromCsvText(src.ctx.buildInventoryCsv([src.bay], false, false), false);
    assert.equal(dest.bay.coils.ATAS_2.id, 'NEW');
});

test('moving a real coil to a marked slot replaces the marker, not an inventory record', () => {
    const { ctx, bay, state } = setup();
    const positions = pattern => ctx.generatePositionsList(pattern).positions;
    bay.coils.ATAS_1 = coil('REAL');
    bay.coils.ATAS_2 = marker;
    const records = core.records(state, positions);
    assert.equal(records.length, 1);
    assert.equal(core.startSession(state, bay.id, 'Audit', 'Shift 1', positions).expected.length, 1);
    core.move(state, records[0], { locId: 'a', type: 'pyramid', posId: 'ATAS', layer: 2 }, 'Audit', 'Shift 1', 'Relocate', true, positions);
    assert.equal(bay.coils.ATAS_1, undefined);
    assert.equal(core.isNoCoil(bay.coils.ATAS_2), false);
    assert.equal(bay.coils.ATAS_2.id, 'REAL');
});

test('hiding upper rows in 3-2-1 reveals the pair, then the full base, across all depth layers', () => {
    const { ctx } = setup();
    const rows = core.pyramidRows(ctx.generatePositionsList('3-2-1').positions);
    const geometry = core.overheadGeometry(rows);
    assert.equal(geometry.columns, 6);
    const coils = {};
    for (const pos of rows.flat()) {
        for (const layer of [1, 2]) coils[`${pos.id}_${layer}`] = coil(`${pos.seq}/${layer}`);
    }
    const before = core.clone(coils);
    const visible = (layer, count) => Array.from(core.projectOverheadLayer(geometry, layer, coils,
        core.overheadHiddenPositions(rows, count)), ({ pos, width }) => [pos.seq, width]);

    for (const layer of [1, 2]) {
        const all = [[4, 1], [2, 1], [1, 2], [3, 1], [6, 1]];
        assert.deepEqual(visible(layer, 0), all);
        assert.deepEqual(visible(layer, 1), [[4, 1], [2, 2], [3, 2], [6, 1]]);
        assert.deepEqual(visible(layer, 2), [[4, 2], [5, 2], [6, 2]]);
        assert.deepEqual(visible(layer, 0), all);
    }
    assert.deepEqual(coils, before);
});

test('row hiding follows pyramid positions even when a row is empty in one layer', () => {
    const { ctx } = setup();
    const rows = core.pyramidRows(ctx.generatePositionsList('3-2-1').positions);
    const geometry = core.overheadGeometry(rows);
    const coils = {
        ATAS_1: coil('TOP'), BAWAH_TENGAH_1: coil('BELOW'), BAWAH_KIRI_1: coil('LEFT'),
        BAWAH_KANAN_1: marker, ATAS_2: marker, [`${rows[1][0].id}_2`]: coil('PAIR')
    };
    const visible = (layer, count) => Array.from(core.projectOverheadLayer(geometry, layer, coils,
        core.overheadHiddenPositions(rows, count)), node => node.item.id);
    assert.deepEqual(visible(1, 0), ['LEFT', 'TOP']);
    assert.deepEqual(visible(1, 1), ['LEFT', 'BELOW']);
    assert.deepEqual(visible(2, 1), ['PAIR']);
    assert.deepEqual(visible(2, 2), []);
});

test('custom centered patterns report which half of a partially covered coil to draw', () => {
    const { ctx } = setup();
    const rows = core.pyramidRows(ctx.generatePositionsList('4-3').positions);
    const geometry = core.overheadGeometry(rows);
    const [upper, lower] = rows;
    const coils = {
        [`${upper[0].id}_1`]: coil('UP-L'), [`${upper.at(-1).id}_1`]: coil('UP-R'),
        [`${lower[0].id}_1`]: coil('DOWN-L'), [`${lower.at(-1).id}_1`]: coil('DOWN-R')
    };
    const nodes = core.projectOverheadLayer(geometry, 1, coils, new Set());
    assert.deepEqual(Array.from(nodes, ({ item, start, width, offset }) => [item.id, start, width, offset]),
        [['DOWN-L', 0, 1, 0], ['UP-L', 1, 2, 0], ['UP-R', 5, 2, 0], ['DOWN-R', 7, 1, 1]]);
});
