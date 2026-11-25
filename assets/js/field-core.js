/* Pure field-workflow rules, shared by the browser and Node tests. */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.CoilField = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';
    const normalize = value => String(value ?? '').trim().toUpperCase();
    const clone = value => JSON.parse(JSON.stringify(value));
    const identity = item => JSON.stringify([normalize(item.id), normalize(item.heatNumber)]);
    const active = item => item && (!item.status || normalize(item.status) === 'AKTIF');
    const number = value => Number(String(value ?? '').trim().replace(',', '.'));
    const weightKg = item => number(item.weight) * (normalize(item.weightUnit) === 'MT' ? 1000 : 1);

    function address(record) {
        return {
            locId: record.locId, locName: record.locName, type: record.type,
            posId: record.posId || '', position: record.position || '', layer: record.layer ?? null,
            floorAddress: record.item.floorAddress || '', nomor: record.item.nomor || ''
        };
    }

    function addressKey(record) {
        return JSON.stringify(record.type === 'pyramid'
            ? [record.locId, record.type, record.posId, record.layer]
            : [record.locId, record.type, normalize(record.item.floorAddress || record.item.nomor)]);
    }

    function fingerprint(record) {
        const item = record.item;
        return JSON.stringify([identity(item), addressKey(record), number(item.diameter),
            normalize(item.grade), weightKg(item), normalize(item.supplier), normalize(item.status || 'AKTIF'),
            item.lastMovedAt || '']);
    }

    function editBase(previous, nextIdentity) {
        const result = { ...previous };
        if (identity(previous) !== identity(nextIdentity)) {
            delete result.fieldVerification;
            delete result.lastMovedAt;
        }
        return result;
    }

    function records(state, positionsForPattern) {
        const result = [];
        Object.values(state.locations || {}).forEach(loc => {
            const positions = positionsForPattern(loc.stackPattern || '3-2-1');
            Object.entries(loc.coils || {}).forEach(([key, item]) => {
                if (!item?.id || !active(item)) return;
                const split = key.lastIndexOf('_');
                const posId = key.slice(0, split);
                const layer = Number(key.slice(split + 1));
                const position = positions.find(pos => pos.id === posId);
                result.push({ locId: loc.id, locName: loc.name, type: 'pyramid', key, posId,
                    position: position?.shortLabel || posId, layer, item });
            });
            (loc.nonPyramidCoils || []).forEach((item, index) => {
                if (!item?.id || !active(item)) return;
                result.push({ locId: loc.id, locName: loc.name, type: 'nonpyramid', index,
                    position: item.floorAddress || `Non-Piramid #${item.nomor || index + 1}`, layer: null, item });
            });
        });
        return result;
    }

    function parseLabel(raw) {
        const text = String(raw || '').trim();
        if (!text) throw new Error('Scan atau tempel label terlebih dahulu.');
        if (/^https?:\/\//i.test(text)) {
            const url = new URL(text);
            if (url.hostname === 'themastersteel.co.id' || url.hostname.endsWith('.themastersteel.co.id')) {
                return { externalUrl: url.href };
            }
            throw new Error('QR berupa tautan, bukan identitas coil. Isi No. Coil dan Heat secara manual.');
        }
        if (text.startsWith('{')) {
            let data;
            try { data = JSON.parse(text); } catch (_) { throw new Error('JSON label tidak valid.'); }
            if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('JSON label tidak valid.');
            const result = {};
            ['id', 'heatNumber', 'diameter', 'grade', 'weight', 'weightUnit', 'supplier'].forEach(key => {
                if (typeof data[key] === 'string' || typeof data[key] === 'number') result[key] = String(data[key]);
            });
            if (!result.id) throw new Error('JSON label harus memiliki id (No. Coil).');
            return result;
        }
        if (/Code\s*No\.?\s*:/i.test(text)) {
            const extract = pattern => text.match(pattern)?.[1]?.trim() || '';
            const result = {
                id: extract(/Code\s*No\.?\s*:\s*([^\r\n]+)/i),
                heatNumber: extract(/Heat\s*No\.?\s*:\s*([^\r\n]+)/i),
                grade: extract(/Grade\s*:\s*([^\r\n]+)/i), supplier: 'MASTER STEEL'
            };
            const size = extract(/Size\s*:\s*([^\r\n]+)/i).replace(/[∅Øø]/g, '').match(/[\d.,]+/);
            if (size) result.diameter = size[0];
            const weight = extract(/Weight\s*:\s*([^\r\n]+)/i).match(/([\d.,]+)\s*(kg|mts?|tons?|tonnes?)?/i);
            if (weight) {
                result.weightUnit = /^(mt|mts|ton|tons|tonne|tonnes)$/i.test(weight[2] || '') ? 'mt' : 'kg';
                let value = weight[1];
                if (value.includes(',') && value.includes('.')) value = value.replace(/,/g, '');
                else if (result.weightUnit === 'kg' && /^\d{1,3}(,\d{3})+$/.test(value)) value = value.replace(/,/g, '');
                result.weight = value;
            }
            return result;
        }
        const parts = text.split('-').map(part => part.trim());
        if (parts.length >= 6 && Number.isFinite(number(parts[4])) && Number.isFinite(number(parts[5]))) {
            return { supplier: parts[0], grade: parts[1], heatNumber: parts[2], id: parts[3],
                weight: parts[4], weightUnit: number(parts[4]) < 50 ? 'mt' : 'kg', diameter: parts[5] };
        }
        return { id: text };
    }

    function lookup(all, observed) {
        if (!normalize(observed.id)) return { kind: 'incomplete', matches: [] };
        if (!normalize(observed.heatNumber)) {
            return { kind: 'incomplete', matches: all.filter(record => normalize(record.item.id) === normalize(observed.id)) };
        }
        const matches = all.filter(record => identity(record.item) === identity(observed));
        return { kind: matches.length > 1 ? 'ambiguous' : matches.length ? 'found' : 'unregistered', matches };
    }

    function differences(expected, observed) {
        const result = [];
        ['grade', 'supplier'].forEach(key => {
            if (normalize(observed[key]) && normalize(observed[key]) !== normalize(expected[key])) result.push(key);
        });
        if (String(observed.diameter || '').trim() && number(observed.diameter) !== number(expected.diameter)) result.push('diameter');
        if (String(observed.weight || '').trim() && (!Number.isFinite(weightKg(observed)) ||
            !Number.isFinite(weightKg(expected)) || Math.abs(weightKg(observed) - weightKg(expected)) > 0.01)) result.push('weight');
        return result;
    }

    function startSession(state, locId, operator, shift, positionsForPattern, now = new Date().toISOString()) {
        if (!normalize(operator)) throw new Error('Nama pemeriksa wajib diisi.');
        if (!state.locations[locId]) throw new Error('Lokasi tidak tersedia.');
        if ((state.checkSessions || []).some(session => session.status === 'active')) throw new Error('Selesaikan sesi aktif sebelum memulai sesi baru.');
        const expected = records(state, positionsForPattern).filter(record => record.locId === locId).map(record => ({
            identity: identity(record.item), addressKey: addressKey(record), fingerprint: fingerprint(record),
            address: address(record), item: clone(record.item)
        }));
        const session = { id: `check_${now}_${(state.checkSessions || []).length}`, locId,
            locName: state.locations[locId].name, operator: operator.trim(), shift, startedAt: now,
            status: 'active', expected, checks: [] };
        (state.checkSessions ||= []).unshift(session);
        state.activeCheckSessionId = session.id;
        return session;
    }

    function check(state, session, observed, actual, confirmed, note, positionsForPattern, now = new Date().toISOString()) {
        if (!session || session.status !== 'active') throw new Error('Mulai sesi cek lapangan terlebih dahulu.');
        if (!normalize(observed.id) || !normalize(observed.heatNumber)) throw new Error('No. Coil dan Heat Number wajib diisi.');
        if (!confirmed) throw new Error('Konfirmasi lokasi dan slot yang terlihat di lapangan.');
        if (actual.locId !== session.locId || !state.locations[actual.locId]) throw new Error('Lokasi pengamatan harus sama dengan lokasi sesi.');
        const loc = state.locations[actual.locId];
        const legacyNonPyramid = actual.type === 'nonpyramid' && !normalize(actual.floorAddress) &&
            normalize(actual.nomor) && (loc.nonPyramidCoils || []).some(item => active(item) && !item.floorAddress && String(item.nomor) === String(actual.nomor));
        if (!legacyNonPyramid) validateDestination(loc, actual, positionsForPattern);
        const all = records(state, positionsForPattern);
        const found = lookup(all, observed);
        if (found.kind === 'ambiguous') throw new Error('Identitas coil + heat ganda. Perbaiki duplikasi sebelum verifikasi.');
        const record = found.matches[0];
        const actualRecord = { ...actual, item: { floorAddress: actual.floorAddress, nomor: actual.nomor } };
        const diff = record ? differences(record.item, observed) : [];
        const sameAddress = record && addressKey(record) === addressKey(actualRecord);
        const outcome = !record ? 'unregistered' : !sameAddress ? 'wrong_location' : diff.length ? 'mismatch' : 'matched';
        const event = { id: `observation_${now}_${session.checks.length}`, at: now, identity: identity(observed),
            observed: clone(observed), actual: clone(actual), expectedAddress: record ? address(record) : null,
            fingerprint: record ? fingerprint(record) : '', outcome, differences: diff, note: String(note || '').trim() };
        session.checks.push(event);
        if (outcome === 'matched') {
            record.item.fieldVerification = { at: now, operator: session.operator, shift: session.shift,
                sessionId: session.id, fingerprint: fingerprint(record) };
        } else if (record?.item.fieldVerification) {
            record.item.fieldVerification.invalidatedAt = now;
            record.item.fieldVerification.invalidatedReason = outcome;
        }
        return event;
    }

    function progress(session, all) {
        return session.expected.map(expected => {
            const latest = [...session.checks].reverse().find(event => event.identity === expected.identity);
            const current = all.filter(record => identity(record.item) === expected.identity);
            const unchanged = current.length === 1 && fingerprint(current[0]) === expected.fingerprint;
            const outcome = !unchanged ? 'changed' : !latest ? 'unchecked'
                : latest.fingerprint !== expected.fingerprint ? 'changed' : latest.outcome;
            return { expected, latest, outcome };
        });
    }

    function finishSession(state, session, positionsForPattern, now = new Date().toISOString()) {
        if (!session || session.status !== 'active') throw new Error('Tidak ada sesi aktif.');
        session.finalRows = clone(progress(session, records(state, positionsForPattern)));
        session.status = 'finished';
        session.finishedAt = now;
        state.activeCheckSessionId = null;
    }

    function historyIds(history, ids, label) {
        if (!Array.isArray(ids) || !ids.length || ids.some(id => typeof id !== 'string' || !id)) {
            throw new Error(`Pilih ${label} yang akan dihapus.`);
        }
        const selected = new Set(ids);
        if ([...selected].some(id => !history.some(item => item.id === id))) {
            throw new Error(`${label} berubah atau sudah dihapus. Pilih ulang sebelum menghapus.`);
        }
        return selected;
    }

    function removeSessions(state, ids) {
        const sessions = state.checkSessions || [];
        const selected = historyIds(sessions, ids, 'Sesi cek');
        // Deleted demo checks must not leave a valid verification badge behind.
        const clearVerification = item => {
            if (item?.fieldVerification && selected.has(item.fieldVerification.sessionId)) delete item.fieldVerification;
        };
        Object.values(state.locations || {}).forEach(loc => {
            Object.values(loc.coils || {}).forEach(clearVerification);
            (loc.nonPyramidCoils || []).forEach(clearVerification);
        });
        (state.coilHistory || []).forEach(clearVerification);
        state.checkSessions = sessions.filter(session => !selected.has(session.id));
        if (selected.has(state.activeCheckSessionId)) state.activeCheckSessionId = null;
        return sessions.length - state.checkSessions.length;
    }

    function removeMovements(state, ids) {
        const movements = state.coilMovements || [];
        const selected = historyIds(movements, ids, 'Riwayat perpindahan');
        // History cleanup is not a stock rollback: retain addresses and lastMovedAt.
        state.coilMovements = movements.filter(event => !selected.has(event.id));
        return movements.length - state.coilMovements.length;
    }

    function validateDestination(loc, destination, positionsForPattern) {
        if (destination.type === 'pyramid') {
            if (!Number.isInteger(destination.layer) || destination.layer < 1 || destination.layer > loc.totalLayers ||
                !positionsForPattern(loc.stackPattern || '3-2-1').some(pos => pos.id === destination.posId)) {
                throw new Error('Posisi atau layer tujuan tidak valid.');
            }
        } else if (destination.type !== 'nonpyramid' || !normalize(destination.floorAddress)) {
            throw new Error('Alamat lantai non-piramid wajib diisi (contoh: ZONA-A / 03).');
        }
    }

    function move(state, source, destination, operator, shift, reason, confirmed, positionsForPattern, now = new Date().toISOString()) {
        if (!normalize(operator) || !normalize(reason)) throw new Error('PIC dan alasan perpindahan wajib diisi.');
        if (!confirmed) throw new Error('Konfirmasi coil, lokasi asal, dan tujuan fisik sebelum mencatat perpindahan.');
        const all = records(state, positionsForPattern);
        const found = lookup(all, source.item);
        if (found.kind !== 'found') throw new Error('Coil tidak aktif atau identitas ganda. Cari ulang sebelum memindahkan.');
        const current = found.matches[0];
        if (fingerprint(current) !== fingerprint(source)) throw new Error('Data asal berubah. Cari ulang sebelum memindahkan.');
        const loc = state.locations[destination.locId];
        if (!loc) throw new Error('Lokasi tujuan tidak tersedia.');
        validateDestination(loc, destination, positionsForPattern);
        const targetRecord = { ...destination, item: { floorAddress: destination.floorAddress } };
        if (addressKey(current) === addressKey(targetRecord)) throw new Error('Tujuan sama dengan lokasi asal.');
        const key = `${destination.posId}_${destination.layer}`;
        if (destination.type === 'pyramid' && loc.coils?.[key]?.id) throw new Error('Slot tujuan terisi. Tidak ada coil yang ditimpa.');
        if (destination.type === 'nonpyramid' && all.some(record => record !== current && record.type === 'nonpyramid' &&
            record.locId === destination.locId && normalize(record.item.floorAddress) === normalize(destination.floorAddress))) {
            throw new Error('Alamat lantai tujuan terisi. Pilih alamat lain.');
        }
        const item = clone(current.item);
        delete item.fieldVerification;
        item.lastMovedAt = now;
        item.updatedAt = now;
        if (destination.type === 'nonpyramid') item.floorAddress = destination.floorAddress.trim().toUpperCase();
        else delete item.floorAddress;
        const from = address(current);
        if (current.type === 'pyramid') delete state.locations[current.locId].coils[current.key];
        else state.locations[current.locId].nonPyramidCoils.splice(current.index, 1);
        if (destination.type === 'pyramid') (loc.coils ||= {})[key] = item;
        else {
            const used = new Set((loc.nonPyramidCoils || []).map(record => String(record.nomor)));
            let n = 1;
            while (used.has(String(n))) n++;
            item.nomor = String(n);
            (loc.nonPyramidCoils ||= []).push(item);
        }
        const to = address({ ...destination, locName: loc.name,
            position: destination.type === 'pyramid' ? positionsForPattern(loc.stackPattern || '3-2-1').find(pos => pos.id === destination.posId).shortLabel : item.floorAddress, item });
        const event = { id: `move_${now}_${(state.coilMovements || []).length}`, identity: identity(item),
            coilId: item.id, heatNumber: item.heatNumber, from, to, operator: operator.trim(), shift,
            reason: reason.trim(), at: now };
        (state.coilMovements ||= []).unshift(event);
        return event;
    }

    const verified = record => !!record.item.fieldVerification && !record.item.fieldVerification.invalidatedAt &&
        record.item.fieldVerification.fingerprint === fingerprint(record);
    return { normalize, identity, address, addressKey, fingerprint, editBase, records, parseLabel, lookup, differences,
        startSession, check, progress, finishSession, removeSessions, removeMovements, move, verified, clone };
});
