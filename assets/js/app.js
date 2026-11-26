/* CoilStack application logic */
// ==========================================
        // KONFIGURASI & GENERATOR SUSUNAN DINAMIS
        // ==========================================
        let POSITIONS = [];

        function generatePositionsList(patternStr) {
            const bottomToTop = (patternStr || '3-2-1')
                .split('-')
                .map(n => parseInt(n.trim(), 10))
                .filter(n => !isNaN(n) && n > 0 && n <= 200);

            const validPattern = bottomToTop.length > 0 ? bottomToTop : [3, 2, 1];
            const totalRows = validPattern.length;
            const generated = [];
            let seqCounter = 1;

            for (let rIdx = totalRows - 1; rIdx >= 0; rIdx--) {
                const countInRow = validPattern[rIdx];
                const visualRowFromTop = totalRows - rIdx;

                for (let cIdx = 0; cIdx < countInRow; cIdx++) {
                    const isLegacy321 = validPattern.join('-') === '3-2-1';
                    let id = `R${rIdx + 1}_C${cIdx + 1}`;
                    let label = `BARIS ${rIdx + 1} - POSISI ${cIdx + 1}`;
                    let shortLabel = `B${rIdx + 1}-P${cIdx + 1}`;

                    if (isLegacy321) {
                        if (rIdx === 2 && cIdx === 0) { id = 'ATAS'; label = 'ATAS (Puncak)'; shortLabel = 'Atas'; }
                        else if (rIdx === 1 && cIdx === 0) { id = 'TENGAH_KIRI'; label = 'TENGAH KIRI'; shortLabel = 'Tengah Kiri'; }
                        else if (rIdx === 1 && cIdx === 1) { id = 'TENGAH_KANAN'; label = 'TENGAH KANAN'; shortLabel = 'Tengah Kanan'; }
                        else if (rIdx === 0 && cIdx === 0) { id = 'BAWAH_KIRI'; label = 'BAWAH KIRI'; shortLabel = 'Bawah Kiri'; }
                        else if (rIdx === 0 && cIdx === 1) { id = 'BAWAH_TENGAH'; label = 'BAWAH TENGAH'; shortLabel = 'Bawah Tengah'; }
                        else if (rIdx === 0 && cIdx === 2) { id = 'BAWAH_KANAN'; label = 'BAWAH KANAN'; shortLabel = 'Bawah Kanan'; }
                    } else {
                        const rowName = rIdx === totalRows - 1 ? 'Puncak' : (rIdx === 0 ? 'Bawah' : `Baris ${rIdx + 1}`);
                        const posName = countInRow === 1 ? 'Tengah' : (cIdx === 0 ? 'Kiri' : (cIdx === countInRow - 1 ? 'Kanan' : `Ke-${cIdx + 1}`));
                        label = `${rowName.toUpperCase()} - ${posName.toUpperCase()}`;
                        shortLabel = countInRow === 1 ? rowName : `${rowName} ${posName}`;
                    }

                    generated.push({
                        id,
                        seq: seqCounter++,
                        label,
                        shortLabel,
                        visualRowFromTop,
                        countInRow
                    });
                }
            }
            return {
                positions: generated,
                normalizedPattern: validPattern.join('-')
            };
        }

        function buildPositionsFromPattern(patternStr) {
            const res = generatePositionsList(patternStr);
            POSITIONS = res.positions;
            return res.normalizedPattern;
        }

        function getAutoSequenceNumber(posId) {
            const position = POSITIONS.find(pos => pos.id === posId);
            return position ? String(position.seq) : '';
        }

        function getNextNonPyramidNomor(excludeIndex) {
            return getNextNpNomorInLocation(appState, excludeIndex);
        }

        function getNextCoilNomorInLocation(loc, excludeKey) {
            const used = new Set();
            Object.entries((loc && loc.coils) || {}).forEach(([key, rec]) => {
                if (key === excludeKey || !rec) return;
                const n = parseInt(String(rec.nomor || '').replace(/[^\d]/g, ''), 10);
                if (!isNaN(n) && n > 0) used.add(n);
            });
            let n = 1;
            while (used.has(n)) n++;
            return n.toString();
        }

        function getNextNpNomorInLocation(loc, excludeIndex) {
            const used = new Set();
            ((loc && loc.nonPyramidCoils) || []).forEach((rec, idx) => {
                if (idx === excludeIndex || !rec) return;
                const n = parseInt(String(rec.nomor || '').replace(/[^\d]/g, ''), 10);
                if (!isNaN(n) && n > 0) used.add(n);
            });
            let n = 1;
            while (used.has(n)) n++;
            return n.toString();
        }

        function normalizeDuplicateValue(value) {
            return String(value || '').trim().toUpperCase();
        }

        function normalizeCoilStatus(value) {
            const status = normalizeDuplicateValue(value).replace(/[\s-]+/g, '_');
            if (status === 'DIPAKAI' || status === 'DIPAKAI_PRODUKSI' || status === 'HABIS') return 'DIPAKAI_PRODUKSI';
            if (status === 'HILANG') return 'HILANG';
            if (status === 'DIHAPUS' || status === 'DELETED') return 'DIHAPUS';
            return 'AKTIF';
        }

        function getCoilStatusLabel(status) {
            const normalized = normalizeCoilStatus(status);
            if (normalized === 'DIPAKAI_PRODUKSI') return 'DIPAKAI PRODUKSI';
            if (normalized === 'HILANG') return 'HILANG';
            if (normalized === 'DIHAPUS') return 'DIHAPUS';
            return 'AKTIF';
        }

        function isCoilActive(item) {
            return !!item && normalizeCoilStatus(item.status) === 'AKTIF';
        }

        const isNoLabelRecord = CoilField.isNoLabel;
        const coilDisplayId = CoilField.displayCoil;

        function collectInventoryRefs() {
            const refs = new Set();
            const add = item => {
                const ref = CoilField.normalizeRef(item?.inventoryRef);
                if (ref) refs.add(ref);
            };
            Object.values(appState.locations || {}).forEach(loc => {
                Object.values(loc?.coils || {}).forEach(add);
                (loc?.nonPyramidCoils || []).forEach(add);
            });
            (appState.coilHistory || []).forEach(add);
            return refs;
        }

        function generateInventoryRef() {
            const used = collectInventoryRefs();
            for (let attempt = 0; attempt < 100; attempt++) {
                const bytes = new Uint8Array(8);
                if (globalThis.crypto?.getRandomValues) {
                    globalThis.crypto.getRandomValues(bytes);
                } else {
                    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
                }
                const ref = `NL-${Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('').toUpperCase()}`;
                if (!used.has(ref)) return ref;
            }
            throw new Error('Gagal membuat referensi internal NO LABEL. Coba lagi.');
        }

        function ensureInventoryRef(item) {
            if (!isNoLabelRecord(item)) return '';
            const existing = CoilField.normalizeRef(item.inventoryRef);
            if (existing) return existing;
            item.inventoryRef = generateInventoryRef();
            return item.inventoryRef;
        }

        function coilMergeKey(item) {
            if (!item) return '';
            if (isNoLabelRecord(item)) return `REF:${CoilField.normalizeRef(item.inventoryRef)}`;
            return `ID:${normalizeDuplicateValue(item.id)}`;
        }

        function archiveCoilRecord(item, context = {}) {
            if (!CoilField.hasCoil(item)) return;
            const normalizedStatus = normalizeCoilStatus(item.status);
            if (normalizedStatus !== 'DIPAKAI_PRODUKSI' && normalizedStatus !== 'HILANG') return;
            if (isNoLabelRecord(item)) ensureInventoryRef(item);

            if (!Array.isArray(appState.coilHistory)) appState.coilHistory = [];
            const archiveRecord = {
                ...item,
                status: normalizedStatus,
                locId: context.locId ?? appState.activeLocationId ?? '',
                locName: context.locName || appState.bayName || '',
                type: context.type || 'pyramid',
                position: context.position || '',
                layer: context.layer ?? null,
                nomorUrut: context.nomorUrut ?? item.nomor ?? null,
                exitedAt: context.exitedAt || item.updatedAt || new Date().toLocaleString('id-ID')
            };
            const signature = [
                archiveRecord.locId || normalizeDuplicateValue(archiveRecord.locName),
                archiveRecord.type,
                archiveRecord.position,
                archiveRecord.layer ?? '',
                normalizeDuplicateValue(archiveRecord.id),
                normalizeDuplicateValue(archiveRecord.heatNumber),
                CoilField.normalizeRef(archiveRecord.inventoryRef),
                archiveRecord.status
            ].join('|');
            const alreadyArchived = appState.coilHistory.some(record => [
                record.locId || normalizeDuplicateValue(record.locName),
                record.type || '',
                record.position || '',
                record.layer ?? '',
                normalizeDuplicateValue(record.id),
                normalizeDuplicateValue(record.heatNumber),
                CoilField.normalizeRef(record.inventoryRef),
                normalizeCoilStatus(record.status)
            ].join('|') === signature);
            if (!alreadyArchived) appState.coilHistory.unshift(archiveRecord);
        }

        function syncImportedTerminalStatus(loc, id, heatNumber, status, context = {}, inventoryRef = '') {
            if (!loc || !['DIPAKAI_PRODUKSI', 'HILANG'].includes(status)) return false;
            const targetRef = CoilField.normalizeRef(inventoryRef);
            const targetId = normalizeDuplicateValue(id);
            const targetHeat = normalizeDuplicateValue(heatNumber);
            if (!targetRef && (!targetId || !targetHeat)) return false;

            const matches = (item) => item && (targetRef
                ? CoilField.normalizeRef(item.inventoryRef) === targetRef
                : !isNoLabelRecord(item) &&
                    normalizeDuplicateValue(item.id) === targetId &&
                    normalizeDuplicateValue(item.heatNumber) === targetHeat);

            for (const [key, item] of Object.entries(loc.coils || {})) {
                if (!matches(item)) continue;
                const parts = key.split('_');
                const layer = parseInt(parts.pop(), 10);
                const posId = parts.join('_');
                const position = generatePositionsList(loc.stackPattern || '3-2-1').positions
                    .find(pos => pos.id === posId);
                archiveCoilRecord({
                    ...item,
                    status,
                    updatedAt: context.updatedAt || item.updatedAt
                }, {
                    locId: loc.id,
                    locName: loc.name,
                    type: 'pyramid',
                    position: position ? position.shortLabel : posId,
                    layer: isNaN(layer) ? null : layer
                });
                delete loc.coils[key];
                return true;
            }

            const nonPyramidIndex = (loc.nonPyramidCoils || []).findIndex(matches);
            if (nonPyramidIndex >= 0) {
                const item = loc.nonPyramidCoils[nonPyramidIndex];
                archiveCoilRecord({
                    ...item,
                    status,
                    updatedAt: context.updatedAt || item.updatedAt
                }, {
                    locId: loc.id,
                    locName: loc.name,
                    type: 'nonpyramid',
                    position: 'Samping',
                    layer: null,
                    nomorUrut: item.nomor || nonPyramidIndex + 1
                });
                loc.nonPyramidCoils.splice(nonPyramidIndex, 1);
                return true;
            }

            return false;
        }

        function freePyramidSlotsForUsedCoils(coils, context = {}) {
            if (!coils || typeof coils !== 'object') return;
            Object.entries(coils).forEach(([key, item]) => {
                const status = normalizeCoilStatus(item?.status);
                if (item && status === 'DIHAPUS') {
                    delete coils[key];
                } else if (item && ['DIPAKAI_PRODUKSI', 'HILANG'].includes(status)) {
                    const parts = key.split('_');
                    const layer = parseInt(parts.pop(), 10);
                    const posId = parts.join('_');
                    const pos = POSITIONS.find(p => p.id === posId);
                    archiveCoilRecord(item, {
                        locId: context.locId,
                        locName: context.locName,
                        type: 'pyramid',
                        position: pos ? pos.shortLabel : posId,
                        layer: isNaN(layer) ? null : layer
                    });
                    delete coils[key];
                }
            });
        }

        function isMeaningfulDuplicateValue(value) {
            const normalized = normalizeDuplicateValue(value);
            return normalized !== '' && normalized !== '0';
        }

        function findDuplicateCoil(id, opts = {}) {
            const target = normalizeDuplicateValue(id);
            const targetHeat = normalizeDuplicateValue(opts.heatNumber);
            if (!target) return null;

            const locations = Object.values(appState.locations || {});
            let firstCoilDuplicate = null;
            for (const loc of locations) {
                if (!loc) continue;
                const isActiveLocation = loc.id === appState.activeLocationId;
                const coils = isActiveLocation ? appState.coils : (loc.coils || {});
                const nonPyramidCoils = isActiveLocation ? appState.nonPyramidCoils : (loc.nonPyramidCoils || []);

                for (const [key, item] of Object.entries(coils)) {
                    if (loc.id === opts.locationId && key === opts.pyramidKey) continue;
                    if (!item || isNoLabelRecord(item) || normalizeDuplicateValue(item.id) !== target) continue;
                    const duplicate = {
                        type: isActiveLocation ? 'pyramid' : 'other_pyramid',
                        locName: loc.name || appState.bayName,
                        key,
                        item,
                        sameCoilHeat: isMeaningfulDuplicateValue(target) &&
                            isMeaningfulDuplicateValue(targetHeat) &&
                            normalizeDuplicateValue(item.heatNumber) === targetHeat &&
                            isMeaningfulDuplicateValue(item.heatNumber)
                    };
                    if (duplicate.sameCoilHeat) return duplicate;
                    if (!firstCoilDuplicate) firstCoilDuplicate = duplicate;
                }

                for (let i = 0; i < nonPyramidCoils.length; i++) {
                    const item = nonPyramidCoils[i];
                    if (loc.id === opts.locationId && i === opts.nonPyramidIndex) continue;
                    if (!item || isNoLabelRecord(item) || normalizeDuplicateValue(item.id) !== target) continue;
                    const duplicate = {
                        type: isActiveLocation ? 'nonpyramid' : 'other_nonpyramid',
                        locName: loc.name || appState.bayName,
                        index: i,
                        item,
                        sameCoilHeat: isMeaningfulDuplicateValue(target) &&
                            isMeaningfulDuplicateValue(targetHeat) &&
                            normalizeDuplicateValue(item.heatNumber) === targetHeat &&
                            isMeaningfulDuplicateValue(item.heatNumber)
                    };
                    if (duplicate.sameCoilHeat) return duplicate;
                    if (!firstCoilDuplicate) firstCoilDuplicate = duplicate;
                }
            }
            return firstCoilDuplicate;
        }

        function validInventoryWeight(value, noLabel) {
            const text = String(value ?? '').trim();
            if (!text) return noLabel;
            const kgOrMt = Number(text.replace(',', '.'));
            return Number.isFinite(kgOrMt) && kgOrMt > 0;
        }

        // CSV and WhatsApp must make the same decision before changing either slot.
        function storeImportedCoil(loc, item, position, layer, overwrite, tracker) {
            const key = position ? `${position.id}_${layer}` : null;
            const identity = CoilField.identity(item);
            const index = key ? -1 : loc.nonPyramidCoils.findIndex(c => CoilField.identity(c) === identity);
            const existing = key ? loc.coils[key] : loc.nonPyramidCoils[index];
            if (item.status === 'DIPAKAI_PRODUKSI' || item.status === 'HILANG') {
                if (!syncImportedTerminalStatus(loc, item.id, item.heatNumber, item.status, item, item.inventoryRef)) {
                    archiveCoilRecord(item, { locId: loc.id, locName: loc.name, type: key ? 'pyramid' : 'nonpyramid', position: position?.shortLabel || 'Samping', layer });
                }
            } else {
                if (CoilField.hasCoil(existing) && !overwrite || item.status === 'DIHAPUS') {
                    tracker.skippedCount++;
                    return;
                }
                if (isNoLabelRecord(item) || (isMeaningfulDuplicateValue(item.id) && isMeaningfulDuplicateValue(item.heatNumber))) {
                    const all = CoilField.records(appState, pattern => generatePositionsList(pattern).positions);
                    const found = isNoLabelRecord(item) ? CoilField.lookupReference(all, item.inventoryRef) : CoilField.lookup(all, item);
                    if (found.kind === 'ambiguous') {
                        tracker.skippedCount++;
                        tracker.hardDuplicateCount++;
                        return;
                    }
                    const source = found.matches[0];
                    if (source && source.item !== existing) {
                        const from = appState.locations[source.locId];
                        if (source.type === 'pyramid') delete from.coils[source.key];
                        else from.nonPyramidCoils.splice(source.index, 1);
                        tracker.relocatedCount++;
                    }
                }
                item.nomor ||= key ? getNextCoilNomorInLocation(loc, key) : getNextNpNomorInLocation(loc, index);
                if (key) loc.coils[key] = item;
                else if (index >= 0) loc.nonPyramidCoils[index] = item;
                else loc.nonPyramidCoils.push(item);
            }
            tracker.importedCount++;
            tracker.touchedLocIds.add(loc.id);
        }

        function describeDuplicate(dup) {
            if (!dup) return '';
            if (dup.type === 'pyramid') {
                const parts = dup.key.split('_');
                const layer = parts[parts.length - 1];
                const posId = parts.slice(0, -1).join('_');
                const pos = POSITIONS.find(p => p.id === posId);
                return `${pos ? pos.shortLabel : posId} • Layer ${layer}`;
            }
            if (dup.type === 'nonpyramid') {
                return `Non-Piramid #${dup.item.nomor || (dup.index + 1)}`;
            }
            if (dup.type === 'other_pyramid') {
                const parts = dup.key.split('_');
                const layer = parts[parts.length - 1];
                const posId = parts.slice(0, -1).join('_');
                return `Lokasi "${dup.locName}" (${posId} • Layer ${layer})`;
            }
            if (dup.type === 'other_nonpyramid') {
                return `Lokasi "${dup.locName}" (Non-Piramid #${dup.item.nomor || (dup.index + 1)})`;
            }
            return '';
        }

        const STORAGE_KEY = 'coilstack_321_data_v1';

        function detectCurrentShiftByTime(dateObj = new Date()) {
            const totalMinutes = dateObj.getHours() * 60 + dateObj.getMinutes();
            // Shift 1: 07:30 (450) - 15:30 (930)
            if (totalMinutes >= 450 && totalMinutes < 930) return 'Shift 1';
            // Shift 2: 15:30 (930) - 23:30 (1410)
            if (totalMinutes >= 930 && totalMinutes < 1410) return 'Shift 2';
            // Shift 3: 23:30 (1410) - 07:30 (450)
            return 'Shift 3';
        }

        function createLocationRecord(id, name, overrides = {}) {
            return {
                id,
                name: name || 'BAY-A01',
                picName: overrides.picName !== undefined ? overrides.picName : '',
                shift: overrides.shift || detectCurrentShiftByTime(),
                stackPattern: overrides.stackPattern || '3-2-1',
                totalLayers: overrides.totalLayers !== undefined ? overrides.totalLayers : (appState ? appState.totalLayers : 2),
                activePosition: overrides.activePosition || 'ATAS',
                selectedLayer: overrides.selectedLayer || 1,
                crawlDirection: overrides.crawlDirection || 'asc',
                coils: overrides.coils || {},
                nonPyramidCoils: Array.isArray(overrides.nonPyramidCoils) ? overrides.nonPyramidCoils : []
            };
        }

        let appState = {
            bayName: 'BAY-A01',
            picName: '',
            shift: detectCurrentShiftByTime(),
            stackPattern: '3-2-1',
            totalLayers: 2,
            activePosition: 'ATAS',
            selectedLayer: 1,
            crawlDirection: 'asc',
            defaultWeightUnit: 'kg',
            coils: {},
            nonPyramidCoils: [],
            coilHistory: [],
            activeLocationId: 'loc_1',
            locations: {}
        };

        let currentMode = 'crawl';
        let pyramidCoilClipboard = null;
        let quickPastedCoil = null;
        let editingNonPyramidIndex = -1;
        let locationModalMode = 'new';
        let html5QrScanner = null;
        let activeQrTarget = 'pyramid';
        let awaitingExternalCopyTarget = null;
        let saveStateTimer = null;

        // ==========================================
        // HELPER UI & MODAL
        // ==========================================
        function escapeHTML(str) {
            if (str === null || str === undefined) return '';
            return String(str)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        }

        function showToast(message, type = 'success') {
            const container = document.getElementById('toast-container');
            if (!container) return;
            const toast = document.createElement('div');
            const bgClass = type === 'error'
                ? 'bg-red-600 text-white border-red-700'
                : (type === 'info' ? 'bg-slate-800 text-amber-300 border-slate-700' : 'bg-emerald-600 text-white border-emerald-700');
            const iconClass = type === 'error'
                ? 'fa-circle-exclamation'
                : (type === 'info' ? 'fa-circle-info' : 'fa-circle-check');

            toast.setAttribute('role', type === 'error' ? 'alert' : 'status');
            toast.className = `${bgClass} border px-4 py-3 rounded-xl shadow-lg text-sm font-semibold flex items-center gap-2.5 pointer-events-auto transition-all duration-300`;
            toast.innerHTML = `<i class="fa-solid ${iconClass} shrink-0"></i><span>${escapeHTML(message)}</span>`;
            container.appendChild(toast);

            setTimeout(() => {
                toast.style.opacity = '0';
                toast.style.transform = 'translateY(-6px)';
                setTimeout(() => toast.remove(), 300);
            }, Math.max(4000, Math.min(8000, 2500 + String(message).length * 35)));
        }

        let modalReturnFocus = null;

        function showModalEl(id) {
            const el = document.getElementById(id);
            if (!el) return;
            if (!document.querySelector('.fixed[role="dialog"]:not(.hidden)')) {
                modalReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
            }
            const heading = el.querySelector('h1, h2, h3, h4');
            if (heading) {
                if (!heading.id) heading.id = `${id}-heading`;
                el.setAttribute('aria-labelledby', heading.id);
            } else {
                el.setAttribute('aria-label', 'Dialog');
            }
            el.setAttribute('role', 'dialog');
            el.setAttribute('aria-modal', 'true');
            el.classList.remove('hidden');
            el.classList.add('flex');
            document.body.classList.add('modal-open');
            requestAnimationFrame(() => {
                const initialFocus = el.querySelector('[autofocus], input:not([type="hidden"]), textarea, select, button, a[href], [tabindex]:not([tabindex="-1"])');
                initialFocus?.focus({ preventScroll: true });
            });
        }

        function hideModalEl(id) {
            const el = document.getElementById(id);
            if (!el) return;
            el.classList.add('hidden');
            el.classList.remove('flex');
            el.removeAttribute('aria-modal');
            if (!document.querySelector('.fixed[role="dialog"]:not(.hidden)')) {
                document.body.classList.remove('modal-open');
                if (modalReturnFocus?.isConnected) modalReturnFocus.focus({ preventScroll: true });
                modalReturnFocus = null;
            }
        }

        document.addEventListener('keydown', event => {
            const dialogs = Array.from(document.querySelectorAll('.fixed[role="dialog"]:not(.hidden)'));
            const dialog = dialogs[dialogs.length - 1];
            if (!dialog) return;

            if (event.key === 'Escape') {
                event.preventDefault();
                const closeButton = dialog.querySelector('#modal-cancel, button[onclick*="close"]');
                closeButton?.click();
                return;
            }

            if (event.key !== 'Tab') return;
            const focusable = Array.from(dialog.querySelectorAll('button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'))
                .filter(node => node.offsetParent !== null);
            if (!focusable.length) {
                event.preventDefault();
                dialog.focus();
                return;
            }
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
                event.preventDefault();
                first.focus();
            }
        });

        function showConfirmModal(title, message, onConfirm, onCancel) {
            document.getElementById('modal-title').textContent = title;
            document.getElementById('modal-message').textContent = message;
            const cancelBtn = document.getElementById('modal-cancel');
            const confirmBtn = document.getElementById('modal-confirm');

            const cleanup = () => hideModalEl('confirm-modal');
            cancelBtn.onclick = () => {
                cleanup();
                if (typeof onCancel === 'function') onCancel();
            };
            confirmBtn.onclick = () => {
                cleanup();
                if (typeof onConfirm === 'function') onConfirm();
            };
            showModalEl('confirm-modal');
        }

        // ==========================================
        // STATE PERSISTENCE & MULTI-LOKASI
        // ==========================================
        function syncActiveStateToLocation() {
            if (!appState.locations) appState.locations = {};
            const id = appState.activeLocationId || 'loc_1';
            appState.locations[id] = createLocationRecord(id, appState.bayName, {
                picName: appState.picName,
                shift: appState.shift,
                stackPattern: appState.stackPattern,
                totalLayers: appState.totalLayers,
                activePosition: appState.activePosition,
                selectedLayer: appState.selectedLayer,
                crawlDirection: appState.crawlDirection,
                coils: appState.coils,
                nonPyramidCoils: appState.nonPyramidCoils
            });
        }

        function loadLocationIntoActiveState(locId) {
            const loc = appState.locations[locId];
            if (!loc) return;
            if (!Array.isArray(appState.coilHistory)) appState.coilHistory = [];
            Object.entries(loc.coils || {}).forEach(([key, item]) => {
                if (!CoilField.hasCoil(item)) return;
                item.status = normalizeCoilStatus(item.status);
            });
            (loc.nonPyramidCoils || []).forEach(item => {
                if (CoilField.hasCoil(item)) item.status = normalizeCoilStatus(item.status);
            });
            appState.activeLocationId = locId;
            appState.bayName = loc.name || 'BAY-A01';
            appState.picName = loc.picName || '';
            appState.shift = loc.shift || detectCurrentShiftByTime();
            appState.stackPattern = buildPositionsFromPattern(loc.stackPattern || '3-2-1');
            freePyramidSlotsForUsedCoils(loc.coils, { locId: loc.id, locName: loc.name });
            appState.totalLayers = loc.totalLayers || 2;
            appState.activePosition = POSITIONS.some(p => p.id === loc.activePosition) ? loc.activePosition : POSITIONS[0].id;
            appState.selectedLayer = Math.min(Math.max(loc.selectedLayer || 1, 1), appState.totalLayers);
            appState.crawlDirection = loc.crawlDirection || 'asc';
            appState.coils = loc.coils || {};
            appState.nonPyramidCoils = Array.isArray(loc.nonPyramidCoils) ? loc.nonPyramidCoils : [];
        }

        function saveState() {
            if (saveStateTimer) {
                clearTimeout(saveStateTimer);
                saveStateTimer = null;
            }
            syncActiveStateToLocation();
            freePyramidSlotsForUsedCoils(appState.coils, {
                locId: appState.activeLocationId,
                locName: appState.bayName
            });
            appState.nonPyramidCoils = (appState.nonPyramidCoils || []).filter(item => normalizeCoilStatus(item?.status) !== 'DIHAPUS');
            Object.values(appState.locations || {}).forEach(loc => {
                if (!loc) return;
                freePyramidSlotsForUsedCoils(loc.coils, { locId: loc.id, locName: loc.name });
                if (Array.isArray(loc.nonPyramidCoils)) {
                    loc.nonPyramidCoils = loc.nonPyramidCoils.filter(item => normalizeCoilStatus(item?.status) !== 'DIHAPUS');
                }
            });
            try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(appState));
                return true;
            } catch (e) {
                console.warn('Gagal menyimpan ke localStorage:', e);
                showToast('Data tidak tersimpan. Penyimpanan perangkat penuh atau diblokir; ekspor cadangan sebelum menutup aplikasi.', 'error');
                return false;
            }
        }

        function scheduleSaveState(delay = 400) {
            if (saveStateTimer) clearTimeout(saveStateTimer);
            saveStateTimer = setTimeout(() => {
                saveStateTimer = null;
                saveState();
            }, delay);
        }

        function renderLocationSelector() {
            const sel = document.getElementById('location-select');
            const delBtn = document.getElementById('delete-location-btn');
            if (!sel) return;
            sel.innerHTML = '';

            const locs = Object.values(appState.locations || {});
            locs.forEach(loc => {
                const count = Object.values(loc.coils || {}).filter(c => CoilField.hasCoil(c) && isCoilActive(c)).length +
                    (loc.nonPyramidCoils || []).filter(c => CoilField.hasCoil(c) && isCoilActive(c)).length;
                const opt = document.createElement('option');
                opt.value = loc.id;
                opt.textContent = `${loc.name} (${count})`;
                if (loc.id === appState.activeLocationId) opt.selected = true;
                sel.appendChild(opt);
            });

            if (delBtn) {
                delBtn.classList.remove('hidden');
                if (locs.length > 1) {
                    delBtn.title = `Hapus lokasi ${appState.bayName}`;
                } else {
                    delBtn.title = `Hapus lokasi ${appState.bayName} & mulai dari nol`;
                }
            }
        }

        function switchLocation(newLocId) {
            if (!appState.locations[newLocId] || newLocId === appState.activeLocationId) return;
            syncActiveStateToLocation();
            loadLocationIntoActiveState(newLocId);
            resetNonPyramidForm();
            saveState();
            renderAll();
            showToast(`Pindah ke lokasi ${appState.bayName}`, 'info');
        }

        function syncPicShiftUI() {
            const picInp = document.getElementById('pic-name-input');
            const shiftSel = document.getElementById('shift-select');
            if (picInp && picInp.value !== (appState.picName || '')) {
                picInp.value = appState.picName || '';
            }
            if (shiftSel) {
                shiftSel.value = appState.shift || detectCurrentShiftByTime();
            }
        }

        function onPicShiftChange() {
            const picInp = document.getElementById('pic-name-input');
            const shiftSel = document.getElementById('shift-select');
            if (picInp) appState.picName = picInp.value;
            if (shiftSel) appState.shift = shiftSel.value;
            scheduleSaveState();
        }

        function openNewLocationModal() {
            locationModalMode = 'new';
            const locCount = Object.keys(appState.locations || {}).length;
            document.getElementById('location-modal-title').textContent = locCount === 0 ? 'Buat Lokasi Baru' : 'Tambah Lokasi Baru';
            document.getElementById('location-modal-subtitle').textContent = locCount === 0 ? 'Tentukan nama lokasi / bay untuk mulai input data' : 'Data lokasi sebelumnya tetap tersimpan aman';
            document.getElementById('location-name-input').value = '';
            document.getElementById('new-location-pattern').value = appState.stackPattern || '3-2-1';
            const layersInp = document.getElementById('new-location-layers');
            if (layersInp) layersInp.value = appState.totalLayers || 2;
            document.getElementById('location-pattern-row').classList.remove('hidden');
            const delAllBtn = document.getElementById('modal-delete-all-btn');
            if (delAllBtn) {
                if (locCount > 1) delAllBtn.classList.remove('hidden');
                else delAllBtn.classList.add('hidden');
            }
            showModalEl('location-modal');
            setTimeout(() => document.getElementById('location-name-input').focus(), 50);
        }

        function openRenameLocationModal() {
            locationModalMode = 'rename';
            document.getElementById('location-modal-title').textContent = 'Ubah Nama Lokasi';
            document.getElementById('location-modal-subtitle').textContent = `Mengubah nama lokasi aktif (${appState.bayName})`;
            document.getElementById('location-name-input').value = appState.bayName || '';
            document.getElementById('location-pattern-row').classList.add('hidden');
            const delAllBtn = document.getElementById('modal-delete-all-btn');
            if (delAllBtn) delAllBtn.classList.add('hidden');
            showModalEl('location-modal');
            setTimeout(() => document.getElementById('location-name-input').focus(), 50);
        }

        function closeLocationModal() {
            hideModalEl('location-modal');
            if (!appState.locations || Object.keys(appState.locations).length === 0) {
                const defId = 'loc_' + Date.now();
                const defLoc = createLocationRecord(defId, 'BAY-01', {
                    stackPattern: appState.stackPattern || '3-2-1',
                    totalLayers: appState.totalLayers || 2
                });
                appState.locations = { [defId]: defLoc };
                loadLocationIntoActiveState(defId);
                saveState();
                renderAll();
            }
        }

        function saveLocationModal() {
            const rawName = document.getElementById('location-name-input').value.trim().toUpperCase();
            if (!rawName) {
                showToast('Nama lokasi wajib diisi!', 'error');
                return;
            }

            if (locationModalMode === 'rename') {
                if (rawName === (appState.bayName || '').toUpperCase()) {
                    closeLocationModal();
                    return;
                }
                const duplicateLoc = Object.values(appState.locations).find(
                    l => l.id !== appState.activeLocationId && (l.name || '').toUpperCase() === rawName
                );
                if (duplicateLoc) {
                    showToast(`Nama "${rawName}" sudah dipakai lokasi lain!`, 'error');
                    return;
                }
                appState.bayName = rawName;
                syncActiveStateToLocation();
                saveState();
                closeLocationModal();
                renderAll();
                showToast(`Nama lokasi diubah menjadi ${rawName}`);
                return;
            }

            const existingLoc = Object.values(appState.locations).find(l => l.name.toUpperCase() === rawName);
            if (existingLoc) {
                closeLocationModal();
                switchLocation(existingLoc.id);
                return;
            }

            syncActiveStateToLocation();
            const newId = 'loc_' + Date.now();
            const chosenPattern = document.getElementById('new-location-pattern').value || '3-2-1';
            const chosenLayers = parseInt(document.getElementById('new-location-layers')?.value, 10) || appState.totalLayers || 2;
            appState.locations[newId] = createLocationRecord(newId, rawName, {
                picName: appState.picName,
                shift: appState.shift,
                stackPattern: chosenPattern,
                totalLayers: Math.min(Math.max(chosenLayers, 1), 50)
            });

            loadLocationIntoActiveState(newId);
            resetNonPyramidForm();
            saveState();
            closeLocationModal();
            renderAll();
            showToast(`Lokasi baru "${rawName}" dibuat!`);
        }

        function resetToCleanLocation() {
            appState.locations = {};
            appState.coils = {};
            appState.nonPyramidCoils = [];
            appState.activeLocationId = '';
            appState.bayName = '';
            appState.picName = '';
            appState.selectedLayer = 1;
            resetNonPyramidForm();
            openNewLocationModal();
            showToast('Lokasi dikosongkan. Silakan buat lokasi baru.', 'info');
        }

        function confirmDeleteCurrentLocation() {
            const locKeys = Object.keys(appState.locations || {});
            if (locKeys.length <= 1) {
                showConfirmModal(
                    'Hapus Lokasi & Mulai Dari Nol?',
                    `Lokasi "${appState.bayName}" dan seluruh data coil di dalamnya akan dihapus. Anda dapat langsung menginput nama lokasi baru dari nol tanpa placeholder.`,
                    () => {
                        resetToCleanLocation();
                    }
                );
                return;
            }
            showConfirmModal(
                'Hapus Lokasi Ini?',
                `Seluruh data coil pada lokasi "${appState.bayName}" akan dihapus permanen. Lokasi lain tetap aman.`,
                () => {
                    delete appState.locations[appState.activeLocationId];
                    const nextId = Object.keys(appState.locations)[0];
                    loadLocationIntoActiveState(nextId);
                    resetNonPyramidForm();
                    saveState();
                    renderAll();
                    showToast(`Lokasi dihapus. Beralih ke ${appState.bayName}`, 'info');
                }
            );
        }

        function confirmDeleteAllLocations() {
            closeLocationModal();
            const count = Object.keys(appState.locations || {}).length;
            showConfirmModal(
                'Hapus SEMUA Lokasi?',
                `PERINGATAN: Seluruh ${count} lokasi dan semua data coil di dalamnya akan dihapus total untuk mulai dari nol.`,
                () => {
                    resetToCleanLocation();
                }
            );
        }

        function openMergeLocationsModal() {
            const locations = Object.values(appState.locations || {});
            if (locations.length < 2) {
                showToast('Minimal dua lokasi diperlukan untuk digabungkan.', 'info');
                return;
            }
            syncActiveStateToLocation();
            const sourceSelect = document.getElementById('merge-source-location');
            const targetSelect = document.getElementById('merge-target-location');
            if (!sourceSelect || !targetSelect) return;

            sourceSelect.innerHTML = '';
            targetSelect.innerHTML = '';
            locations.forEach(loc => {
                const sourceOption = document.createElement('option');
                sourceOption.value = loc.id;
                sourceOption.textContent = loc.name;
                sourceSelect.appendChild(sourceOption);

                const targetOption = document.createElement('option');
                targetOption.value = loc.id;
                targetOption.textContent = loc.name;
                if (loc.id === appState.activeLocationId) targetOption.selected = true;
                targetSelect.appendChild(targetOption);
            });
            const sourceCandidate = locations.find(loc => loc.id !== appState.activeLocationId);
            if (sourceCandidate) sourceSelect.value = sourceCandidate.id;
            updateMergeLocationPreview();
            showModalEl('merge-locations-modal');
        }

        function closeMergeLocationsModal() {
            hideModalEl('merge-locations-modal');
        }

        function getLocationMergePreview() {
            const sourceId = document.getElementById('merge-source-location')?.value;
            const targetId = document.getElementById('merge-target-location')?.value;
            const source = appState.locations?.[sourceId];
            const target = appState.locations?.[targetId];
            if (!source || !target || sourceId === targetId) {
                return { valid: false, added: 0, conflicts: 0, duplicateIds: 0, npAdded: 0, npConflicts: 0 };
            }

            const overwrite = document.querySelector('input[name="location-merge-mode"]:checked')?.value === 'overwrite';
            const newLayer = document.querySelector('input[name="location-merge-mode"]:checked')?.value === 'new_layer';
            const mappingPattern = document.getElementById('merge-position-pattern')?.value || 'target';
            const sourcePositions = generatePositionsList(source.stackPattern || '3-2-1').positions;
            const targetPositions = generatePositionsList(target.stackPattern || '3-2-1').positions;
            const getMappedTargetPosition = (sourcePos, index) =>
                mappingPattern === 'source'
                    ? (targetPositions.find(pos => pos.id === sourcePos.id) || targetPositions[index])
                    : targetPositions[index];
            let added = 0;
            let conflicts = 0;

            sourcePositions.forEach((sourcePos, index) => {
                const targetPos = getMappedTargetPosition(sourcePos, index);
                if (!targetPos) return;
                for (let layer = 1; layer <= (source.totalLayers || 1); layer++) {
                    const sourceItem = (source.coils || {})[`${sourcePos.id}_${layer}`];
                    if (!CoilField.hasSlotData(sourceItem)) continue;
                    const targetLayer = newLayer ? (target.totalLayers || 1) + layer : layer;
                    const targetItem = (target.coils || {})[`${targetPos.id}_${targetLayer}`];
                    if (CoilField.isNoCoil(sourceItem) && CoilField.hasSlotData(targetItem)) continue;
                    if (CoilField.hasCoil(targetItem)) conflicts++;
                    else added++;
                }
            });

            const targetIds = new Set();
            Object.values(target.coils || {}).forEach(item => {
                if (CoilField.hasCoil(item)) targetIds.add(coilMergeKey(item));
            });
            (target.nonPyramidCoils || []).forEach(item => {
                if (CoilField.hasCoil(item)) targetIds.add(coilMergeKey(item));
            });
            let duplicateIds = 0;
            let npAdded = 0;
            let npConflicts = 0;
            (source.nonPyramidCoils || []).forEach(item => {
                if (!CoilField.hasCoil(item)) return;
                const key = coilMergeKey(item);
                if (targetIds.has(key)) {
                    duplicateIds++;
                    npConflicts++;
                } else {
                    npAdded++;
                }
            });

            return { valid: true, overwrite, newLayer, mappingPattern, added, conflicts, duplicateIds, npAdded, npConflicts };
        }

        function updateMergeLocationPreview() {
            const preview = document.getElementById('merge-location-preview');
            const confirmButton = document.getElementById('merge-locations-confirm');
            const sourceId = document.getElementById('merge-source-location')?.value;
            const targetId = document.getElementById('merge-target-location')?.value;
            const source = appState.locations?.[sourceId];
            const target = appState.locations?.[targetId];
            const result = getLocationMergePreview();

            if (!preview || !confirmButton) return;
            if (!source || !target || sourceId === targetId) {
                preview.innerHTML = '<strong class="text-red-700">Pilih dua lokasi yang berbeda.</strong>';
                confirmButton.disabled = true;
                confirmButton.classList.add('opacity-50', 'cursor-not-allowed');
                return;
            }

            confirmButton.disabled = false;
            confirmButton.classList.remove('opacity-50', 'cursor-not-allowed');
            const newLayerOptions = document.getElementById('merge-new-layer-options');
            if (newLayerOptions) newLayerOptions.classList.toggle('hidden', !result.newLayer);
            const patternWarning = source.stackPattern !== target.stackPattern
                ? '<strong class="text-amber-700 mt-1">Pola susunan berbeda. Posisi dipetakan berdasarkan urutan slot.</strong>'
                : '';
            const layerDescription = result.newLayer
                ? `<span>Layer sumber akan ditempatkan pada layer ${target.totalLayers + 1} sampai ${target.totalLayers + (source.totalLayers || 1)}</span>`
                : '';
            preview.innerHTML = `
                <div class="flex flex-col gap-1">
                    <strong>${escapeHTML(source.name)} → ${escapeHTML(target.name)}</strong>
                    ${layerDescription}
                    <span>Slot piramid baru: ${result.added}</span>
                    <span>Slot piramid konflik: ${result.conflicts}</span>
                    <span>Koil non-piramid baru: ${result.npAdded}</span>
                    <span>Nomor coil duplikat: ${result.duplicateIds}</span>
                    ${patternWarning}
                    ${result.conflicts || result.duplicateIds ? '<strong class="text-amber-700 mt-1">Konflik memerlukan pilihan timpa atau pengisian kosong.</strong>' : ''}
                </div>
            `;
        }

        function executeLocationMerge() {
            const result = getLocationMergePreview();
            if (!result.valid) {
                showToast('Pilih dua lokasi yang berbeda.', 'error');
                return;
            }

            const sourceId = document.getElementById('merge-source-location').value;
            const targetId = document.getElementById('merge-target-location').value;
            const source = appState.locations[sourceId];
            const target = appState.locations[targetId];
            const overwrite = result.overwrite;

            showConfirmModal(
                'Gabungkan Lokasi?',
                `${result.newLayer ? 'Data sumber akan dibuat sebagai layer baru.' : (overwrite ? 'Slot konflik dan nomor coil duplikat akan ditimpa oleh data sumber.' : 'Hanya slot kosong yang akan diisi; data tujuan dipertahankan.')} Lokasi sumber ${document.getElementById('merge-delete-source')?.checked ? 'akan dihapus' : 'akan tetap disimpan'}.`,
                () => {
                    const sourcePositions = generatePositionsList(source.stackPattern || '3-2-1').positions;
                    const targetPositions = generatePositionsList(target.stackPattern || '3-2-1').positions;
                    const getMappedTargetPosition = (sourcePos, index) =>
                        result.mappingPattern === 'source'
                            ? (targetPositions.find(pos => pos.id === sourcePos.id) || targetPositions[index])
                            : targetPositions[index];
                    let added = 0;
                    let replaced = 0;

                    if (!target.coils) target.coils = {};
                    const targetLayerCountBeforeMerge = target.totalLayers || 1;
                    target.totalLayers = result.newLayer
                        ? targetLayerCountBeforeMerge + (source.totalLayers || 1)
                        : Math.max(targetLayerCountBeforeMerge, source.totalLayers || 1);

                    let hardDuplicateCount = 0;
                    sourcePositions.forEach((sourcePos, index) => {
                        const targetPos = getMappedTargetPosition(sourcePos, index);
                        if (!targetPos) return;
                        for (let layer = 1; layer <= (source.totalLayers || 1); layer++) {
                            const sourceItem = (source.coils || {})[`${sourcePos.id}_${layer}`];
                            if (!CoilField.hasSlotData(sourceItem)) continue;
                            const targetLayer = result.newLayer ? targetLayerCountBeforeMerge + layer : layer;
                            const key = `${targetPos.id}_${targetLayer}`;
                            if (CoilField.isNoCoil(sourceItem)) {
                                if (!CoilField.hasSlotData(target.coils[key])) {
                                    target.coils[key] = { ...sourceItem };
                                    added++;
                                }
                                continue;
                            }
                            const duplicate = isNoLabelRecord(sourceItem) ? null : findDuplicateCoil(sourceItem.id, {
                                heatNumber: sourceItem.heatNumber,
                                locationId: sourceId,
                                pyramidKey: `${sourcePos.id}_${layer}`
                            });
                            if (duplicate?.sameCoilHeat) {
                                hardDuplicateCount++;
                                continue;
                            }
                            if (CoilField.hasCoil(target.coils[key]) && !overwrite && !result.newLayer) continue;
                            if (CoilField.hasCoil(target.coils[key])) replaced++;
                            else added++;
                            target.coils[key] = { ...sourceItem };
                            if (isNoLabelRecord(sourceItem)) delete source.coils[`${sourcePos.id}_${layer}`];
                        }
                    });

                    if (!Array.isArray(target.nonPyramidCoils)) target.nonPyramidCoils = [];
                    let npAdded = 0;
                    let npReplaced = 0;
                    const movedWithoutLabel = new Set();
                    (source.nonPyramidCoils || []).forEach(sourceItem => {
                        if (!CoilField.hasCoil(sourceItem)) return;
                        const sourceKey = coilMergeKey(sourceItem);
                        const duplicate = isNoLabelRecord(sourceItem) ? null : findDuplicateCoil(sourceItem.id, {
                            heatNumber: sourceItem.heatNumber,
                            locationId: sourceId,
                            nonPyramidIndex: source.nonPyramidCoils.indexOf(sourceItem)
                        });
                        if (duplicate?.sameCoilHeat) {
                            hardDuplicateCount++;
                            return;
                        }
                        const duplicateIndex = target.nonPyramidCoils.findIndex(item =>
                            CoilField.hasCoil(item) && coilMergeKey(item) === sourceKey
                        );
                        if (duplicateIndex >= 0) {
                            if (overwrite) {
                                target.nonPyramidCoils[duplicateIndex] = { ...sourceItem };
                                if (isNoLabelRecord(sourceItem)) movedWithoutLabel.add(sourceItem);
                                npReplaced++;
                            }
                        } else {
                            target.nonPyramidCoils.push({ ...sourceItem });
                            if (isNoLabelRecord(sourceItem)) movedWithoutLabel.add(sourceItem);
                            npAdded++;
                        }
                    });

                    const deleteSource = document.getElementById('merge-delete-source')?.checked;
                    if (deleteSource) delete appState.locations[sourceId];
                    else if (movedWithoutLabel.size) source.nonPyramidCoils = source.nonPyramidCoils.filter(item => !movedWithoutLabel.has(item));

                    appState.activeLocationId = targetId;
                    loadLocationIntoActiveState(targetId);
                    saveState();
                    closeMergeLocationsModal();
                    renderAll();
                    showToast(`Gabungan selesai: ${added} slot/koil baru, ${replaced + npReplaced} ditimpa, ${npAdded} koil non-piramid ditambahkan${hardDuplicateCount ? `, ${hardDuplicateCount} duplikasi coil+heat ditolak` : ''}.`);
                }
            );
        }

        // ==========================================
        // POLA SUSUNAN PIRAMID & LAYER CONTROLS
        // ==========================================
        function syncPatternDropdownUI() {
            const sel = document.getElementById('stack-pattern-select');
            const badge = document.getElementById('header-pattern-badge');
            const overviewLabel = document.getElementById('overview-pattern-label');
            const pattern = appState.stackPattern || '3-2-1';

            if (badge) badge.textContent = pattern.replace(/-/g, '');
            if (overviewLabel) overviewLabel.textContent = pattern;
            if (!sel) return;

            const presetValues = ['3-2-1', '4-3-2-1', '5-4-3-2-1', '2-1'];
            // Hapus opsi custom dinamis lama jika ada
            Array.from(sel.options).forEach(opt => {
                if (opt.dataset.customOption === 'true') opt.remove();
            });

            if (presetValues.includes(pattern)) {
                sel.value = pattern;
            } else {
                const customOpt = document.createElement('option');
                customOpt.value = pattern;
                customOpt.textContent = `${pattern} (${POSITIONS.length} Coil)`;
                customOpt.dataset.customOption = 'true';
                sel.insertBefore(customOpt, sel.querySelector('option[value="CUSTOM"]'));
                sel.value = pattern;
            }
        }

        function onStackPatternChange(val) {
            if (val === 'CUSTOM') {
                document.getElementById('custom-pattern-input').value = appState.stackPattern || '3-2-1';
                showModalEl('custom-pattern-modal');
                syncPatternDropdownUI();
                return;
            }
            requestPatternChange(val);
        }

        function closeCustomPatternModal() {
            hideModalEl('custom-pattern-modal');
        }

        function applyCustomPattern() {
            const raw = document.getElementById('custom-pattern-input').value.trim();
            const parts = raw.split('-').map(n => parseInt(n.trim(), 10)).filter(n => !isNaN(n) && n > 0 && n <= 200);
            if (parts.length === 0) {
                showToast('Format pola tidak valid! Gunakan angka dipisah strip, misal: 4-3-2-1', 'error');
                return;
            }
            closeCustomPatternModal();
            requestPatternChange(parts.join('-'));
        }

        function requestPatternChange(patternStr) {
            const normalized = generatePositionsList(patternStr).normalizedPattern;
            if (normalized === (appState.stackPattern || '3-2-1')) {
                syncPatternDropdownUI();
                return;
            }
            const filledPyramid = Object.values(appState.coils || {}).filter(CoilField.hasSlotData).length;
            if (filledPyramid === 0) {
                applyPatternString(normalized);
                return;
            }
            showConfirmModal(
                'Ubah Susunan Piramid?',
                `Susunan akan diubah menjadi ${normalized}. Data pada posisi yang tidak tersedia di susunan baru tetap tersimpan, tetapi tidak akan tampil sampai susunan lama dipilih kembali. Saat ini ada ${filledPyramid} slot tercatat.`,
                () => applyPatternString(normalized),
                () => syncPatternDropdownUI()
            );
        }

        function applyPatternString(patternStr) {
            const normalized = buildPositionsFromPattern(patternStr);
            appState.stackPattern = normalized;
            if (!POSITIONS.some(p => p.id === appState.activePosition)) {
                appState.activePosition = POSITIONS[0].id;
            }
            saveState();
            renderAll();
            showToast(`Susunan diubah ke ${normalized} (${POSITIONS.length} coil/layer)`);
        }

        function changeLayerCount(delta) {
            const current = appState.totalLayers || 5;
            const next = Math.min(Math.max(current + delta, 1), 50);
            if (next === current) return;

            const doChange = () => {
                appState.totalLayers = next;
                if (appState.selectedLayer > next) appState.selectedLayer = next;
                saveState();
                renderAll();
            };

            if (delta < 0) {
                let filled = 0;
                for (let l = next + 1; l <= current; l++) {
                    POSITIONS.forEach(pos => {
                        const item = appState.coils[`${pos.id}_${l}`];
                        if (CoilField.hasSlotData(item)) filled++;
                    });
                }
                if (filled > 0) {
                    showConfirmModal(
                        'Kurangi Total Layer?',
                        `Layer ${next + 1} sampai ${current} berisi ${filled} slot tercatat. Data tidak dihapus, tetapi tidak akan tampil sampai total layer dinaikkan kembali.`,
                        doChange
                    );
                    return;
                }
            }
            doChange();
        }

        function toggleCrawlDirection() {
            appState.crawlDirection = appState.crawlDirection === 'asc' ? 'desc' : 'asc';
            saveState();
            appState.selectedLayer = getFirstEmptyLayerForPosition(appState.activePosition);
            renderAll();
        }

        // ==========================================
        // NAVIGASI TAB & POSISI PIRAMID
        // ==========================================
        function switchMode(mode) {
            currentMode = mode;
            const views = {
                crawl: document.getElementById('view-crawl'),
                nonpyramid: document.getElementById('view-nonpyramid'),
                layer: document.getElementById('view-layer'),
                production: document.getElementById('view-production'),
                field: document.getElementById('view-field')
            };
            const tabs = {
                crawl: document.getElementById('tab-crawl'),
                nonpyramid: document.getElementById('tab-nonpyramid'),
                layer: document.getElementById('tab-layer'),
                production: document.getElementById('tab-production'),
                field: document.getElementById('tab-field')
            };

            Object.keys(views).forEach(k => {
                if (!views[k]) return;
                if (k === mode) {
                    views[k].classList.remove('hidden');
                    views[k].classList.add('flex');
                } else {
                    views[k].classList.add('hidden');
                    views[k].classList.remove('flex');
                }
            });

            Object.keys(tabs).forEach(k => {
                if (!tabs[k]) return;
                tabs[k].setAttribute('aria-selected', k === mode ? 'true' : 'false');
                if (k === mode) {
                    tabs[k].className = 'min-h-11 py-2 px-2 sm:px-3 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 transition bg-white text-slate-900 shadow-sm';
                } else {
                    tabs[k].className = 'min-h-11 py-2 px-2 sm:px-3 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 transition text-slate-600 hover:text-slate-900';
                }
            });

            if (mode === 'layer') {
                renderLayerOverview();
            } else if (mode === 'nonpyramid') {
                renderNonPyramidList();
                prepareNonPyramidFormDefaults();
            } else if (mode === 'production') {
                renderProductionUsageList();
            } else if (mode === 'field') {
                renderFieldWorkflows();
            } else {
                renderCrawlView();
            }
        }

        function getFirstEmptyLayerForPosition(posId) {
            if (appState.crawlDirection === 'desc') {
                for (let l = appState.totalLayers; l >= 1; l--) {
                    const item = appState.coils[`${posId}_${l}`];
                    if (!CoilField.hasSlotData(item)) return l;
                }
                return appState.totalLayers;
            } else {
                for (let l = 1; l <= appState.totalLayers; l++) {
                    const item = appState.coils[`${posId}_${l}`];
                    if (!CoilField.hasSlotData(item)) return l;
                }
                return appState.totalLayers;
            }
        }

        function selectPosition(posId) {
            appState.activePosition = posId;
            appState.selectedLayer = getFirstEmptyLayerForPosition(posId);
            saveState();
            renderCrawlView();
            focusQuickSlotInput();
        }

        function openSlotMap() {
            showModalEl('slot-map-modal');
            renderSlotMap();
            document.getElementById('slot-map-search')?.focus();
        }

        function openCoilSearch() {
            const scope = document.getElementById('coil-search-scope');
            if (scope) scope.value = 'current';
            showModalEl('coil-search-modal');
            renderCoilSearch();
            document.getElementById('coil-search-input')?.focus();
        }

        function closeCoilSearch() {
            hideModalEl('coil-search-modal');
        }

        function openCoilSummary() {
            showModalEl('coil-summary-modal');
            renderCoilSummary();
        }

        function closeCoilSummary() {
            hideModalEl('coil-summary-modal');
        }

        function openCoilHistory() {
            showModalEl('coil-history-modal');
            renderCoilHistory();
            document.getElementById('coil-history-search')?.focus();
        }

        function closeCoilHistory() {
            hideModalEl('coil-history-modal');
        }

        function renderCoilHistory() {
            const container = document.getElementById('coil-history-results');
            const countEl = document.getElementById('coil-history-count');
            if (!container) return;
            const query = normalizeDuplicateValue(document.getElementById('coil-history-search')?.value);
            const statusFilter = document.getElementById('coil-history-status')?.value || 'ALL';
            const records = (Array.isArray(appState.coilHistory) ? appState.coilHistory : []).filter(record => {
                if (statusFilter !== 'ALL' && normalizeCoilStatus(record.status) !== statusFilter) return false;
                if (!query) return true;
                return [coilDisplayId(record), record.nomor, record.heatNumber, record.supplier, record.grade, record.locName, record.position]
                    .some(value => normalizeDuplicateValue(value).includes(query));
            });
            if (countEl) countEl.textContent = `${records.length} data riwayat coil`;
            if (records.length === 0) {
                container.innerHTML = '<div class="p-6 text-center text-xs text-slate-400 italic bg-slate-50 rounded-xl border border-dashed border-slate-200">Belum ada riwayat coil.</div>';
                return;
            }
            container.innerHTML = records.map(record => {
                const status = normalizeCoilStatus(record.status);
                const location = record.type === 'pyramid'
                    ? `${record.position || '-'} • Layer ${record.layer || '-'}`
                    : `Non-Piramid • No. Urut ${record.nomorUrut || record.nomor || '-'}`;
                return `
                    <div class="p-3 rounded-xl border border-slate-200 bg-slate-50/70">
                        <div class="flex flex-wrap items-center gap-1.5">
                            <span class="text-sm font-mono font-extrabold text-slate-900">${escapeHTML(coilDisplayId(record))}</span>
                            <span class="text-[10px] font-bold px-1.5 py-0.5 rounded ${status === 'HILANG' ? 'bg-red-100 text-red-700' : 'bg-rose-100 text-rose-700'}">${escapeHTML(getCoilStatusLabel(status))}</span>
                        </div>
                        <p class="text-[11px] text-slate-600 mt-1">${escapeHTML(record.locName || '-')} • ${escapeHTML(location)}</p>
                        <p class="text-[11px] text-slate-500 mt-0.5">Heat ${escapeHTML(record.heatNumber || '-')} • ${escapeHTML(record.weight || '-')} ${escapeHTML(record.weightUnit || 'kg')} • ${escapeHTML(record.supplier || '-')}</p>
                        <p class="text-[10px] text-slate-400 mt-1">Keluar: ${escapeHTML(record.exitedAt || record.updatedAt || '-')} • Tim/Shift: ${escapeHTML(record.picName || '-')} / ${escapeHTML(record.shift || '-')}</p>
                    </div>`;
            }).join('');
        }

        function getCoilSearchRecords() {
            syncActiveStateToLocation();
            const scope = document.getElementById('coil-search-scope')?.value || 'current';
            const locations = scope === 'all'
                ? Object.values(appState.locations || {})
                : [appState.locations[appState.activeLocationId]].filter(Boolean);
            const records = [];

            locations.forEach(loc => {
                const positions = generatePositionsList(loc.stackPattern || '3-2-1').positions;
                positions.forEach(pos => {
                    for (let layer = 1; layer <= (loc.totalLayers || 1); layer++) {
                        const item = (loc.coils || {})[`${pos.id}_${layer}`];
                        if (!CoilField.hasCoil(item)) continue;
                        records.push({
                            locId: loc.id,
                            locName: loc.name,
                            type: 'pyramid',
                            posId: pos.id,
                            position: pos.shortLabel,
                            layer,
                            ...item
                        });
                    }
                });
                (loc.nonPyramidCoils || []).forEach((item, index) => {
                    if (!CoilField.hasCoil(item)) return;
                    records.push({
                        locId: loc.id,
                        locName: loc.name,
                        type: 'nonpyramid',
                        index,
                        position: 'Samping',
                        layer: null,
                        ...item
                    });
                });
            });
            return records;
        }

        function renderCoilSearch() {
            const input = document.getElementById('coil-search-input');
            const countEl = document.getElementById('coil-search-count');
            const container = document.getElementById('coil-search-results');
            if (!container) return;
            const query = (input?.value || '').trim().toLowerCase();
            container.innerHTML = '';

            if (!query) {
                if (countEl) countEl.textContent = 'Masukkan kata kunci pencarian';
                container.innerHTML = '<div class="p-6 text-center text-xs text-slate-400 italic">Cari nomor coil, grade, supplier, posisi, atau atribut lainnya.</div>';
                return;
            }

            const records = getCoilSearchRecords().filter(record => [
                record.nomor, coilDisplayId(record), record.diameter, record.grade,
                record.heatNumber, record.weight, record.weightUnit,
                record.supplier, record.picName, record.shift,
                record.locName, record.position, record.type === 'pyramid' ? `Layer ${record.layer}` : 'Non-Piramid'
            ].some(value => String(value || '').toLowerCase().includes(query)));

            if (countEl) countEl.textContent = `${records.length} data coil ditemukan`;
            if (records.length === 0) {
                container.innerHTML = '<div class="p-6 text-center text-xs text-slate-400 italic">Tidak ada data coil yang cocok.</div>';
                return;
            }

            records.forEach(record => {
                const card = document.createElement('button');
                card.type = 'button';
                card.className = 'w-full text-left bg-slate-50 hover:bg-sky-50 border border-slate-200 hover:border-sky-300 rounded-xl p-3 transition';
                card.onclick = () => openCoilSearchResult(record);
                card.innerHTML = `
                    <div class="flex items-start justify-between gap-3">
                        <div class="min-w-0">
                            <div class="flex flex-wrap items-center gap-1.5">
                                <span class="font-mono font-extrabold text-slate-900">${escapeHTML(coilDisplayId(record))}</span>
                                <span class="text-[10px] px-1.5 py-0.5 rounded-full ${record.type === 'pyramid' ? 'bg-amber-100 text-amber-800' : 'bg-sky-100 text-sky-800'}">${record.type === 'pyramid' ? 'Piramid' : 'Non-Piramid'}</span>
                                <span class="text-[10px] px-1.5 py-0.5 rounded-full ${normalizeCoilStatus(record.status) === 'AKTIF' ? 'bg-emerald-100 text-emerald-700' : normalizeCoilStatus(record.status) === 'HILANG' ? 'bg-red-100 text-red-700' : 'bg-slate-200 text-slate-700'}">${getCoilStatusLabel(record.status)}</span>
                            </div>
                            <div class="text-[11px] text-slate-600 mt-1">${escapeHTML(record.locName)} • ${escapeHTML(record.position)}${record.layer ? ` • Layer ${record.layer}` : ''}</div>
                        </div>
                        <i class="fa-solid fa-chevron-right text-slate-400 mt-1"></i>
                    </div>
                    <div class="grid grid-cols-2 sm:grid-cols-4 gap-1.5 mt-2 text-[11px] text-slate-600">
                        <span>No: ${escapeHTML(record.nomor || '-')}</span>
                        <span>Ø ${escapeHTML(record.diameter || '-')}</span>
                        <span>Grade: ${escapeHTML(record.grade || '-')}</span>
                        <span>Heat: ${escapeHTML(record.heatNumber || '-')}</span>
                        <span>Berat: ${record.weight ? `${escapeHTML(record.weight)} ${escapeHTML(record.weightUnit || 'kg')}` : '-'}</span>
                        <span>Supplier: ${escapeHTML(record.supplier || '-')}</span>
                        <span>PIC: ${escapeHTML(record.picName || '-')}</span>
                        <span>Shift: ${escapeHTML(record.shift || '-')}</span>
                    </div>
                `;
                container.appendChild(card);
            });
        }

        function openCoilSearchResult(record) {
            closeCoilSearch();
            if (record.locId !== appState.activeLocationId) {
                switchLocation(record.locId);
            }
            if (record.type === 'pyramid') {
                appState.activePosition = record.posId;
                appState.selectedLayer = record.layer;
                saveState();
                switchMode('crawl');
                renderAll();
                document.getElementById('quick-input-form')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            } else {
                switchMode('nonpyramid');
                editNonPyramidItem(record.index);
                document.getElementById('view-nonpyramid')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }

        function renderCoilSummary() {
            syncActiveStateToLocation();
            const container = document.getElementById('coil-summary-content');
            if (!container) return;
            container.innerHTML = '';

            let totalPyramid = 0;
            let totalNonPyramid = 0;
            let totalWeightKg = 0;
            const locationCards = [];

            Object.values(appState.locations || {}).forEach(loc => {
                let pyramid = 0;
                let nonPyramid = (loc.nonPyramidCoils || []).filter(item => CoilField.hasCoil(item) && isCoilActive(item)).length;
                let weightKg = 0;
                Object.values(loc.coils || {}).forEach(item => {
                    if (!CoilField.hasCoil(item)) return;
                    if (!isCoilActive(item)) return;
                    pyramid++;
                    const weight = parseFloat(String(item.weight || '').replace(',', '.'));
                    if (!isNaN(weight)) {
                        weightKg += (item.weightUnit || 'kg') === 'mt' ? weight * 1000 : weight;
                    }
                });
                (loc.nonPyramidCoils || []).forEach(item => {
                    if (!CoilField.hasCoil(item)) return;
                    if (!isCoilActive(item)) return;
                    const weight = parseFloat(String(item.weight || '').replace(',', '.'));
                    if (!isNaN(weight)) {
                        weightKg += (item.weightUnit || 'kg') === 'mt' ? weight * 1000 : weight;
                    }
                });
                totalPyramid += pyramid;
                totalNonPyramid += nonPyramid;
                totalWeightKg += weightKg;
                locationCards.push({ loc, pyramid, nonPyramid, weightKg });
            });

            const total = totalPyramid + totalNonPyramid;
            const formatWeight = value => value >= 1000
                ? `${(value / 1000).toLocaleString('id-ID', { maximumFractionDigits: 3 })} mt`
                : `${value.toLocaleString('id-ID', { maximumFractionDigits: 3 })} kg`;

            container.innerHTML = `
                <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <div class="bg-slate-900 rounded-xl p-3 text-white"><div class="text-[10px] text-slate-400 font-bold uppercase">Total Coil</div><div class="text-2xl font-mono font-extrabold text-amber-400">${total}</div></div>
                    <div class="bg-emerald-50 border border-emerald-200 rounded-xl p-3"><div class="text-[10px] text-emerald-700 font-bold uppercase">Piramid</div><div class="text-2xl font-mono font-extrabold text-emerald-700">${totalPyramid}</div></div>
                    <div class="bg-sky-50 border border-sky-200 rounded-xl p-3"><div class="text-[10px] text-sky-700 font-bold uppercase">Non-Piramid</div><div class="text-2xl font-mono font-extrabold text-sky-700">${totalNonPyramid}</div></div>
                    <div class="bg-amber-50 border border-amber-200 rounded-xl p-3"><div class="text-[10px] text-amber-700 font-bold uppercase">Total Berat</div><div class="text-lg font-mono font-extrabold text-amber-700">${escapeHTML(formatWeight(totalWeightKg))}</div></div>
                </div>
                <div>
                    <h4 class="text-xs font-bold text-slate-700 mb-2">Ringkasan per Lokasi</h4>
                    <div class="flex flex-col gap-2">
                        ${locationCards.map(({ loc, pyramid, nonPyramid, weightKg }) => `
                            <button type="button" onclick="switchLocation('${escapeHTML(loc.id)}'); closeCoilSummary();" class="w-full text-left bg-slate-50 hover:bg-amber-50 border border-slate-200 hover:border-amber-300 rounded-xl p-3 transition">
                                <div class="flex items-center justify-between gap-3">
                                    <span class="font-bold text-slate-900">${escapeHTML(loc.name)}</span>
                                    <span class="text-xs font-mono font-bold text-slate-600">${pyramid + nonPyramid} coil</span>
                                </div>
                                <div class="grid grid-cols-3 gap-2 mt-2 text-[11px] text-slate-600">
                                    <span>Piramid: <b>${pyramid}</b></span>
                                    <span>Non-Piramid: <b>${nonPyramid}</b></span>
                                    <span>Berat: <b>${escapeHTML(formatWeight(weightKg))}</b></span>
                                </div>
                            </button>
                        `).join('')}
                    </div>
                </div>
            `;
        }

        function closeSlotMap() {
            hideModalEl('slot-map-modal');
        }

        let positionFullscreenZoom = 1;
        let positionFullscreenPinchInitialized = false;

        async function openPositionFullscreen() {
            const modal = document.getElementById('position-fullscreen-modal');
            if (!modal) return;
            showModalEl(modal.id);
            setPositionFullscreenZoom(1);
            renderPositionFullscreen();
            if (modal.requestFullscreen) {
                try {
                    await modal.requestFullscreen();
                } catch (_) {
                    // Modal remains usable even if browser fullscreen permission is unavailable.
                }
            }
            if (screen.orientation && typeof screen.orientation.lock === 'function') {
                try {
                    await screen.orientation.lock('landscape');
                } catch (_) {
                    // Portrait phones can remain in portrait; the layout stays scrollable.
                }
            }
        }

        async function closePositionFullscreen() {
            hideModalEl('position-fullscreen-modal');
            if (screen.orientation && typeof screen.orientation.unlock === 'function') {
                try {
                    screen.orientation.unlock();
                } catch (_) {}
            }
            if (document.fullscreenElement) {
                try {
                    await document.exitFullscreen();
                } catch (_) {}
            }
        }

        function setPositionFullscreenZoom(nextZoom) {
            positionFullscreenZoom = Math.min(2.5, Math.max(0.5, nextZoom));
            const grid = document.getElementById('position-fullscreen-grid');
            if (grid) grid.style.zoom = String(positionFullscreenZoom);
            const resetBtn = document.getElementById('position-fullscreen-zoom-reset');
            if (resetBtn) resetBtn.textContent = `${Math.round(positionFullscreenZoom * 100)}%`;
        }

        function setupPositionFullscreenPinch() {
            if (positionFullscreenPinchInitialized) return;
            const grid = document.getElementById('position-fullscreen-grid');
            if (!grid) return;
            positionFullscreenPinchInitialized = true;
            const pointers = new Map();
            let startDistance = 0;
            let startZoom = 1;

            const getDistance = () => {
                const points = Array.from(pointers.values());
                if (points.length < 2) return 0;
                return Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
            };

            grid.addEventListener('pointerdown', event => {
                if (event.pointerType !== 'touch') return;
                pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
                if (pointers.size === 2) {
                    startDistance = getDistance();
                    startZoom = positionFullscreenZoom;
                }
            });
            grid.addEventListener('pointermove', event => {
                if (!pointers.has(event.pointerId)) return;
                pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
                if (pointers.size === 2 && startDistance > 0) {
                    event.preventDefault();
                    setPositionFullscreenZoom(startZoom * (getDistance() / startDistance));
                }
            }, { passive: false });
            const clearPointer = event => pointers.delete(event.pointerId);
            grid.addEventListener('pointerup', clearPointer);
            grid.addEventListener('pointercancel', clearPointer);
        }

        function renderPositionFullscreen() {
            const grid = document.getElementById('position-fullscreen-grid');
            if (!grid) return;
            grid.innerHTML = '';
            setupPositionFullscreenPinch();

            const summary = document.getElementById('position-fullscreen-summary');
            const posObj = POSITIONS.find(p => p.id === appState.activePosition) || POSITIONS[0];
            if (summary) summary.textContent = `Aktif: #${posObj.seq} • ${posObj.label} • Layer ${appState.selectedLayer}/${appState.totalLayers}`;

            const select = document.getElementById('position-fullscreen-select');
            if (select) {
                select.innerHTML = '';
                POSITIONS.forEach(pos => {
                    const opt = document.createElement('option');
                    opt.value = pos.id;
                    opt.textContent = `#${pos.seq} ${pos.shortLabel}`;
                    opt.selected = pos.id === posObj.id;
                    select.appendChild(opt);
                });
            }

            const content = document.createElement('div');
            content.className = 'flex flex-col items-center justify-center gap-3 sm:gap-4 min-h-full min-w-max mx-auto';
            const rowsMap = new Map();
            POSITIONS.forEach(pos => {
                if (!rowsMap.has(pos.visualRowFromTop)) rowsMap.set(pos.visualRowFromTop, []);
                rowsMap.get(pos.visualRowFromTop).push(pos);
            });

            const isLargeArrangement = POSITIONS.length > 24;
            const nodeSize = isLargeArrangement ? 'w-16 h-16 sm:w-20 sm:h-20' : 'w-24 h-24 sm:w-28 sm:h-28';
            Array.from(rowsMap.keys()).sort((a, b) => a - b).forEach(rowKey => {
                const row = document.createElement('div');
                row.className = 'flex items-center justify-center gap-2 sm:gap-3';
                rowsMap.get(rowKey).forEach(pos => {
                    let filledCount = 0;
                    for (let layer = 1; layer <= appState.totalLayers; layer++) {
                        if (CoilField.hasSlotData(appState.coils[`${pos.id}_${layer}`])) filledCount++;
                    }
                    const isActive = pos.id === appState.activePosition;
                    const button = document.createElement('button');
                    button.type = 'button';
                    button.onclick = () => {
                        selectPosition(pos.id);
                        renderPositionFullscreen();
                    };
                    button.className = `${nodeSize} shrink-0 rounded-full border-2 flex flex-col items-center justify-center p-1.5 transition shadow-sm ${
                        isActive
                            ? 'bg-amber-400 border-amber-200 text-slate-950 ring-4 ring-amber-300/30'
                            : filledCount >= appState.totalLayers
                                ? 'bg-emerald-500 border-emerald-300 text-white'
                                : filledCount > 0
                                    ? 'bg-amber-100 border-amber-400 text-slate-900'
                                    : 'bg-slate-700 border-slate-500 text-slate-200 hover:border-amber-400'
                    }`;
                    button.innerHTML = `
                        <span class="text-[10px] sm:text-xs font-mono font-extrabold opacity-75">#${pos.seq}</span>
                        <span class="text-[10px] sm:text-xs font-extrabold leading-tight text-center line-clamp-2">${escapeHTML(pos.shortLabel)}</span>
                        <span class="text-[9px] sm:text-[10px] font-mono font-bold mt-0.5">${filledCount}/${appState.totalLayers}</span>
                    `;
                    row.appendChild(button);
                });
                content.appendChild(row);
            });
            grid.appendChild(content);
        }

        function selectSlotFromMap(posId, layerNum) {
            appState.activePosition = posId;
            appState.selectedLayer = layerNum;
            saveState();
            closeSlotMap();
            switchMode('crawl');
            renderAll();
            focusQuickSlotInput();
        }

        function renderSlotMap() {
            const container = document.getElementById('slot-map-container');
            if (!container) return;
            container.innerHTML = '';

            const search = (document.getElementById('slot-map-search')?.value || '').trim().toLowerCase();
            const status = document.getElementById('slot-map-status')?.value || 'all';
            const table = document.createElement('table');
            table.className = 'border-separate border-spacing-1 min-w-full';

            const thead = document.createElement('thead');
            const headerRow = document.createElement('tr');
            const corner = document.createElement('th');
            corner.className = 'sticky left-0 z-20 bg-slate-100 border border-slate-200 rounded-lg px-2 py-2 text-left text-[10px] text-slate-600 min-w-[150px]';
            corner.textContent = 'Posisi';
            headerRow.appendChild(corner);

            for (let layer = 1; layer <= appState.totalLayers; layer++) {
                const th = document.createElement('th');
                th.className = 'sticky top-0 z-10 bg-slate-100 border border-slate-200 rounded-lg w-10 h-9 text-[10px] font-mono text-slate-600';
                th.textContent = `L${layer}`;
                headerRow.appendChild(th);
            }
            thead.appendChild(headerRow);
            table.appendChild(thead);

            const tbody = document.createElement('tbody');
            let visibleCount = 0;
            POSITIONS.forEach(pos => {
                const coilValues = [];
                for (let layer = 1; layer <= appState.totalLayers; layer++) {
                    const item = appState.coils[`${pos.id}_${layer}`];
                    if (!item) continue;
                    coilValues.push(
                        item.nomor, coilDisplayId(item), item.diameter, item.grade,
                        item.heatNumber, item.weight, item.supplier,
                        item.picName, item.shift
                    );
                }
                const searchable = [
                    `#${pos.seq}`, pos.label, pos.shortLabel,
                    ...coilValues
                ].join(' ').toLowerCase();
                if (search && !searchable.includes(search)) return;

                let matchesStatus = true;
                if (status === 'filled') {
                    matchesStatus = false;
                    for (let l = 1; l <= appState.totalLayers; l++) {
                        if (CoilField.hasCoil(appState.coils[`${pos.id}_${l}`])) matchesStatus = true;
                    }
                } else if (status === 'empty' || status === 'no-coil') {
                    matchesStatus = false;
                    for (let l = 1; l <= appState.totalLayers; l++) {
                        const item = appState.coils[`${pos.id}_${l}`];
                        if (status === 'no-coil' ? CoilField.isNoCoil(item) : !CoilField.hasSlotData(item)) matchesStatus = true;
                    }
                }
                if (!matchesStatus) return;
                visibleCount++;

                const row = document.createElement('tr');
                const posCell = document.createElement('th');
                posCell.className = 'sticky left-0 z-10 bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-left min-w-[150px]';
                posCell.innerHTML = `<span class="text-[10px] font-mono text-amber-700 mr-1">#${pos.seq}</span><span class="text-[11px] text-slate-800">${escapeHTML(pos.shortLabel)}</span>`;
                row.appendChild(posCell);

                for (let layer = 1; layer <= appState.totalLayers; layer++) {
                    const item = appState.coils[`${pos.id}_${layer}`];
                    const isActive = pos.id === appState.activePosition && layer === appState.selectedLayer;
                    const td = document.createElement('td');
                    td.className = 'p-0';
                    const button = document.createElement('button');
                    button.type = 'button';
                    const noCoil = CoilField.isNoCoil(item);
                    button.title = `${pos.label} - Layer ${layer}: ${CoilField.hasCoil(item) ? coilDisplayId(item) : noCoil ? 'Tidak ada Coil' : 'Belum diisi'}`;
                    button.setAttribute('aria-label', button.title);
                    button.className = `w-10 h-9 rounded-lg border text-[10px] font-mono font-bold transition ${
                        isActive
                            ? 'bg-amber-400 border-amber-600 text-slate-950 shadow-sm'
                            : CoilField.hasCoil(item)
                                ? 'bg-emerald-500 border-emerald-600 text-white'
                                : noCoil ? 'bg-sky-100 border-sky-400 text-sky-800' : 'bg-white border-slate-300 text-slate-400 hover:border-amber-400 hover:bg-amber-50'
                    }`;
                    button.textContent = CoilField.hasCoil(item) ? '✓' : noCoil ? '—' : '';
                    button.onclick = () => selectSlotFromMap(pos.id, layer);
                    td.appendChild(button);
                    row.appendChild(td);
                }
                tbody.appendChild(row);
            });

            table.appendChild(tbody);
            if (visibleCount === 0) {
                container.innerHTML = '<div class="p-6 text-center text-xs text-slate-400 italic">Tidak ada posisi yang sesuai filter.</div>';
                return;
            }
            container.appendChild(table);
        }

        function nextPosition() {
            const idx = POSITIONS.findIndex(p => p.id === appState.activePosition);
            const nextIdx = (idx + 1) % POSITIONS.length;
            selectPosition(POSITIONS[nextIdx].id);
        }

        // ==========================================
        // RENDER DIAGRAM PIRAMID & FORM CRAWL
        // ==========================================
        let pyramidZoom = 1;
        const PYRAMID_ZOOM_MIN = 0.5;
        const PYRAMID_ZOOM_MAX = 2.5;

        function setPyramidZoom(nextZoom) {
            pyramidZoom = Math.min(PYRAMID_ZOOM_MAX, Math.max(PYRAMID_ZOOM_MIN, nextZoom));
            const container = document.getElementById('dynamic-pyramid-grid');
            const content = document.getElementById('pyramid-zoom-content');
            if (container) container.style.zoom = String(pyramidZoom);
            const resetBtn = document.getElementById('pyramid-zoom-reset');
            if (resetBtn) resetBtn.textContent = `${Math.round(pyramidZoom * 100)}%`;
            if (content) content.style.minWidth = 'max-content';
        }

        function setupPyramidZoomControls() {
            const outBtn = document.getElementById('pyramid-zoom-out');
            const resetBtn = document.getElementById('pyramid-zoom-reset');
            const inBtn = document.getElementById('pyramid-zoom-in');
            if (outBtn) outBtn.onclick = () => setPyramidZoom(pyramidZoom - 0.25);
            if (resetBtn) resetBtn.onclick = () => setPyramidZoom(1);
            if (inBtn) inBtn.onclick = () => setPyramidZoom(pyramidZoom + 0.25);

            const container = document.getElementById('dynamic-pyramid-grid');
            if (!container || container.dataset.pinchEnabled === 'true') return;
            container.dataset.pinchEnabled = 'true';
            let pinchPointers = new Map();
            let pinchStartDistance = 0;
            let pinchStartZoom = 1;

            const distance = () => {
                const points = Array.from(pinchPointers.values());
                if (points.length < 2) return 0;
                return Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
            };

            container.addEventListener('pointerdown', event => {
                if (event.pointerType === 'touch') {
                    pinchPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
                    if (pinchPointers.size === 2) {
                        pinchStartDistance = distance();
                        pinchStartZoom = pyramidZoom;
                    }
                }
            });
            container.addEventListener('pointermove', event => {
                if (!pinchPointers.has(event.pointerId)) return;
                pinchPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
                if (pinchPointers.size === 2 && pinchStartDistance > 0) {
                    event.preventDefault();
                    const scale = distance() / pinchStartDistance;
                    setPyramidZoom(pinchStartZoom * scale);
                }
            }, { passive: false });
            const endPinch = event => pinchPointers.delete(event.pointerId);
            container.addEventListener('pointerup', endPinch);
            container.addEventListener('pointercancel', endPinch);
        }

        function renderPyramidDiagram() {
            const container = document.getElementById('dynamic-pyramid-grid');
            if (!container) return;
            container.innerHTML = '';
            const content = document.createElement('div');
            content.id = 'pyramid-zoom-content';
            content.className = 'flex flex-col items-center justify-start gap-2.5 min-w-full';
            container.appendChild(content);
            setupPyramidZoomControls();

            // Kelompokkan POSITIONS berdasarkan visualRowFromTop (1 = Puncak ke bawah)
            const rowsMap = new Map();
            POSITIONS.forEach(pos => {
                if (!rowsMap.has(pos.visualRowFromTop)) rowsMap.set(pos.visualRowFromTop, []);
                rowsMap.get(pos.visualRowFromTop).push(pos);
            });

            const sortedRowKeys = Array.from(rowsMap.keys()).sort((a, b) => a - b);
            sortedRowKeys.forEach(rowKey => {
                const rowPositions = rowsMap.get(rowKey);
                const rowDiv = document.createElement('div');
                const isLargeArrangement = POSITIONS.length > 24;
                rowDiv.className = isLargeArrangement
                    ? 'flex items-center justify-center gap-1.5 sm:gap-2'
                    : 'flex items-center justify-center gap-2 sm:gap-3';
                rowDiv.style.minWidth = `${Math.max(rowPositions.length * (isLargeArrangement ? 64 : 96) + (rowPositions.length - 1) * (isLargeArrangement ? 6 : 12), 300)}px`;

                rowPositions.forEach(pos => {
                    let filledCount = 0;
                    for (let l = 1; l <= appState.totalLayers; l++) {
                        const item = appState.coils[`${pos.id}_${l}`];
                        if (CoilField.hasSlotData(item)) filledCount++;
                    }

                    const isActive = pos.id === appState.activePosition;
                    const isComplete = filledCount >= appState.totalLayers;

                    const btn = document.createElement('button');
                    btn.type = 'button';
                    btn.onclick = () => selectPosition(pos.id);
                    btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
                    btn.setAttribute('aria-label', `Posisi ${pos.seq}, ${pos.shortLabel}. ${filledCount} dari ${appState.totalLayers} layer tercatat${isActive ? '. Posisi aktif' : ''}`);

                    let nodeColorClass = 'bg-white border-slate-300 text-slate-700 hover:border-amber-400';
                    if (isActive) {
                        nodeColorClass = 'bg-amber-500 border-amber-600 text-slate-950 active-coil-node scale-105 shadow-md';
                    } else if (isComplete) {
                        nodeColorClass = 'bg-emerald-50 border-emerald-500 text-emerald-900';
                    } else if (filledCount > 0) {
                        nodeColorClass = 'bg-amber-50/70 border-amber-300 text-slate-800';
                    }

                    btn.className = isLargeArrangement
                        ? `w-14 h-14 sm:w-16 sm:h-16 rounded-full border-2 flex flex-col items-center justify-center p-1 transition cursor-pointer shrink-0 ${nodeColorClass}`
                        : `w-20 h-20 sm:w-24 sm:h-24 rounded-full border-2 flex flex-col items-center justify-center p-1.5 transition cursor-pointer shrink-0 ${nodeColorClass}`;
                    btn.innerHTML = `
                        <span class="text-[10px] font-mono font-extrabold opacity-75">#${pos.seq}</span>
                        <span class="text-xs font-extrabold leading-tight text-center line-clamp-2">${escapeHTML(pos.shortLabel)}</span>
                        <span class="mt-0.5 text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-full ${isActive ? 'bg-slate-900 text-amber-300' : isComplete ? 'bg-emerald-600 text-white' : 'bg-slate-200/80 text-slate-700'}">
                            ${isComplete && !isActive ? '<i class="fa-solid fa-check mr-0.5"></i>' : ''}${filledCount}/${appState.totalLayers}
                        </span>
                    `;
                    rowDiv.appendChild(btn);
                });

                content.appendChild(rowDiv);
            });
        }

        function renderCrawlView() {
            renderPyramidDiagram();

            const posObj = POSITIONS.find(p => p.id === appState.activePosition) || POSITIONS[0];
            document.getElementById('active-pos-title').textContent = `#${posObj.seq} • ${posObj.label}`;
            const positionSelect = document.getElementById('active-position-select');
            if (positionSelect) {
                positionSelect.innerHTML = '';
                POSITIONS.forEach(pos => {
                    const opt = document.createElement('option');
                    opt.value = pos.id;
                    opt.textContent = `#${pos.seq} • ${pos.label}`;
                    opt.selected = pos.id === posObj.id;
                    positionSelect.appendChild(opt);
                });
            }

            const dirLabel = document.getElementById('crawl-direction-label');
            if (dirLabel) {
                dirLabel.innerHTML = appState.crawlDirection === 'desc'
                    ? `Layer ${appState.totalLayers} &rarr; Layer 1`
                    : `Layer 1 &rarr; Layer ${appState.totalLayers}`;
            }

            // Isi dropdown target layer
            const layerSelect = document.getElementById('target-layer-select');
            layerSelect.innerHTML = '';
            const layerOrder = [];
            if (appState.crawlDirection === 'desc') {
                for (let l = appState.totalLayers; l >= 1; l--) layerOrder.push(l);
            } else {
                for (let l = 1; l <= appState.totalLayers; l++) layerOrder.push(l);
            }

            layerOrder.forEach(l => {
                const item = appState.coils[`${posObj.id}_${l}`];
                const opt = document.createElement('option');
                opt.value = l;
                opt.textContent = `Layer ${l} ${CoilField.hasCoil(item) ? '✓' : CoilField.isNoCoil(item) ? '(Tidak ada Coil)' : '(Belum diisi)'}`;
                if (l === appState.selectedLayer) opt.selected = true;
                layerSelect.appendChild(opt);
            });

            updateMobileSaveContext(posObj);
            populateFormForCurrentSlot();
            renderPositionLayerList();
        }

        function updateMobileSaveContext(pos = POSITIONS.find(pos => pos.id === appState.activePosition)) {
            const context = document.getElementById('mobile-save-context');
            if (context && pos) context.textContent = `#${pos.seq} ${pos.shortLabel} • Layer ${appState.selectedLayer}`;
        }

        function onLayerSelectChange() {
            const val = parseInt(document.getElementById('target-layer-select').value, 10);
            if (!isNaN(val)) {
                appState.selectedLayer = val;
                updateMobileSaveContext();
                populateFormForCurrentSlot();
                renderPositionLayerList();
            }
        }

        function setNoLabelMode(mode, enabled) {
            const prefix = mode === 'np' ? 'np' : 'coil';
            const idInput = document.getElementById(`${prefix}-id-input`);
            const heatInput = document.getElementById(`${prefix}-heat-input`);
            const supplierInput = document.getElementById(`${prefix}-supplier-input`);
            const qrBlock = document.getElementById(mode === 'np' ? 'np-qr-block' : 'coil-qr-block');
            const note = document.getElementById(mode === 'np' ? 'np-no-label-note' : 'coil-no-label-note');
            if (!idInput || !heatInput || !supplierInput) return;
            idInput.form.classList.toggle('no-label-mode', enabled);
            idInput.disabled = enabled;
            heatInput.disabled = enabled;
            idInput.required = !enabled;
            heatInput.required = !enabled;
            document.getElementById(`${prefix}-weight-input`).required = !enabled;
            supplierInput.required = !enabled;
            supplierInput.placeholder = enabled ? 'Nama Supplier (opsional)...' : 'Nama Supplier...';
            if (qrBlock) qrBlock.classList.toggle('hidden', enabled);
            if (note) note.classList.toggle('hidden', !enabled);
        }

        function setNoCoilMode(enabled) {
            const toggle = document.getElementById('coil-no-coil');
            const fields = document.getElementById('coil-details-fields');
            const noLabel = document.getElementById('coil-no-label');
            toggle.checked = enabled && !toggle.disabled;
            fields.disabled = fields.hidden = toggle.checked;
            document.getElementById('coil-copy-previous').disabled = toggle.checked;
            document.getElementById('coil-no-coil-note').textContent = toggle.disabled
                ? 'Slot ini sudah berisi coil. Penandaan ini tidak menggantikan data coil.'
                : 'Untuk slot yang sejak awal tidak berisi coil. Simpan untuk membedakannya dari slot yang belum diisi.';
            if (toggle.checked) noLabel.checked = false;
            setNoLabelMode('pyramid', noLabel.checked);
        }

        function focusQuickSlotInput() {
            const id = document.getElementById('coil-no-coil').checked ? 'coil-no-coil'
                : document.getElementById('coil-no-label').checked ? 'coil-weight-input' : 'coil-id-input';
            document.getElementById(id).focus();
        }

        function populateFormForCurrentSlot() {
            const key = `${appState.activePosition}_${appState.selectedLayer}`;
            const existing = appState.coils[key];
            quickPastedCoil = null;
            renderPyramidCoilClipboard();

            document.getElementById('coil-nomor-input').value = existing?.nomor || getAutoSequenceNumber(appState.activePosition);
            document.getElementById('coil-id-input').value = existing?.id || '';
            document.getElementById('coil-diameter-input').value = existing?.diameter || '';
            document.getElementById('coil-grade-input').value = existing?.grade || '';
            document.getElementById('coil-weight-input').value = existing?.weight || '';
            document.getElementById('coil-weight-unit').value = existing?.weightUnit || appState.defaultWeightUnit || 'kg';
            document.getElementById('coil-heat-input').value = existing?.heatNumber || '';
            document.getElementById('coil-supplier-input').value = existing?.supplier || '';
            document.getElementById('coil-status-input').value = normalizeCoilStatus(existing?.status);
            document.getElementById('qr-raw-input').value = '';
            document.getElementById('coil-no-label').checked = CoilField.isNoLabel(existing);
            document.getElementById('coil-no-coil').disabled = CoilField.hasCoil(existing);
            setNoCoilMode(CoilField.isNoCoil(existing));
            hideQrLinkHelper('pyramid');
        }

        function renderPyramidCoilClipboard() {
            const bar = document.getElementById('coil-paste-bar');
            bar.classList.toggle('hidden', !pyramidCoilClipboard);
            if (!pyramidCoilClipboard) return;
            const { item, address } = pyramidCoilClipboard;
            const occupied = CoilField.hasCoil(appState.coils[`${appState.activePosition}_${appState.selectedLayer}`]);
            document.getElementById('coil-paste-data').disabled = occupied;
            document.getElementById('coil-paste-source').textContent = `${coilDisplayId(item)} · ${address}${occupied ? ' — pilih slot kosong untuk menempel.' : ''}`;
        }

        function copyPyramidCoilData(posId, layer) {
            const key = `${posId}_${layer}`;
            const item = appState.coils[key];
            if (!CoilField.hasActiveCoil(item)) return;
            const position = POSITIONS.find(pos => pos.id === posId)?.shortLabel || posId;
            pyramidCoilClipboard = { item: CoilField.clone(item), locId: appState.activeLocationId, key,
                address: `${appState.bayName} · ${position} · Layer ${layer}` };
            renderPyramidCoilClipboard();
            showToast('Data disalin. Pilih posisi dan layer tujuan, lalu klik Tempel Data.');
        }

        function pastePyramidCoilData() {
            const key = `${appState.activePosition}_${appState.selectedLayer}`;
            if (!pyramidCoilClipboard || CoilField.hasCoil(appState.coils[key])) return;
            quickPastedCoil = pyramidCoilClipboard;
            const item = quickPastedCoil.item;
            setNoCoilMode(false);
            const noLabel = CoilField.isNoLabel(item);
            document.getElementById('coil-no-label').checked = noLabel;
            setNoLabelMode('pyramid', noLabel);
            for (const [field, value] of Object.entries({ id: noLabel ? '' : item.id, heat: noLabel ? '' : item.heatNumber,
                diameter: item.diameter, grade: item.grade, weight: item.weight, supplier: item.supplier, status: 'AKTIF' })) {
                document.getElementById(`coil-${field}-input`).value = value ?? '';
            }
            document.getElementById('coil-weight-unit').value = item.weightUnit || 'kg';
            document.getElementById('qr-raw-input').value = '';
            hideQrLinkHelper('pyramid');
            focusQuickSlotInput();
            showToast('Data ditempel ke form. Periksa posisi dan spesifikasi sebelum menyimpan.');
        }

        function pastedPyramidSource(copy, identity) {
            const matches = CoilField.records(appState, pattern => generatePositionsList(pattern).positions)
                .filter(record => CoilField.identity(record.item) === identity);
            if (!matches.length) {
                const location = appState.locations[copy.locId];
                // Allow a manually cleared slot, but not a deleted bay or a coil already taken out of stock.
                if (!location || CoilField.hasCoil(location.coils?.[copy.key]) ||
                    (appState.coilHistory || []).some(item => CoilField.identity(item) === identity)) return false;
                return null;
            }
            const source = matches[0];
            if (matches.length !== 1 || source.locId !== copy.locId || source.key !== copy.key ||
                JSON.stringify(source.item) !== JSON.stringify(copy.item)) return false;
            return source;
        }

        function confirmPastedPyramidSave(id, key, action, noLabel, heatNumber) {
            const copy = quickPastedCoil;
            if (!copy) return false;
            const inventoryRef = CoilField.normalizeRef(copy.item.inventoryRef);
            const identity = CoilField.identity({ id, heatNumber, noLabel, inventoryRef });
            if (identity !== CoilField.identity(copy.item)) return false;

            const statusInput = document.getElementById('coil-status-input');
            if (CoilField.hasCoil(appState.coils[key]) || normalizeCoilStatus(statusInput.value) !== 'AKTIF') {
                showToast('Untuk koreksi posisi, pilih slot kosong dan biarkan status coil AKTIF.', 'error');
                return true;
            }
            syncActiveStateToLocation();
            const source = pastedPyramidSource(copy, identity);
            const sourceChanged = () => showToast('Salinan tidak lagi cocok dengan data asal. Salin ulang dari posisi yang benar.', 'error');
            if (source === false) {
                sourceChanged();
                return true;
            }
            if (!source) {
                // The original was already cleared. For NO LABEL keep the existing tag rather than issuing a new one.
                if (noLabel) {
                    performQuickSave(id, key, action, { inventoryRef });
                    return true;
                }
                return false;
            }
            const locId = appState.activeLocationId;
            const position = POSITIONS.find(pos => pos.id === appState.activePosition)?.shortLabel || appState.activePosition;
            const layer = appState.selectedLayer;
            showConfirmModal('Koreksi Posisi Coil?',
                `Data ${coilDisplayId(copy.item)} akan dipindahkan dari ${copy.address} ke ${appState.bayName} · ${position} · Layer ${layer}. Slot asal akan dikosongkan. Ini mengoreksi posisi tercatat, bukan mencatat perpindahan fisik.`, () => {
                    if (quickPastedCoil !== copy || appState.activeLocationId !== locId || `${appState.activePosition}_${appState.selectedLayer}` !== key ||
                        CoilField.hasCoil(appState.coils[key]) || document.getElementById('coil-no-coil').checked ||
                        document.getElementById('coil-no-label').checked !== noLabel || normalizeCoilStatus(statusInput.value) !== 'AKTIF' ||
                        (!noLabel && (normalizeDuplicateValue(document.getElementById('coil-id-input').value) !== id ||
                            normalizeDuplicateValue(document.getElementById('coil-heat-input').value) !== normalizeDuplicateValue(heatNumber)))) {
                        showToast('Posisi atau form tujuan berubah. Periksa lalu simpan lagi.', 'error');
                        return;
                    }
                    syncActiveStateToLocation();
                    const currentSource = pastedPyramidSource(copy, identity);
                    if (!currentSource) {
                        sourceChanged();
                        return;
                    }
                    performQuickSave(id, key, action, { inventoryRef, source: currentSource });
                });
            return true;
        }

        function copyFromPreviousLayer() {
            const prevLayer = appState.crawlDirection === 'desc'
                ? appState.selectedLayer + 1
                : appState.selectedLayer - 1;

            if (prevLayer < 1 || prevLayer > appState.totalLayers) {
                showToast('Tidak ada layer sebelumnya untuk disalin', 'info');
                return;
            }

            const prevData = appState.coils[`${appState.activePosition}_${prevLayer}`];
            if (!CoilField.hasCoil(prevData)) {
                showToast(`Data Layer ${prevLayer} masih kosong`, 'info');
                return;
            }

            document.getElementById('coil-diameter-input').value = prevData.diameter || '';
            document.getElementById('coil-grade-input').value = prevData.grade || '';
            document.getElementById('coil-weight-input').value = prevData.weight || '';
            document.getElementById('coil-weight-unit').value = prevData.weightUnit || 'kg';
            if (!document.getElementById('coil-no-label').checked) document.getElementById('coil-heat-input').value = prevData.heatNumber || '';
            document.getElementById('coil-supplier-input').value = prevData.supplier || '';
            document.getElementById('coil-status-input').value = normalizeCoilStatus(prevData.status);
            showToast(`Spesifikasi disalin dari Layer ${prevLayer}`, 'info');
        }

        function setQuickSaveAction(action = 'next') {
            const actionInput = document.getElementById('quick-save-action');
            if (actionInput) actionInput.value = action;
        }

        function submitQuickForm(action = 'save') {
            const form = document.getElementById('quick-input-form');
            if (!form) return;
            setQuickSaveAction(action);
            if (typeof form.requestSubmit === 'function') {
                form.requestSubmit();
            } else {
                form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
            }
        }

        function handleQuickSubmit(e) {
            e.preventDefault();
            const key = `${appState.activePosition}_${appState.selectedLayer}`;
            const saveAction = document.getElementById('quick-save-action')?.value || 'next';
            if (document.getElementById('coil-no-coil').checked) {
                saveNoCoilSlot(key, saveAction);
                return;
            }
            const noLabel = document.getElementById('coil-no-label')?.checked === true;
            const idVal = noLabel ? '' : document.getElementById('coil-id-input').value.trim().toUpperCase();
            if (!noLabel && !idVal) {
                showToast('Isi No. Coil, pilih NO LABEL untuk coil tanpa label, atau pilih Tidak ada Coil untuk slot kosong.', 'error');
                document.getElementById('coil-id-input').focus();
                return;
            }

            const weightVal = document.getElementById('coil-weight-input').value.trim();
            if (!validInventoryWeight(weightVal, noLabel)) {
                showToast(noLabel ? 'Kosongkan berat jika belum diketahui, atau isi dengan angka lebih dari 0.' : 'Berat wajib diisi dengan angka lebih dari 0!', 'error');
                document.getElementById('coil-weight-input').focus();
                return;
            }
            const heatVal = noLabel ? '' : document.getElementById('coil-heat-input').value.trim();
            if (!noLabel && !heatVal) {
                showToast('Heat Number wajib diisi!', 'error');
                document.getElementById('coil-heat-input').focus();
                return;
            }
            const supplierVal = document.getElementById('coil-supplier-input').value.trim();
            if (!noLabel && !supplierVal) {
                showToast('Nama Supplier wajib diisi!', 'error');
                document.getElementById('coil-supplier-input').focus();
                return;
            }

            if (confirmPastedPyramidSave(idVal, key, saveAction, noLabel, heatVal)) return;
            const dup = noLabel ? null : findDuplicateCoil(idVal, {
                heatNumber: heatVal,
                locationId: appState.activeLocationId,
                pyramidKey: key
            });
            if (dup) {
                if (dup.sameCoilHeat) {
                    showToast(`Gagal menyimpan: No. Coil ${idVal} dan Heat ${heatVal} sudah terdaftar di ${describeDuplicate(dup)}. Kombinasi harus unik di semua lokasi.`, 'error');
                    return;
                }
                showConfirmModal(
                    'No. Coil Duplikat',
                    `No. Coil ${idVal} sudah terdaftar di ${describeDuplicate(dup)} dengan heat berbeda. Tetap simpan di slot ini?`,
                    () => performQuickSave(idVal, key, saveAction)
                );
                return;
            }
            performQuickSave(idVal, key, saveAction);
        }

        function saveNoCoilSlot(key, saveAction) {
            const previous = appState.coils[key];
            if (CoilField.hasCoil(previous)) {
                showToast('Slot sudah berisi coil. Penandaan tidak menggantikan data coil.', 'error');
                return;
            }
            const marker = CoilField.isNoCoil(previous) ? previous : {
                noCoil: true,
                picName: (document.getElementById('pic-name-input')?.value || appState.picName || '').trim(),
                shift: document.getElementById('shift-select')?.value || appState.shift || '',
                updatedAt: new Date().toISOString()
            };
            appState.coils[key] = marker;
            completeQuickSave(marker, saveAction, () => {
                if (previous) appState.coils[key] = previous;
                else delete appState.coils[key];
            });
        }

        function storeImportedNoCoil(loc, posId, layer, marker, tracker) {
            const key = `${posId}_${layer}`;
            // A report of an empty slot must never erase a coil or a previous marker.
            if (CoilField.hasSlotData(loc.coils?.[key])) return;
            (loc.coils ||= {})[key] = { noCoil: true, ...marker };
            tracker.markedEmptyCount++;
            tracker.touchedLocIds.add(loc.id);
        }

        function clearNoCoilMarker(posId, layer) {
            const key = `${posId}_${layer}`;
            const locId = appState.activeLocationId;
            const marker = appState.coils[key];
            if (!CoilField.isNoCoil(marker)) return;
            showConfirmModal('Batalkan penandaan Tidak ada Coil?', `Layer ${layer} akan kembali berstatus Belum diisi.`, () => {
                if (appState.activeLocationId !== locId || appState.coils[key] !== marker) return;
                delete appState.coils[key];
                if (!saveState()) appState.coils[key] = marker;
                else showToast('Penandaan dibatalkan. Slot belum diisi.');
                renderAll();
            });
        }

        function performQuickSave(idVal, key, saveAction = 'save', { inventoryRef: copiedRef, source } = {}) {
            const noLabel = document.getElementById('coil-no-label')?.checked === true;
            const nomorVal = document.getElementById('coil-nomor-input').value.trim().toUpperCase() || getAutoSequenceNumber(appState.activePosition);
            const weightUnit = document.getElementById('coil-weight-unit').value || 'kg';
            appState.defaultWeightUnit = weightUnit;

            const previous = appState.coils[key];
            const existing = CoilField.isNoCoil(previous) ? {} : previous || {};
            const activePic = (document.getElementById('pic-name-input')?.value || appState.picName || '').trim();
            const activeShift = document.getElementById('shift-select')?.value || appState.shift || detectCurrentShiftByTime();
            appState.picName = activePic;
            appState.shift = activeShift;

            const idValue = noLabel ? '' : String(idVal || '').trim().toUpperCase();
            const heatValue = noLabel ? '' : document.getElementById('coil-heat-input').value.trim().toUpperCase();
            const displayId = noLabel ? 'NO LABEL' : idValue;
            const status = normalizeCoilStatus(document.getElementById('coil-status-input')?.value);
            if (status === 'DIHAPUS') {
                delete appState.coils[key];
                saveState();
                renderAll();
                showToast(`Data coil ${displayId} dihapus permanen dari slot`, 'success');
                (noLabel ? document.getElementById('coil-weight-input') : document.getElementById('coil-id-input'))?.focus();
                return;
            }

            const refHolder = { noLabel, inventoryRef: copiedRef || existing.inventoryRef };
            const inventoryRef = noLabel ? ensureInventoryRef(refHolder) : '';
            const savedItem = {
                ...CoilField.editBase(source?.item || existing, { id: idValue, heatNumber: heatValue, noLabel, inventoryRef }),
                nomor: nomorVal,
                id: idValue,
                diameter: document.getElementById('coil-diameter-input').value.trim(),
                grade: document.getElementById('coil-grade-input').value.trim().toUpperCase(),
                weight: document.getElementById('coil-weight-input').value.trim(),
                weightUnit,
                heatNumber: heatValue,
                supplier: document.getElementById('coil-supplier-input').value.trim(),
                status,
                picName: activePic || existing.picName || '',
                shift: activeShift,
                updatedAt: new Date().toLocaleString('id-ID')
            };
            if (noLabel) {
                savedItem.noLabel = true;
                savedItem.inventoryRef = inventoryRef;
            } else {
                delete savedItem.noLabel;
                delete savedItem.inventoryRef;
            }
            const sourceSlots = source ? appState.locations[source.locId].coils : null;
            if (sourceSlots) {
                delete savedItem.fieldVerification;
                delete sourceSlots[source.key];
            }
            appState.coils[key] = savedItem;
            const clipboard = pyramidCoilClipboard;
            if (clipboard && quickPastedCoil === clipboard && CoilField.identity(savedItem) === CoilField.identity(clipboard.item)) {
                pyramidCoilClipboard = null;
            }
            completeQuickSave(savedItem, saveAction, () => {
                if (previous) appState.coils[key] = previous;
                else delete appState.coils[key];
                if (sourceSlots) sourceSlots[source.key] = source.item;
                pyramidCoilClipboard = clipboard;
            });
        }

        function completeQuickSave(savedItem, saveAction, rollback) {
            const savedPosition = appState.activePosition;
            const savedLayer = appState.selectedLayer;
            if (saveAction === 'next') {
                const nextLayer = appState.crawlDirection === 'desc'
                    ? appState.selectedLayer - 1
                    : appState.selectedLayer + 1;
                if (nextLayer >= 1 && nextLayer <= appState.totalLayers) {
                    appState.selectedLayer = nextLayer;
                } else {
                    const posIndex = POSITIONS.findIndex(pos => pos.id === appState.activePosition);
                    if (posIndex >= 0) {
                        const nextPosition = POSITIONS[(posIndex + 1) % POSITIONS.length];
                        appState.activePosition = nextPosition.id;
                        appState.selectedLayer = getFirstEmptyLayerForPosition(nextPosition.id);
                    }
                }
            } else if (saveAction === 'next-position') {
                // Posisi berikutnya: pindah ke posisi piramid berikutnya.
                const posIndex = POSITIONS.findIndex(pos => pos.id === appState.activePosition);
                if (posIndex >= 0) {
                    const nextPosition = POSITIONS[(posIndex + 1) % POSITIONS.length];
                    appState.activePosition = nextPosition.id;
                    appState.selectedLayer = getFirstEmptyLayerForPosition(nextPosition.id);
                }
            } else if (saveAction === 'next-layer') {
                // Layer berikutnya: maju mundur pada posisi yang sama sesuai arah input.
                if (appState.crawlDirection === 'desc') {
                    if (appState.selectedLayer > 1) {
                        appState.selectedLayer--;
                    } else {
                        showToast('Layer terakhir posisi ini sudah tercapai.', 'info');
                    }
                } else {
                    if (appState.selectedLayer < appState.totalLayers) {
                        appState.selectedLayer++;
                    } else {
                        showToast('Layer terakhir posisi ini sudah tercapai.', 'info');
                    }
                }
            }

            if (!saveState()) {
                rollback();
                appState.activePosition = savedPosition;
                appState.selectedLayer = savedLayer;
                syncActiveStateToLocation();
                return;
            }
            setQuickSaveAction('next');
            renderAll();
            showToast(`Tersimpan di Layer ${savedLayer} (${CoilField.isNoCoil(savedItem) ? 'Tidak ada Coil' : coilDisplayId(savedItem)})`);
            focusQuickSlotInput();
        }

        function renderPositionLayerList() {
            const listEl = document.getElementById('position-layer-list');
            if (!listEl) return;
            listEl.innerHTML = '';

            const layerOrder = [];
            if (appState.crawlDirection === 'desc') {
                for (let l = appState.totalLayers; l >= 1; l--) layerOrder.push(l);
            } else {
                for (let l = 1; l <= appState.totalLayers; l++) layerOrder.push(l);
            }

            layerOrder.forEach(l => {
                const key = `${appState.activePosition}_${l}`;
                const item = appState.coils[key];
                const isSelected = l === appState.selectedLayer;

                const card = document.createElement('div');
                card.className = `p-3 rounded-xl border transition flex items-center justify-between gap-2 cursor-pointer ${
                    isSelected
                        ? 'bg-amber-50 border-amber-400 shadow-sm'
                        : (CoilField.hasCoil(item) ? 'bg-white border-slate-200 hover:border-slate-300' : 'bg-slate-50/70 border-dashed border-slate-200 hover:border-slate-300')
                }`;
                card.onclick = () => {
                    appState.selectedLayer = l;
                    renderCrawlView();
                };

                if (CoilField.hasCoil(item)) {
                    const metaParts = [
                        item.diameter ? `Ø${escapeHTML(item.diameter)}` : '',
                        item.grade ? escapeHTML(item.grade) : '',
                        item.heatNumber ? `Heat:${escapeHTML(item.heatNumber)}` : '',
                        item.weight ? `${escapeHTML(item.weight)} ${escapeHTML(item.weightUnit || 'kg')}` : '',
                        item.supplier ? escapeHTML(item.supplier) : ''
                    ].filter(Boolean).join(' • ');

                    const itemPic = item.picName || appState.picName || '';
                    const itemShift = item.shift || appState.shift || '';
                    const picShiftBadge = (itemPic || itemShift)
                        ? `<span class="text-[10px] font-mono bg-sky-100 text-sky-800 px-1.5 py-0.5 rounded font-semibold">${escapeHTML([itemPic, itemShift].filter(Boolean).join(' • '))}</span>`
                        : '';

                    card.innerHTML = `
                        <div class="min-w-0 flex-1">
                            <div class="flex items-center gap-1.5 flex-wrap">
                                <span class="text-xs font-mono font-extrabold px-2 py-0.5 rounded bg-slate-900 text-amber-400">L${l}</span>
                                <span class="text-xs font-mono font-bold text-slate-500">#${escapeHTML(item.nomor || '-')}</span>
                                <span class="text-sm font-mono font-extrabold text-slate-900 truncate">${escapeHTML(coilDisplayId(item))}</span>
                                ${picShiftBadge}
                            </div>
                            <p class="text-[11px] text-slate-600 mt-1 truncate">${metaParts || 'Tanpa keterangan tambahan'}</p>
                        </div>
                        <div class="flex flex-col items-end gap-1.5 shrink-0">
                        ${CoilField.hasActiveCoil(item) ? '<button type="button" class="min-h-11 px-2 rounded-lg border border-slate-300 bg-slate-50 hover:bg-slate-100 text-xs font-bold text-slate-700"><i class="fa-regular fa-copy" aria-hidden="true"></i> Salin Data</button>' : ''}
                        <select onchange="event.stopPropagation(); markLayerCoilStatus('${appState.activePosition}', ${l}, this.value)" onclick="event.stopPropagation()"
                            title="Ubah status coil"
                            class="shrink-0 max-w-[118px] bg-slate-100 border border-slate-300 rounded-lg px-1.5 py-1 text-[10px] font-bold text-slate-700">
                            <option value="AKTIF" ${normalizeCoilStatus(item.status) === 'AKTIF' ? 'selected' : ''}>AKTIF</option>
                            <option value="DIPAKAI_PRODUKSI" ${normalizeCoilStatus(item.status) === 'DIPAKAI_PRODUKSI' ? 'selected' : ''}>DIPAKAI PRODUKSI</option>
                            <option value="HILANG" ${normalizeCoilStatus(item.status) === 'HILANG' ? 'selected' : ''}>HILANG</option>
                            <option value="DIHAPUS" ${normalizeCoilStatus(item.status) === 'DIHAPUS' ? 'selected' : ''}>DIHAPUS</option>
                        </select>
                        </div>
                    `;
                    const copy = card.querySelector('button');
                    const posId = appState.activePosition;
                    if (copy) copy.onclick = event => {
                        event.stopPropagation();
                        copyPyramidCoilData(posId, l);
                    };
                } else if (CoilField.isNoCoil(item)) {
                    card.classList.add('border-sky-300');
                    const meta = [item.picName, item.shift, item.updatedAt && new Date(item.updatedAt).toLocaleString('id-ID')].filter(Boolean).join(' • ');
                    card.innerHTML = `
                        <div class="min-w-0">
                            <span class="text-xs font-mono font-bold px-2 py-0.5 rounded bg-sky-100 text-sky-800">L${l}</span>
                            <strong class="text-sm text-sky-800">Tidak ada Coil</strong>
                            <p class="text-xs text-slate-600 mt-1">${escapeHTML(meta)}</p>
                        </div>
                        <button type="button" class="field-button text-xs" aria-label="Batalkan penandaan Layer ${l}">Batalkan</button>`;
                    const posId = appState.activePosition;
                    card.querySelector('button').onclick = event => {
                        event.stopPropagation();
                        clearNoCoilMarker(posId, l);
                    };
                } else {
                    card.innerHTML = `
                        <div class="flex items-center gap-2">
                            <span class="text-xs font-mono font-bold px-2 py-0.5 rounded bg-slate-200 text-slate-600">L${l}</span>
                            <span class="text-xs text-slate-500 italic">Belum diisi — ketuk untuk input</span>
                        </div>
                        <span class="text-[11px] font-semibold text-amber-600">${isSelected ? 'Aktif' : 'Pilih'}</span>
                    `;
                }

                listEl.appendChild(card);
            });
        }

        function deleteLayerItem(posId, layerNum) {
            const item = appState.coils[`${posId}_${layerNum}`];
            const coilId = CoilField.hasCoil(item) ? ` (${coilDisplayId(item)})` : '';
            showConfirmModal(
                'Tandai Coil DIPAKAI PRODUKSI?',
                `Coil di Layer ${layerNum}${coilId} akan keluar dari slot dan dapat diganti oleh coil lain.`,
                () => {
                    markLayerCoilStatus(posId, layerNum, 'DIPAKAI_PRODUKSI');
                }
            );
        }

        function markLayerCoilStatus(posId, layerNum, status, confirmed = false) {
            const key = `${posId}_${layerNum}`;
            const item = appState.coils[key];
            if (!CoilField.hasCoil(item)) return;
            const normalizedStatus = normalizeCoilStatus(status);
            if ((normalizedStatus === 'DIPAKAI_PRODUKSI' || normalizedStatus === 'HILANG') && !confirmed) {
                showConfirmModal(
                    normalizedStatus === 'HILANG' ? 'Tandai Coil Hilang?' : 'Tandai Coil Dipakai Produksi?',
                    `Coil ${coilDisplayId(item)} akan dipindahkan dari slot aktif ke riwayat. Slot ini akan menjadi kosong.`,
                    () => markLayerCoilStatus(posId, layerNum, normalizedStatus, true),
                    () => renderAll()
                );
                return;
            }
            if (normalizedStatus === 'DIHAPUS') {
                showConfirmModal(
                    'Hapus Data Coil Permanen?',
                    `Data coil ${coilDisplayId(item)} akan dihapus dari slot dan tidak akan tersimpan di riwayat.`,
                    () => {
                        delete appState.coils[key];
                        saveState();
                        renderAll();
                        showToast(`Data coil ${coilDisplayId(item)} dihapus permanen`, 'success');
                    },
                    () => renderAll()
                );
                return;
            }
            if (normalizedStatus === 'DIPAKAI_PRODUKSI' || normalizedStatus === 'HILANG') {
                const pos = POSITIONS.find(p => p.id === posId);
                const exitedItem = {
                    ...item,
                    status: normalizedStatus,
                    updatedAt: new Date().toLocaleString('id-ID')
                };
                archiveCoilRecord(exitedItem, {
                    locId: appState.activeLocationId,
                    locName: appState.bayName,
                    type: 'pyramid',
                    position: pos ? pos.shortLabel : posId,
                    layer: layerNum
                });
                delete appState.coils[key];
                saveState();
                renderAll();
                showToast(`${getCoilStatusLabel(normalizedStatus)}. Slot Layer ${layerNum} kini kosong`, 'success');
                return;
            }
            item.status = normalizedStatus;
            item.updatedAt = new Date().toLocaleString('id-ID');
            saveState();
            renderAll();
            showToast(`Status coil diubah menjadi ${getCoilStatusLabel(item.status)}`, 'info');
        }

        function editLayerItem(posId, layerNum) {
            appState.activePosition = posId;
            appState.selectedLayer = layerNum;
            switchMode('crawl');
            const targetEl = document.getElementById('quick-input-form') || document.getElementById('view-crawl');
            if (targetEl) targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }

        // ==========================================
        // MODE NON-PIRAMID (SAMPING 1-N)
        // ==========================================
        function prepareNonPyramidFormDefaults() {
            if (editingNonPyramidIndex >= 0) return;
            const nextNo = getNextNonPyramidNomor(-1);
            const nomorInput = document.getElementById('np-nomor-input');
            const unitSelect = document.getElementById('np-weight-unit');
            if (nomorInput) nomorInput.value = nextNo;
            if (unitSelect) unitSelect.value = appState.defaultWeightUnit || 'kg';
        }

        function resetNonPyramidForm() {
            editingNonPyramidIndex = -1;
            document.getElementById('np-form-mode-label').textContent = 'Tambah Koil Non-Piramid';
            document.getElementById('np-submit-btn-text').textContent = 'Simpan Koil Non-Piramid';
            document.getElementById('np-cancel-edit-btn').classList.add('hidden');
            document.getElementById('np-qr-raw-input').value = '';
            document.getElementById('np-id-input').value = '';
            document.getElementById('np-diameter-input').value = '';
            document.getElementById('np-grade-input').value = '';
            document.getElementById('np-weight-input').value = '';
            document.getElementById('np-heat-input').value = '';
            document.getElementById('np-supplier-input').value = '';
            document.getElementById('np-status-input').value = 'AKTIF';
            document.getElementById('np-no-label').checked = false;
            setNoLabelMode('np', false);
            hideQrLinkHelper('np');
            prepareNonPyramidFormDefaults();
        }

        function handleNonPyramidSubmit(e) {
            e.preventDefault();
            const noLabel = document.getElementById('np-no-label')?.checked === true;
            const idVal = noLabel ? '' : document.getElementById('np-id-input').value.trim().toUpperCase();
            if (!noLabel && !idVal) {
                showToast('No. Coil Non-Piramid wajib diisi, atau centang NO LABEL!', 'error');
                document.getElementById('np-id-input').focus();
                return;
            }

            const weightVal = document.getElementById('np-weight-input').value.trim();
            if (!validInventoryWeight(weightVal, noLabel)) {
                showToast(noLabel ? 'Kosongkan berat jika belum diketahui, atau isi dengan angka lebih dari 0.' : 'Berat wajib diisi dengan angka lebih dari 0!', 'error');
                document.getElementById('np-weight-input').focus();
                return;
            }
            const heatVal = noLabel ? '' : document.getElementById('np-heat-input').value.trim();
            if (!noLabel && !heatVal) {
                showToast('Heat Number wajib diisi!', 'error');
                document.getElementById('np-heat-input').focus();
                return;
            }
            const supplierVal = document.getElementById('np-supplier-input').value.trim();
            if (!noLabel && !supplierVal) {
                showToast('Nama Supplier wajib diisi!', 'error');
                document.getElementById('np-supplier-input').focus();
                return;
            }

            const editingIdx = editingNonPyramidIndex;
            const weightUnit = document.getElementById('np-weight-unit').value || 'kg';
            appState.defaultWeightUnit = weightUnit;
            const prevNp = (editingIdx >= 0) ? (appState.nonPyramidCoils[editingIdx] || {}) : {};
            const activePic = (document.getElementById('pic-name-input')?.value || appState.picName || '').trim();
            const activeShift = document.getElementById('shift-select')?.value || appState.shift || detectCurrentShiftByTime();
            appState.picName = activePic;
            appState.shift = activeShift;

            const refHolder = { noLabel, inventoryRef: prevNp.inventoryRef };
            const inventoryRef = noLabel ? ensureInventoryRef(refHolder) : '';
            const record = {
                ...CoilField.editBase(prevNp, { id: idVal, heatNumber: heatVal, noLabel, inventoryRef }),
                nomor: document.getElementById('np-nomor-input').value.trim().toUpperCase() || getNextNonPyramidNomor(editingIdx),
                id: idVal,
                diameter: document.getElementById('np-diameter-input').value.trim(),
                grade: document.getElementById('np-grade-input').value.trim().toUpperCase(),
                weight: document.getElementById('np-weight-input').value.trim(),
                weightUnit,
                heatNumber: heatVal,
                supplier: document.getElementById('np-supplier-input').value.trim(),
                status: normalizeCoilStatus(document.getElementById('np-status-input')?.value),
                picName: activePic || prevNp.picName || '',
                shift: activeShift,
                updatedAt: new Date().toLocaleString('id-ID')
            };
            if (noLabel) {
                record.noLabel = true;
                record.inventoryRef = inventoryRef;
            } else {
                delete record.noLabel;
                delete record.inventoryRef;
            }

            const dup = noLabel ? null : findDuplicateCoil(idVal, {
                heatNumber: record.heatNumber,
                locationId: appState.activeLocationId,
                nonPyramidIndex: editingIdx >= 0 ? editingIdx : undefined
            });
            if (dup) {
                if (dup.sameCoilHeat) {
                    showToast(`Gagal menyimpan: No. Coil ${idVal} dan Heat ${record.heatNumber} sudah terdaftar di ${describeDuplicate(dup)}. Kombinasi harus unik di semua lokasi.`, 'error');
                    return;
                }
                showConfirmModal(
                    'No. Coil Duplikat',
                    `No. Coil ${idVal} sudah terdaftar di ${describeDuplicate(dup)} dengan heat berbeda. Tetap simpan sebagai koil non-piramid?`,
                    () => commitNonPyramidRecord(record, editingIdx)
                );
                return;
            }
            commitNonPyramidRecord(record, editingIdx);
        }

        function commitNonPyramidRecord(record, editingIdx) {
            if (!Array.isArray(appState.nonPyramidCoils)) appState.nonPyramidCoils = [];
            const displayId = coilDisplayId(record);
            if (record.status === 'DIHAPUS') {
                if (editingIdx >= 0) appState.nonPyramidCoils.splice(editingIdx, 1);
                resetNonPyramidForm();
                saveState();
                renderAll();
                showToast(`Data coil ${displayId} dihapus permanen`, 'success');
                document.getElementById('np-id-input').focus();
                return;
            }
            if (record.status === 'DIPAKAI_PRODUKSI' || record.status === 'HILANG') {
                archiveCoilRecord(record, {
                    locId: appState.activeLocationId,
                    locName: appState.bayName,
                    type: 'nonpyramid',
                    position: 'Samping',
                    layer: null,
                    nomorUrut: record.nomor || (editingIdx + 1)
                });
            }
            if (editingIdx >= 0 && editingIdx < appState.nonPyramidCoils.length) {
                appState.nonPyramidCoils[editingIdx] = record;
                showToast(`Koil Non-Piramid #${record.nomor} diperbarui!`);
            } else {
                appState.nonPyramidCoils.push(record);
                showToast(`Koil Non-Piramid #${record.nomor} (${displayId}) ditambahkan!`);
            }

            resetNonPyramidForm();
            saveState();
            renderAll();
            document.getElementById('np-id-input').focus();
        }

        function editNonPyramidItem(idx) {
            const item = (appState.nonPyramidCoils || [])[idx];
            if (!item) return;
            editingNonPyramidIndex = idx;
            document.getElementById('np-form-mode-label').textContent = `Edit Koil Non-Piramid #${item.nomor || (idx + 1)}`;
            document.getElementById('np-submit-btn-text').textContent = 'Perbarui Koil Non-Piramid';
            document.getElementById('np-cancel-edit-btn').classList.remove('hidden');

            document.getElementById('np-nomor-input').value = item.nomor || (idx + 1).toString();
            document.getElementById('np-id-input').value = item.id || '';
            document.getElementById('np-diameter-input').value = item.diameter || '';
            document.getElementById('np-grade-input').value = item.grade || '';
            document.getElementById('np-weight-input').value = item.weight || '';
            document.getElementById('np-weight-unit').value = item.weightUnit || 'kg';
            document.getElementById('np-heat-input').value = item.heatNumber || '';
            document.getElementById('np-supplier-input').value = item.supplier || '';
            document.getElementById('np-status-input').value = normalizeCoilStatus(item.status);
            document.getElementById('np-no-label').checked = CoilField.isNoLabel(item);
            setNoLabelMode('np', CoilField.isNoLabel(item));
            const formEl = document.getElementById('nonpyramid-form');
            if (formEl) formEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            (CoilField.isNoLabel(item) ? document.getElementById('np-weight-input') : document.getElementById('np-id-input'))?.focus();
        }

        function deleteNonPyramidItem(idx) {
            const item = (appState.nonPyramidCoils || [])[idx];
            const coilId = item ? ` (${coilDisplayId(item)})` : '';
            showConfirmModal(
                'Tandai Koil DIPAKAI PRODUKSI?',
                `Koil #${item?.nomor || idx + 1}${coilId} tidak akan dihapus. Status berubah menjadi DIPAKAI PRODUKSI dan seluruh berat dianggap habis dikonsumsi.`,
                () => {
                    const exited = appState.nonPyramidCoils[idx];
                    if (exited) {
                        exited.status = 'DIPAKAI_PRODUKSI';
                        exited.updatedAt = new Date().toLocaleString('id-ID');
                        archiveCoilRecord(exited, {
                            locId: appState.activeLocationId,
                            locName: appState.bayName,
                            type: 'nonpyramid',
                            position: 'Samping',
                            layer: null,
                            nomorUrut: exited.nomor || (idx + 1)
                        });
                    }
                    if (editingNonPyramidIndex === idx) document.getElementById('np-status-input').value = 'DIPAKAI_PRODUKSI';
                    saveState();
                    renderAll();
                    showToast('Koil Non-Piramid ditandai DIPAKAI PRODUKSI', 'info');
                }
            );
        }

        function markNonPyramidCoilStatus(idx, status, confirmed = false) {
            const item = appState.nonPyramidCoils[idx];
            if (!item) return;
            const normalizedStatus = normalizeCoilStatus(status);
            const displayId = coilDisplayId(item);
            if ((normalizedStatus === 'DIPAKAI_PRODUKSI' || normalizedStatus === 'HILANG') && !confirmed) {
                showConfirmModal(
                    normalizedStatus === 'HILANG' ? 'Tandai Coil Hilang?' : 'Tandai Coil Dipakai Produksi?',
                    `Coil ${displayId} akan dipindahkan dari daftar aktif ke riwayat.`,
                    () => markNonPyramidCoilStatus(idx, normalizedStatus, true),
                    () => renderAll()
                );
                return;
            }
            if (normalizedStatus === 'DIHAPUS') {
                showConfirmModal(
                    'Hapus Data Coil Permanen?',
                    `Data coil ${displayId} akan dihapus permanen dan tidak akan tersimpan di riwayat.`,
                    () => {
                        appState.nonPyramidCoils.splice(idx, 1);
                        if (editingNonPyramidIndex === idx) resetNonPyramidForm();
                        saveState();
                        renderAll();
                        showToast(`Data coil ${displayId} dihapus permanen`, 'success');
                    },
                    () => renderAll()
                );
                return;
            }
            item.status = normalizedStatus;
            item.updatedAt = new Date().toLocaleString('id-ID');
            if (item.status === 'DIPAKAI_PRODUKSI' || item.status === 'HILANG') {
                archiveCoilRecord(item, {
                    locId: appState.activeLocationId,
                    locName: appState.bayName,
                    type: 'nonpyramid',
                    position: 'Samping',
                    layer: null,
                    nomorUrut: item.nomor || (idx + 1)
                });
            }
            saveState();
            renderAll();
            showToast(`Status coil ${displayId} diubah menjadi ${getCoilStatusLabel(item.status)}`, 'info');
        }

        function getProductionCoilRecords() {
            syncActiveStateToLocation();
            const records = [];
            const positions = generatePositionsList(appState.stackPattern || '3-2-1').positions;
            positions.forEach(pos => {
                for (let layer = 1; layer <= (appState.totalLayers || 1); layer++) {
                    const item = (appState.coils || {})[`${pos.id}_${layer}`];
                    if (!CoilField.hasCoil(item)) continue;
                    records.push({
                        type: 'pyramid',
                        posId: pos.id,
                        position: pos.shortLabel,
                        layer,
                        index: null,
                        item
                    });
                }
            });
            (appState.nonPyramidCoils || []).forEach((item, index) => {
                if (!CoilField.hasCoil(item) || !isCoilActive(item)) return;
                records.push({
                    type: 'nonpyramid',
                    posId: null,
                    position: 'Samping',
                    layer: null,
                    index,
                    item
                });
            });
            return records;
        }

        function renderProductionUsageList(query = '') {
            const list = document.getElementById('production-coil-list');
            if (!list) return;
            const badge = document.getElementById('production-location-badge');
            if (badge) badge.textContent = appState.bayName || 'Lokasi';

            const statusFilter = document.getElementById('production-status-filter')?.value || 'AKTIF';
            const normalizedQuery = normalizeDuplicateValue(query);
            const records = getProductionCoilRecords().filter(record => {
                const item = record.item;
                const status = normalizeCoilStatus(item.status);
                if (statusFilter !== 'ALL' && status !== statusFilter) return false;
                if (!normalizedQuery) return true;
                return [coilDisplayId(item), item.nomor, item.heatNumber, item.grade, item.supplier]
                    .some(value => normalizeDuplicateValue(value).includes(normalizedQuery));
            });

            if (records.length === 0) {
                list.innerHTML = `<div class="p-6 text-center text-xs text-slate-400 italic bg-slate-50 rounded-xl border border-dashed border-slate-200">${normalizedQuery ? 'Coil tidak ditemukan pada lokasi ini.' : 'Tidak ada coil dengan status filter ini.'}</div>`;
                return;
            }

            list.innerHTML = '';
            records.forEach(record => {
                const item = record.item;
                const status = normalizeCoilStatus(item.status);
                const locationText = record.type === 'pyramid'
                    ? `${escapeHTML(record.position)} • Layer ${record.layer}`
                    : `Non-Piramid • No. Urut ${escapeHTML(item.nomor || record.index + 1)}`;
                const card = document.createElement('div');
                card.className = 'p-3 rounded-xl border border-slate-200 bg-slate-50/70 flex items-center justify-between gap-3';
                card.innerHTML = `
                    <div class="min-w-0 flex-1">
                        <div class="flex items-center gap-1.5 flex-wrap">
                            <span class="text-xs font-mono font-extrabold px-2 py-0.5 rounded ${record.type === 'pyramid' ? 'bg-slate-900 text-amber-300' : 'bg-sky-600 text-white'}">${record.type === 'pyramid' ? `L${record.layer}` : 'NP'}</span>
                            <span class="text-sm font-mono font-extrabold text-slate-900 truncate">${escapeHTML(coilDisplayId(item))}</span>
                            <span class="text-[10px] font-bold px-1.5 py-0.5 rounded ${status === 'AKTIF' ? 'bg-emerald-100 text-emerald-700' : status === 'DIPAKAI_PRODUKSI' ? 'bg-rose-100 text-rose-700' : 'bg-slate-200 text-slate-700'}">${escapeHTML(getCoilStatusLabel(status))}</span>
                        </div>
                        <p class="text-[11px] text-slate-600 mt-1">${locationText} • Heat ${escapeHTML(item.heatNumber || '-')} • ${escapeHTML(item.weight || '-')} ${escapeHTML(item.weightUnit || 'kg')}</p>
                        <p class="text-[11px] text-slate-500 mt-0.5 truncate">${escapeHTML(item.supplier || '-')} • ${escapeHTML(item.grade || '-')} • Ø${escapeHTML(item.diameter || '-')}</p>
                    </div>
                    ${status === 'AKTIF' ? `<button type="button" class="shrink-0 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold px-3 py-2 rounded-lg transition" data-production-record="${encodeURIComponent(JSON.stringify(record))}">
                        <i class="fa-solid fa-industry mr-1"></i>Dipakai
                    </button>` : ''}
                `;
                const button = card.querySelector('[data-production-record]');
                if (button) button.addEventListener('click', () => confirmProductionUsage(record));
                list.appendChild(card);
            });
        }

        function confirmProductionUsage(record) {
            const item = record.item;
            const locationText = record.type === 'pyramid'
                ? `Piramid ${record.position}, Layer ${record.layer}`
                : `Non-Piramid No. Urut ${item.nomor || record.index + 1}`;
            const impactText = record.type === 'pyramid'
                ? `Slot piramid akan kosong dan dapat diisi coil lain.`
                : `Data coil tidak akan dihapus.`;
            showConfirmModal(
                'Tandai Coil Dipakai Produksi?',
                `Coil ${coilDisplayId(item)} (${locationText}) akan ditandai DIPAKAI PRODUKSI. ${impactText}`,
                () => {
                    if (record.type === 'pyramid') {
                        markLayerCoilStatus(record.posId, record.layer, 'DIPAKAI_PRODUKSI');
                    } else {
                        markNonPyramidCoilStatus(record.index, 'DIPAKAI_PRODUKSI');
                    }
                    renderProductionUsageList(document.getElementById('production-search-input')?.value || '');
                }
            );
        }

        function handleProductionQrDecoded(decodedText) {
            const input = document.getElementById('production-search-input');
            if (!input) return;
            input.value = decodedText;
            const codeMatch = String(decodedText).match(/Code\s*No\.?\s*:\s*([^\r\n]+)/i);
            const parts = String(decodedText).split('-').map(part => part.trim());
            const candidates = [
                codeMatch ? codeMatch[1].trim() : '',
                parts.length >= 4 ? parts[3] : '',
                getCoilHintFromDecoded(decodedText)
            ].filter(Boolean);

            const records = getProductionCoilRecords();
            const matched = records.find(record => candidates.some(candidate =>
                normalizeDuplicateValue(candidate) === normalizeDuplicateValue(record.item.id) ||
                normalizeDuplicateValue(candidate) === normalizeDuplicateValue(record.item.heatNumber)
            ));
            if (matched) input.value = matched.item.id || matched.item.inventoryRef || '';
            renderProductionUsageList(input.value);
        }

        async function pasteProductionFromClipboard() {
            try {
                if (navigator.clipboard && navigator.clipboard.readText) {
                    const text = await navigator.clipboard.readText();
                    if (text) {
                        handleProductionQrDecoded(text);
                        return;
                    }
                }
            } catch (e) {}
            document.getElementById('production-search-input')?.focus();
            showToast('Tekan & tahan kotak pencarian lalu pilih Tempel', 'info');
        }

        function handleProductionQrPhoto(event) {
            const file = event.target.files && event.target.files[0];
            if (!file) return;
            if (typeof Html5Qrcode === 'undefined') {
                showToast('Library pembaca QR belum siap, gunakan paste teks QR.', 'error');
                event.target.value = '';
                return;
            }
            showToast('Membaca QR dari foto...', 'info');
            const scanner = new Html5Qrcode('qr-file-reader-hidden');
            scanner.scanFile(file, true)
                .then(decodedText => {
                    handleProductionQrDecoded(decodedText);
                    event.target.value = '';
                })
                .catch(() => {
                    showToast('QR tidak terbaca pada foto. Foto lebih dekat & pastikan QR jelas.', 'error');
                    event.target.value = '';
                })
                .finally(() => {
                    try { scanner.clear(); } catch (e) {}
                });
        }

        function renderNonPyramidList() {
            const container = document.getElementById('nonpyramid-list-container');
            const badge = document.getElementById('np-total-badge');
            const tabCount = document.getElementById('nonpyramid-tab-count');
            const items = appState.nonPyramidCoils || [];

            const activeCount = items.filter(item => CoilField.hasCoil(item) && isCoilActive(item)).length;
            if (badge) badge.textContent = `${activeCount} Aktif`;
            if (tabCount) tabCount.textContent = activeCount;
            if (!container) return;

            if (items.length === 0) {
                container.innerHTML = `<div class="p-6 text-center text-xs text-slate-400 italic bg-slate-50 rounded-xl border border-dashed border-slate-200">Belum ada koil non-piramid pada lokasi ini.</div>`;
                return;
            }

            container.innerHTML = '';
            items.forEach((item, idx) => {
                const meta = [
                    item.diameter ? `Ø${escapeHTML(item.diameter)}` : '',
                    item.grade ? escapeHTML(item.grade) : '',
                    item.heatNumber ? `Heat:${escapeHTML(item.heatNumber)}` : '',
                    item.weight ? `${escapeHTML(item.weight)} ${escapeHTML(item.weightUnit || 'kg')}` : '',
                    item.supplier ? escapeHTML(item.supplier) : ''
                ].filter(Boolean).join(' • ');

                const itemPic = item.picName || appState.picName || '';
                const itemShift = item.shift || appState.shift || '';
                const picShiftBadge = (itemPic || itemShift)
                    ? `<span class="text-[10px] font-mono bg-sky-100 text-sky-800 px-1.5 py-0.5 rounded font-semibold">${escapeHTML([itemPic, itemShift].filter(Boolean).join(' • '))}</span>`
                    : '';

                const card = document.createElement('div');
                card.className = 'p-3 rounded-xl border border-slate-200 bg-slate-50/70 hover:bg-sky-50/40 transition flex items-center justify-between gap-2 cursor-pointer';
                card.onclick = () => editNonPyramidItem(idx);
                card.innerHTML = `
                    <div class="min-w-0 flex-1">
                        <div class="flex items-center gap-1.5 flex-wrap">
                            <span class="text-xs font-mono font-extrabold px-2 py-0.5 rounded bg-sky-600 text-white">#${escapeHTML(item.nomor || (idx + 1).toString())}</span>
                            <span class="text-sm font-mono font-extrabold text-slate-900 truncate">${escapeHTML(coilDisplayId(item))}</span>
                            ${picShiftBadge}
                        </div>
                        <p class="text-[11px] text-slate-600 mt-1 truncate">${meta || 'Tanpa keterangan tambahan'}</p>
                    </div>
                    <select onchange="event.stopPropagation(); markNonPyramidCoilStatus(${idx}, this.value)" onclick="event.stopPropagation()"
                        title="Ubah status coil"
                        class="shrink-0 max-w-[118px] bg-slate-100 border border-slate-300 rounded-lg px-1.5 py-1 text-[10px] font-bold text-slate-700">
                        <option value="AKTIF" ${normalizeCoilStatus(item.status) === 'AKTIF' ? 'selected' : ''}>AKTIF</option>
                        <option value="DIPAKAI_PRODUKSI" ${normalizeCoilStatus(item.status) === 'DIPAKAI_PRODUKSI' ? 'selected' : ''}>DIPAKAI PRODUKSI</option>
                        <option value="HILANG" ${normalizeCoilStatus(item.status) === 'HILANG' ? 'selected' : ''}>HILANG</option>
                        <option value="DIHAPUS" ${normalizeCoilStatus(item.status) === 'DIHAPUS' ? 'selected' : ''}>DIHAPUS</option>
                    </select>
                `;
                container.appendChild(card);
            });
        }

        // ==========================================
        // MODE TINJAU PER LAYER & MATRIKS TABEL
        // ==========================================
        function renderLayerOverview() {
            const selector = document.getElementById('view-layer-selector');
            const detailBox = document.getElementById('layer-pyramid-detail');
            const bayLabel = document.getElementById('overview-bay-name');
            if (bayLabel) bayLabel.textContent = appState.bayName;

            if (selector) {
                const prevVal = parseInt(selector.value, 10) || 1;
                selector.innerHTML = '';
                for (let l = 1; l <= appState.totalLayers; l++) {
                    const opt = document.createElement('option');
                    opt.value = l;
                    opt.textContent = `Layer ${l}`;
                    if (l === Math.min(prevVal, appState.totalLayers)) opt.selected = true;
                    selector.appendChild(opt);
                }
            }

            const chosenLayer = selector ? parseInt(selector.value, 10) || 1 : 1;

            if (detailBox) {
                detailBox.innerHTML = '';
                const rowsMap = new Map();
                POSITIONS.forEach(pos => {
                    if (!rowsMap.has(pos.visualRowFromTop)) rowsMap.set(pos.visualRowFromTop, []);
                    rowsMap.get(pos.visualRowFromTop).push(pos);
                });

                Array.from(rowsMap.keys()).sort((a, b) => a - b).forEach(rowKey => {
                    const rowDiv = document.createElement('div');
                    rowDiv.className = 'flex flex-wrap items-center justify-center gap-2.5 sm:gap-3 w-full';
                    rowsMap.get(rowKey).forEach(pos => {
                        const item = appState.coils[`${pos.id}_${chosenLayer}`];
                        const card = document.createElement('div');
                        card.onclick = () => editLayerItem(pos.id, chosenLayer);
                        if (CoilField.hasCoil(item)) {
                            card.className = 'w-28 sm:w-36 p-2.5 rounded-2xl bg-white border-2 border-emerald-500 shadow-sm cursor-pointer hover:scale-105 transition text-center';
                            card.innerHTML = `
                                <div class="text-[10px] font-bold text-emerald-700">#${pos.seq} ${escapeHTML(pos.shortLabel)}</div>
                                <div class="text-xs sm:text-sm font-mono font-extrabold text-slate-900 truncate mt-0.5">${escapeHTML(coilDisplayId(item))}</div>
                                <div class="text-[10px] text-slate-500 truncate mt-0.5">${item.diameter ? `Ø${escapeHTML(item.diameter)} ` : ''}${item.weight ? `${escapeHTML(item.weight)}${escapeHTML(item.weightUnit || 'kg')}` : ''}</div>
                            `;
                        } else {
                            const noCoil = CoilField.isNoCoil(item);
                            card.className = `w-28 sm:w-36 p-2.5 rounded-2xl border cursor-pointer hover:border-amber-400 transition text-center ${noCoil ? 'bg-sky-50 border-sky-300 text-sky-800' : 'bg-white/60 border-dashed border-slate-300 text-slate-500'}`;
                            card.innerHTML = `
                                <div class="text-[10px] font-bold">#${pos.seq} ${escapeHTML(pos.shortLabel)}</div>
                                <div class="text-xs font-semibold mt-1">${noCoil ? 'Tidak ada Coil' : 'Belum diisi'}</div>
                            `;
                        }
                        rowDiv.appendChild(card);
                    });
                    detailBox.appendChild(rowDiv);
                });
            }

            renderMatrixTable();
        }

        function renderMatrixTable() {
            const tbody = document.getElementById('matrix-table-body');
            if (!tbody) return;
            const mobileList = document.getElementById('matrix-mobile-list');
            tbody.innerHTML = '';
            if (mobileList) mobileList.innerHTML = '';

            const appendMobileCard = (item, position, layer, onClick) => {
                if (!mobileList) return;
                const noCoil = CoilField.isNoCoil(item);
                const card = document.createElement('button');
                card.type = 'button';
                card.className = 'w-full min-h-16 p-3 bg-white hover:bg-amber-50/60 text-left flex items-start justify-between gap-3';
                card.onclick = onClick;
                card.innerHTML = `
                    <span class="min-w-0">
                        <span class="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                            <span class="text-[11px] font-bold uppercase text-amber-700">${escapeHTML(layer)}</span>
                            <span class="text-xs font-semibold text-slate-600">${escapeHTML(position)}</span>
                        </span>
                        <span class="block mt-1 text-sm font-mono font-extrabold text-slate-900 break-all">${noCoil ? 'Tidak ada Coil' : escapeHTML(coilDisplayId(item))}</span>
                        ${noCoil ? `<span class="block mt-1 text-xs text-slate-600">${escapeHTML([item.picName, item.shift, item.updatedAt && new Date(item.updatedAt).toLocaleString('id-ID')].filter(Boolean).join(' · '))}</span>` : `
                            <span class="block mt-1 text-xs text-slate-600">Heat ${escapeHTML(item.heatNumber || '-')} · ${item.weight ? `${escapeHTML(item.weight)} ${escapeHTML(item.weightUnit || 'kg')}` : 'Berat -'}</span>
                            <span class="block mt-1 text-xs text-slate-500 break-words">${escapeHTML(item.grade || '-')} · ${escapeHTML(item.supplier || '-')}</span>`}
                    </span>
                    <i class="fa-solid fa-chevron-right mt-1 text-xs text-slate-400 shrink-0"></i>
                `;
                mobileList.appendChild(card);
            };

            let rowCount = 0;
            for (let l = 1; l <= appState.totalLayers; l++) {
                POSITIONS.forEach(pos => {
                    const item = appState.coils[`${pos.id}_${l}`];
                    if (!CoilField.hasSlotData(item)) return;
                    const noCoil = CoilField.isNoCoil(item);
                    rowCount++;
                    const tr = document.createElement('tr');
                    tr.className = 'hover:bg-amber-50/50 cursor-pointer';
                    tr.onclick = () => editLayerItem(pos.id, l);
                    tr.innerHTML = `
                        <td class="p-2.5 font-bold text-amber-700">L${l}</td>
                        <td class="p-2.5 font-sans text-slate-700">${escapeHTML(pos.shortLabel)}</td>
                        <td class="p-2.5 text-slate-600">${escapeHTML(item.nomor || '-')}</td>
                        <td class="p-2.5 font-bold ${noCoil ? 'text-sky-800' : 'text-slate-900'}">${noCoil ? 'Tidak ada Coil' : escapeHTML(coilDisplayId(item))}</td>
                        <td class="p-2.5 text-slate-600">${escapeHTML(item.diameter || '-')}</td>
                        <td class="p-2.5 text-slate-600">${escapeHTML(item.grade || '-')}</td>
                        <td class="p-2.5 text-slate-600">${escapeHTML(item.heatNumber || '-')}</td>
                        <td class="p-2.5 text-slate-700">${item.weight ? `${escapeHTML(item.weight)} ${escapeHTML(item.weightUnit || 'kg')}` : '-'}</td>
                        <td class="p-2.5 font-sans text-slate-600">${escapeHTML(item.supplier || '-')}</td>
                        <td class="p-2.5 font-sans font-semibold text-slate-700">${escapeHTML(item.picName || (!noCoil && appState.picName) || '-')}</td>
                        <td class="p-2.5 font-mono text-sky-700 font-bold">${escapeHTML(item.shift || (!noCoil && appState.shift) || '-')}</td>
                    `;
                    tbody.appendChild(tr);
                    appendMobileCard(item, pos.shortLabel, `Layer ${l}`, () => editLayerItem(pos.id, l));
                });
            }

            (appState.nonPyramidCoils || []).forEach((item, idx) => {
                rowCount++;
                const tr = document.createElement('tr');
                tr.className = 'bg-sky-50/40 hover:bg-sky-50 cursor-pointer';
                tr.onclick = () => { switchMode('nonpyramid'); editNonPyramidItem(idx); };
                tr.innerHTML = `
                    <td class="p-2.5 font-bold text-sky-700">Non-Piramid</td>
                    <td class="p-2.5 font-sans text-slate-700">Samping</td>
                    <td class="p-2.5 text-slate-600">${escapeHTML(item.nomor || (idx + 1).toString())}</td>
                    <td class="p-2.5 font-bold text-slate-900">${escapeHTML(coilDisplayId(item))}</td>
                    <td class="p-2.5 text-slate-600">${escapeHTML(item.diameter || '-')}</td>
                    <td class="p-2.5 text-slate-600">${escapeHTML(item.grade || '-')}</td>
                    <td class="p-2.5 text-slate-600">${escapeHTML(item.heatNumber || '-')}</td>
                    <td class="p-2.5 text-slate-700">${item.weight ? `${escapeHTML(item.weight)} ${escapeHTML(item.weightUnit || 'kg')}` : '-'}</td>
                    <td class="p-2.5 font-sans text-slate-600">${escapeHTML(item.supplier || '-')}</td>
                    <td class="p-2.5 font-sans font-semibold text-slate-700">${escapeHTML(item.picName || appState.picName || '-')}</td>
                    <td class="p-2.5 font-mono text-sky-700 font-bold">${escapeHTML(item.shift || appState.shift || '-')}</td>
                `;
                tbody.appendChild(tr);
                appendMobileCard(item, 'Samping', `Non-Piramid · #${item.nomor || (idx + 1)}`, () => { switchMode('nonpyramid'); editNonPyramidItem(idx); });
            });
            if (rowCount === 0) {
                tbody.innerHTML = '<tr><td colspan="11" class="p-6 text-center font-sans text-slate-400 italic">Belum ada data coil yang diinput pada lokasi ini.</td></tr>';
                if (mobileList) mobileList.innerHTML = '<div class="p-6 text-center text-sm text-slate-500">Belum ada data coil yang diinput pada lokasi ini.</div>';
            }
        }

        function confirmResetAll() {
            showConfirmModal(
                'Reset Data Lokasi Ini?',
                `Semua data coil piramid & non-piramid di lokasi "${appState.bayName}" akan dikosongkan.`,
                () => {
                    appState.coils = {};
                    appState.nonPyramidCoils = [];
                    appState.selectedLayer = 1;
                    saveState();
                    renderAll();
                    showToast(`Data lokasi ${appState.bayName} telah direset`, 'info');
                }
            );
        }

        // ==========================================
        // PARSER QR LABEL (SHAGANG & MASTER STEEL)
        // ==========================================
        function getTargetFieldIds(target = 'pyramid') {
            if (target === 'np') {
                return {
                    qrRaw: 'np-qr-raw-input',
                    id: 'np-id-input',
                    diameter: 'np-diameter-input',
                    grade: 'np-grade-input',
                    weight: 'np-weight-input',
                    unit: 'np-weight-unit',
                    heat: 'np-heat-input',
                    supplier: 'np-supplier-input',
                    helperBox: 'qr-link-helper-np',
                    helperAnchor: 'qr-link-anchor-np',
                    msPasteBox: 'ms-paste-box-np'
                };
            }
            return {
                qrRaw: 'qr-raw-input',
                id: 'coil-id-input',
                diameter: 'coil-diameter-input',
                grade: 'coil-grade-input',
                weight: 'coil-weight-input',
                unit: 'coil-weight-unit',
                heat: 'coil-heat-input',
                supplier: 'coil-supplier-input',
                helperBox: 'qr-link-helper-pyramid',
                helperAnchor: 'qr-link-anchor-pyramid',
                msPasteBox: 'ms-paste-box-pyramid'
            };
        }

        function isMasterSteelUrl(text) {
            try {
                const u = new URL(String(text || '').trim());
                if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
                const host = u.hostname.toLowerCase();
                return host === 'themastersteel.co.id' || host.endsWith('.themastersteel.co.id');
            } catch (e) {
                return false;
            }
        }

        function normalizeDecimalString(raw) {
            let s = String(raw || '').trim();
            if (s.includes(',') && s.includes('.')) s = s.replace(/,/g, '');
            else s = s.replace(',', '.');
            return s;
        }

        function parseWeightAndUnit(raw) {
            const text = String(raw || '').trim();
            const m = text.match(/([\d.,]+)\s*(kg|mts?|tons?|tonnes?)?/i);
            if (!m) return { value: '', unit: 'kg' };
            const rawNum = m[1];
            const unitRaw = (m[2] || '').toLowerCase();
            const unit = /^(mt|mts|ton|tons|tonne|tonnes)$/.test(unitRaw) ? 'mt' : 'kg';
            let num;
            if (rawNum.includes(',') && rawNum.includes('.')) {
                num = rawNum.replace(/,/g, '');
            } else if (rawNum.includes(',')) {
                const segs = rawNum.split(',');
                if (segs.length === 2 && (unit === 'mt' || segs[1].length !== 3)) {
                    num = `${segs[0]}.${segs[1]}`;
                } else {
                    num = rawNum.replace(/,/g, '');
                }
            } else {
                num = rawNum;
            }
            num = num.replace(/[^\d.]/g, '');
            const f = parseFloat(num);
            return { value: isNaN(f) ? '' : String(f), unit };
        }

        function showQrLinkHelper(url, target = 'pyramid') {
            if (!isMasterSteelUrl(url)) {
                hideQrLinkHelper(target);
                return;
            }
            const ids = getTargetFieldIds(target);
            const box = document.getElementById(ids.helperBox);
            const anchor = document.getElementById(ids.helperAnchor);
            if (anchor) anchor.href = url;
            if (box) box.classList.remove('hidden');
        }

        function hideQrLinkHelper(target = 'pyramid') {
            const ids = getTargetFieldIds(target);
            const box = document.getElementById(ids.helperBox);
            if (box) box.classList.add('hidden');
        }

        function markAwaitingExternalCopy(target) {
            awaitingExternalCopyTarget = target;
        }

        async function pasteMasterSteelBox(target = 'pyramid') {
            const ids = getTargetFieldIds(target);
            const box = document.getElementById(ids.msPasteBox);
            try {
                if (navigator.clipboard && navigator.clipboard.readText) {
                    const txt = await navigator.clipboard.readText();
                    if (txt) {
                        if (box) box.value = txt;
                        parseAndFillQrString(txt, true, target);
                        return;
                    }
                }
            } catch (e) {
                // Fallback ke fokus manual
            }
            if (box) {
                box.focus();
                showToast('Tekan & tahan pada kotak teks lalu pilih Tempel (Paste)', 'info');
            }
        }

        function handleQrRawInput(val, target = 'pyramid') {
            const trimmed = (val || '').trim();
            if (isMasterSteelUrl(trimmed) && !trimmed.includes('\n')) {
                showQrLinkHelper(trimmed, target);
                return;
            }
            if (trimmed.includes('\n') || trimmed.split('-').length >= 5) {
                parseAndFillQrString(trimmed, false, target);
            }
        }

        function handleCoilIdSmartScan(val, target = 'pyramid') {
            const trimmed = (val || '').trim();
            if (isMasterSteelUrl(trimmed) && !trimmed.includes('\n')) {
                document.getElementById(getTargetFieldIds(target).id).value = '';
                showQrLinkHelper(trimmed, target);
                showToast('Link Master Steel terdeteksi! Klik "1. Buka Link" lalu tempel hasilnya.', 'info');
                return;
            }
            if (trimmed.includes('\n') || trimmed.split('-').length >= 5) {
                parseAndFillQrString(trimmed, false, target);
            }
        }

        function parseAndFillQrString(rawText, showFeedback = true, target = 'pyramid') {
            if (target === 'pyramid' && document.getElementById('coil-no-coil')?.checked) return false;
            const text = (rawText || '').trim();
            if (!text) {
                if (showFeedback) showToast('Teks QR masih kosong', 'error');
                return false;
            }

            const ids = getTargetFieldIds(target);

            // 1. Cek jika hanya berupa URL Master Steel
            if (isMasterSteelUrl(text) && !text.includes('\n')) {
                showQrLinkHelper(text, target);
                if (showFeedback) showToast('Buka link Master Steel, salin teks halaman, lalu klik Paste.', 'info');
                return true;
            }

            // 2. Cek Format Teks Halaman Master Steel (Multi-baris dengan label Size, Grade, Heat No., Code No., Weight)
            if (/Size\s*:|Grade\s*:|Heat\s*No\.?\s*:|Code\s*No\.?\s*:/i.test(text)) {
                const extractField = (regex) => {
                    const m = text.match(regex);
                    return m ? m[1].trim() : '';
                };

                const sizeRaw = extractField(/Size\s*:\s*([^\r\n]+)/i).replace(/[∅Øø]/g, '').trim();
                const sizeFloat = parseFloat(normalizeDecimalString(sizeRaw));
                const diameterClean = sizeRaw ? (isNaN(sizeFloat) ? sizeRaw : String(sizeFloat)) : '';
                const grade = extractField(/Grade\s*:\s*([^\r\n]+)/i).toUpperCase();
                const heatNo = extractField(/Heat\s*No\.?\s*:\s*([^\r\n]+)/i).toUpperCase();
                const codeNo = extractField(/Code\s*No\.?\s*:\s*([^\r\n]+)/i).toUpperCase();
                const weightRaw = extractField(/Weight\s*:\s*([^\r\n]+)/i);

                let weightNum = '';
                let weightUnit = 'kg';
                if (weightRaw) {
                    const parsedWeight = parseWeightAndUnit(weightRaw);
                    if (parsedWeight.value) {
                        weightNum = parsedWeight.value;
                        weightUnit = parsedWeight.unit;
                    }
                }

                if (codeNo) document.getElementById(ids.id).value = codeNo;
                if (diameterClean) document.getElementById(ids.diameter).value = diameterClean;
                if (grade) document.getElementById(ids.grade).value = grade;
                if (heatNo) document.getElementById(ids.heat).value = heatNo;
                if (weightNum) {
                    document.getElementById(ids.weight).value = weightNum;
                    document.getElementById(ids.unit).value = weightUnit;
                }
                document.getElementById(ids.supplier).value = 'MASTER STEEL';
                hideQrLinkHelper(target);
                if (showFeedback) showToast(`Data Master Steel (${codeNo || 'OK'}) berhasil diisi!`);
                return true;
            }

            // 3. Cek Format Shagang: SHAGANG-SWRH52A-T690004803-008-2.344-5.5-20260906
            const parts = text.split('-').map(p => p.trim());
            if (parts.length >= 6) {
                const supplier = parts[0].toUpperCase();
                const grade = parts[1].toUpperCase();
                const heatNo = parts[2].toUpperCase();
                const coilNo = parts[3].toUpperCase();
                const weightRaw = normalizeDecimalString(parts[4]);
                const diameterRaw = normalizeDecimalString(parts[5]);

                const wFloat = parseFloat(weightRaw);
                const weightUnit = (!isNaN(wFloat) && wFloat < 50) ? 'mt' : 'kg';

                document.getElementById(ids.supplier).value = supplier;
                document.getElementById(ids.grade).value = grade;
                document.getElementById(ids.heat).value = heatNo;
                document.getElementById(ids.id).value = coilNo;
                document.getElementById(ids.weight).value = weightRaw;
                document.getElementById(ids.unit).value = weightUnit;
                document.getElementById(ids.diameter).value = diameterRaw;
                hideQrLinkHelper(target);
                if (showFeedback) showToast(`QR ${supplier} (${coilNo}) berhasil terbaca!`);
                return true;
            }

            // Jika hanya string kode coil biasa
            document.getElementById(ids.id).value = text.toUpperCase();
            if (showFeedback) showToast('Kode dimasukkan ke No. Coil', 'info');
            return true;
        }

        async function pasteFromClipboardToQr(target = 'pyramid') {
            const ids = getTargetFieldIds(target);
            const inp = document.getElementById(ids.qrRaw);
            try {
                if (navigator.clipboard && navigator.clipboard.readText) {
                    const clipText = await navigator.clipboard.readText();
                    if (clipText) {
                        inp.value = clipText;
                        parseAndFillQrString(clipText, true, target);
                        return;
                    }
                }
            } catch (err) {
                // Fallback
            }
            inp.focus();
            showToast('Tekan & tahan kotak QR lalu pilih Tempel (Paste)', 'info');
        }

        // ==========================================
        // SCANNER QR KAMERA & FOTO FILE
        // ==========================================
        function getCoilHintFromDecoded(decodedText) {
            const text = String(decodedText || '');
            const codeMatch = text.match(/Code\s*No\.?\s*:\s*([^\r\n]+)/i);
            if (codeMatch) return codeMatch[1].trim();
            const parts = text.split('-');
            if (parts.length >= 4 && parts[3].trim()) return parts[3].trim();
            return text.slice(0, 18);
        }

        function saveVerifiedQrPhoto(file, decodedText, target = 'pyramid') {
            try {
                const chkId = target === 'np' ? 'np-save-photo-to-gallery' : 'save-photo-to-gallery';
                const saveChk = document.getElementById(chkId);
                if (saveChk && !saveChk.checked) return;

                const cleanLoc = (appState.bayName || 'BAY').replace(/[^a-zA-Z0-9_-]/g, '');
                const coilHint = getCoilHintFromDecoded(decodedText) || 'COIL';
                const cleanCoil = coilHint.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 18);
                const posTag = target === 'np' ? 'NONPIRAMID' : appState.activePosition;
                const fileName = `QR_${cleanLoc}_L${appState.selectedLayer}_${posTag}_${cleanCoil}.jpg`;

                const url = URL.createObjectURL(file);
                const a = document.createElement('a');
                a.href = url;
                a.download = fileName;
                document.body.appendChild(a);
                a.click();
                a.remove();
                setTimeout(() => URL.revokeObjectURL(url), 4000);
            } catch (e) {
                console.warn('Gagal menyimpan salinan foto QR:', e);
            }
        }

        function handleQrPhotoUpload(event, target = 'pyramid') {
            const file = event.target.files && event.target.files[0];
            if (!file) return;
                if (target === 'production') {
                    handleProductionQrPhoto({ target: { files: [file], value: event.target.value } });
                    event.target.value = '';
                    return;
                }

            if (typeof Html5Qrcode === 'undefined') {
                showToast('Library pembaca QR belum siap, coba gunakan tombol Tempel.', 'error');
                event.target.value = '';
                return;
            }

            showToast('Membaca QR dari foto...', 'info');
            const scanner = new Html5Qrcode('qr-file-reader-hidden');
            scanner.scanFile(file, true)
                .then(decodedText => {
                    const ids = getTargetFieldIds(target);
                    document.getElementById(ids.qrRaw).value = decodedText;
                    parseAndFillQrString(decodedText, true, target);
                    // Simpan foto hanya setelah QR berhasil terbaca!
                    saveVerifiedQrPhoto(file, decodedText, target);
                })
                .catch(() => {
                    showToast('QR tidak terbaca pada foto. Foto tidak disimpan, silakan foto lebih dekat & jelas.', 'error');
                })
                .finally(() => {
                    event.target.value = '';
                    try { scanner.clear(); } catch (e) {}
                });
        }

        function openQrScannerModal(target = 'pyramid') {
            activeQrTarget = target;
            if (typeof Html5Qrcode === 'undefined') {
                showToast('Kamera live tidak tersedia, gunakan tombol Foto QR.', 'error');
                return;
            }
            showModalEl('qr-scanner-modal');

            try {
                html5QrScanner = new Html5Qrcode('qr-reader');
                html5QrScanner.start(
                    { facingMode: 'environment' },
                    { fps: 10, qrbox: { width: 220, height: 220 } },
                    (decodedText) => {
                        if (activeQrTarget === 'field') {
                            handleFieldQrDecoded(decodedText);
                            closeQrScannerModal();
                            return;
                        }
                        if (activeQrTarget === 'production') {
                            handleProductionQrDecoded(decodedText);
                            closeQrScannerModal();
                            return;
                        }
                        const ids = getTargetFieldIds(activeQrTarget);
                        document.getElementById(ids.qrRaw).value = decodedText;
                        parseAndFillQrString(decodedText, true, activeQrTarget);
                        closeQrScannerModal();
                    },
                    () => {}
                ).catch(() => {
                    closeQrScannerModal();
                    showToast('Akses kamera live diblokir browser. Gunakan tombol "Foto QR" di sebelahnya!', 'error');
                });
            } catch (e) {
                closeQrScannerModal();
                showToast('Gagal membuka kamera live. Gunakan tombol "Foto QR".', 'error');
            }
        }

        function closeQrScannerModal() {
            hideModalEl('qr-scanner-modal');
            if (html5QrScanner) {
                const scanner = html5QrScanner;
                html5QrScanner = null;
                try {
                    scanner.stop().then(() => scanner.clear()).catch(() => {});
                } catch (e) {}
            }
        }

        // ==========================================
        // EKSPOR LAPORAN WHATSAPP & CSV (EXCEL)
        // ==========================================
        function openExportModal() {
            syncActiveStateToLocation();
            const locCount = Object.keys(appState.locations).length;
            const lbl = document.getElementById('export-all-loc-label');
            if (lbl) lbl.textContent = `Semua Lokasi (${locCount})`;
            updateExportPreview();
            showModalEl('export-modal');
        }

        function closeExportModal() {
            hideModalEl('export-modal');
        }

        function getSelectedExportLocations() {
            syncActiveStateToLocation();
            const scopeEl = document.querySelector('input[name="export-scope"]:checked');
            const scope = scopeEl ? scopeEl.value : 'all';
            if (scope === 'current') {
                return [appState.locations[appState.activeLocationId]];
            }
            return Object.values(appState.locations);
        }

        function buildLocationReportLines(loc) {
            const locPositions = generatePositionsList(loc.stackPattern || '3-2-1').positions;
            let lines = [];
            lines.push(`==============================`);
            lines.push(`*LOKASI / BAY: ${loc.name}*`);
            lines.push(`Susunan: ${loc.stackPattern || '3-2-1'} | Total Layer: ${loc.totalLayers || 5}`);
            lines.push(`==============================`);

            const maxLayer = loc.totalLayers || 5;
            for (let l = 1; l <= maxLayer; l++) {
                lines.push(`\n*LAYER ${l}:*`);
                locPositions.forEach(pos => {
                    const item = (loc.coils || {})[`${pos.id}_${l}`];
                    if (CoilField.isNoCoil(item)) {
                        const details = [item.picName && `Tim:${item.picName}`, item.shift && `Shift:${item.shift}`, item.updatedAt && `Dicatat:${item.updatedAt}`];
                        lines.push(`- ${pos.shortLabel}: ${['Tidak ada Coil', ...details.filter(Boolean)].join(' | ')}`);
                    } else if (CoilField.hasCoil(item) || item?.nomor) {
                        const itemPic = item.picName || loc.picName || appState.picName || '';
                        const itemShift = item.shift || loc.shift || appState.shift || '';
                        const isNoLabel = CoilField.isNoLabel(item);
                        const coilParts = isNoLabel
                            ? ['Coil:NO LABEL', item.inventoryRef ? `Ref:${item.inventoryRef}` : '']
                            : [`Coil:${item.id}`];
                        const details = [
                            item.nomor ? `No:${item.nomor}` : '',
                            ...coilParts,
                            item.diameter ? `Ø${item.diameter}` : '',
                            item.grade ? `Gr:${item.grade}` : '',
                            item.heatNumber ? `Heat:${item.heatNumber}` : '',
                            item.weight ? `${item.weight} ${item.weightUnit || 'kg'}` : '',
                            item.supplier ? `Supp:${item.supplier}` : '',
                            `Status:${getCoilStatusLabel(item.status)}`,
                            itemPic ? `Tim:${itemPic}` : '',
                            itemShift ? `Shift:${itemShift}` : ''
                        ].filter(Boolean).join(' | ');
                        lines.push(`- ${pos.shortLabel}: ${details}`);
                    } else {
                        lines.push(`- ${pos.shortLabel}: (Belum diisi)`);
                    }
                });
            }

            const npItems = (loc.nonPyramidCoils || []).filter(item => isCoilActive(item));
            if (npItems.length > 0) {
                lines.push(`\n*NON-PIRAMID (SAMPING):*`);
                npItems.forEach((item, idx) => {
                    const itemPic = item.picName || loc.picName || appState.picName || '';
                    const itemShift = item.shift || loc.shift || appState.shift || '';
                    const isNoLabel = CoilField.isNoLabel(item);
                    const coilParts = isNoLabel
                        ? ['Coil:NO LABEL', item.inventoryRef ? `Ref:${item.inventoryRef}` : '']
                        : [`Coil:${item.id}`];
                    const details = [
                        `No:${item.nomor || (idx + 1)}`,
                        ...coilParts,
                        item.diameter ? `Ø${item.diameter}` : '',
                        item.grade ? `Gr:${item.grade}` : '',
                        item.heatNumber ? `Heat:${item.heatNumber}` : '',
                        item.weight ? `${item.weight} ${item.weightUnit || 'kg'}` : '',
                        item.supplier ? `Supp:${item.supplier}` : '',
                        `Status:${getCoilStatusLabel(item.status)}`,
                        itemPic ? `Tim:${itemPic}` : '',
                        itemShift ? `Shift:${itemShift}` : ''
                    ].filter(Boolean).join(' | ');
                    lines.push(`- Samping: ${details}`);
                });
            }

            return lines;
        }

        function updateExportPreview() {
            const locs = getSelectedExportLocations();
            const nowStr = new Date().toLocaleString('id-ID');
            let allLines = [
                `*REKAP DATA COILSTACK BY HAN*`,
                `Waktu Cetak: ${nowStr}`
            ];
            locs.forEach(loc => {
                allLines.push('');
                allLines = allLines.concat(buildLocationReportLines(loc));
            });
            if (appState.coilHistory && appState.coilHistory.length > 0) {
                allLines.push('');
                allLines.push(`==============================`);
                allLines.push(`*RIWAYAT COIL KELUAR*`);
                allLines.push(`==============================`);
                appState.coilHistory.forEach(record => {
                    const location = record.type === 'pyramid'
                        ? `${record.position || '-'} | Layer:${record.layer || '-'}`
                        : `Non-Piramid | No.Urut:${record.nomorUrut || record.nomor || '-'}`;
                    allLines.push(`- Coil:${isNoLabelRecord(record) ? 'NO LABEL' : (record.id || '-')}${isNoLabelRecord(record) && record.inventoryRef ? ` | Ref:${record.inventoryRef}` : ''} | Lokasi:${record.locName || '-'} | ${location} | Status:${getCoilStatusLabel(record.status)} | Heat:${record.heatNumber || '-'} | Berat:${record.weight || '-'} ${record.weightUnit || 'kg'} | Supplier:${record.supplier || '-'} | Keluar:${record.exitedAt || record.updatedAt || '-'}`);
                });
            }
            document.getElementById('export-text-preview').value = allLines.join('\n');
        }

        async function copyTextToClipboard(text) {
            try {
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    await navigator.clipboard.writeText(text);
                    return true;
                }
            } catch (e) {
                // Lanjut ke fallback
            }
            try {
                const temp = document.createElement('textarea');
                temp.value = text;
                temp.style.position = 'fixed';
                temp.style.opacity = '0';
                document.body.appendChild(temp);
                temp.select();
                temp.setSelectionRange(0, text.length);
                const ok = document.execCommand('copy');
                temp.remove();
                return ok;
            } catch (e) {
                return false;
            }
        }

        async function copyReportText() {
            const text = document.getElementById('export-text-preview').value;
            const ok = await copyTextToClipboard(text);
            if (ok) {
                showToast('Teks laporan disalin! Siap ditempel ke WhatsApp.');
            } else {
                showToast('Gagal menyalin otomatis, silakan salin manual dari kotak teks.', 'error');
            }
        }

        function csvEscape(val) {
            const s = val === null || val === undefined ? '' : String(val);
            if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
                return `"${s.replace(/"/g, '""')}"`;
            }
            return s;
        }

        function buildInventoryCsv(locs, includeHistory, allLocations) {
            const headers = [
                'Lokasi', 'PIC_Tim', 'Shift', 'Susunan', 'Layer', 'Posisi',
                'Nomor', 'No_Coil', 'Inventory_Ref', 'No_Label', 'Diameter_mm', 'Grade', 'Heat_Number',
                'Berat', 'Satuan_Berat', 'Supplier', 'Status', 'Waktu_Update',
                'Riwayat_Lokasi', 'Riwayat_Jenis', 'Riwayat_Posisi', 'Riwayat_Layer',
                'Riwayat_Waktu_Keluar'
            ];
            const csvRows = [headers.join(',')];
            const coilCsvFields = item => [
                csvEscape(CoilField.isNoLabel(item) ? 'NO LABEL' : (item.id || '')),
                csvEscape(item.inventoryRef || ''),
                csvEscape(CoilField.isNoLabel(item) ? 'TRUE' : '')
            ];

            locs.forEach(loc => {
                const locPositions = generatePositionsList(loc.stackPattern || '3-2-1').positions;
                const maxLayer = loc.totalLayers || 5;

                for (let l = 1; l <= maxLayer; l++) {
                    locPositions.forEach(pos => {
                        const rawItem = (loc.coils || {})[`${pos.id}_${l}`] || {};
                        const noCoil = CoilField.isNoCoil(rawItem);
                        const item = (noCoil || (CoilField.hasCoil(rawItem) && isCoilActive(rawItem))) ? rawItem : {};
                        const hasItem = CoilField.hasCoil(item);
                        const rowPic = hasItem ? (item.picName || loc.picName || appState.picName || '') : noCoil ? item.picName : '';
                        const rowShift = hasItem ? (item.shift || loc.shift || appState.shift || '') : noCoil ? item.shift : '';
                        csvRows.push([
                            csvEscape(loc.name),
                            csvEscape(rowPic),
                            csvEscape(rowShift),
                            csvEscape(loc.stackPattern || '3-2-1'),
                            l,
                            csvEscape(pos.shortLabel),
                            csvEscape(item.nomor || ''),
                            ...coilCsvFields(item),
                            csvEscape(item.diameter || ''),
                            csvEscape(item.grade || ''),
                            csvEscape(item.heatNumber || ''),
                            csvEscape(item.weight || ''),
                            csvEscape(hasItem ? (item.weightUnit || 'kg') : ''),
                            csvEscape(item.supplier || ''),
                            csvEscape(hasItem ? getCoilStatusLabel(item.status) : noCoil ? 'Tidak ada Coil' : ''),
                            csvEscape(item.updatedAt || ''),
                            '', '', '', '', ''
                        ].join(','));
                    });
                }

                (loc.nonPyramidCoils || []).filter(item => CoilField.hasCoil(item) && isCoilActive(item)).forEach((item, idx) => {
                    const rowPic = item.picName || loc.picName || appState.picName || '';
                    const rowShift = item.shift || loc.shift || appState.shift || '';
                    csvRows.push([
                        csvEscape(loc.name),
                        csvEscape(rowPic),
                        csvEscape(rowShift),
                        csvEscape('NON-PIRAMID'),
                        csvEscape('Non-Piramid'),
                        csvEscape('Samping'),
                        csvEscape(item.nomor || (idx + 1).toString()),
                        ...coilCsvFields(item),
                        csvEscape(item.diameter || ''),
                        csvEscape(item.grade || ''),
                        csvEscape(item.heatNumber || ''),
                        csvEscape(item.weight || ''),
                        csvEscape(item.weightUnit || 'kg'),
                        csvEscape(item.supplier || ''),
                        csvEscape(getCoilStatusLabel(item.status)),
                        csvEscape(item.updatedAt || ''),
                        '', '', '', '', ''
                    ].join(','));
                });
            });

            if (includeHistory) {
                const selectedIds = new Set(locs.map(loc => loc.id));
                const selectedNames = new Set(locs.map(loc => normalizeDuplicateValue(loc.name)));
                const seenHistory = new Set();
                const historical = [...(appState.coilHistory || [])];
                for (const loc of locs) {
                    for (const item of loc.nonPyramidCoils || []) {
                        if (!CoilField.hasCoil(item) || !['HILANG', 'DIPAKAI_PRODUKSI'].includes(normalizeCoilStatus(item.status))) continue;
                        historical.push({ ...item, locId: loc.id, locName: loc.name, type: 'nonpyramid', position: 'Samping', exitedAt: item.updatedAt });
                    }
                }
                historical.forEach(record => {
                    const belongsToScope = allLocations || selectedIds.has(record.locId) ||
                        (!record.locId && selectedNames.has(normalizeDuplicateValue(record.locName)));
                    if (!belongsToScope) return;
                    const signature = [
                        record.locId || normalizeDuplicateValue(record.locName),
                        record.type || '', record.position || '', record.layer ?? '',
                        record.inventoryRef || '', normalizeDuplicateValue(record.id),
                        normalizeDuplicateValue(record.heatNumber), normalizeCoilStatus(record.status),
                        record.exitedAt || record.updatedAt || ''
                    ].join('|');
                    if (seenHistory.has(signature)) return;
                    seenHistory.add(signature);
                    csvRows.push([
                        csvEscape(record.locName || ''),
                        csvEscape(record.picName || ''),
                        csvEscape(record.shift || ''),
                        csvEscape(record.type === 'pyramid' ? 'PIRAMID' : 'NON-PIRAMID'),
                        csvEscape(record.layer ?? ''),
                        csvEscape(record.position || ''),
                        csvEscape(record.nomor || record.nomorUrut || ''),
                        ...coilCsvFields(record),
                        csvEscape(record.diameter || ''),
                        csvEscape(record.grade || ''),
                        csvEscape(record.heatNumber || ''),
                        csvEscape(record.weight || ''),
                        csvEscape(record.weightUnit || 'kg'),
                        csvEscape(record.supplier || ''),
                        csvEscape(getCoilStatusLabel(record.status)),
                        csvEscape(record.updatedAt || ''),
                        csvEscape(record.locName || ''),
                        csvEscape(record.type === 'pyramid' ? 'Piramid' : 'Non-Piramid'),
                        csvEscape(record.position || ''),
                        csvEscape(record.layer ?? ''),
                        csvEscape(record.exitedAt || '')
                    ].join(','));
                });
            }

            return '\uFEFF' + csvRows.join('\n');
        }

        function downloadCSV() {
            const includeHistory = document.getElementById('export-include-history').checked;
            const allLocations = document.querySelector('input[name="export-scope"]:checked')?.value !== 'current';
            const csvContent = buildInventoryCsv(getSelectedExportLocations(), includeHistory, allLocations);
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            const dateTag = new Date().toISOString().slice(0, 10);
            a.href = url;
            a.download = `CoilStack_Rekap_${dateTag}.csv`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 4000);
            showToast(includeHistory ? 'File CSV (Excel) dengan riwayat berhasil diunduh!' : 'File CSV (Excel) stok aktif berhasil diunduh!');
        }

        // ==========================================
        // IMPOR & SINKRONISASI MULTI-USER (CSV & WA)
        // ==========================================
        function openImportSyncModal() {
            document.getElementById('import-text-area').value = '';
            showModalEl('import-sync-modal');
        }

        function closeImportSyncModal() {
            hideModalEl('import-sync-modal');
        }

        async function pasteToImportArea() {
            const area = document.getElementById('import-text-area');
            try {
                if (navigator.clipboard && navigator.clipboard.readText) {
                    const txt = await navigator.clipboard.readText();
                    if (txt) {
                        area.value = txt;
                        showToast('Teks berhasil ditempel!', 'info');
                        return;
                    }
                }
            } catch (e) {}
            area.focus();
            showToast('Tekan & tahan kotak teks lalu pilih Tempel (Paste)', 'info');
        }

        function handleImportCsvFile(event) {
            const file = event.target.files && event.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (e) => {
                document.getElementById('import-text-area').value = e.target.result || '';
                showToast(`File "${file.name}" siap disinkronkan!`, 'info');
            };
            reader.readAsText(file);
            event.target.value = '';
        }

        function isDefaultVirginLocation(loc) {
            if (!loc) return false;
            const hasPyramid = Object.values(loc.coils || {}).some(c => CoilField.hasCoil(c));
            const hasNp = (loc.nonPyramidCoils || []).some(c => CoilField.hasCoil(c));
            return !hasPyramid && !hasNp && !loc.picName && (loc.name === 'BAY-A01' || loc.name === 'BAY-01');
        }

        function getOrCreateLocationByName(rawLocName, patternHint, tracker) {
            const cleanName = (rawLocName || '').trim().toUpperCase();
            if (!cleanName) {
                return appState.locations[appState.activeLocationId];
            }
            const existing = Object.values(appState.locations).find(l => l.name.toUpperCase() === cleanName);
            if (existing) {
                if (patternHint && patternHint !== 'NON-PIRAMID' && !existing.stackPattern) {
                    existing.stackPattern = patternHint;
                }
                tracker.touchedLocIds.add(existing.id);
                return existing;
            }

            // Jika hanya ada 1 lokasi bawaan yang masih kosong (mis. BAY-A01), bersihkan agar tidak tertinggal sebagai placeholder
            const locKeys = Object.keys(appState.locations || {});
            if (locKeys.length === 1 && isDefaultVirginLocation(appState.locations[locKeys[0]]) && cleanName !== appState.locations[locKeys[0]].name) {
                delete appState.locations[locKeys[0]];
            }

            const newId = 'loc_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
            const validPattern = (patternHint && patternHint !== 'NON-PIRAMID') ? patternHint : '3-2-1';
            const created = createLocationRecord(newId, cleanName, { stackPattern: validPattern, totalLayers: 1 });
            appState.locations[newId] = created;
            tracker.createdLocCount++;
            tracker.touchedLocIds.add(newId);
            return created;
        }

        function parseCsvRows(text, delimiter = ',') {
            const rows = [];
            let row = [];
            let cur = '';
            let inQuotes = false;
            for (let i = 0; i < text.length; i++) {
                const ch = text[i];
                if (inQuotes) {
                    if (ch === '"') {
                        if (text[i + 1] === '"') {
                            cur += '"';
                            i++;
                        } else {
                            inQuotes = false;
                        }
                    } else {
                        cur += ch;
                    }
                } else if (ch === '"') {
                    inQuotes = true;
                } else if (ch === delimiter) {
                    row.push(cur);
                    cur = '';
                } else if (ch === '\n') {
                    row.push(cur);
                    rows.push(row);
                    row = [];
                    cur = '';
                } else if (ch === '\r') {
                    if (text[i + 1] !== '\n') {
                        row.push(cur);
                        rows.push(row);
                        row = [];
                        cur = '';
                    }
                } else {
                    cur += ch;
                }
            }
            if (cur !== '' || (row.length > 0 && row.some(c => String(c).trim() !== ''))) {
                row.push(cur);
                rows.push(row);
            }
            return rows;
        }

        function detectCsvDelimiter(headerLine) {
            const semicolons = (headerLine.match(/;/g) || []).length;
            const commas = (headerLine.match(/,/g) || []).length;
            const tabs = (headerLine.match(/\t/g) || []).length;
            if (semicolons > commas && semicolons >= tabs) return ';';
            if (tabs > commas && tabs > semicolons) return '\t';
            return ',';
        }

        function importFromCsvText(rawCsv, overwrite) {
            let text = String(rawCsv || '').replace(/^\uFEFF/, '');
            const tracker = { importedCount: 0, markedEmptyCount: 0, skippedCount: 0, hardDuplicateCount: 0, relocatedCount: 0, createdLocCount: 0, touchedLocIds: new Set() };
            const locMaxLayers = {};

            const firstPhysicalLine = text.split(/\r?\n/)[0] || '';
            if (/^sep\s*=\s*[,;\t]/i.test(firstPhysicalLine.trim())) {
                const nl = text.indexOf('\n');
                text = nl >= 0 ? text.slice(nl + 1) : '';
            }

            const headerLine = text.split(/\r?\n/)[0] || '';
            const delimiter = detectCsvDelimiter(headerLine);
            const rows = parseCsvRows(text, delimiter).filter(r => r.some(c => String(c).trim() !== ''));
            if (rows.length < 2) return tracker;

            const headers = rows[0].map(h => h.trim().toLowerCase().replace(/[\s/.-]+/g, '_'));
            const findCol = (...names) => headers.findIndex(h => names.includes(h));

            const idxLoc = findCol('lokasi', 'bay', 'location', 'lokasi_bay', 'nama_lokasi');
            const idxPic = findCol('pic_tim', 'pic', 'tim', 'nama_pic');
            const idxShift = findCol('shift');
            const idxSusunan = findCol('susunan', 'pattern', 'pola');
            const idxLayer = findCol('layer');
            const idxPos = findCol('posisi', 'position', 'pos');
            const idxNomor = findCol('nomor', 'no', 'no_urut');
            const idxCoil = findCol('no_coil', 'coil', 'coil_no', 'kode_coil');
            const idxRef = findCol('inventory_ref', 'inventory_reference', 'ref', 'referensi');
            const idxNoLabel = findCol('no_label', 'tanpa_label');
            const idxDia = findCol('diameter_mm', 'diameter', 'dia', 'size');
            const idxGrade = findCol('grade');
            const idxHeat = findCol('heat_number', 'heat', 'heat_no');
            const idxWeight = findCol('berat', 'weight');
            const idxUnit = findCol('satuan_berat', 'satuan', 'unit');
            const idxSupp = findCol('supplier', 'nama_supplier');
            const idxTime = findCol('waktu_update', 'waktu', 'updated_at');
            const idxStatus = findCol('status', 'status_coil');
            const idxHistory = findCol('riwayat_jenis');
            const idxExitedAt = findCol('riwayat_waktu_keluar');

            for (let r = 1; r < rows.length; r++) {
                const cols = rows[r];
                const rawId = idxCoil >= 0 ? (cols[idxCoil] || '').trim().toUpperCase() : '';
                const nomor = idxNomor >= 0 ? (cols[idxNomor] || '').trim().toUpperCase() : '';
                const rawRef = idxRef >= 0 ? (cols[idxRef] || '').trim() : '';
                const inventoryRef = CoilField.normalizeRef(rawRef);
                const noLabelFlag = idxNoLabel >= 0 && /^(1|true|ya|yes|no\s*label|tanpa\s*label)$/i.test(String(cols[idxNoLabel] || '').trim());
                const isNoLabelRow = !!(rawRef || noLabelFlag);
                const noCoil = normalizeDuplicateValue(cols[idxStatus]) === 'TIDAK ADA COIL';
                const id = isNoLabelRow ? '' : rawId;
                if (!noCoil && !isNoLabelRow && !id && !nomor) continue;
                if (isNoLabelRow && !inventoryRef) {
                    // Jangan mengubah data lama berlabel "0"/"NO LABEL" secara otomatis.
                    tracker.skippedCount++;
                    continue;
                }

                const locName = idxLoc >= 0 ? (cols[idxLoc] || '').trim() : '';
                const patternHint = idxSusunan >= 0 ? (cols[idxSusunan] || '').trim().toUpperCase() : '';
                const rowPic = (idxPic >= 0 && cols[idxPic]?.trim()) ? cols[idxPic].trim() : '';
                const rowShift = (idxShift >= 0 && cols[idxShift]?.trim()) ? cols[idxShift].trim() : '';

                const layerRaw = idxLayer >= 0 ? (cols[idxLayer] || '').trim() : '';
                const posLabelRaw = idxPos >= 0 ? (cols[idxPos] || '').trim() : '';
                const diameter = idxDia >= 0 ? (cols[idxDia] || '').trim() : '';
                const grade = idxGrade >= 0 ? (cols[idxGrade] || '').trim().toUpperCase() : '';
                const heatNumber = isNoLabelRow ? '' : (idxHeat >= 0 ? (cols[idxHeat] || '').trim().toUpperCase() : '');
                const weight = idxWeight >= 0 ? (cols[idxWeight] || '').trim() : '';
                const unitRaw = idxUnit >= 0 ? (cols[idxUnit] || '').trim().toLowerCase() : '';
                const weightUnit = (unitRaw === 'mt' || unitRaw === 'ton') ? 'mt' : 'kg';
                const supplier = idxSupp >= 0 ? (cols[idxSupp] || '').trim() : '';
                const status = idxStatus >= 0 ? normalizeCoilStatus(cols[idxStatus]) : 'AKTIF';
                const updatedAt = (idxTime >= 0 && cols[idxTime]) ? cols[idxTime].trim() : new Date().toLocaleString('id-ID');
                const historyType = cols[idxHistory]?.trim();
                const isNonPyramid = /non[\s-]*piramid/i.test(layerRaw) || /^samping$/i.test(posLabelRaw);
                if (noCoil && (!locName || !/^\d+$/.test(layerRaw) || !posLabelRaw || rawId || isNoLabelRow || historyType || isNonPyramid)) continue;
                if (!noCoil && !validInventoryWeight(weight, isNoLabelRow)) {
                    tracker.skippedCount++;
                    continue;
                }
                if (!noCoil && !isNoLabelRow && (!id || !heatNumber || !supplier)) {
                    tracker.skippedCount++;
                    continue;
                }

                const item = { nomor, id, diameter, grade, heatNumber, weight, weightUnit, supplier, status, picName: rowPic, shift: rowShift, updatedAt,
                    ...(isNoLabelRow ? { noLabel: true, inventoryRef } : {}) };
                if (historyType) {
                    // A historical exit is a snapshot, never an instruction to remove current stock.
                    const bay = Object.values(appState.locations).find(loc => normalizeDuplicateValue(loc.name) === normalizeDuplicateValue(locName));
                    archiveCoilRecord(item, { locId: bay?.id || '', locName, type: /^non/i.test(historyType) ? 'nonpyramid' : 'pyramid',
                        position: posLabelRaw, layer: Number(layerRaw) || null, exitedAt: cols[idxExitedAt]?.trim() });
                    continue;
                }
                const targetLoc = getOrCreateLocationByName(locName, patternHint, tracker);
                if (patternHint && patternHint !== 'NON-PIRAMID' && Object.keys(targetLoc.coils || {}).length === 0) {
                    targetLoc.stackPattern = generatePositionsList(patternHint).normalizedPattern;
                }
                if (isNonPyramid) {
                    storeImportedCoil(targetLoc, item, null, null, overwrite, tracker);
                    continue;
                }

                const layerNum = parseInt(layerRaw.replace(/[^\d]/g, ''), 10);
                if (isNaN(layerNum) || layerNum < 1) continue;
                const locPositions = generatePositionsList(targetLoc.stackPattern || '3-2-1').positions;
                const posObj = locPositions.find(p =>
                    p.shortLabel.toLowerCase() === posLabelRaw.toLowerCase() ||
                    p.id.toLowerCase() === posLabelRaw.toLowerCase() ||
                    p.seq.toString() === posLabelRaw
                );
                if (!posObj) continue;
                locMaxLayers[targetLoc.id] = Math.max(locMaxLayers[targetLoc.id] || 0, layerNum);
                if (noCoil) storeImportedNoCoil(targetLoc, posObj.id, layerNum, { picName: rowPic, shift: rowShift, updatedAt: cols[idxTime]?.trim() || '' }, tracker);
                else storeImportedCoil(targetLoc, item, posObj, layerNum, overwrite, tracker);
            }

            tracker.touchedLocIds.forEach(locId => {
                const loc = appState.locations[locId];
                if (loc && locMaxLayers[locId] && locMaxLayers[locId] > 0) {
                    loc.totalLayers = Math.max(loc.totalLayers, locMaxLayers[locId]);
                }
            });

            return tracker;
        }

        function processImportSync() {
            const rawText = document.getElementById('import-text-area').value.trim();
            if (!rawText) {
                showToast('Silakan pilih file CSV atau tempel teks laporan terlebih dahulu!', 'error');
                return;
            }

            syncActiveStateToLocation();
            const mergeMode = document.querySelector('input[name="merge-mode"]:checked')?.value || 'fill_empty';
            const overwrite = mergeMode === 'overwrite';

            const cleanLines = rawText.replace(/^\uFEFF/, '').split(/\r?\n/).filter(l => l.trim());
            const headerCandidate = /^sep\s*=\s*[,;\t]/i.test(cleanLines[0] || '') ? (cleanLines[1] || '') : (cleanLines[0] || '');
            if (/[,;\t]/.test(headerCandidate) && /no_coil|no\s*coil|lokasi|bay|layer/i.test(headerCandidate)) {
                const res = importFromCsvText(rawText, overwrite);
                if (res.touchedLocIds.size > 0 && !res.touchedLocIds.has(appState.activeLocationId)) {
                    const firstTouchedId = Array.from(res.touchedLocIds)[0];
                    appState.activeLocationId = firstTouchedId;
                }
                loadLocationIntoActiveState(appState.activeLocationId);
                saveState();
                closeImportSyncModal();
                renderAll();
                const locNames = Array.from(res.touchedLocIds).map(id => appState.locations[id]?.name).filter(Boolean).join(', ');
                showToast(`CSV Sinkron (${res.touchedLocIds.size} lokasi: ${locNames || '-'}): ${res.importedCount} coil masuk${res.markedEmptyCount ? `, ${res.markedEmptyCount} slot Tidak ada Coil` : ''}${res.relocatedCount ? `, ${res.relocatedCount} coil dipindahkan mengikuti lokasi terbaru` : ''}, ${res.createdLocCount} lokasi baru${res.hardDuplicateCount ? `, ${res.hardDuplicateCount} duplikasi coil+heat ditolak` : ''}.`);
                return;
            }

            // Parsing format teks laporan WhatsApp
            const lines = rawText.split(/\r?\n/);
            const tracker = { importedCount: 0, markedEmptyCount: 0, skippedCount: 0, hardDuplicateCount: 0, relocatedCount: 0, createdLocCount: 0, touchedLocIds: new Set() };
            let targetLoc = appState.locations[appState.activeLocationId];
            if (!targetLoc) {
                targetLoc = getOrCreateLocationByName(appState.bayName || 'BAY-A01', null, tracker);
            }
            let blockPicName = '';
            let blockShift = '';
            let currentLayer = null;
            let isNonPyramidSection = false;
            let inExitHistory = false;
            const locMaxLayers = {};
            const locExplicitLayers = new Set();

            lines.forEach(line => {
                const trimmed = line.trim();
                if (/^\*?RIWAYAT COIL KELUAR\*?$/i.test(trimmed)) inExitHistory = true;
                if (inExitHistory) return;
                if (!trimmed) return;

                const locMatch = trimmed.match(/^\*?(?:LOKASI\s*(?:\/\s*BAY)?|BAY)\s*:\s*([^*]+)\*?$/i);
                if (locMatch) {
                    targetLoc = getOrCreateLocationByName(locMatch[1], null, tracker);
                    blockPicName = '';
                    blockShift = '';
                    currentLayer = null;
                    isNonPyramidSection = false;
                    return;
                }

                const susunanMatch = trimmed.match(/Susunan\s*:\s*([\d-]+)/i);
                const totalLayerMatch = trimmed.match(/Total\s*Layer\s*:\s*(\d+)/i);
                if ((susunanMatch || totalLayerMatch) && targetLoc) {
                    if (susunanMatch) targetLoc.stackPattern = generatePositionsList(susunanMatch[1]).normalizedPattern;
                    if (totalLayerMatch) {
                        const parsedL = parseInt(totalLayerMatch[1], 10);
                        if (parsedL > 0) {
                            targetLoc.totalLayers = parsedL;
                            locExplicitLayers.add(targetLoc.id);
                        }
                    }
                    return;
                }

                if (/^PIC\s*(?:\/\s*Tim)?\s*:/i.test(trimmed)) {
                    const segs = trimmed.split('|');
                    const picPart = segs[0]?.split(':')[1]?.trim();
                    if (picPart && picPart !== '-') blockPicName = picPart;
                    const shiftSeg = segs.find(s => /Shift\s*:/i.test(s));
                    if (shiftSeg) {
                        const shiftPart = shiftSeg.split(':')[1]?.trim();
                        if (shiftPart) blockShift = shiftPart;
                    }
                    return;
                }

                if (/^\*?NON[\s-]*PIRAMID/i.test(trimmed)) {
                    isNonPyramidSection = true;
                    currentLayer = null;
                    return;
                }

                const layerMatch = trimmed.match(/^\*?LAYER\s+(\d+)\s*:?\*?$/i);
                if (layerMatch) {
                    currentLayer = parseInt(layerMatch[1], 10);
                    isNonPyramidSection = false;
                    if (targetLoc && currentLayer > 0) {
                        locMaxLayers[targetLoc.id] = Math.max(locMaxLayers[targetLoc.id] || 0, currentLayer);
                    }
                    return;
                }

                if (trimmed.startsWith('- ')) {
                    const content = trimmed.slice(2);
                    const colonIdx = content.indexOf(':');
                    if (colonIdx === -1) return;

                    const posLabel = content.slice(0, colonIdx).trim();
                    const detailStr = content.slice(colonIdx + 1).trim();
                    if (!detailStr || /^\((Kosong|Belum diisi)\)$/i.test(detailStr)) return;

                    const parts = detailStr.split('|').map(p => p.trim());
                    const posObj = isNonPyramidSection || !currentLayer ? null : generatePositionsList(targetLoc.stackPattern || '3-2-1').positions.find(p =>
                        p.shortLabel.toLowerCase() === posLabel.toLowerCase() || p.id.toLowerCase() === posLabel.toLowerCase());
                    if (normalizeDuplicateValue(parts[0]) === 'TIDAK ADA COIL') {
                        if (posObj) {
                            const value = prefix => parts.find(part => part.startsWith(prefix))?.slice(prefix.length).trim() || '';
                            storeImportedNoCoil(targetLoc, posObj.id, currentLayer, { picName: value('Tim:'), shift: value('Shift:'), updatedAt: value('Dicatat:') }, tracker);
                        }
                        return;
                    }
                    let nomor = '';
                    let id = '';
                    let diameter = '';
                    let grade = '';
                    let heatNumber = '';
                    let weight = '';
                    let weightUnit = 'kg';
                    let supplier = '';
                    let status = 'AKTIF';
                    let itemPic = blockPicName;
                    let itemShift = blockShift;
                    let inventoryRef = '';
                    let noLabelFlag = false;

                    parts.forEach(part => {
                        if (/^No\s*:/i.test(part)) nomor = part.replace(/^No\s*:/i, '').trim();
                        else if (/^Coil\s*:/i.test(part)) id = part.replace(/^Coil\s*:/i, '').trim();
                        else if (/^(?:Inventory\s*)?Ref(?:erence)?\s*:/i.test(part)) inventoryRef = CoilField.normalizeRef(part.replace(/^(?:Inventory\s*)?Ref(?:erence)?\s*:/i, '').trim());
                        else if (/^(?:No[_ ]?Label|Tanpa\s*Label)\s*:/i.test(part)) noLabelFlag = /^(1|true|ya|yes|no\s*label|tanpa\s*label)$/i.test(part.replace(/^(?:No[_ ]?Label|Tanpa\s*Label)\s*:/i, '').trim());
                        else if (/^Ø/i.test(part)) diameter = part.replace(/^Ø\s*/i, '').trim();
                        else if (/^Gr\s*:/i.test(part)) grade = part.replace(/^Gr\s*:/i, '').trim();
                        else if (/^Heat\s*:/i.test(part)) heatNumber = part.replace(/^Heat\s*:/i, '').trim();
                        else if (/^Supp\s*:/i.test(part)) supplier = part.replace(/^Supp\s*:/i, '').trim();
                        else if (/^Status\s*:/i.test(part)) status = normalizeCoilStatus(part.replace(/^Status\s*:/i, '').trim());
                        else if (/^(?:Tim|PIC)\s*:/i.test(part)) itemPic = part.replace(/^(?:Tim|PIC)\s*:/i, '').trim();
                        else if (/^Shift\s*:/i.test(part)) itemShift = part.replace(/^Shift\s*:/i, '').trim();
                        else if (/^[\d.,]+\s*(kg|mt)$/i.test(part)) {
                            const wMatch = part.match(/^([\d.,]+)\s*(kg|mt)$/i);
                            if (wMatch) {
                                weight = wMatch[1];
                                weightUnit = wMatch[2].toLowerCase();
                            }
                        }
                    });

                    const isNoLabelRow = !!(inventoryRef || noLabelFlag || parts.some(part => /^Ref\s*:/i.test(part)));
                    if (isNoLabelRow) {
                        if (!inventoryRef) {
                            // Jangan mengubah teks lama "NO LABEL"/"0" tanpa referensi secara otomatis.
                            tracker.skippedCount++;
                            return;
                        }
                        id = '';
                        heatNumber = '';
                    } else {
                        id = id.toUpperCase();
                        heatNumber = heatNumber.toUpperCase();
                    }

                    if (!validInventoryWeight(weight, isNoLabelRow)) {
                        tracker.skippedCount++;
                        return;
                    }
                    if (!isNoLabelRow && (!id || !heatNumber || !supplier)) {
                        tracker.skippedCount++;
                        return;
                    }

                    const item = { nomor, id, diameter, grade, heatNumber, weight, weightUnit, supplier, status, picName: itemPic, shift: itemShift,
                        updatedAt: new Date().toLocaleString('id-ID'), ...(isNoLabelRow ? { noLabel: true, inventoryRef } : {}) };
                    if (isNonPyramidSection) {
                        storeImportedCoil(targetLoc, item, null, null, overwrite, tracker);
                        return;
                    }

                    if (!posObj) return;

                    storeImportedCoil(targetLoc, item, posObj, currentLayer, overwrite, tracker);
                }
            });

            tracker.touchedLocIds.forEach(locId => {
                const loc = appState.locations[locId];
                if (loc && !locExplicitLayers.has(locId) && locMaxLayers[locId] && locMaxLayers[locId] > 0) {
                    loc.totalLayers = locMaxLayers[locId];
                }
            });

            if (tracker.touchedLocIds.size > 0 && !tracker.touchedLocIds.has(appState.activeLocationId)) {
                appState.activeLocationId = Array.from(tracker.touchedLocIds)[0];
            }
            loadLocationIntoActiveState(appState.activeLocationId);
            saveState();
            closeImportSyncModal();
            renderAll();
            showToast(`Sinkronisasi selesai: ${tracker.importedCount} coil masuk${tracker.markedEmptyCount ? `, ${tracker.markedEmptyCount} slot Tidak ada Coil` : ''}${tracker.relocatedCount ? `, ${tracker.relocatedCount} coil dipindahkan mengikuti lokasi terbaru` : ''}, ${tracker.createdLocCount} lokasi baru dibuat${tracker.hardDuplicateCount ? `, ${tracker.hardDuplicateCount} duplikasi coil+heat ditolak` : ''}.`);
        }

        // ==========================================
        // RENDER UTAMA & INISIALISASI
        // ==========================================
        function updateGlobalProgress() {
            const totalSlots = POSITIONS.length * (appState.totalLayers || 5);
            let filled = 0;
            for (let l = 1; l <= appState.totalLayers; l++) {
                POSITIONS.forEach(pos => {
                    const item = appState.coils[`${pos.id}_${l}`];
                    if (CoilField.hasSlotData(item)) filled++;
                });
            }
            const npCount = (appState.nonPyramidCoils || []).length;
            const badge = document.getElementById('progress-badge');
            if (badge) badge.textContent = `${filled} / ${totalSlots}${npCount > 0 ? ` • +${npCount} NP` : ''}`;

            const meter = document.getElementById('progress-meter');
            if (meter) meter.style.width = `${totalSlots ? Math.min(100, (filled / totalSlots) * 100) : 0}%`;

            const context = document.getElementById('progress-context');
            if (context) context.textContent = `${POSITIONS.length} slot/layer × ${appState.totalLayers || 1} layer`;

            const layerDisp = document.getElementById('total-layers-display');
            if (layerDisp) layerDisp.textContent = appState.totalLayers;
        }

        function renderAll() {
            renderLocationSelector();
            syncPicShiftUI();
            syncPatternDropdownUI();
            updateGlobalProgress();
            renderNonPyramidList();

            if (currentMode === 'layer') {
                renderLayerOverview();
            } else if (currentMode === 'nonpyramid') {
                prepareNonPyramidFormDefaults();
            } else if (currentMode === 'production') {
                renderProductionUsageList(document.getElementById('production-search-input')?.value || '');
            } else if (currentMode === 'field') {
                renderFieldWorkflows();
            } else {
                renderCrawlView();
            }
        }

        function observeStickyHeaderHeight() {
            const header = document.getElementById('app-header');
            if (!header || typeof ResizeObserver === 'undefined') return;
            const updateOffset = () => document.documentElement.style.setProperty('--app-header-height', `${header.getBoundingClientRect().height}px`);
            new ResizeObserver(updateOffset).observe(header);
            updateOffset();
        }

        function initApp() {
            observeStickyHeaderHeight();
            try {
                const raw = localStorage.getItem(STORAGE_KEY);
                if (raw) {
                    const parsed = JSON.parse(raw);
                    if (parsed && typeof parsed === 'object') {
                        appState = { ...appState, ...parsed };
                        // BUG-03 fix: migrate old single-location schema (coils at top level, no locations)
                        if (appState.coils && Object.keys(appState.coils).length > 0 &&
                            (!appState.locations || Object.keys(appState.locations).length === 0)) {
                            const migratedLoc = createLocationRecord('loc_1', appState.bayName || 'BAY-A01', {
                                picName: appState.picName || '',
                                shift: appState.shift || detectCurrentShiftByTime(),
                                stackPattern: appState.stackPattern || '3-2-1',
                                totalLayers: appState.totalLayers || 2,
                                activePosition: appState.activePosition || 'ATAS',
                                selectedLayer: appState.selectedLayer || 1,
                                crawlDirection: appState.crawlDirection || 'asc',
                                coils: appState.coils || {},
                                nonPyramidCoils: appState.nonPyramidCoils || []
                            });
                            appState.locations = { loc_1: migratedLoc };
                            appState.activeLocationId = 'loc_1';
                            console.info('CoilStack: Migrasi data format lama berhasil.');
                        }
                    }
                }
            } catch (e) {
                console.warn('Memulai dengan state awal:', e);
            }

            if (!appState.locations || Object.keys(appState.locations).length === 0) {
                const defaultLoc = createLocationRecord('loc_1', appState.bayName || 'BAY-A01', {
                    picName: appState.picName || '',
                    shift: appState.shift || detectCurrentShiftByTime(),
                    stackPattern: appState.stackPattern || '3-2-1',
                    totalLayers: appState.totalLayers || 2,
                    activePosition: appState.activePosition || 'ATAS',
                    selectedLayer: appState.selectedLayer || 1,
                    crawlDirection: appState.crawlDirection || 'asc',
                    coils: appState.coils || {},
                    nonPyramidCoils: appState.nonPyramidCoils || []
                });
                appState.locations = { loc_1: defaultLoc };
                appState.activeLocationId = 'loc_1';
            }

            if (!appState.locations[appState.activeLocationId]) {
                appState.activeLocationId = Object.keys(appState.locations)[0];
            }

            loadLocationIntoActiveState(appState.activeLocationId);
            initFieldWorkflows();
            saveState();
            renderAll();

            // Auto-capture clipboard saat user kembali dari membuka link Master Steel
            window.addEventListener('focus', async () => {
                if (!awaitingExternalCopyTarget) return;
                const target = awaitingExternalCopyTarget;
                awaitingExternalCopyTarget = null;
                try {
                    if (navigator.clipboard && navigator.clipboard.readText) {
                        const txt = await navigator.clipboard.readText();
                        if (txt && /Size\s*:|Grade\s*:|Heat\s*No/i.test(txt)) {
                            parseAndFillQrString(txt, true, target);
                        }
                    }
                } catch (e) {}
            });
        }

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', initApp);
        } else {
            initApp();
        }

        document.addEventListener('fullscreenchange', () => {
            if (!document.fullscreenElement) {
                const modal = document.getElementById('position-fullscreen-modal');
                if (modal && !modal.classList.contains('hidden')) {
                    hideModalEl('position-fullscreen-modal');
                }
            }
        });
