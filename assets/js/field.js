/* Field UI adapter. Inventory changes go through CoilField and a persisted transaction. */
let fieldSelectedSessionId = null;
let fieldSearchRecord = null;
let fieldMoveSource = null;
let fieldDecodedRaw = null;
const fieldMap = { bayId: '', layer: 1, view: 'front', posId: '', hiddenRows: 0 };
let fieldMapFullscreen = null;
const fieldOutcomeLabels = {
    matched: 'Sesuai', wrong_location: 'Salah lokasi / slot', mismatch: 'Selisih spesifikasi',
    unregistered: 'Tidak terdaftar aktif', unchecked: 'Belum dicek', changed: 'Data berubah - cek ulang',
    no_label: 'Tanpa label - verifikasi label tidak berlaku'
};
const fieldSpecLabels = { diameter: 'Diameter', grade: 'Grade', weight: 'Berat', supplier: 'Supplier' };
const fieldEl = id => document.getElementById(`field-${id}`);
const fieldValue = id => fieldEl(id)?.value || '';
const fieldPositions = pattern => generatePositionsList(pattern).positions;
const fieldTime = time => time ? new Date(time).toLocaleString('id-ID') : '-';

function fieldCoilLabel(itemOrEvent) {
    if (!itemOrEvent) return '-';
    return itemOrEvent.coilId || CoilField.displayCoil(itemOrEvent);
}

function fieldHeatLabel(itemOrEvent) {
    return CoilField.isNoLabel(itemOrEvent) ? 'Tanpa label' : `Heat ${itemOrEvent?.heatNumber || '-'}`;
}

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
    document.addEventListener('fullscreenchange', handleFieldMapFullscreenChange);
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
    return outcome === 'matched' ? 'field-matched' : ['unchecked', 'changed', 'no_label'].includes(outcome) ? 'field-warning' : 'field-error';
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
            div.innerHTML = `<strong>${escapeHTML(fieldCoilLabel(row.expected.item))} · ${escapeHTML(fieldHeatLabel(row.expected.item))}</strong>
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
        div.innerHTML = `<strong>${escapeHTML(fieldCoilLabel(event))} · ${escapeHTML(fieldHeatLabel(event))}</strong>
            <p class="mt-1">${escapeHTML(fieldAddressText(event.from))}<br>→ ${escapeHTML(fieldAddressText(event.to))}</p>
            <p class="text-xs mt-1">${escapeHTML(event.operator)} · ${escapeHTML(event.shift)} · ${escapeHTML(fieldTime(event.at))}</p><p class="text-xs mt-1">${escapeHTML(event.reason)}</p>`;
        const deleteButton = document.createElement('button');
        deleteButton.type = 'button';
        deleteButton.className = 'field-button field-danger mt-2';
        deleteButton.textContent = 'Hapus Riwayat Ini';
        deleteButton.setAttribute('aria-label', `Hapus riwayat coil ${fieldCoilLabel(event)}, ${fieldTime(event.at)}`);
        deleteButton.onclick = () => deleteFieldMovement(event.id);
        div.appendChild(deleteButton);
        movementList.appendChild(div);
    });
    if (fieldSearchRecord) {
        const current = lookupFieldRecord(all, fieldSearchRecord.item);
        if (current.kind !== 'found' || CoilField.fingerprint(current.matches[0]) !== CoilField.fingerprint(fieldSearchRecord) ||
            JSON.stringify(current.matches[0].item.fieldVerification) !== JSON.stringify(fieldSearchRecord.item.fieldVerification)) {
            findFieldCoil();
        }
    }
    renderFieldMap();
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

function lookupFieldRecord(all, item) {
    const ref = item.inventoryRef || (!item.heatNumber && CoilField.normalizeRef(item.id));
    return ref ? CoilField.lookupReference(all, ref) : CoilField.lookup(all, item);
}

function findFieldCoil() {
    if (fieldValue('raw').trim() && fieldValue('raw') !== fieldDecodedRaw && !decodeFieldLabel()) return;
    clearFieldResult();
    const found = lookupFieldRecord(fieldRecords(), fieldObserved());
    const container = fieldEl('find-result');
    if (found.kind !== 'found') {
        const message = found.kind === 'incomplete' ? 'Isi No. Coil dan Heat Number. Nomor coil saja tidak cukup untuk verifikasi.'
            : found.kind === 'ambiguous' ? 'Kombinasi coil + heat terdaftar lebih dari sekali. Perbaiki duplikasi sebelum cek atau pindah.'
            : 'Kombinasi coil + heat tidak ditemukan dalam stok aktif. Catat sebagai selisih bila terlihat di lapangan.';
        container.innerHTML = `<div class="field-row field-warning">${escapeHTML(message)}</div>`;
        found.matches.forEach(record => {
            const div = document.createElement('div');
            div.className = 'field-row mt-2';
            div.textContent = `Coil ${fieldCoilLabel(record.item)} · ${fieldHeatLabel(record.item)} · ${fieldAddressText(CoilField.address(record))}`;
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
    container.innerHTML = `<div class="field-row"><strong>${escapeHTML(fieldCoilLabel(record.item))} · ${escapeHTML(fieldHeatLabel(record.item))}</strong>
        <p class="font-bold mt-2">${escapeHTML(fieldAddressText(CoilField.address(record)))}</p>
        <p class="text-sm mt-1">Ø ${escapeHTML(record.item.diameter || '—')} · ${escapeHTML(record.item.grade || '—')} · ${escapeHTML(record.item.weight)} ${escapeHTML(record.item.weightUnit || 'kg')} · ${escapeHTML(record.item.supplier || '—')}</p>
        <p class="text-xs mt-2">${valid ? `Terakhir diverifikasi: ${escapeHTML(fieldTime(verification.at))} · ${escapeHTML(verification.operator)}`
            : CoilField.isNoLabel(record.item) ? 'Referensi internal untuk pencarian dan perpindahan; tidak dapat digunakan untuk verifikasi label.' : verification ? 'Verifikasi lama tidak berlaku: data, lokasi, atau hasil pengamatan berubah. Cek ulang.' : 'Belum diverifikasi di lokasi ini.'}</p>
        ${diff.length ? `<p class="text-sm text-red-700 mt-2">Selisih label vs catatan: ${escapeHTML(diff.map(key => fieldSpecLabels[key]).join(', '))}. Data stok tidak diubah.</p>` : ''}
        <div class="flex flex-wrap gap-2 mt-3"><button type="button" class="field-button" id="field-show-slot">Tunjukkan Slot</button><button type="button" class="field-button" id="field-open-move">Pindahkan Coil</button></div></div>`;
    fieldEl('show-slot').onclick = () => showFieldLocation(CoilField.clone(record));
    fieldEl('open-move').onclick = openFieldMove;
}

function showFieldLocation(source) {
    const all = fieldRecords();
    const found = lookupFieldRecord(all, source.item);
    if (found.kind !== 'found') return showToast('Lokasi tidak lagi unik atau coil tidak aktif. Cari ulang.', 'error');
    const record = found.matches[0];
    const loc = appState.locations[record.locId];
    if (record.type === 'pyramid' && fieldPositions(loc.stackPattern).some(pos => pos.id === record.posId) &&
        Number.isInteger(record.layer) && record.layer >= 1 && record.layer <= loc.totalLayers) {
        if (fieldMap.bayId !== record.locId) fieldMap.hiddenRows = 0;
        Object.assign(fieldMap, { bayId: record.locId, layer: record.layer, view: 'front', posId: record.posId });
        renderFieldMap();
        fieldEl('map-title').focus({ preventScroll: true });
        fieldEl('map-panel').scrollIntoView({ block: 'start' });
        const diagram = fieldEl('map-diagram');
        const slot = fieldMapSlotButton(diagram, record.posId, record.layer);
        if (slot) diagram.scrollLeft += slot.getBoundingClientRect().left - diagram.getBoundingClientRect().left - (diagram.clientWidth - slot.offsetWidth) / 2;
        return;
    }
    const content = fieldEl('location-content');
    content.innerHTML = `<p class="font-bold">${escapeHTML(fieldCoilLabel(record.item))} · ${escapeHTML(fieldHeatLabel(record.item))}</p>
        <p class="mt-1">${escapeHTML(fieldAddressText(CoilField.address(record)))}</p>
        <p class="text-sm text-slate-600 mt-2">${record.type === 'pyramid' ? 'Slot tercatat tidak tersedia pada pola atau jumlah layer saat ini.' : 'Peta skematis hanya menampilkan slot Piramid.'}</p>`;
    showModalEl('field-location-modal');
}

function setFieldMapBay(bayId) {
    Object.assign(fieldMap, { bayId, layer: 1, posId: '', hiddenRows: 0 });
    renderFieldMap();
    const diagram = fieldEl('map-diagram');
    diagram.scrollLeft = 0;
    diagram.scrollTop = 0;
    const overheadScroll = diagram.querySelector('.field-map-overhead-scroll');
    if (overheadScroll) overheadScroll.scrollLeft = 0;
}

function setFieldMapLayer(layer) {
    if (fieldMap.layer !== layer) fieldMap.posId = '';
    fieldMap.layer = layer;
    renderFieldMap();
    scrollFieldMapDepth();
}

function setFieldMapView(view) {
    fieldMap.view = view;
    renderFieldMap();
    fieldEl('map-diagram').scrollLeft = 0;
    scrollFieldMapDepth();
}

async function openFieldMapFullscreen() {
    const host = fieldEl('map-fullscreen');
    if (!host || fieldMapFullscreen) return;
    const panel = fieldEl('map-panel');
    const body = fieldEl('map-fullscreen-body');
    const session = { host, native: false, orientationLocked: false, inlineMinHeight: panel.style.minHeight };
    fieldMapFullscreen = session;

    // Share the interactive elements without moving the whole card or slot list.
    panel.style.minHeight = `${panel.offsetHeight}px`;
    body.before(fieldEl('map-controls'));
    body.append(fieldEl('map-diagram-column'), fieldEl('map-detail'));
    showModalEl(host.id);
    host.scrollTop = 0;

    if (!host.requestFullscreen) return;
    try {
        await host.requestFullscreen();
    } catch (_) {
        return; // The fixed overlay stays usable, including on mobile browsers without native fullscreen.
    }
    if (document.fullscreenElement !== host) return;
    if (fieldMapFullscreen !== session) {
        if (!fieldMapFullscreen) await document.exitFullscreen().catch(() => {});
        return;
    }
    session.native = true;
    const orientation = window.screen.orientation;
    if (!orientation?.lock) return;
    try {
        await orientation.lock('landscape');
        session.orientationLocked = true;
        if (!fieldMapFullscreen && !document.fullscreenElement) orientation.unlock?.();
    } catch (_) {
        // Orientation lock is optional; the portrait layout shows a manual-rotation hint.
    }
}

function handleFieldMapFullscreenChange() {
    if (!fieldMapFullscreen) return;
    if (document.fullscreenElement === fieldMapFullscreen.host) fieldMapFullscreen.native = true;
    else if (fieldMapFullscreen.native) closeFieldMapFullscreen();
}

function closeFieldMapFullscreen() {
    const session = fieldMapFullscreen;
    if (!session) return;
    fieldMapFullscreen = null;
    hideModalEl(session.host.id);
    fieldEl('map-help').before(fieldEl('map-controls'));
    fieldEl('map-layout').prepend(fieldEl('map-diagram-column'));
    fieldEl('map-list-title').before(fieldEl('map-detail'));
    fieldEl('map-panel').style.minHeight = session.inlineMinHeight;
    fieldEl('map-expand').focus({ preventScroll: true });

    if (session.orientationLocked) {
        try { window.screen.orientation?.unlock?.(); } catch (_) {}
    }
    if (document.fullscreenElement === session.host) document.exitFullscreen().catch(() => {});
}

function fieldMapSlotButton(container, posId, layer) {
    return container.querySelector(`[data-pos="${posId}"][data-layer="${layer}"]`);
}

function selectFieldMapSlot(posId, layer, from) {
    Object.assign(fieldMap, { posId, layer });
    renderFieldMap();
    fieldMapSlotButton(from, posId, layer)?.focus({ preventScroll: true });
}

function scrollFieldMapDepth() {
    const diagram = fieldEl('map-diagram');
    const depth = diagram.querySelector(`[data-depth="${fieldMap.layer}"]`);
    diagram.scrollTop = depth ? diagram.scrollTop + depth.getBoundingClientRect().top - diagram.getBoundingClientRect().top
        - (diagram.clientHeight - depth.offsetHeight) / 2 : 0;
}

function setFieldMapHiddenRows(count) {
    if (fieldMap.view !== 'top') return;
    fieldMap.hiddenRows = Number.isInteger(count) ? Math.max(0, count) : 0;
    renderFieldMap();
}

function restoreFieldMapCoils() {
    setFieldMapHiddenRows(0);
    fieldEl('map-hidden-rows').focus({ preventScroll: true });
}

function fieldMapSlot(loc, pos, layer) {
    const item = loc.coils?.[`${pos.id}_${layer}`];
    if (CoilField.hasActiveCoil(item)) return { kind: 'coil', title: fieldCoilLabel(item), item };
    if (CoilField.isNoCoil(item)) return { kind: 'no-coil', title: 'Tidak ada Coil', item };
    return { kind: 'blank', title: 'Belum diisi' };
}

function makeFieldMapSlotButton(loc, pos, layer, container, className) {
    const { kind, title } = fieldMapSlot(loc, pos, layer);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `${className} field-map-${kind}`;
    button.dataset.pos = pos.id;
    button.dataset.layer = String(layer);
    button.title = `Layer ${layer} · #${pos.seq} ${pos.shortLabel} · ${title}`;
    button.setAttribute('aria-label', button.title);
    button.setAttribute('aria-pressed', String(fieldMap.posId === pos.id && fieldMap.layer === layer));
    button.onclick = () => selectFieldMapSlot(pos.id, layer, container);
    return button;
}

function renderFieldMap() {
    const bay = fieldEl('map-bay');
    if (!bay) return;
    const locations = Object.values(appState.locations || {});
    if (!locations.some(loc => loc.id === fieldMap.bayId)) {
        Object.assign(fieldMap, { bayId: appState.activeLocationId, layer: 1, posId: '', hiddenRows: 0 });
    }
    const loc = locations.find(entry => entry.id === fieldMap.bayId) || locations[0];
    if (!loc) return;
    fieldMap.bayId = loc.id;
    bay.replaceChildren(...locations.map(entry => new Option(entry.name, entry.id)));
    bay.value = loc.id;
    const totalLayers = Math.max(1, Number(loc.totalLayers) || 1);
    fieldMap.layer = Math.min(Math.max(fieldMap.layer || 1, 1), totalLayers);
    const layers = fieldEl('map-layer');
    layers.replaceChildren(...Array.from({ length: totalLayers }, (_, i) => new Option(`Layer ${i + 1}`, String(i + 1))));
    layers.value = String(fieldMap.layer);

    const positions = fieldPositions(loc.stackPattern);
    const rows = CoilField.pyramidRows(positions);
    const maxHiddenRows = Math.max(0, rows.length - 1);
    fieldMap.hiddenRows = Math.min(fieldMap.hiddenRows, maxHiddenRows);
    const selected = positions.find(pos => pos.id === fieldMap.posId);
    if (!selected) fieldMap.posId = '';
    const isTop = fieldMap.view === 'top';
    const hiddenPositions = CoilField.overheadHiddenPositions(rows, fieldMap.hiddenRows);
    const rowFilter = fieldEl('map-hidden-rows');
    rowFilter.replaceChildren(...Array.from({ length: maxHiddenRows + 1 }, (_, count) =>
        new Option(count ? `${count} baris teratas` : '0 baris', String(count))));
    rowFilter.value = String(fieldMap.hiddenRows);
    rowFilter.disabled = maxHiddenRows === 0;
    fieldEl('map-reset').disabled = fieldMap.hiddenRows === 0;
    fieldEl('map-front').setAttribute('aria-pressed', String(!isTop));
    fieldEl('map-top').setAttribute('aria-pressed', String(isTop));
    fieldEl('map-top-actions').classList.toggle('hidden', !isTop);
    fieldEl('map-top-actions').classList.toggle('flex', isTop);
    fieldEl('map-help').textContent = isTop
        ? 'Sembunyikan baris dari puncak untuk melihat coil di bawahnya di semua layer. Geser peta ke samping jika perlu. Stok tidak berubah.'
        : 'Pilih layer untuk melihat semua posisi pada kedalaman tersebut. Ketuk posisi atau pilih dari daftar.';

    const diagram = fieldEl('map-diagram');
    const overheadScrollLeft = diagram.querySelector('.field-map-overhead-scroll')?.scrollLeft || 0;
    const figure = document.createElement('div');
    const visible = new Set();
    if (isTop) {
        const geometry = CoilField.overheadGeometry(rows);
        figure.className = 'field-map-overhead';
        figure.style.setProperty('--map-columns', geometry.columns);
        const front = document.createElement('p');
        front.className = 'field-map-overhead-front text-xs font-bold text-slate-600 mb-2';
        front.textContent = 'Depan bay ↓';
        const gutter = document.createElement('div');
        const overheadScroll = document.createElement('div');
        overheadScroll.className = 'field-map-overhead-scroll';
        overheadScroll.tabIndex = 0;
        overheadScroll.setAttribute('role', 'region');
        overheadScroll.setAttribute('aria-label', 'Gulir peta tampak atas ke kiri atau kanan');
        figure.append(front, gutter, overheadScroll);
        for (let layer = 1; layer <= totalLayers; layer++) {
            const row = document.createElement('div');
            row.className = 'field-map-depth field-map-depth-gutter';
            row.dataset.depth = String(layer);
            row.classList.toggle('field-map-selected-depth', layer === fieldMap.layer);
            const label = document.createElement('button');
            label.type = 'button';
            label.className = 'field-map-depth-label';
            label.textContent = `L${layer}`;
            label.setAttribute('aria-label', `Pilih Layer ${layer}`);
            label.setAttribute('aria-pressed', String(layer === fieldMap.layer));
            label.onclick = () => {
                setFieldMapLayer(layer);
                diagram.querySelector(`[data-depth="${layer}"] button`)?.focus({ preventScroll: true });
            };
            row.appendChild(label);
            gutter.appendChild(row);
            const strip = document.createElement('div');
            strip.className = 'field-map-depth field-map-strip';
            strip.classList.toggle('field-map-selected-depth', layer === fieldMap.layer);
            for (const { pos, start, width } of CoilField.projectOverheadLayer(geometry, layer, loc.coils, hiddenPositions)) {
                if (layer === fieldMap.layer) visible.add(pos.id);
                const button = makeFieldMapSlotButton(loc, pos, layer, diagram, 'field-map-overhead-node');
                button.style.gridColumn = `${start + 1} / span ${width}`;
                // Keep the visible footprint, but draw even a half-width coil as a complete, labeled symbol.
                if (width === 1) {
                    button.classList.add('field-map-overhead-node--partial');
                    button.title += ' · Terlihat sebagian';
                    button.setAttribute('aria-label', button.title);
                }
                button.innerHTML = `<strong>#${pos.seq}</strong><span>${escapeHTML(pos.shortLabel)}</span>`;
                strip.appendChild(button);
            }
            overheadScroll.appendChild(strip);
        }
    } else {
        figure.className = 'field-map-front';
        rows.forEach(row => {
            const strip = document.createElement('div');
            strip.className = 'field-map-front-row';
            row.forEach(pos => {
                const button = makeFieldMapSlotButton(loc, pos, fieldMap.layer, diagram, 'field-map-front-node');
                const { title, item } = fieldMapSlot(loc, pos, fieldMap.layer);
                button.innerHTML = `<span>#${pos.seq}</span><strong>${escapeHTML(pos.shortLabel)}</strong><span>${escapeHTML(CoilField.isNoLabel(item) ? 'NO LABEL' : title)}</span>`;
                strip.appendChild(button);
            });
            figure.appendChild(strip);
        });
    }
    diagram.replaceChildren(figure);
    if (isTop) figure.querySelector('.field-map-overhead-scroll').scrollLeft = overheadScrollLeft;

    const list = fieldEl('map-list');
    fieldEl('map-list-title').textContent = `Daftar Slot — Layer ${fieldMap.layer}`;
    const visibilityText = pos => !isTop ? '' : hiddenPositions.has(pos.id) ? 'Baris disembunyikan di peta'
        : !visible.has(pos.id) ? 'Tertutup dari atas' : '';
    list.replaceChildren(...positions.map(pos => {
        const button = makeFieldMapSlotButton(loc, pos, fieldMap.layer, list, 'field-row field-map-list-row');
        const { kind, title, item } = fieldMapSlot(loc, pos, fieldMap.layer);
        const visibility = kind === 'coil' ? visibilityText(pos) : '';
        button.innerHTML = `<span><strong>#${pos.seq} ${escapeHTML(pos.shortLabel)}</strong> · ${escapeHTML(title)}</span>
            ${kind === 'coil' ? `<span>${escapeHTML(fieldHeatLabel(item))}${visibility ? ` · ${visibility}` : ''}</span>` : ''}`;
        button.setAttribute('aria-label', `${button.title}${kind === 'coil' ? ` · ${fieldHeatLabel(item)}` : ''}${visibility ? ` · ${visibility}` : ''}`);
        return button;
    }));

    const detail = fieldEl('map-detail');
    if (!selected) {
        detail.textContent = 'Pilih posisi untuk melihat detail.';
        return;
    }
    const { kind, title, item } = fieldMapSlot(loc, selected, fieldMap.layer);
    const status = kind === 'coil' ? visibilityText(selected) : '';
    const spec = kind === 'coil' ? [fieldHeatLabel(item), item.diameter && `Ø ${item.diameter} mm`, item.grade,
        item.weight && `${item.weight} ${item.weightUnit || 'kg'}`, item.supplier] : kind === 'no-coil'
        ? [item.picName, item.shift, item.updatedAt && fieldTime(item.updatedAt)] : [];
    detail.innerHTML = `<strong>${escapeHTML(loc.name)} · Layer ${fieldMap.layer} · #${selected.seq} ${escapeHTML(selected.shortLabel)}</strong>
        <span class="block mt-1 font-bold">${escapeHTML(title)}</span>
        <span class="block text-sm">${escapeHTML(spec.filter(Boolean).join(' · '))}</span>
        ${status ? `<span class="block text-sm text-amber-800">${status}</span>` : ''}`;
    detail.scrollTop = 0;
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
        : `catatan Coil ${fieldCoilLabel(events[0])} / ${fieldHeatLabel(events[0])}\nDari: ${fieldAddressText(events[0].from)}\nKe: ${fieldAddressText(events[0].to)}\nWaktu: ${fieldTime(events[0].at)}`;
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
    fieldEl('move-source').textContent = `Coil ${fieldCoilLabel(fieldMoveSource.item)} · ${fieldHeatLabel(fieldMoveSource.item)} · Asal: ${fieldAddressText(CoilField.address(fieldMoveSource))}`;
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
    showConfirmModal('Catat Perpindahan Coil', `Coil ${fieldCoilLabel(source.item)} / ${fieldHeatLabel(source.item)}\nDari: ${fieldAddressText(CoilField.address(source))}\nKe: ${fieldAddressText(destination)}\nAlasan: ${reason}\nVerifikasi lokasi lama tidak berlaku setelah dipindahkan.`, () => {
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
    rows.forEach(row => output.push([...metadata, 'Ringkasan coil awal', fieldCoilLabel(row.expected.item), row.expected.item.heatNumber,
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
        ...appState.coilMovements.map(event => [fieldCoilLabel(event), event.heatNumber, fieldAddressText(event.from), fieldAddressText(event.to), event.operator, event.shift, event.at, event.reason])];
    fieldDownloadCsv('CoilStack_Perpindahan.csv', rows);
}
