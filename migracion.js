class MigrationSimulator {
    constructor() {
        this.timeSlots = [
            { start: '07:16', end: '08:00' }, { start: '08:01', end: '08:45' }, { start: '08:46', end: '09:30' },
            { start: '09:31', end: '10:15' }, { start: '10:16', end: '11:00' }, { start: '11:01', end: '11:45' },
            { start: '11:46', end: '12:30' }, { start: '12:31', end: '13:15' }, { start: '13:16', end: '14:00' },
            { start: '14:01', end: '14:45' }, { start: '14:46', end: '15:30' }, { start: '15:31', end: '16:15' },
            { start: '16:16', end: '17:00' }, { start: '17:01', end: '17:45' }, { start: '17:46', end: '18:30' },
            { start: '18:31', end: '19:15' }, { start: '19:16', end: '20:00' }, { start: '20:01', end: '20:45' },
            { start: '20:46', end: '21:30' }, { start: '21:31', end: '22:15' }, { start: '22:16', end: '23:00' }
        ];
        this.aulas = [];
        this.ofertas = [];
        this.sourceAula = null;
        this.sourceBlocks = [];
        this.activeBlockId = null;
        this.virtualMigrations = new Map(); // blockId -> { courseName, destAula, destNombre, slots }
        this.simulatedAulas = new Set(); // store simulated source aula codes
        this.isSessionActive = false;

        this.initTheme();
        this.init();
    }

    initTheme() {
        const theme = localStorage.getItem('theme') || 'dark';
        if (theme === 'light') {
            document.documentElement.classList.add('light-mode');
            document.querySelector('.theme-icon').textContent = '☀️';
        }
    }

    toggleTheme() {
        const isLight = document.documentElement.classList.toggle('light-mode');
        localStorage.setItem('theme', isLight ? 'light' : 'dark');
        document.querySelector('.theme-icon').textContent = isLight ? '☀️' : '🌙';
    }

    async init() {
        try {
            const [aulasRes, ofertasRes] = await Promise.all([
                fetch('/api/migracion/aulas'),
                fetch('/api/migracion/ofertas')
            ]);
            this.aulas = await aulasRes.json();
            this.ofertas = await ofertasRes.json();

            this.populatePabellonFilters();
            this.renderGrid();
            this.setupEventListeners();
        } catch (error) {
            console.error('Error fetching migration data:', error);
            Swal.fire('Error', 'No se pudo conectar con el servidor', 'error');
        }
    }

    populatePabellonFilters() {
        const uniquePabellones = new Map();
        this.aulas.forEach(a => {
            if (!uniquePabellones.has(a.CodigoPabellon)) {
                uniquePabellones.set(a.CodigoPabellon, { id: a.CodigoPabellon, name: a.NombrePabellon, campusId: a.CodigoCampus });
            }
        });

        const sorted = Array.from(uniquePabellones.values()).sort((a, b) => a.name.localeCompare(b.name));

        const incContainer = document.getElementById('filter-include-container');
        const excContainer = document.getElementById('filter-exclude-container');
        if (!incContainer || !excContainer) return;

        incContainer.innerHTML = '';
        excContainer.innerHTML = '';

        sorted.forEach(p => {
            const campusStr = p.campusId == 14 ? 'Central' : p.campusId == 13 ? 'Balta' : `Campus ${p.campusId}`;

            const incLabel = document.createElement('label');
            incLabel.className = 'checkbox-label';
            incLabel.style.display = 'block';
            incLabel.style.marginBottom = '2px';
            incLabel.innerHTML = `<input type="checkbox" value="${p.id}"> <span style="font-size:0.85em">${p.name} (${campusStr})</span>`;
            incContainer.appendChild(incLabel);

            const excLabel = document.createElement('label');
            excLabel.className = 'checkbox-label';
            excLabel.style.display = 'block';
            excLabel.style.marginBottom = '2px';
            excLabel.innerHTML = `<input type="checkbox" value="${p.id}"> <span style="font-size:0.85em">${p.name} (${campusStr})</span>`;
            excContainer.appendChild(excLabel);
        });

        const cbs = document.querySelectorAll('#filter-include-container input, #filter-exclude-container input');
        cbs.forEach(cb => cb.addEventListener('change', () => this.calculateSuggestions()));
    }

    getDayName(num) {
        const names = ['', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
        return names[num] || 'Desconocido';
    }

    getDayNumber(code) {
        const mapping = { 'LU': 1, 'MA': 2, 'MI': 3, 'JU': 4, 'VI': 5, 'SA': 6 };
        return mapping[code] || parseInt(code);
    }

    getSlotsForSession(start, end) {
        return this.timeSlots.filter(s => s.start >= start && s.start < end);
    }

    getCourseHash(name) {
        let hash = 0;
        for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
        return Math.abs(hash) % 8 + 1; // 1 to 8
    }

    setupEventListeners() {
        document.getElementById('theme-toggle').addEventListener('click', () => this.toggleTheme());
        document.getElementById('load-source-aula').addEventListener('click', () => {
            const aula = document.getElementById('source-aula').value.trim();
            if (aula) this.loadSourceAula(aula);
            else Swal.fire('Error', 'Ingrese código de aula', 'warning');
        });

        const inputsToTriggerFilter = ['filter-inc-aulas', 'filter-exc-aulas', 'migrar-entera'];
        inputsToTriggerFilter.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener('change', () => this.calculateSuggestions());
                if (el.type === 'text') el.addEventListener('keyup', () => this.calculateSuggestions()); // for text inputs
            }
        });

        document.getElementById('toggle-filters').addEventListener('click', () => {
            const el = document.getElementById('filter-group-content');
            el.style.display = el.style.display === 'none' ? 'block' : 'none';
        });

        const toggleSug = document.getElementById('toggle-sugerencias');
        if (toggleSug) toggleSug.addEventListener('click', () => {
            const el = document.getElementById('suggestions-list');
            el.style.display = el.style.display === 'none' ? 'block' : 'none';
        });

        const autoMigrateBtn = document.getElementById('btn-auto-migrate');
        if (autoMigrateBtn) {
            autoMigrateBtn.addEventListener('click', () => this.autoMigrate());
        }

        const exportBtn = document.getElementById('btn-export-migrations');
        if (exportBtn) {
            exportBtn.style.display = 'inline-block';
            exportBtn.addEventListener('click', () => this.exportCsv(false));
        }

        const exportCurrentBtn = document.getElementById('btn-export-current');
        if (exportCurrentBtn) {
            exportCurrentBtn.style.display = 'inline-block';
            exportCurrentBtn.addEventListener('click', () => this.exportCsv(true));
        }

        document.getElementById('agrupar-bloques').addEventListener('change', () => {
            if (this.sourceAula) this.loadSourceAula(this.sourceAula);
        });

        document.getElementById('btn-start-session').addEventListener('click', () => {
            this.isSessionActive = true;
            document.getElementById('btn-start-session').style.display = 'none';
            document.getElementById('btn-stop-session').style.display = 'block';
            document.getElementById('session-stats').style.display = 'flex';
        });

        document.getElementById('btn-stop-session').addEventListener('click', () => {
            this.isSessionActive = false;
            this.virtualMigrations.clear();
            this.simulatedAulas.clear();
            this.updateSessionUI();
            this.sourceBlocks = [];
            this.renderSourceBlocks();
            this.calculateSuggestions();
            document.getElementById('btn-stop-session').style.display = 'none';
            document.getElementById('session-stats').style.display = 'none';
            document.getElementById('btn-start-session').style.display = 'block';
        });

        document.getElementById('session-history').addEventListener('change', (e) => {
            if (e.target.value) {
                document.getElementById('source-aula').value = e.target.value;
                this.loadSourceAula(e.target.value);
            }
        });

        document.getElementById('btn-remove-aula-mem').addEventListener('click', () => {
            if (!this.sourceAula) return;
            // Remove all virtual migrations mapped to this source
            const blocksToRemove = this.sourceBlocks.map(b => b.id);
            blocksToRemove.forEach(id => this.virtualMigrations.delete(id));
            this.simulatedAulas.delete(this.sourceAula);
            this.updateSessionUI();
            this.renderSourceBlocks();
            this.calculateSuggestions();
            Swal.fire({ toast: true, position: 'top-end', showConfirmButton: false, timer: 2000, icon: 'success', title: 'Aula removida de memoria' });
        });

        document.getElementById('btn-export-session').addEventListener('click', () => this.exportSessionJson());
        document.getElementById('btn-import-session').addEventListener('click', () => document.getElementById('import-json-file').click());
        document.getElementById('import-json-file').addEventListener('change', (e) => this.importSessionJson(e));
    }

    loadSourceAula(aulaCode) {
        const schedule = this.ofertas.filter(o => o.CodigoAula && o.CodigoAula.toString() === aulaCode);

        if (schedule.length === 0) {
            Swal.fire('Sin registros', 'El aula indicada no tiene cursos programados o no existe.', 'info');
            this.updateStats(0, 0);
            this.sourceBlocks = [];
            this.renderSourceBlocks();
            this.calculateSuggestions();
            return;
        }

        this.sourceAula = aulaCode;
        const isGrouping = document.getElementById('agrupar-bloques') && document.getElementById('agrupar-bloques').checked;

        // Step 1: Divide into atomic time slots for processing
        const allSlots = [];
        schedule.forEach(o => {
            const localSlots = this.getSlotsForSession(o.HORAINICIO, o.HORAFIN);
            const day = this.getDayNumber(o.CODIGODIA);

            // Refined grouping key: ignore detailed suffixes to group same-type sessions (e.g. TEO 1 and TEO 2)
            // We use package if available, else prefix + type
            const gKey = isGrouping ?
                (o.ABREVIATURAPAQUETEEVENTOS || o.CLAVEEVENTO.toString()) :
                o.CONSECUTIVOOFERTA.toString();

            localSlots.forEach(ls => {
                allSlots.push({
                    day,
                    start: ls.start,
                    end: ls.end,
                    oferta: o,
                    groupKey: gKey
                });
            });
        });

        // Sort by day then time
        allSlots.sort((a, b) => (a.day - b.day) || a.start.localeCompare(b.start));

        this.sourceBlocks = [];
        let currentBlock = null;

        allSlots.forEach(slot => {
            if (!currentBlock) {
                currentBlock = {
                    key: slot.groupKey,
                    day: slot.day,
                    slots: [slot],
                    ofertas: [slot.oferta]
                };
            } else {
                const prevSlot = currentBlock.slots[currentBlock.slots.length - 1];
                const diffIndex = this.timeSlots.findIndex(s => s.start === slot.start) - this.timeSlots.findIndex(s => s.start === prevSlot.start);

                // If same group, same day, and consecutive time slot
                if (slot.groupKey === currentBlock.key && slot.day === currentBlock.day && diffIndex === 1) {
                    currentBlock.slots.push(slot);
                    if (!currentBlock.ofertas.includes(slot.oferta)) currentBlock.ofertas.push(slot.oferta);
                } else {
                    // Save finished block
                    this.sourceBlockPush(currentBlock);
                    // Start new block
                    currentBlock = {
                        key: slot.groupKey,
                        day: slot.day,
                        slots: [slot],
                        ofertas: [slot.oferta]
                    };
                }
            }
        });
        if (currentBlock) this.sourceBlockPush(currentBlock);

        const autoBtn = document.getElementById('btn-auto-migrate');
        if (autoBtn && this.sourceBlocks.length > 0) autoBtn.style.display = 'inline-block';
        else if (autoBtn) autoBtn.style.display = 'none';

        if (this.sourceBlocks.length > 0) {
            this.activeBlockId = this.sourceBlocks[0].id;
        }

        let totalSlotsProcessed = 0;
        this.sourceBlocks.forEach(b => totalSlotsProcessed += b.slots.length);
        const totalHours = (totalSlotsProcessed * 0.75).toFixed(1);

        this.updateStats('-', totalHours);
        this.activeBlockId = null;
        this.renderSourceBlocks();
        this.calculateSuggestions();
    }

    sourceBlockPush(blockData) {
        let maxCap = 0;
        blockData.ofertas.forEach(o => { if (o.CapacidadNecesaria > maxCap) maxCap = o.CapacidadNecesaria; });

        // Name: uniquely concatenate distinctive offers
        const namesSet = new Set(blockData.ofertas.map(o => o.ABREVIATURAEVENTO).filter(x => x));
        const namesStr = Array.from(namesSet).join('|') || 'Sin Código';

        this.sourceBlocks.push({
            id: `b_${blockData.key}_${blockData.day}_${blockData.slots[0].start.replace(':', '')}`,
            name: namesStr,
            fullCourseNames: Array.from(new Set(blockData.ofertas.map(o => o.NombreCurso).filter(x => x))),
            docentes: Array.from(new Set(blockData.ofertas.map(o => o.Docente).filter(x => x))),
            sourceAulaCap: blockData.ofertas[0].CapacidadAula || '?',
            ofertas: blockData.ofertas,
            slots: blockData.slots,
            maxCap: maxCap,
            dayNum: blockData.day,
            colorClass: `plan-${this.getCourseHash(namesStr)}`
        });
    }

    updateStats(reqCap, hours) {
        document.getElementById('required-capacity').textContent = reqCap;
        document.getElementById('total-hours').textContent = `${hours} h`;
    }

    renderGrid() {
        const grid = document.getElementById('schedule-grid');
        while (grid.children.length > 7) grid.removeChild(grid.lastChild);

        this.timeSlots.forEach(slot => {
            const timeLabel = document.createElement('div');
            timeLabel.className = 'time-cell';
            timeLabel.style.whiteSpace = 'nowrap';
            timeLabel.textContent = `${slot.start} - ${slot.end}`;
            grid.appendChild(timeLabel);

            for (let day = 1; day <= 6; day++) {
                const cell = document.createElement('div');
                cell.className = 'slot-cell';
                cell.dataset.day = day;
                cell.dataset.time = slot.start;
                grid.appendChild(cell);
            }
        });
    }

    renderSourceBlocks() {
        document.querySelectorAll('.schedule-block').forEach(el => el.remove());

        this.sourceBlocks.forEach(b => {
            if (b.slots.length === 0) return;
            const firstCell = document.querySelector(`.slot-cell[data-day="${b.dayNum}"][data-time="${b.slots[0].start}"]`);
            if (!firstCell) return;

            const block = document.createElement('div');
            block.className = `assigned-block ${b.colorClass}`;
            if (this.activeBlockId === b.id) block.classList.add('selected-block');

            const isMigrated = this.virtualMigrations.has(b.id);

            // Height spans N consecutive slots (each slot is 75px + 1px gap)
            // Subtracting 4px to account for top:2px and bottom:2px gap to avoid overlap
            const slotCount = b.slots.length;
            block.style.top = '2px';
            block.style.left = '2px';
            block.style.right = '2px';
            block.style.height = `calc(${slotCount * 100}% + ${(slotCount - 1)}px - 4px)`;
            block.style.zIndex = '2';
            block.style.overflow = 'hidden';

            // Optimization-like cleaner styling
            block.style.background = isMigrated ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255, 255, 255, 0.05)';
            block.style.border = 'none';
            block.style.borderLeft = isMigrated ? '4px solid var(--success-color)' : '4px solid var(--primary)';
            block.style.padding = '4px 6px';
            block.style.display = 'flex';
            block.style.flexDirection = 'column';
            block.style.justifyContent = 'flex-start';
            block.style.alignItems = 'flex-start';
            block.style.color = isMigrated ? 'var(--success-color)' : 'var(--text-main)';
            block.style.boxShadow = '0 2px 4px rgba(0,0,0,0.3)';

            if (isMigrated) block.style.opacity = '0.7';

            const timeRange = `${b.slots[0].start} - ${b.slots[b.slots.length - 1].end}`;
            const destLabel = isMigrated ? `<div style="font-size:0.55rem; color:var(--success-color); font-weight:700; border-top:1px solid rgba(255,255,255,0.1); width:100%; margin-top:2px; padding-top:2px;">→ ${this.virtualMigrations.get(b.id).destNombre}</div>` : '';

            block.innerHTML = `
                <div class="block-title" style="font-size:0.65rem; line-height:1.2; font-weight:700; margin-bottom:2px;">${b.name}</div>
                <div class="block-sub" style="font-size:0.55rem; opacity:0.8;">${timeRange}${destLabel}</div>
            `;

            block.addEventListener('click', () => {
                if (isMigrated) {
                    Swal.fire({
                        title: 'Deshacer Migración',
                        text: `Este bloque ya está migrado. ¿Deseas deshacer la reubicación?`,
                        icon: 'question',
                        showCancelButton: true,
                        confirmButtonText: 'Sí, deshacer'
                    }).then((result) => {
                        if (result.isConfirmed) {
                            this.virtualMigrations.delete(b.id);
                            this.renderSourceBlocks();
                            this.calculateSuggestions();
                        }
                    });
                    return;
                }

                this.activeBlockId = b.id;
                this.renderSourceBlocks(); // visually update selection
                this.updateStats(b.maxCap, (b.slots.length * 0.75).toFixed(1));
                this.calculateSuggestions();
            });

            firstCell.appendChild(block);
        });
    }

    calculateSuggestions() {
        const suggestionsList = document.getElementById('suggestions-list');
        const countBadge = document.getElementById('suggestions-count');

        if (!this.activeBlockId) {
            suggestionsList.innerHTML = '<div style="padding: 1rem; text-align: center; color: var(--text-secondary); font-size: 0.9em;">Seleccione un bloque del horario haciendo clic sobre él para ver aulas destino.</div>';
            countBadge.textContent = '0';
            return;
        }

        const activeBlock = this.sourceBlocks.find(b => b.id === this.activeBlockId);

        const isMigrarEntera = document.getElementById('migrar-entera') && document.getElementById('migrar-entera').checked;
        let requiredCap = 0;
        let reqSlots = [];

        if (isMigrarEntera) {
            this.sourceBlocks.forEach(b => {
                if (b.maxCap > requiredCap) requiredCap = b.maxCap;
                b.slots.forEach(s => reqSlots.push(`${s.day}-${s.start}`));
            });
        } else {
            requiredCap = activeBlock.maxCap;
            reqSlots = activeBlock.slots.map(s => `${s.day}-${s.start}`);
        }

        const incNodes = document.querySelectorAll('#filter-include-container input:checked');
        const excNodes = document.querySelectorAll('#filter-exclude-container input:checked');
        const includedPabs = Array.from(incNodes).map(o => o.value);
        const excludedPabs = Array.from(excNodes).map(o => o.value);

        const textIncAulas = document.getElementById('filter-inc-aulas') ? document.getElementById('filter-inc-aulas').value : '';
        const textExcAulas = document.getElementById('filter-exc-aulas') ? document.getElementById('filter-exc-aulas').value : '';
        const allowedAulas = textIncAulas.split(',').map(s => s.trim()).filter(s => s);
        const deniedAulas = textExcAulas.split(',').map(s => s.trim()).filter(s => s);

        const validAulas = [];
        this.aulas.forEach(aula => {
            const aulaStr = aula.CodigoAula.toString();
            // Same aula filter
            if (aulaStr === this.sourceAula) return;
            // Explicit Aula codes Include/Exclude
            if (allowedAulas.length > 0 && !allowedAulas.includes(aulaStr)) return;
            if (deniedAulas.length > 0 && deniedAulas.includes(aulaStr)) return;
            // Pavilion filters
            if (includedPabs.length > 0 && !includedPabs.includes(aula.CodigoPabellon.toString())) return;
            if (excludedPabs.length > 0 && excludedPabs.includes(aula.CodigoPabellon.toString())) return;
            // Capacity filter
            if (aula.Capacidad < requiredCap) return;

            // Check availability against actual db offers
            const destOffers = this.ofertas.filter(o => o.CodigoAula && o.CodigoAula === aula.CodigoAula);
            let hasOverlap = false;

            for (const o of destOffers) {
                const destDayNum = this.getDayNumber(o.CODIGODIA);
                const ds = this.getSlotsForSession(o.HORAINICIO, o.HORAFIN);
                for (const d of ds) {
                    if (reqSlots.includes(`${destDayNum}-${d.start}`)) {
                        hasOverlap = true;
                        break;
                    }
                }
                if (hasOverlap) break;
            }

            // Check against VIRTUAL assignments (memoria)
            if (!hasOverlap) {
                for (const [virtBlockId, destMapping] of this.virtualMigrations.entries()) {
                    if (destMapping.destAula === aulaStr) {
                        for (const vs of destMapping.slots) {
                            if (reqSlots.includes(`${vs.day}-${vs.start}`)) {
                                hasOverlap = true; break;
                            }
                        }
                    }
                    if (hasOverlap) break;
                }
            }

            if (!hasOverlap) validAulas.push(aula);
        });

        countBadge.textContent = validAulas.length;
        suggestionsList.innerHTML = '';

        if (validAulas.length === 0) {
            suggestionsList.innerHTML = '<div style="padding: 1rem; text-align: center; color: var(--text-secondary); font-size: 0.9em;">No hay aulas destino disponibles para este bloque.</div>';
            return;
        }

        validAulas.forEach(aula => {
            const item = document.createElement('div');
            item.className = 'plan-item' + (activeBlock.maxCap > aula.Capacidad ? ' over-capacity' : '');

            item.dataset.aulaCode = aula.CodigoAula;
            item.dataset.aulaName = aula.NombreAula;
            item.dataset.capacidad = aula.Capacidad;

            const content = document.createElement('div');
            content.className = 'plan-header';
            content.style.cursor = 'default';
            content.innerHTML = `
                <div class="plan-title">${aula.NombreAula} (Cód: ${aula.CodigoAula})</div>
                <div style="font-size:0.8em; color:var(--text-secondary);">Pabellón ${aula.NombrePabellon} | Capacidad: ${aula.Capacidad}</div>
            `;

            const btn = document.createElement('button');
            btn.className = 'btn-primary';
            btn.style.marginTop = '0.5rem';
            btn.style.width = '100%';
            btn.style.backgroundColor = 'var(--success-color)';
            btn.textContent = 'Mover a este aula';

            btn.addEventListener('click', () => {
                const isMigrarEnteraLocal = document.getElementById('migrar-entera') && document.getElementById('migrar-entera').checked;
                const bIdList = isMigrarEnteraLocal ? this.sourceBlocks.map(b => b.id) : [this.activeBlockId];

                bIdList.forEach(bId => {
                    const blockTarget = this.sourceBlocks.find(b => b.id === bId);
                    if (!blockTarget) return;

                    this.virtualMigrations.set(bId, {
                        sourceAula: this.sourceAula,
                        sourceAulaCap: blockTarget.sourceAulaCap || '?',
                        courseName: blockTarget.fullCourseNames.join('|'),
                        docente: blockTarget.docentes.join('|'),
                        destAula: aula.CodigoAula.toString(),
                        destNombre: aula.NombreAula,
                        destCap: aula.Capacidad,
                        day: this.getDayName(blockTarget.dayNum),
                        time: `${blockTarget.slots[0].start} - ${blockTarget.slots[blockTarget.slots.length - 1].end}`,
                        slots: blockTarget.slots.map(s => ({ day: s.day, start: s.start }))
                    });
                });

                if (this.isSessionActive) {
                    this.simulatedAulas.add(this.sourceAula);
                    this.updateSessionUI();
                }

                this.activeBlockId = null;
                this.renderSourceBlocks();
                this.calculateSuggestions();
                Swal.fire({ toast: true, position: 'top-end', showConfirmButton: false, timer: 2000, icon: 'success', title: 'Migración virtual guardada en memoria' });
            });

            item.appendChild(content);
            item.appendChild(btn);
            suggestionsList.appendChild(item);
        });
    }

    exportCsv(onlyCurrent = false) {
        if (this.virtualMigrations.size === 0) {
            Swal.fire('Vacío', 'No has realizado ninguna migración virtual aún.', 'info');
            return;
        }

        let csvContent = "\uFEFF"; // BOM for Excel
        csvContent += "Aula Origen,Cap. Origen,Aula Destino,Cap. Destino,Curso,Docente,Día,Horario\r\n";

        for (const [virtBlockId, m] of this.virtualMigrations.entries()) {
            if (onlyCurrent && m.sourceAula !== this.sourceAula) continue;

            csvContent += `"${m.sourceAula}",${m.sourceAulaCap},"${m.destAula}",${m.destCap},"${m.courseName}","${m.docente}","${m.day}","${m.time}"\r\n`;
        }

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", onlyCurrent ? `migracion_aula_${this.sourceAula}.csv` : `migraciones_completas.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    autoMigrate() {
        if (this.sourceBlocks.length === 0) return;

        let migratedCount = 0;
        const isMigrarEntera = document.getElementById('migrar-entera') && document.getElementById('migrar-entera').checked;

        if (isMigrarEntera) {
            if (this.sourceBlocks.some(b => !this.virtualMigrations.has(b.id))) {
                this.activeBlockId = this.sourceBlocks[0].id;
                this.calculateSuggestions();
                const topSuggestion = document.querySelector('#suggestions-list .plan-item');

                if (topSuggestion && !topSuggestion.classList.contains('over-capacity')) {
                    const destAulaStr = topSuggestion.dataset.aulaCode;
                    const destNombreStr = topSuggestion.dataset.aulaName;

                    if (destAulaStr) {
                        const aulaDest = this.aulas.find(a => a.CodigoAula.toString() === destAulaStr);
                        this.sourceBlocks.forEach(b => {
                            if (!this.virtualMigrations.has(b.id)) {
                                this.virtualMigrations.set(b.id, {
                                    sourceAula: this.sourceAula,
                                    sourceAulaCap: b.sourceAulaCap,
                                    courseName: b.fullCourseNames.join('|'),
                                    docente: b.docentes.join('|'),
                                    destAula: destAulaStr,
                                    destNombre: destNombreStr,
                                    destCap: aulaDest ? aulaDest.Capacidad : '?',
                                    day: this.getDayName(b.dayNum),
                                    time: `${b.slots[0].start} - ${b.slots[b.slots.length - 1].end}`,
                                    slots: b.slots.map(s => ({ day: s.day, start: s.start }))
                                });
                                migratedCount++;
                            }
                        });
                    }
                }
            }
        } else {
            for (const block of this.sourceBlocks) {
                if (this.virtualMigrations.has(block.id)) continue;

                this.activeBlockId = block.id;
                this.calculateSuggestions();

                const topSuggestion = document.querySelector('#suggestions-list .plan-item');

                if (topSuggestion && !topSuggestion.classList.contains('over-capacity')) {
                    const destAulaStr = topSuggestion.dataset.aulaCode;
                    const destNombreStr = topSuggestion.dataset.aulaName;
                    const destCapStr = topSuggestion.dataset.capacidad;

                    if (destAulaStr) {
                        this.virtualMigrations.set(block.id, {
                            sourceAula: this.sourceAula,
                            sourceAulaCap: block.sourceAulaCap,
                            courseName: block.fullCourseNames.join('|'),
                            docente: block.docentes.join('|'),
                            destAula: destAulaStr,
                            destNombre: destNombreStr,
                            destCap: destCapStr,
                            day: this.getDayName(block.dayNum),
                            time: `${block.slots[0].start} - ${block.slots[block.slots.length - 1].end}`,
                            slots: block.slots.map(s => ({ day: s.day, start: s.start }))
                        });
                        migratedCount++;
                    }
                }
            }
        }

        if (migratedCount > 0 && this.isSessionActive) {
            this.simulatedAulas.add(this.sourceAula);
            this.updateSessionUI();
        }

        this.activeBlockId = null;
        this.renderSourceBlocks();
        this.calculateSuggestions();
        Swal.fire('Migración Automática', `Se auto-reubicaron ${migratedCount} bloques con éxito.`, 'success');
    }

    updateSessionUI() {
        document.getElementById('session-count').textContent = this.simulatedAulas.size;

        const historySelect = document.getElementById('session-history');
        historySelect.innerHTML = '<option value="">- Historial -</option>';
        Array.from(this.simulatedAulas).forEach(aulaCode => {
            const opt = document.createElement('option');
            opt.value = aulaCode;
            opt.textContent = `Aula: ${aulaCode}`;
            historySelect.appendChild(opt);
        });
        historySelect.value = this.sourceAula && this.simulatedAulas.has(this.sourceAula) ? this.sourceAula : '';
    }

    exportSessionJson() {
        if (this.virtualMigrations.size === 0) return;
        const memoryArray = Array.from(this.virtualMigrations.entries());
        const sessionData = {
            simulatedAulas: Array.from(this.simulatedAulas),
            migrations: memoryArray
        };
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(sessionData));
        const dlAnchorElem = document.createElement('a');
        dlAnchorElem.setAttribute("href", dataStr);
        dlAnchorElem.setAttribute("download", "sesion_simulacion.json");
        dlAnchorElem.click();
    }

    importSessionJson(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const sessionData = JSON.parse(e.target.result);
                this.simulatedAulas = new Set(sessionData.simulatedAulas);
                this.virtualMigrations = new Map(sessionData.migrations);

                this.isSessionActive = true;
                document.getElementById('btn-start-session').style.display = 'none';
                document.getElementById('btn-stop-session').style.display = 'block';
                document.getElementById('session-stats').style.display = 'flex';

                this.updateSessionUI();
                this.calculateSuggestions();
                this.renderSourceBlocks();

                Swal.fire('Importado', 'Sesión de simulación cargada correctamente.', 'success');
            } catch (err) {
                Swal.fire('Error', 'Archivo inválido.', 'error');
            }
            event.target.value = '';
        };
        reader.readAsText(file);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new MigrationSimulator();
});
