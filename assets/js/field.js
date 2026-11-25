/* Field UI adapter. Inventory changes go through CoilField and a persisted transaction. */
let fieldSelectedSessionId = null;
let fieldSearchRecord = null;
let fieldMoveSource = null;
let fieldDecodedRaw = null;
const fieldOutcomeLabels = {
    matched: 'Sesuai', wrong_location: 'Salah lokasi / slot', mismatch: 'Selisih spesifikasi',
    unregistered: 'Tidak terdaftar aktif', unchecked: 'Belum dicek', changed: 'Data berubah — cek ulang'
};
const fieldSpecLabels = { diameter: 'Diameter', grade: 'Grade', weight: 'Berat', supplier: 'Supplier' };
const fieldEl = id => document.getElementById(`field-${id}`);
const fieldValue = id => fieldEl(id)?.value || '';
const fieldPositions = pattern => generatePositionsList(pattern).positions;
const fieldTime = time => time ? new Date(time).toLocaleString('id-ID') : '—';

function fieldRecords() {
    syncActiveStateToLocation();
    return CoilField.records(appState, fieldPositions);
}

function initFieldWorkflows() {
    if (!Array.isArray(appState.checkSessions)) appState.checkSessions = [];
    if (!Array.isArray(appState.coilMovements)) appState.coilMovements = [];
    fieldSelectedSessionId = appState.activeCheckSessionId || appState.checkSessions[0]?.id || null;
    fieldEl('operator').value = appState.picName || '';
    fieldEl('shift').value = appState.shift;
    ['diameter', 'grade', 'supplier', 'weight', 'unit'].forEach(id => {
        fieldEl(id).addEventListener('input', clearFieldConfirmation);
    });
    renderFieldWorkflows();
}

function fieldTransaction(action) {
    syncActiveStateToLocation();
    const backup = CoilField.clone(appState);
    try {
        const result = action();
        loadLocationIntoActiveState(appState.activeLocationId);
        if (!saveState()) throw new Error('Tindakan dibatalkan karena data tidak dapat disimpan. Ekspor cadangan atau kosongkan penyimpanan.');
        return result || true;
    } catch (error) {
        appState = backup;
        loadLocationIntoActiveState(appState.activeLocationId);
        showToast(error.message, 'error');
        return null;
    }
}

function fieldFillLocations(id, preferred) {
    const select = fieldEl(id);
    const previous = select.value || preferred || appState.activeLocationId;
    const entries = Object.values(appState.locations || {});
    select.replaceChildren(...entries.map(loc => new Option(loc.name, loc.id)));
    select.value = entries.some(loc => loc.id === previous) ? previous : appState.activeLocationId;
}

function fieldSession() {
    return appState.checkSessions.find(session => session.id === fieldSelectedSessionId) || null;
}

function selectFieldSession(id) {
    fieldSelectedSessionId = id || null;
    clearFieldConfirmation();
    fieldEl('check-feedback').replaceChildren();
    renderFieldWorkflows();
}

function fieldAddressText(value) {
    if (!value) return 'Tidak tercatat';
    const locName = value.locName || appState.locations[value.locId]?.name || value.locId;
    return `${locName} → ${value.type === 'pyramid' ? `${value.position || value.posId} → Layer ${value.layer}`
        : value.floorAddress || `Non-Piramid #${value.nomor || '?'} (alamat lantai belum dicatat)`}`;
}

function fieldStatusClass(outcome) {
    return outcome === 'matched' ? 'field-matched' : ['unchecked', 'changed'].includes(outcome) ? 'field-warning' : 'field-error';
}

function renderFieldWorkflows() {
    const all = fieldRecords();
    fieldFillLocations('session-location');
    fieldFillLocations('move-location');
    const sessions = appState.checkSessions || [];
    if (!sessions.some(session => session.id === fieldSelectedSessionId)) fieldSelectedSessionId = appState.activeCheckSessionId || sessions[0]?.id || null;
    const select = fieldEl('session-select');
    select.replaceChildren(new Option('Pilih sesi', ''), ...sessions.map(session => new Option(
        `${session.status === 'active' ? 'Aktif' : 'Selesai'} · ${session.locName} · ${fieldTime(session.startedAt)}`, session.id)));
    select.value = fieldSelectedSessionId || '';
    const session = fieldSession();
    const activeSession = sessions.find(item => item.status === 'active');
    fieldEl('start-panel').classList.toggle('hidden', !!activeSession);
    fieldEl('check-form').classList.toggle('hidden', session?.status !== 'active');
    fieldEl('check-form').classList.toggle('flex', session?.status === 'active');
    ['finish', 'report-copy', 'report-csv', 'delete-session'].forEach(id => fieldEl(id).disabled = !session || (id === 'finish' && session.status !== 'active'));
    fieldEl('clear-sessions').disabled = !sessions.length;
    const summary = fieldEl('session-summary');
    const list = fieldEl('session-rows');
    list.replaceChildren();
    if (!session) {
        summary.textContent = 'Mulai sesi untuk membuat daftar awal coil. Coil yang belum dicek tidak akan ditandai hilang.';
    } else {
        const rows = session.status === 'finished' ? session.finalRows : CoilField.progress(session, all);
        const matched = rows.filter(row => row.outcome === 'matched').length;
        summary.innerHTML = `<div class="field-row"><strong>${escapeHTML(session.locName)} · ${escapeHTML(session.operator)} · ${escapeHTML(session.shift)}</strong>
            <p class="mt-1">${matched} / ${rows.length} coil awal sesuai · ${session.checks.length} pengamatan · ${session.status === 'active' ? 'Sesi aktif (tersimpan otomatis)' : `Selesai ${escapeHTML(fieldTime(session.finishedAt))}`}</p>
            <p class="text-xs text-slate-500 mt-1">Daftar awal tetap; perubahan stok ditandai untuk cek ulang. Verifikasi identitas saja tidak membuktikan semua spesifikasi.</p></div>`;
        rows.forEach(row => {
            const div = document.createElement('div');
            div.className = `field-row ${fieldStatusClass(row.outcome)}`;
            div.innerHTML = `<strong>${escapeHTML(row.expected.item.id)} · Heat ${escapeHTML(row.expected.item.heatNumber)}</strong>
                <span class="field-badge ml-2">${fieldOutcomeLabels[row.outcome]}</span>
                <p class="mt-1">${escapeHTML(fieldAddressText(row.expected.address))}</p>
                ${row.latest ? `<p class="text-xs mt-1">Pengamatan: ${escapeHTML(fieldAddressText(row.latest.actual))} · ${escapeHTML(fieldTime(row.latest.at))}${row.latest.differences.length ? ` · Selisih: ${escapeHTML(row.latest.differences.map(key => fieldSpecLabels[key]).join(', '))}` : ''}</p>` : ''}
                ${row.latest?.note ? `<p class="text-xs mt-1">Catatan: ${escapeHTML(row.latest.note)}</p>` : ''}`;
            list.appendChild(div);
        });
        const expectedIds = new Set(session.expected.map(item => item.identity));
        session.checks.filter(event => !expectedIds.has(event.identity)).forEach(event => {
            const div = document.createElement('div');
            div.className = `field-row ${fieldStatusClass(event.outcome)}`;
            div.innerHTML = `<strong>${escapeHTML(event.observed.id)} · Heat ${escapeHTML(event.observed.heatNumber)}</strong>
                <span class="field-badge ml-2">${fieldOutcomeLabels[event.outcome]} · di luar daftar awal</span>
                <p class="mt-1">${escapeHTML(fieldAddressText(event.actual))}</p><p class="text-xs mt-1">${escapeHTML(event.note)} · ${escapeHTML(fieldTime(event.at))}</p>`;
            list.appendChild(div);
        });
        if (session.status === 'active') updateFieldAddress('actual', true);
    }
    const movementList = fieldEl('movement-list');
    movementList.replaceChildren();
    fieldEl('clear-movements').disabled = !appState.coilMovements.length;
    if (!appState.coilMovements.length) movementList.textContent = 'Belum ada perpindahan tercatat.';
    appState.coilMovements.forEach(event => {
        const div = document.createElement('div');
        div.className = 'field-row';
        div.innerHTML = `<strong>${escapeHTML(event.coilId)} · Heat ${escapeHTML(event.heatNumber)}</strong>
            <p class="mt-1">${escapeHTML(fieldAddressText(event.from))}<br>→ ${escapeHTML(fieldAddressText(event.to))}</p>
            <p class="text-xs mt-1">${escapeHTML(event.operator)} · ${escapeHTML(event.shift)} · ${escapeHTML(fieldTime(event.at))}</p><p class="text-xs mt-1">${escapeHTML(event.reason)}</p>`;
        const deleteButton = document.createElement('button');
        deleteButton.type = 'button';
        deleteButton.className = 'field-button field-danger mt-2';
        deleteButton.textContent = 'Hapus Riwayat Ini';
        deleteButton.setAttribute('aria-label', `Hapus riwayat coil ${event.coilId}, heat ${event.heatNumber}, ${fieldTime(event.at)}`);
        deleteButton.onclick = () => deleteFieldMovement(event.id);
        div.appendChild(deleteButton);
        movementList.appendChild(div);
    });
    if (fieldSearchRecord) {
        const current = CoilField.lookup(all, fieldSearchRecord.item);
        if (current.kind !== 'found' || CoilField.fingerprint(current.matches[0]) !== CoilField.fingerprint(fieldSearchRecord) ||
            JSON.stringify(current.matches[0].item.fieldVerification) !== JSON.stringify(fieldSearchRecord.item.fieldVerification)) {
            findFieldCoil();
        }
    }
}

function clearFieldConfirmation() { fieldEl('check-confirm').checked = false; }
function clearFieldMoveConfirmation() { fieldEl('move-confirm').checked = false; }

function clearFieldResult() {
    fieldSearchRecord = null;
    fieldMoveSource = null;
    fieldEl('find-result').replaceChildren();
    fieldEl('move-panel').classList.add('hidden');
    clearFieldConfirmation();
    clearFieldMoveConfirmation();
}

function clearFieldObservation() {
    fieldDecodedRaw = null;
    ['coil-id', 'heat', 'diameter', 'grade', 'weight', 'supplier'].forEach(id => fieldEl(id).value = '');
    fieldEl('unit').value = 'kg';
    fieldEl('link-helper').classList.add('hidden');
    clearFieldResult();
}

function fieldObserved() {
    return { id: fieldValue('coil-id').trim(), heatNumber: fieldValue('heat').trim(), diameter: fieldValue('diameter').trim(),
        grade: fieldValue('grade').trim(), weight: fieldValue('weight').trim(), weightUnit: fieldValue('unit'), supplier: fieldValue('supplier').trim() };
}

function decodeFieldLabel() {
    try {
        const raw = fieldValue('raw');
        clearFieldObservation();
        const label = CoilField.parseLabel(raw);
        fieldDecodedRaw = raw;
        if (label.externalUrl) {
            fieldEl('external-link').href = label.externalUrl;
            fieldEl('link-helper').classList.remove('hidden');
            return false;
        }
        const fields = { id: 'coil-id', heatNumber: 'heat', diameter: 'diameter', grade: 'grade', weight: 'weight', weightUnit: 'unit', supplier: 'supplier' };
        Object.entries(fields).forEach(([key, id]) => {
            if (label[key] !== undefined) fieldEl(id).value = key === 'weightUnit' ? (CoilField.normalize(label[key]) === 'MT' ? 'mt' : 'kg') : label[key];
        });
        if (!label.heatNumber) showToast('No. Coil terbaca. Isi Heat Number untuk memastikan identitas.', 'info');
        return true;
    } catch (error) {
        showToast(error.message, 'error');
        return false;
    }
}

function handleFieldQrDecoded(text) {
    fieldEl('raw').value = text;
    if (decodeFieldLabel()) findFieldCoil();
}

async function pasteFieldLabel() {
    try {
        const text = await navigator.clipboard.readText();
        if (text) handleFieldQrDecoded(text);
    } catch (_) {
        fieldEl('raw').focus();
        showToast('Tempel label secara manual di kotak teks.', 'info');
    }
}

async function handleFieldPhoto(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (typeof Html5Qrcode === 'undefined') return showToast('Pembaca QR belum tersedia. Gunakan tempel label.', 'error');
    const scanner = new Html5Qrcode('qr-file-reader-hidden');
    try { handleFieldQrDecoded(await scanner.scanFile(file, true)); }
    catch (_) { showToast('QR tidak terbaca. Ambil foto lebih jelas atau isi coil + heat secara manual.', 'error'); }
    finally { try { scanner.clear(); } catch (_) {} }
}

function findFieldCoil() {
    if (fieldValue('raw').trim() && fieldValue('raw') !== fieldDecodedRaw && !decodeFieldLabel()) return;
    clearFieldResult();
    const found = CoilField.lookup(fieldRecords(), fieldObserved());
    const container = fieldEl('find-result');
    if (found.kind !== 'found') {
        const message = found.kind === 'incomplete' ? 'Isi No. Coil dan Heat Number. Nomor coil saja tidak cukup untuk verifikasi.'
            : found.kind === 'ambiguous' ? 'Kombinasi coil + heat terdaftar lebih dari sekali. Perbaiki duplikasi sebelum cek atau pindah.'
            : 'Kombinasi coil + heat tidak ditemukan dalam stok aktif. Catat sebagai selisih bila terlihat di lapangan.';
        container.innerHTML = `<div class="field-row field-warning">${escapeHTML(message)}</div>`;
        found.matches.forEach(record => {
            const div = document.createElement('div');
            div.className = 'field-row mt-2';
            div.textContent = `Coil ${record.item.id} · Heat ${record.item.heatNumber} · ${fieldAddressText(CoilField.address(record))}`;
            container.appendChild(div);
        });
        if (found.kind === 'unregistered') {
            const history = (appState.coilHistory || []).filter(item => CoilField.identity(item) === CoilField.identity(fieldObserved()));
            history.forEach(item => {
                const div = document.createElement('div');
                div.className = 'field-row mt-2';
                div.textContent = `Riwayat: ${getCoilStatusLabel(item.status)} · ${item.locName} · ${item.exitedAt || item.updatedAt || ''}`;
                container.appendChild(div);
            });
        }
        return;
    }
    fieldSearchRecord = CoilField.clone(found.matches[0]);
    const record = found.matches[0];
    const verification = record.item.fieldVerification;
    const valid = CoilField.verified(record);
    const diff = CoilField.differences(record.item, fieldObserved());
    container.innerHTML = `<div class="field-row"><strong>${escapeHTML(record.item.id)} · Heat ${escapeHTML(record.item.heatNumber)}</strong>
        <p class="font-bold mt-2">${escapeHTML(fieldAddressText(CoilField.address(record)))}</p>
        <p class="text-sm mt-1">Ø ${escapeHTML(record.item.diameter || '—')} · ${escapeHTML(record.item.grade || '—')} · ${escapeHTML(record.item.weight)} ${escapeHTML(record.item.weightUnit || 'kg')} · ${escapeHTML(record.item.supplier || '—')}</p>
        <p class="text-xs mt-2">${valid ? `Terakhir diverifikasi: ${escapeHTML(fieldTime(verification.at))} · ${escapeHTML(verification.operator)}`
            : verification ? 'Verifikasi lama tidak berlaku: data, lokasi, atau hasil pengamatan berubah. Cek ulang.' : 'Belum diverifikasi di lokasi ini.'}</p>
        ${diff.length ? `<p class="text-sm text-red-700 mt-2">Selisih label vs catatan: ${escapeHTML(diff.map(key => fieldSpecLabels[key]).join(', '))}. Data stok tidak diubah.</p>` : ''}
        <div class="flex flex-wrap gap-2 mt-3"><button type="button" class="field-button" id="field-show-slot">Tunjukkan Slot</button><button type="button" class="field-button" id="field-open-move">Pindahkan Coil</button></div></div>`;
    fieldEl('show-slot').onclick = () => showFieldLocation(CoilField.clone(record));
    fieldEl('open-move').onclick = openFieldMove;
}

function showFieldLocation(source) {
    const all = fieldRecords();
    const found = CoilField.lookup(all, source.item);
    if (found.kind !== 'found') return showToast('Lokasi tidak lagi unik atau coil tidak aktif. Cari ulang.', 'error');
    const record = found.matches[0];
    const content = fieldEl('location-content');
    content.innerHTML = `<p class="font-bold">${escapeHTML(record.item.id)} · Heat ${escapeHTML(record.item.heatNumber)}</p>
        <p class="mt-1">${escapeHTML(fieldAddressText(CoilField.address(record)))}</p>
        <p class="text-sm text-slate-600 mt-2">Tampak depan bay: kiri/kanan mengikuti arah ini. Layer adalah kedalaman, bukan tingkat vertikal.</p>`;
    if (record.type === 'pyramid') {
        const positions = fieldPositions(appState.locations[record.locId].stackPattern);
        const grid = document.createElement('div');
        grid.className = 'flex flex-col items-center gap-2 mt-4 overflow-auto p-2';
        [...new Set(positions.map(pos => pos.visualRowFromTop))].forEach(row => {
            const strip = document.createElement('div');
            strip.className = 'flex gap-2';
            positions.filter(pos => pos.visualRowFromTop === row).forEach(pos => {
                const coil = appState.locations[record.locId].coils[`${pos.id}_${record.layer}`];
                const slot = document.createElement('div');
                slot.className = `field-row field-slot ${pos.id === record.posId ? 'field-slot-target' : ''}`;
                slot.innerHTML = `<strong>${escapeHTML(pos.shortLabel)}</strong><p>${escapeHTML(coil?.id || 'Kosong')}</p><p class="text-xs">${escapeHTML(coil?.heatNumber || '')}</p>`;
                strip.appendChild(slot);
            });
            grid.appendChild(strip);
        });
        content.appendChild(grid);
        const layerLabel = document.createElement('p');
        layerLabel.className = 'text-center text-sm font-bold mt-2';
        layerLabel.textContent = `Layer ${record.layer} dari ${appState.locations[record.locId].totalLayers} (1 = paling depan)`;
        content.appendChild(layerLabel);
    }
    showModalEl('field-location-modal');
}

function updateFieldAddress(prefix, preserve = false) {
    const locId = prefix === 'actual' ? fieldSession()?.locId : fieldValue('move-location');
    const loc = appState.locations[locId];
    if (!loc) return;
    const select = fieldEl(`${prefix}-position`);
    const layer = fieldEl(`${prefix}-layer`);
    const oldPosition = preserve ? select.value : '';
    const oldLayer = preserve ? layer.value : '';
    const pyramid = fieldValue(`${prefix}-type`) === 'pyramid';
    if (pyramid) {
        select.replaceChildren(new Option('Pilih posisi', ''), ...fieldPositions(loc.stackPattern).map(pos => new Option(pos.shortLabel, pos.id)));
    } else if (prefix === 'actual') {
        const choices = (loc.nonPyramidCoils || []).filter(item => isCoilActive(item)).map(item => new Option(
            item.floorAddress || `Non-Piramid #${item.nomor} — hanya konfirmasi bay (alamat belum dicatat)`,
            item.floorAddress ? `floor:${item.floorAddress}` : `legacy:${item.nomor}`));
        select.replaceChildren(new Option('Pilih alamat / penanda NP', ''), new Option('Alamat lain (isi manual)', 'custom'), ...choices);
    }
    select.value = oldPosition;
    layer.replaceChildren(new Option('Pilih layer', ''), ...Array.from({ length: loc.totalLayers }, (_, index) => new Option(`Layer ${index + 1}`, String(index + 1))));
    layer.value = oldLayer;
    fieldEl(`${prefix}-position-wrap`).classList.toggle('hidden', !pyramid && prefix === 'move');
    fieldEl(`${prefix}-layer-wrap`).classList.toggle('hidden', !pyramid);
    fieldEl(`${prefix}-floor-wrap`).classList.toggle('hidden', pyramid || (prefix === 'actual' && select.value !== 'custom'));
    if (!preserve) {
        if (prefix === 'actual') clearFieldConfirmation();
        else clearFieldMoveConfirmation();
    }
}

function updateFieldActualSelection() {
    fieldEl('actual-floor-wrap').classList.toggle('hidden', fieldValue('actual-type') === 'pyramid' || fieldValue('actual-position') !== 'custom');
    clearFieldConfirmation();
}

function getFieldAddress(prefix) {
    const locId = prefix === 'actual' ? fieldSession()?.locId : fieldValue('move-location');
    const type = fieldValue(`${prefix}-type`);
    const position = fieldValue(`${prefix}-position`);
    const loc = appState.locations[locId];
    const result = { locId, locName: loc?.name || '', type, posId: type === 'pyramid' ? position : '',
        position: type === 'pyramid' ? fieldPositions(loc?.stackPattern).find(pos => pos.id === position)?.shortLabel || position : '',
        layer: type === 'pyramid' ? Number(fieldValue(`${prefix}-layer`)) : null,
        floorAddress: '', nomor: '' };
    if (type === 'nonpyramid') {
        if (prefix === 'actual' && position.startsWith('legacy:')) result.nomor = position.slice(7);
        else result.floorAddress = prefix === 'actual' && position.startsWith('floor:') ? position.slice(6)
            : prefix === 'move' || position === 'custom' ? fieldValue(`${prefix}-floor`).trim().toUpperCase() : '';
        result.position = result.floorAddress || `Non-Piramid #${result.nomor}`;
    }
    return result;
}

function startFieldSession() {
    const session = fieldTransaction(() => CoilField.startSession(appState, fieldValue('session-location'), fieldValue('operator'), fieldValue('shift'), fieldPositions));
    if (!session) return;
    fieldSelectedSessionId = session.id;
    clearFieldConfirmation();
    fieldEl('check-feedback').replaceChildren();
    renderFieldWorkflows();
    showToast('Sesi dimulai. Pilih posisi fisik untuk setiap coil yang diperiksa.');
}

function recordFieldCheck() {
    if (fieldValue('raw').trim() && fieldValue('raw') !== fieldDecodedRaw && !decodeFieldLabel()) return;
    const event = fieldTransaction(() => CoilField.check(appState, fieldSession(), fieldObserved(), getFieldAddress('actual'),
        fieldEl('check-confirm').checked, fieldValue('check-note'), fieldPositions));
    if (!event) return;
    clearFieldConfirmation();
    fieldEl('check-note').value = '';
    renderFieldWorkflows();
    fieldEl('check-feedback').innerHTML = `<div class="field-row ${fieldStatusClass(event.outcome)}"><strong>${escapeHTML(event.observed.id)} · Heat ${escapeHTML(event.observed.heatNumber)}: ${fieldOutcomeLabels[event.outcome]}</strong>
        ${event.differences.length ? `<p>Selisih: ${escapeHTML(event.differences.map(key => fieldSpecLabels[key]).join(', '))}</p>` : ''}<p class="text-xs mt-1">Pengamatan tersimpan. Identitas, lokasi dan spesifikasi stok tidak ditimpa.</p></div>`;
    findFieldCoil();
}

function finishFieldSession() {
    const session = fieldSession();
    if (!session || session.status !== 'active') return;
    const id = session.id;
    showConfirmModal('Selesaikan Sesi Cek', 'Simpan hasil akhir sesi? Coil yang belum dicek tetap belum dicek, bukan hilang. Selisih harus ditindaklanjuti secara terpisah.', () => {
        if (!fieldTransaction(() => CoilField.finishSession(appState, appState.checkSessions.find(item => item.id === id), fieldPositions))) return;
        renderFieldWorkflows();
        showToast('Sesi selesai. Laporan siap disalin atau diunduh.');
    });
}

function confirmFieldSessionDeletion(sessions, all = false) {
    if (!sessions.length) return;
    const ids = sessions.map(session => session.id);
    const active = sessions.some(session => session.status === 'active');
    const description = all ? `${sessions.length} sesi cek beserta seluruh pengamatannya`
        : `sesi ${sessions[0].locName} · ${sessions[0].operator} · ${fieldTime(sessions[0].startedAt)} (${sessions[0].checks.length} pengamatan)`;
    showConfirmModal(all ? 'Hapus Semua Sesi Cek' : 'Hapus Sesi Cek',
        `Hapus permanen ${description}?${active ? '\nSesi aktif ikut dihapus dan tidak dapat dilanjutkan.' : ''}\nVerifikasi coil dari sesi yang dihapus ikut dibersihkan. Stok, lokasi coil, dan riwayat perpindahan tidak dihapus.\nUnduh laporan yang diperlukan terlebih dahulu. Tindakan ini tidak dapat dibatalkan.`, () => {
            if (!fieldTransaction(() => CoilField.removeSessions(appState, ids))) return;
            if (ids.includes(fieldSelectedSessionId)) fieldSelectedSessionId = null;
            clearFieldConfirmation();
            fieldEl('check-feedback').replaceChildren();
            renderFieldWorkflows();
            showToast('Sesi cek dihapus. Stok coil tetap tersimpan.');
        });
}

function deleteFieldSession() {
    const session = fieldSession();
    if (session) confirmFieldSessionDeletion([session]);
}

function clearFieldSessions() {
    confirmFieldSessionDeletion(appState.checkSessions || [], true);
}

function confirmFieldMovementDeletion(events, all = false) {
    if (!events.length) return;
    const ids = events.map(event => event.id);
    const description = all ? `${events.length} catatan perpindahan`
        : `catatan Coil ${events[0].coilId} / Heat ${events[0].heatNumber}\nDari: ${fieldAddressText(events[0].from)}\nKe: ${fieldAddressText(events[0].to)}\nWaktu: ${fieldTime(events[0].at)}`;
    showConfirmModal(all ? 'Hapus Semua Riwayat Perpindahan' : 'Hapus Riwayat Perpindahan',
        `Hapus permanen ${description}?\nHanya riwayat yang dihapus. Stok dan lokasi coil saat ini tetap; perpindahan tidak dibatalkan. Sesi cek tidak dihapus.\nUnduh CSV yang diperlukan terlebih dahulu. Tindakan ini tidak dapat dibatalkan.`, () => {
            if (!fieldTransaction(() => CoilField.removeMovements(appState, ids))) return;
            renderFieldWorkflows();
            showToast('Riwayat perpindahan dihapus. Lokasi coil tidak berubah.');
        });
}

function deleteFieldMovement(id) {
    const event = (appState.coilMovements || []).find(item => item.id === id);
    if (event) confirmFieldMovementDeletion([event]);
}

function clearFieldMovements() {
    confirmFieldMovementDeletion(appState.coilMovements || [], true);
}

function openFieldMove() {
    if (!fieldSearchRecord) return;
    fieldMoveSource = CoilField.clone(fieldSearchRecord);
    fieldEl('move-panel').classList.remove('hidden');
    fieldEl('move-source').textContent = `Coil ${fieldMoveSource.item.id} · Heat ${fieldMoveSource.item.heatNumber} · Asal: ${fieldAddressText(CoilField.address(fieldMoveSource))}`;
    fieldFillLocations('move-location');
    fieldEl('move-operator').value = appState.picName || fieldSession()?.operator || '';
    fieldEl('move-shift').value = appState.shift;
    fieldEl('move-reason').value = '';
    fieldEl('move-floor').value = '';
    updateFieldAddress('move');
    fieldEl('move-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function confirmFieldMove() {
    if (!fieldMoveSource) return showToast('Cari coil dan pilih Pindahkan Coil terlebih dahulu.', 'error');
    if (!fieldEl('move-confirm').checked) return showToast('Konfirmasi coil, asal, dan tujuan fisik terlebih dahulu.', 'error');
    const source = CoilField.clone(fieldMoveSource);
    const destination = getFieldAddress('move');
    const operator = fieldValue('move-operator');
    const shift = fieldValue('move-shift');
    const reason = fieldValue('move-reason');
    try {
        syncActiveStateToLocation();
        CoilField.move(CoilField.clone(appState), source, destination, operator, shift, reason, true, fieldPositions);
    } catch (error) {
        showToast(error.message, 'error');
        return;
    }
    showConfirmModal('Catat Perpindahan Coil', `Coil ${source.item.id} / Heat ${source.item.heatNumber}\nDari: ${fieldAddressText(CoilField.address(source))}\nKe: ${fieldAddressText(destination)}\nAlasan: ${reason}\nVerifikasi lokasi lama tidak berlaku setelah dipindahkan.`, () => {
        const event = fieldTransaction(() => CoilField.move(appState, source, destination, operator, shift, reason, true, fieldPositions));
        if (!event) return;
        clearFieldResult();
        resetNonPyramidForm();
        renderAll();
        findFieldCoil();
        showToast('Perpindahan tersimpan. Verifikasi coil di tujuan sebelum menandainya sesuai.');
    });
}

function fieldReportRows() {
    const session = fieldSession();
    if (!session) return [];
    const rows = session.status === 'finished' ? session.finalRows : CoilField.progress(session, fieldRecords());
    const metadata = [session.id, session.locName, session.operator, session.shift, session.startedAt, session.finishedAt || '', session.status];
    const output = [['Sesi', 'Lokasi sesi', 'Pemeriksa', 'Shift', 'Mulai', 'Selesai', 'Status sesi', 'Jenis baris', 'No. Coil', 'Heat Number', 'Hasil', 'Lokasi catatan awal', 'Lokasi pengamatan', 'Waktu cek', 'Selisih', 'Catatan', 'Spesifikasi awal JSON', 'Spesifikasi diamati JSON']];
    rows.forEach(row => output.push([...metadata, 'Ringkasan coil awal', row.expected.item.id, row.expected.item.heatNumber,
        fieldOutcomeLabels[row.outcome], fieldAddressText(row.expected.address), row.latest ? fieldAddressText(row.latest.actual) : '',
        row.latest?.at || '', row.latest?.differences.join(', ') || '', row.latest?.note || '', JSON.stringify(row.expected.item), row.latest ? JSON.stringify(row.latest.observed) : '']));
    session.checks.forEach(event => output.push([...metadata, 'Pengamatan (audit)', event.observed.id, event.observed.heatNumber,
        fieldOutcomeLabels[event.outcome], fieldAddressText(event.expectedAddress), fieldAddressText(event.actual), event.at,
        event.differences.join(', '), event.note, '', JSON.stringify(event.observed)]));
    return output;
}

function fieldDownloadCsv(name, rows) {
    // Neutralize spreadsheet formulas while preserving coil numbers as strings in the source data.
    const safe = value => {
        const text = String(value ?? '');
        return csvEscape(/^[\s]*[=+@-]/.test(text) ? `'${text}` : text);
    };
    const blob = new Blob(['\uFEFF' + rows.map(row => row.map(safe).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = name;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function downloadFieldReport() {
    if (!fieldSession()) return;
    fieldDownloadCsv(`CoilStack_Cek_${fieldSession().startedAt.slice(0, 10)}.csv`, fieldReportRows());
}

async function copyFieldReport() {
    const session = fieldSession();
    if (!session) return;
    const rows = fieldReportRows();
    const report = [`CEK LAPANGAN: ${session.locName}`, `PIC: ${session.operator} | ${session.shift}`, `Mulai: ${fieldTime(session.startedAt)} | ${session.status === 'active' ? 'Aktif' : `Selesai: ${fieldTime(session.finishedAt)}`}`,
        'Coil belum dicek tidak dianggap hilang.', ...rows.slice(1).map(row => `${row[7]}: Coil ${row[8]} / Heat ${row[9]} — ${row[10]}\nCatatan: ${row[11]} | Terlihat: ${row[12] || '—'}${row[14] ? ` | Selisih: ${row[14]}` : ''}${row[15] ? ` | ${row[15]}` : ''}`)].join('\n');
    if (await copyTextToClipboard(report)) showToast('Laporan cek disalin.');
}

function downloadFieldMovements() {
    const rows = [['No. Coil', 'Heat Number', 'Asal', 'Tujuan', 'PIC', 'Shift', 'Waktu', 'Alasan'],
        ...appState.coilMovements.map(event => [event.coilId, event.heatNumber, fieldAddressText(event.from), fieldAddressText(event.to), event.operator, event.shift, event.at, event.reason])];
    fieldDownloadCsv('CoilStack_Perpindahan.csv', rows);
}
