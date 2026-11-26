const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const core = require('../assets/js/field-core.js');
const script = readFileSync(path.join(__dirname, '../assets/js/app.js'), 'utf8');

const bare = n => ({ id: '', heatNumber: '', noLabel: true, inventoryRef: `NL-${String(n).padStart(16, '0')}`, status: 'AKTIF' });
const labeled = (id, heatNumber = '001') => ({ id, heatNumber, weight: '1200', supplier: 'A', status: 'AKTIF' });
const bay = (id, name) => ({ id, name, stackPattern: '3-2-1', totalLayers: 2, coils: {}, nonPyramidCoils: [] });
function inventory() {
    const ctx = vm.createContext({ CoilField: core, document: { readyState: 'loading', addEventListener() {} } });
    vm.runInContext(script, ctx);
    const state = vm.runInContext('appState', ctx);
    const a = bay('a', 'A'), b = bay('b', 'B');
    Object.assign(state, { locations: { a, b }, activeLocationId: 'a', coils: a.coils, nonPyramidCoils: a.nonPyramidCoils });
    return { ctx, state, a, b };
}
function data(ctx, csv) {
    const [headers, ...rows] = ctx.parseCsvRows(csv.trimStart());
    return Array.from(rows, row => Object.fromEntries(headers.map((h, i) => [h, row[i]]))).filter(row => row.No_Coil);
}

test('CSV history follows both controls and includes a legacy non-pyramid exit exactly once', () => {
    const { ctx, a, b, state } = inventory();
    a.coils.ATAS_1 = bare(1);
    b.nonPyramidCoils.push(labeled('ACTIVE-B'));
    const exit = { ...bare(2), status: 'HILANG', updatedAt: 'yesterday' };
    a.nonPyramidCoils.push(exit, { ...labeled('OLD-ONLY'), status: 'HILANG' });
    state.coilHistory.push({ ...exit, type: 'nonpyramid', position: 'Samping', locId: 'a', locName: 'A', exitedAt: 'yesterday' },
        { ...labeled('USED-B'), type: 'pyramid', locId: 'b', locName: 'B', status: 'DIPAKAI_PRODUKSI' },
        { ...labeled('OLD-BAY'), type: 'pyramid', locId: 'deleted', locName: 'Former bay', status: 'HILANG' });
    const ids = (locs, history, all) => data(ctx, ctx.buildInventoryCsv(locs, history, all)).map(r => r.Inventory_Ref || r.No_Coil).sort();
    assert.deepEqual(ids([a], false, false), [bare(1).inventoryRef]);
    assert.deepEqual(ids([a, b], false, true), ['ACTIVE-B', bare(1).inventoryRef]);
    assert.deepEqual(ids([a], true, false), [bare(1).inventoryRef, bare(2).inventoryRef, 'OLD-ONLY']);
    assert.deepEqual(ids([a, b], true, true), ['ACTIVE-B', bare(1).inventoryRef, bare(2).inventoryRef, 'OLD-BAY', 'OLD-ONLY', 'USED-B']);
});

test('CSV round-trip preserves distinct unlabeled coils, unknown weights, leading zeros and active stock sharing a historical identity', () => {
    const src = inventory(), dest = inventory();
    src.a.coils.ATAS_2 = bare(1);
    src.a.nonPyramidCoils.push(bare(2), bare(3), labeled('008', '001'), labeled('008', '002'));
    src.ctx.archiveCoilRecord({ ...bare(2), status: 'HILANG', updatedAt: 'then' }, { locId: 'a', locName: 'A', type: 'nonpyramid', position: 'Samping' });
    const csv = src.ctx.buildInventoryCsv([src.a], true, false);
    for (const overwrite of [false, false, true]) dest.ctx.importFromCsvText(csv, overwrite);
    assert.equal(dest.a.coils.ATAS_2.inventoryRef, bare(1).inventoryRef);
    const np = dest.a.nonPyramidCoils;
    assert.deepEqual(np.map(x => x.inventoryRef || x.heatNumber), [bare(2).inventoryRef, bare(3).inventoryRef, '001', '002']);
    assert.equal(np[0].weight, '');
    assert.equal(dest.state.coilHistory.length, 1);
    assert.equal(dest.state.coilHistory[0].inventoryRef, bare(2).inventoryRef);
});

test('fill-only rejects an occupied destination before removing the source; accepted relocation preserves the neighbor', () => {
    const { ctx, a, b } = inventory();
    a.nonPyramidCoils.push(bare(1), bare(2));
    b.coils.ATAS_1 = labeled('OCCUPANT');
    const csv = `Lokasi,Layer,Posisi,No_Coil,No_Label,Inventory_Ref\nB,1,Atas,NO LABEL,TRUE,${bare(1).inventoryRef}`;
    assert.equal(ctx.importFromCsvText(csv, false).importedCount, 0);
    assert.equal(a.nonPyramidCoils.length, 2);
    assert.equal(b.coils.ATAS_1.id, 'OCCUPANT');
    assert.equal(ctx.importFromCsvText(csv, true).relocatedCount, 1);
    assert.deepEqual(a.nonPyramidCoils.map(x => x.inventoryRef), [bare(2).inventoryRef]);
    assert.equal(b.coils.ATAS_1.inventoryRef, bare(1).inventoryRef);
});

test('legacy placeholders remain literal and an explicitly unlabeled row with an invalid reference is skipped', () => {
    const { ctx, a } = inventory();
    ctx.importFromCsvText('Lokasi,Layer,Posisi,No_Coil,Heat_Number,Berat,Supplier,No_Label,Inventory_Ref\nA,1,Atas,NO LABEL,0,1,X,,\nA,2,Atas,NO LABEL,,,,TRUE,wrong', true);
    assert.equal(a.coils.ATAS_1.id, 'NO LABEL');
    assert.equal(core.isNoLabel(a.coils.ATAS_1), false);
    assert.equal(a.coils.ATAS_2, undefined);
});
