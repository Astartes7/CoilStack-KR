const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const core = require('../assets/js/field-core.js');
const positions = pattern => pattern === '2-1'
    ? [{ id: 'R2_C1', shortLabel: 'Puncak' }, { id: 'R1_C1', shortLabel: 'Bawah Kiri' }, { id: 'R1_C2', shortLabel: 'Bawah Kanan' }]
    : [{ id: 'ATAS', shortLabel: 'Atas' }, { id: 'BAWAH_KIRI', shortLabel: 'Bawah Kiri' }];
const now = '2026-11-25T02:00:00.000Z';
const coil = (id = '008', heat = 'H1') => ({ id, heatNumber: heat, nomor: '1', diameter: '5.5',
    grade: 'SWRH52A', supplier: 'SHAGANG', weight: '2344', weightUnit: 'kg', status: 'AKTIF' });
function fixture() {
    return { locations: {
        a: { id: 'a', name: 'BAY-A', stackPattern: '3-2-1', totalLayers: 2,
            coils: { ATAS_1: coil(), BAWAH_KIRI_2: coil('008', 'H2') }, nonPyramidCoils: [] },
        b: { id: 'b', name: 'BAY-B', stackPattern: '2-1', totalLayers: 3, coils: {}, nonPyramidCoils: [] }
    }, checkSessions: [], coilMovements: [] };
}
const actual = (overrides = {}) => ({ locId: 'a', locName: 'BAY-A', type: 'pyramid', posId: 'ATAS', position: 'Atas', layer: 1, ...overrides });
const source = state => core.clone(core.records(state, positions)[0]);
const session = state => core.startSession(state, 'a', 'Ahmad', 'Shift 1', positions, now);
const observe = (state, current, observed = coil(), where = actual(), confirmed = true) => core.check(state, current, observed, where, confirmed, '', positions, now);
const move = (state, from = source(state), to = { locId: 'b', type: 'pyramid', posId: 'R2_C1', layer: 2 }) => core.move(state, from, to, 'Ahmad', 'Shift 1', 'Penataan ulang', true, positions, now);

test('compound identity preserves leading zeros and separates heat numbers', () => {
    const all = core.records(fixture(), positions);
    assert.equal(core.lookup(all, { id: ' 008 ', heatNumber: ' h1 ' }).matches[0].item.heatNumber, 'H1');
    assert.equal(core.lookup(all, { id: '008' }).kind, 'incomplete');
    assert.equal(core.lookup(all, { id: '008' }).matches.length, 2);
    assert.equal(core.lookup(all, { id: '8', heatNumber: 'H1' }).kind, 'unregistered');
});

test('editing the same identity retains field metadata but a replacement does not inherit it', () => {
    const previous = { ...coil(), fieldVerification: { at: now }, lastMovedAt: now, floorAddress: 'A / 01' };
    assert.ok(core.editBase(previous, { id: ' 008 ', heatNumber: 'h1' }).fieldVerification);
    const replacement = core.editBase(previous, { id: 'NEW', heatNumber: 'H1' });
    assert.equal(replacement.fieldVerification, undefined);
    assert.equal(replacement.lastMovedAt, undefined);
    assert.equal(replacement.floorAddress, 'A / 01');
    assert.ok(previous.fieldVerification);
});

test('parses supplier QR, copied Master Steel text, JSON and plain coil ID', () => {
    const label = core.parseLabel('SHAGANG-SWRH52A-H1-008-2.344-5.5-20260906');
    assert.equal(label.id, '008');
    assert.equal(label.heatNumber, 'H1');
    assert.equal(label.weightUnit, 'mt');
    const master = core.parseLabel('Code No.: 0009\nHeat No.: HX\nSize: Ø 5,5 mm\nGrade: A\nWeight: 2,344 kg');
    assert.equal(master.weight, '2344');
    assert.equal(master.diameter, '5,5');
    assert.equal(core.parseLabel('{"id":"008","heatNumber":"H1"}').id, '008');
    assert.deepEqual(core.parseLabel('008'), { id: '008' });
});

test('supplier URLs require copying page text and unsafe/invalid inputs fail closed', () => {
    assert.ok(core.parseLabel('https://themastersteel.co.id/coil/008').externalUrl);
    assert.throws(() => core.parseLabel('https://themastersteel.co.id.evil.test/008'));
    assert.throws(() => core.parseLabel('{broken'));
    assert.throws(() => core.parseLabel('{}'));
    assert.throws(() => core.parseLabel(''));
});

test('spec comparison normalizes units, decimal comma and case without altering inventory', () => {
    const item = coil();
    const original = core.clone(item);
    assert.deepEqual(core.differences(item, { weight: '2,344', weightUnit: 'mt', diameter: '5,5', grade: ' swrh52a ' }), []);
    assert.deepEqual(core.differences(item, { weight: '2.5', weightUnit: 'mt', grade: 'OTHER' }), ['grade', 'weight']);
    assert.deepEqual(item, original);
});

test('sessions snapshot expected inventory and permit only one active session', () => {
    const state = fixture();
    const current = session(state);
    state.locations.a.coils.ATAS_1.grade = 'CHANGED';
    assert.equal(current.expected[0].item.grade, 'SWRH52A');
    assert.throws(() => session(state), /sesi aktif/);
    assert.throws(() => core.startSession(fixture(), 'a', '', 'Shift 1', positions), /pemeriksa/);
});

test('matching checks save independent verification time and operator', () => {
    const state = fixture();
    const current = session(state);
    assert.equal(observe(state, current).outcome, 'matched');
    const record = core.records(state, positions)[0];
    assert.ok(core.verified(record));
    assert.equal(record.item.fieldVerification.operator, 'Ahmad');
    assert.equal(core.progress(current, core.records(state, positions))[0].outcome, 'matched');
});

test('missing heat, physical confirmation and invalid observed slot do not write a check', () => {
    const state = fixture();
    const current = session(state);
    assert.throws(() => observe(state, current, { id: '008' }), /Heat/);
    assert.throws(() => observe(state, current, coil(), actual(), false), /Konfirmasi/);
    assert.throws(() => observe(state, current, coil(), actual({ layer: 0 })), /valid/);
    assert.throws(() => observe(state, current, coil(), actual({ locId: 'b' })), /lokasi sesi/);
    assert.equal(current.checks.length, 0);
});

test('wrong location, mismatch and unregistered observations never overwrite stock', () => {
    const state = fixture();
    const current = session(state);
    const before = core.clone(state.locations);
    assert.equal(observe(state, current, coil(), actual({ posId: 'BAWAH_KIRI', layer: 2 })).outcome, 'wrong_location');
    assert.equal(observe(state, current, { ...coil(), grade: 'OTHER' }).outcome, 'mismatch');
    assert.equal(observe(state, current, coil('X', 'HX')).outcome, 'unregistered');
    assert.deepEqual(state.locations, before);
});

test('duplicates block both verification and movement', () => {
    const state = fixture();
    state.locations.b.coils.R2_C1_1 = coil();
    const current = session(state);
    assert.equal(core.lookup(core.records(state, positions), coil()).kind, 'ambiguous');
    assert.throws(() => observe(state, current), /ganda/);
    assert.throws(() => move(state), /ganda/);
    assert.equal(current.checks.length, 0);
});

test('latest observation governs progress; repeats do not inflate matched count', () => {
    const state = fixture();
    const current = session(state);
    observe(state, current);
    observe(state, current);
    assert.equal(core.progress(current, core.records(state, positions)).filter(row => row.outcome === 'matched').length, 1);
    observe(state, current, { ...coil(), grade: 'OTHER' });
    assert.equal(core.progress(current, core.records(state, positions))[0].outcome, 'mismatch');
    assert.equal(core.verified(core.records(state, positions)[0]), false);
    observe(state, current);
    assert.ok(core.verified(core.records(state, positions)[0]));
});

test('finished sessions keep unchecked coils and immutable final results', () => {
    const state = fixture();
    const current = session(state);
    observe(state, current);
    core.finishSession(state, current, positions, now);
    assert.equal(current.finalRows[1].outcome, 'unchecked');
    assert.equal(state.locations.a.coils.BAWAH_KIRI_2.status, 'AKTIF');
    state.locations.a.coils.ATAS_1.grade = 'NEW';
    assert.equal(current.finalRows[0].outcome, 'matched');
    assert.throws(() => observe(state, current), /sesi/);
    assert.ok(session(state));
});

test('moving across patterns preserves specifications, frees source and writes audit', () => {
    const state = fixture();
    const original = core.clone(state.locations.a.coils.ATAS_1);
    const event = move(state);
    assert.equal(state.locations.a.coils.ATAS_1, undefined);
    const moved = state.locations.b.coils.R2_C1_2;
    ['id', 'heatNumber', 'supplier', 'grade', 'diameter', 'weight', 'weightUnit'].forEach(key => assert.equal(moved[key], original[key]));
    assert.equal(event.from.locName, 'BAY-A');
    assert.equal(event.to.locName, 'BAY-B');
    assert.equal(state.coilMovements.length, 1);
});

test('occupied, same, invalid destinations reject before any mutation', () => {
    const state = fixture();
    const before = core.clone(state);
    assert.throws(() => move(state, source(state), actual({ posId: 'BAWAH_KIRI', layer: 2 })), /terisi/);
    assert.throws(() => move(state, source(state), actual()), /sama/);
    assert.throws(() => move(state, source(state), { locId: 'b', type: 'pyramid', posId: 'ATAS', layer: 1 }), /valid/);
    assert.throws(() => move(state, source(state), { locId: 'b', type: 'pyramid', posId: 'R2_C1', layer: 9 }), /valid/);
    assert.deepEqual(state, before);
});

test('source changes between lookup and confirmation block the move', () => {
    const state = fixture();
    const from = source(state);
    state.locations.a.coils.ATAS_1.grade = 'NEW';
    assert.throws(() => move(state, from), /asal berubah/);
    assert.equal(state.coilMovements.length, 0);
});

test('moves require operator, reason and confirmation', () => {
    const state = fixture();
    const to = { locId: 'b', type: 'pyramid', posId: 'R2_C1', layer: 1 };
    assert.throws(() => core.move(state, source(state), to, '', 'Shift 1', 'reason', true, positions), /PIC/);
    assert.throws(() => core.move(state, source(state), to, 'PIC', 'Shift 1', '', true, positions), /alasan/);
    assert.throws(() => core.move(state, source(state), to, 'PIC', 'Shift 1', 'reason', false, positions), /Konfirmasi/);
    assert.equal(state.coilMovements.length, 0);
});

test('relocation and specification edits invalidate verification and active session progress', () => {
    const state = fixture();
    const current = session(state);
    observe(state, current);
    const from = source(state);
    assert.ok(core.verified(core.records(state, positions)[0]));
    state.locations.a.coils.ATAS_1.grade = 'NEW';
    assert.equal(core.verified(core.records(state, positions)[0]), false);
    assert.equal(core.progress(current, core.records(state, positions))[0].outcome, 'changed');
    state.locations.a.coils.ATAS_1.grade = from.item.grade;
    move(state, from);
    const moved = core.records(state, positions).find(record => record.item.heatNumber === 'H1');
    assert.equal(moved.item.fieldVerification, undefined);
    assert.equal(core.progress(current, core.records(state, positions))[0].outcome, 'changed');
});

test('non-pyramid addresses are required for movement and cannot be overwritten', () => {
    const state = fixture();
    assert.throws(() => move(state, source(state), { locId: 'b', type: 'nonpyramid' }), /Alamat/);
    move(state, source(state), { locId: 'b', type: 'nonpyramid', floorAddress: ' zone-a / 03 ' });
    assert.equal(state.locations.b.nonPyramidCoils[0].floorAddress, 'ZONE-A / 03');
    assert.throws(() => move(state, source(state), { locId: 'b', type: 'nonpyramid', floorAddress: 'zone-a / 03' }), /terisi/);
});

test('non-pyramid to pyramid and same-bay address changes preserve identity', () => {
    const state = fixture();
    move(state, source(state), { locId: 'a', type: 'nonpyramid', floorAddress: 'A / 01' });
    let from = core.clone(core.records(state, positions).find(record => record.item.heatNumber === 'H1'));
    move(state, from, { locId: 'a', type: 'nonpyramid', floorAddress: 'A / 02' });
    from = core.clone(core.records(state, positions).find(record => record.item.heatNumber === 'H1'));
    move(state, from, actual());
    assert.equal(state.locations.a.nonPyramidCoils.length, 0);
    assert.equal(state.locations.a.coils.ATAS_1.floorAddress, undefined);
    assert.equal(state.coilMovements.length, 3);
});

test('legacy non-pyramid coils can be bay-verified using their recorded marker', () => {
    const state = fixture();
    state.locations.a.nonPyramidCoils.push(coil('NP', 'HNP'));
    const current = session(state);
    const result = observe(state, current, coil('NP', 'HNP'), { locId: 'a', type: 'nonpyramid', nomor: '1', layer: null });
    assert.equal(result.outcome, 'matched');
    assert.throws(() => observe(state, current, coil('NP', 'HNP'), { locId: 'a', type: 'nonpyramid', nomor: '8' }), /Alamat/);
});

test('sessions, observations, movement history and verification survive JSON persistence', () => {
    const state = fixture();
    const current = session(state);
    observe(state, current);
    const persisted = core.clone(state);
    assert.equal(persisted.activeCheckSessionId, current.id);
    assert.ok(core.verified(core.records(persisted, positions)[0]));
    move(persisted);
    const reloaded = core.clone(persisted);
    assert.equal(reloaded.coilMovements.length, 1);
    assert.equal(core.progress(reloaded.checkSessions[0], core.records(reloaded, positions))[0].outcome, 'changed');
});

test('field UI transaction rolls back inventory and audit together when persistence fails', () => {
    const state = fixture();
    state.activeLocationId = 'a';
    const before = core.clone(state);
    const warnings = [];
    const context = vm.createContext({ CoilField: core, appState: state,
        syncActiveStateToLocation() {}, loadLocationIntoActiveState() {}, saveState: () => false,
        showToast: text => warnings.push(text) });
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../assets/js/field.js'), 'utf8'), context);
    context.action = () => move(context.appState);
    assert.equal(vm.runInContext('fieldTransaction(action)', context), null);
    assert.deepEqual(context.appState, before);
    assert.equal(context.appState.coilMovements.length, 0);
    assert.match(warnings[0], /dibatalkan/);
});

test('deleting a finished session removes only its linked verification, not other sessions or inventory', () => {
    const state = fixture();
    const first = session(state);
    observe(state, first);
    core.finishSession(state, first, positions, now);
    const second = session(state);
    observe(state, second, coil('008', 'H2'), actual({ posId: 'BAWAH_KIRI', layer: 2 }));
    state.locations.b.nonPyramidCoils.push({ ...coil('NP', 'HNP'), fieldVerification: { sessionId: first.id } });
    state.locations.b.coils.R1_C1_1 = { ...coil('USED', 'HU'), status: 'DIPAKAI_PRODUKSI', fieldVerification: { sessionId: first.id } };
    state.coilHistory = [{ ...coil('OLD', 'HO'), status: 'DIHAPUS', fieldVerification: { sessionId: first.id } }];
    state.coilMovements.push({ id: 'existing-move' });
    const expected = core.clone(state.locations);
    delete expected.a.coils.ATAS_1.fieldVerification;
    delete expected.b.nonPyramidCoils[0].fieldVerification;
    delete expected.b.coils.R1_C1_1.fieldVerification;
    assert.equal(core.removeSessions(state, [first.id]), 1);
    assert.deepEqual(state.locations, expected);
    assert.deepEqual(state.checkSessions, [second]);
    assert.equal(state.activeCheckSessionId, second.id);
    assert.ok(core.verified(core.records(state, positions).find(record => record.item.heatNumber === 'H2')));
    assert.equal(state.coilHistory.length, 1);
    assert.equal(state.coilHistory[0].fieldVerification, undefined);
    assert.equal(state.coilMovements[0].id, 'existing-move');
});

test('deleting an active session discards checks and permits starting another session', () => {
    const state = fixture();
    const current = session(state);
    observe(state, current);
    assert.equal(core.removeSessions(state, [current.id]), 1);
    assert.equal(state.activeCheckSessionId, null);
    assert.equal(state.checkSessions.length, 0);
    assert.deepEqual(state.locations, fixture().locations);
    assert.ok(session(state));
});

test('bulk session deletion keeps stock and movement metadata while clearing selected verification', () => {
    const state = fixture();
    const first = session(state);
    observe(state, first);
    core.finishSession(state, first, positions, now);
    const second = session(state);
    state.locations.a.coils.ATAS_1.lastMovedAt = now;
    state.coilMovements.push({ id: 'move-demo', at: now });
    const expected = core.clone(state.locations);
    delete expected.a.coils.ATAS_1.fieldVerification;
    assert.equal(core.removeSessions(state, [first.id, second.id, first.id]), 2);
    assert.deepEqual(state.locations, expected);
    assert.equal(state.checkSessions.length, 0);
    assert.equal(state.activeCheckSessionId, null);
    assert.equal(state.coilMovements.length, 1);
    assert.deepEqual(core.clone(state), state);
});

test('missing or invalid session deletion targets reject without partial cleanup', () => {
    const state = fixture();
    const current = session(state);
    observe(state, current);
    const before = core.clone(state);
    for (const ids of [[], null, 'all', [''], [null], [current.id, 'missing']]) {
        assert.throws(() => core.removeSessions(state, ids));
        assert.deepEqual(state, before);
    }
    core.removeSessions(state, [current.id]);
    const after = core.clone(state);
    assert.throws(() => core.removeSessions(state, [current.id]), /sudah dihapus/);
    assert.deepEqual(state, after);
});

test('deleting individual and all movement records never reverses stock moves or changes sessions', () => {
    const state = fixture();
    const current = session(state);
    observe(state, current);
    const first = move(state);
    const second = move(state, source(state), { locId: 'b', type: 'pyramid', posId: 'R1_C1', layer: 1 });
    const before = core.clone(state);
    assert.equal(core.removeMovements(state, [first.id]), 1);
    assert.deepEqual(state.coilMovements, [second]);
    assert.deepEqual(state.locations, before.locations);
    assert.deepEqual(state.checkSessions, before.checkSessions);
    assert.equal(state.activeCheckSessionId, before.activeCheckSessionId);
    assert.equal(state.locations.b.coils.R2_C1_2.lastMovedAt, now);
    assert.equal(core.removeMovements(state, state.coilMovements.map(event => event.id)), 1);
    assert.equal(state.coilMovements.length, 0);
    assert.deepEqual(state.locations, before.locations);
    assert.deepEqual(core.clone(state).checkSessions, before.checkSessions);
});

test('invalid movement deletion targets reject atomically and an empty list does not mean clear all', () => {
    const state = fixture();
    const event = move(state);
    const before = core.clone(state);
    for (const ids of [[], null, [''], [event.id, 'missing']]) {
        assert.throws(() => core.removeMovements(state, ids));
        assert.deepEqual(state, before);
    }
});

function fieldUi(state, canSave = true) {
    const elements = {
        'field-check-confirm': { checked: true },
        'field-check-feedback': { replaceChildren() {} }
    };
    const dialogs = [];
    const warnings = [];
    let saved = null;
    let renders = 0;
    const context = vm.createContext({ CoilField: core, appState: state,
        document: { getElementById: id => elements[id] },
        syncActiveStateToLocation() {}, loadLocationIntoActiveState() {},
        saveState() { if (canSave) saved = core.clone(context.appState); return canSave; },
        showToast: text => warnings.push(text),
        showConfirmModal: (title, message, confirm) => dialogs.push({ title, message, confirm }) });
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../assets/js/field.js'), 'utf8'), context);
    context.renderFieldWorkflows = () => renders++;
    return { context, dialogs, warnings, elements, run: code => vm.runInContext(code, context),
        saved: () => saved, renders: () => renders };
}

test('session UI deletion does nothing until confirmed and targets the session shown in the dialog', () => {
    const state = fixture();
    const first = session(state);
    core.finishSession(state, first, positions, now);
    const second = session(state);
    const ui = fieldUi(state);
    ui.run(`fieldSelectedSessionId = ${JSON.stringify(first.id)}; deleteFieldSession()`);
    assert.equal(ui.dialogs.length, 1);
    assert.match(ui.dialogs[0].message, /permanen/);
    assert.match(ui.dialogs[0].message, /Stok, lokasi coil/);
    assert.equal(state.checkSessions.length, 2);
    assert.equal(ui.saved(), null);
    ui.run(`fieldSelectedSessionId = ${JSON.stringify(second.id)}`);
    ui.dialogs[0].confirm();
    assert.deepEqual(ui.context.appState.checkSessions.map(item => item.id), [second.id]);
    assert.equal(ui.run('fieldSelectedSessionId'), second.id);
    assert.equal(ui.saved().checkSessions.length, 1);
    assert.equal(ui.elements['field-check-confirm'].checked, false);
    assert.equal(ui.renders(), 1);
});

test('bulk session confirmation warns about active checks and preserves sessions created after opening it', () => {
    const state = fixture();
    const first = session(state);
    const ui = fieldUi(state);
    ui.run(`fieldSelectedSessionId = ${JSON.stringify(first.id)}; clearFieldSessions()`);
    assert.match(ui.dialogs[0].message, /Sesi aktif ikut dihapus/);
    core.finishSession(state, first, positions, now);
    const second = session(state);
    ui.dialogs[0].confirm();
    assert.deepEqual(state.checkSessions.map(item => item.id), [second.id]);
    assert.equal(state.activeCheckSessionId, second.id);
    assert.equal(ui.run('fieldSelectedSessionId'), null);
});

test('movement cleanup confirmation preserves newly added history and persists only after confirmation', () => {
    const state = fixture();
    const first = move(state);
    const ui = fieldUi(state);
    ui.run('clearFieldMovements()');
    assert.match(ui.dialogs[0].message, /perpindahan tidak dibatalkan/);
    assert.equal(state.coilMovements.length, 1);
    assert.equal(ui.saved(), null);
    const second = move(state, source(state), { locId: 'b', type: 'pyramid', posId: 'R1_C1', layer: 1 });
    const expected = core.clone(state.locations);
    ui.dialogs[0].confirm();
    assert.deepEqual(state.coilMovements.map(event => event.id), [second.id]);
    assert.deepEqual(state.locations, expected);
    ui.run(`deleteFieldMovement(${JSON.stringify(second.id)})`);
    assert.match(ui.dialogs[1].message, /Coil 008 \/ Heat H2/);
    ui.dialogs[1].confirm();
    assert.equal(ui.saved().coilMovements.length, 0);
    assert.deepEqual(state.locations, expected);
    assert.equal(first.to.locName, 'BAY-B');
});

test('session and verification deletion roll back together when persistence fails', () => {
    const state = fixture();
    const current = session(state);
    observe(state, current);
    const before = core.clone(state);
    const ui = fieldUi(state, false);
    ui.run(`fieldSelectedSessionId = ${JSON.stringify(current.id)}; deleteFieldSession()`);
    ui.dialogs[0].confirm();
    assert.deepEqual(core.clone(ui.context.appState), before);
    assert.equal(ui.run('fieldSelectedSessionId'), current.id);
    assert.equal(ui.renders(), 0);
    assert.match(ui.warnings[0], /dibatalkan/);
});

test('movement history deletion rolls back on storage failure and stale confirmation has no partial effect', () => {
    const state = fixture();
    const event = move(state);
    const before = core.clone(state);
    const ui = fieldUi(state, false);
    ui.run('clearFieldMovements()');
    ui.dialogs[0].confirm();
    assert.deepEqual(core.clone(ui.context.appState), before);
    assert.equal(ui.renders(), 0);
    const staleUi = fieldUi(core.clone(before));
    staleUi.run(`deleteFieldMovement(${JSON.stringify(event.id)})`);
    core.removeMovements(staleUi.context.appState, [event.id]);
    const cleaned = core.clone(staleUi.context.appState);
    staleUi.dialogs[0].confirm();
    assert.deepEqual(core.clone(staleUi.context.appState), cleaned);
    assert.equal(staleUi.saved(), null);
    assert.match(staleUi.warnings[0], /sudah dihapus/);
});
