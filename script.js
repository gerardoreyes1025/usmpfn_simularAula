class ScheduleSimulator {
    constructor() {
        this.allOffers = [];
        this.timeSlots = [
            { start: '07:16', end: '08:00' },
            { start: '08:01', end: '08:45' },
            { start: '08:46', end: '09:30' },
            { start: '09:31', end: '10:15' },
            { start: '10:16', end: '11:00' },
            { start: '11:01', end: '11:45' },
            { start: '11:46', end: '12:30' },
            { start: '12:31', end: '13:15' },
            { start: '13:16', end: '14:00' },
            { start: '14:01', end: '14:45' },
            { start: '14:46', end: '15:30' },
            { start: '15:31', end: '16:15' },
            { start: '16:16', end: '17:00' },
            { start: '17:01', end: '17:45' },
            { start: '17:46', end: '18:30' },
            { start: '18:31', end: '19:15' },
            { start: '19:16', end: '20:00' },
            { start: '20:01', end: '20:45' },
            { start: '20:46', end: '21:30' },
            { start: '21:31', end: '22:15' },
            { start: '22:16', end: '23:00' }
        ];
        this.assignedOffers = new Map(); // Map<planClave, Array<offer>>
        this.schedule = {};
        this.filters = { program: '', day: '', time: '', aula: '', onlyEtEp: true, onlyEt: false, onlyEp: false, sugPairs: false, autoPair: false };
        this.scheduleBlockedAll = false;
        this.scheduleBlockedAula = true;
        this.loadedAula = '';
        this.collapsedPlans = new Set();

        this.init();
    }

    async init() {
        try {
            const response = await fetch('http://localhost:3001/api/ofertas');
            this.allOffers = await response.json();

            this.renderPlans();
            this.renderSuggestions();
            this.renderGrid();
            this.setupEventListeners();
            this.updateStats();
        } catch (error) {
            console.error('Error loading data:', error);
            Swal.fire({
                icon: 'error',
                title: 'Error de conexión',
                text: 'Error al conectar con la base de datos. Asegúrate de que el servidor esté corriendo.'
            });
        }
    }

    getDayNumber(code) {
        const dayMapping = {
            'LU': 1, 'MA': 2, 'MI': 3, 'JU': 4, 'VI': 5, 'SA': 6,
            '1': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6
        };
        return dayMapping[code] || parseInt(code);
    }

    getDayName(code) {
        const names = ['', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
        return names[code] || '';
    }

    getSlotsForSession(session) {
        const start = session.HORAINICIO;
        const end = session.HORAFIN;
        return this.timeSlots.filter(slot => {
            return slot.start >= start && slot.start < end;
        });
    }

    getCourseCode(abreviatura) {
        return abreviatura.split('>')[0] || abreviatura;
    }

    getGroupedOffers() {
        const grouped = this.allOffers.reduce((acc, offer) => {
            if (!acc[offer.ClavePlan]) {
                acc[offer.ClavePlan] = {
                    name: offer.PlanEstudio || offer.DENOMINACION,
                    clave: offer.ClavePlan,
                    offers: []
                };
            }
            let existingOffer = acc[offer.ClavePlan].offers.find(o => o.consecutivo === offer.CONSECUTIVOOFERTA);
            if (!existingOffer) {
                existingOffer = {
                    consecutivo: offer.CONSECUTIVOOFERTA,
                    abreviatura: offer.ABREVIATURAEVENTO,
                    capacidad: offer.CapacidadPaquete,
                    sessions: [],
                    courseCode: this.getCourseCode(offer.ABREVIATURAEVENTO),
                    isTheoretical: offer.ABREVIATURAEVENTO.includes('ET'),
                    isPractical: offer.ABREVIATURAEVENTO.includes('EP')
                };
                acc[offer.ClavePlan].offers.push(existingOffer);
            }
            const isDuplicate = existingOffer.sessions.some(s =>
                s.CODIGODIA === offer.CODIGODIA &&
                s.HORAINICIO === offer.HORAINICIO &&
                s.HORAFIN === offer.HORAFIN
            );
            if (!isDuplicate) {
                existingOffer.sessions.push(offer);
            }
            return acc;
        }, {});

        Object.values(grouped).forEach(plan => {
            plan.offers.forEach(offer => {
                const sessionGroups = {};
                offer.sessions.forEach(s => {
                    const day = this.getDayNumber(s.CODIGODIA);
                    if (!sessionGroups[day]) sessionGroups[day] = [];
                    sessionGroups[day].push(s);
                });

                offer.displayTimes = [];
                Object.keys(sessionGroups).forEach(day => {
                    const daySessions = sessionGroups[day].sort((a, b) => a.HORAINICIO.localeCompare(b.HORAINICIO));

                    let currentRange = null;
                    daySessions.forEach(s => {
                        if (!currentRange) {
                            currentRange = { start: s.HORAINICIO, end: s.HORAFIN, day: day };
                        } else {
                            const prevEnd = currentRange.end;
                            if (s.HORAINICIO > prevEnd && (this.isConsecutive(prevEnd, s.HORAINICIO))) {
                                currentRange.end = s.HORAFIN;
                            } else if (s.HORAINICIO <= prevEnd) {
                                if (s.HORAFIN > currentRange.end) currentRange.end = s.HORAFIN;
                            } else {
                                offer.displayTimes.push(currentRange);
                                currentRange = { start: s.HORAINICIO, end: s.HORAFIN, day: day };
                            }
                        }
                    });
                    if (currentRange) offer.displayTimes.push(currentRange);
                });
            });
        });

        return grouped;
    }

    isConsecutive(end, nextStart) {
        const [h1, m1] = end.split(':').map(Number);
        const [h2, m2] = nextStart.split(':').map(Number);
        const diff = (h2 * 60 + m2) - (h1 * 60 + m1);
        return diff <= 2;
    }

    renderPlans() {
        const plansList = document.getElementById('plans-list');
        plansList.innerHTML = '';

        const grouped = this.getGroupedOffers();

        Object.values(grouped).forEach(plan => {
            const currentAssigned = this.assignedOffers.get(plan.clave) || [];

            let visibleOffers = plan.offers.filter(o => {
                const isAssigned = currentAssigned.some(ao => ao.consecutivo === o.consecutivo);

                // ALWAYS show if it is already assigned, bypassing filters
                if (isAssigned) return true;

                if (this.filters.program && !plan.name.toLowerCase().includes(this.filters.program.toLowerCase())) return false;

                // Filter by ET/EP
                if (this.filters.onlyEtEp && !(o.isTheoretical || o.isPractical)) return false;
                if (this.filters.onlyEt && !o.isTheoretical) return false;
                if (this.filters.onlyEp && !o.isPractical) return false;

                // Filter by day
                if (this.filters.day && !o.sessions.some(s => this.getDayNumber(s.CODIGODIA) == this.filters.day)) return false;

                // Filter by time block
                if (this.filters.time && !o.sessions.some(s => s.HORAINICIO === this.filters.time)) return false;

                // Filter by classroom (aula)
                if (this.filters.aula && !o.sessions.some(s => s.CODIGOAULA && s.CODIGOAULA.toString().includes(this.filters.aula))) return false;

                return true;
            });

            if (visibleOffers.length === 0) return;

            // Sort offers by time (day then start time)
            visibleOffers.sort((a, b) => {
                const dayA = this.getDayNumber(a.sessions[0].CODIGODIA);
                const dayB = this.getDayNumber(b.sessions[0].CODIGODIA);
                if (dayA !== dayB) return dayA - dayB;
                return a.sessions[0].HORAINICIO.localeCompare(b.sessions[0].HORAINICIO);
            });

            const planGroup = document.createElement('div');
            planGroup.className = `plan-group ${this.collapsedPlans.has(plan.clave) ? 'collapsed' : ''}`;

            planGroup.innerHTML = `
                <div class="plan-name" onclick="window.simulator.toggleCollapse('${plan.clave}')">
                    <span class="collapse-icon">${this.collapsedPlans.has(plan.clave) ? '▶' : '▼'}</span>
                    <span class="plan-title">${plan.name}</span>
                    <span class="badge">${plan.clave}</span>
                </div>
                <div class="offers-container" id="offers-${plan.clave}"></div>
            `;

            const offersContainer = planGroup.querySelector('.offers-container');
            visibleOffers.forEach(offer => {
                const card = document.createElement('div');
                const isOverCapacity = offer.capacidad > 60;

                card.className = `offer-card ${isOverCapacity ? 'over-capacity' : ''} ${offer.isTheoretical ? 'theoretical' : ''} ${offer.isPractical ? 'practical' : ''}`;
                card.dataset.plan = plan.clave;
                card.dataset.consecutivo = offer.consecutivo;

                const timeHtml = offer.displayTimes.map(t => `
                    <div class="time-range">
                        <span>${this.getDayName(t.day).substring(0, 2)}</span>
                        <span>${t.start} - ${t.end} </span>
                    </div>
                `).join('');

                card.innerHTML = `
                    <div class="offer-name">${offer.sessions[0].NombreCurso}</div>
                    <div class="offer-info" style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 2px;">
                        ${offer.sessions[0].NOMBRES ? `${offer.sessions[0].APELLIDOPATERNO} ${offer.sessions[0].APELLIDOMATERNO}, ${offer.sessions[0].NOMBRES} (${offer.sessions[0].CODIGOSAPDOCENTE})` : 'Docente sin asignar'}
                    </div>
                    <div class="offer-info">
                        <span class="offer-code">${offer.abreviatura}</span>
                        <span class="offer-code">${offer.sessions[0].CODIGOAULA}</span>
                        <span class="offer-cap ${isOverCapacity ? 'text-danger' : ''}">Cap: ${offer.capacidad}</span>
                    </div>
                    <div class="offer-time">${timeHtml}</div>
                    ${isOverCapacity ? '<div class="warning-tag">Excede Capacidad (60)</div>' : ''}
                `;

                card.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.toggleOffer(plan.clave, offer);
                });
                offersContainer.appendChild(card);
            });

            if (offersContainer.children.length > 0) {
                plansList.appendChild(planGroup);
            }
        });
    }

    toggleCollapse(planClave, isSuggestion = false) {
        if (this.collapsedPlans.has(planClave)) {
            this.collapsedPlans.delete(planClave);
        } else {
            this.collapsedPlans.add(planClave);
        }
        if (isSuggestion) {
            this.renderSuggestions();
        } else {
            this.renderPlans();
        }
    }

    findPair(planClave, offer) {
        const grouped = this.getGroupedOffers();
        const plan = grouped[planClave];
        if (!plan) return null;

        const potentialPairs = plan.offers.filter(o =>
            o.consecutivo !== offer.consecutivo &&
            o.courseCode === offer.courseCode &&
            ((offer.isTheoretical && o.isPractical) || (offer.isPractical && o.isTheoretical))
        );

        for (const o of potentialPairs) {
            const canPair = offer.sessions.some(s1 => {
                const d1 = this.getDayNumber(s1.CODIGODIA);
                return o.sessions.some(s2 => {
                    const d2 = this.getDayNumber(s2.CODIGODIA);
                    if (d1 !== d2) return false;
                    return this.isConsecutive(s1.HORAFIN, s2.HORAINICIO) || this.isConsecutive(s2.HORAFIN, s1.HORAINICIO);
                });
            });
            if (canPair) return o;
        }
        return null;
    }

    renderSuggestions() {
        const suggestionsList = document.getElementById('suggestions-list');
        const suggestionsCount = document.getElementById('suggestions-count');
        if (!suggestionsList || !suggestionsCount) return;

        suggestionsList.innerHTML = '';

        // No suggestions if schedule is completely empty
        if (Object.keys(this.schedule).length === 0) {
            suggestionsCount.textContent = '0';
            suggestionsList.innerHTML = '<div style="padding: 1rem; color: var(--text-muted); text-align: center; font-size: 0.8rem;">Carga una aula o asigna materias para ver sugerencias que llenen los huecos libres.</div>';
            return;
        }

        const grouped = this.getGroupedOffers();
        let count = 0;

        Object.values(grouped).forEach(plan => {
            let visibleOffers = plan.offers;

            // Only show offers that are NOT assigned and that CAN be assigned (fit in the schedule)
            const currentAssigned = this.assignedOffers.get(plan.clave) || [];
            visibleOffers = visibleOffers.filter(o => {
                const isAlreadyAssigned = currentAssigned.some(ao => ao.consecutivo === o.consecutivo);
                return !isAlreadyAssigned && this.canAssign(o);
            });

            if (this.filters.onlyEtEp) {
                visibleOffers = visibleOffers.filter(o => o.isTheoretical || o.isPractical);
            }
            if (this.filters.onlyEt) {
                visibleOffers = visibleOffers.filter(o => o.isTheoretical);
            }
            if (this.filters.onlyEp) {
                visibleOffers = visibleOffers.filter(o => o.isPractical);
            }
            if (this.filters.program && !plan.name.toLowerCase().includes(this.filters.program.toLowerCase())) {
                visibleOffers = [];
            }
            if (this.filters.day) {
                visibleOffers = visibleOffers.filter(o => o.sessions.some(s => this.getDayNumber(s.CODIGODIA) == this.filters.day));
            }
            if (this.filters.time) {
                visibleOffers = visibleOffers.filter(o => o.sessions.some(s => s.HORAINICIO === this.filters.time));
            }

            // Suggestions pairing filter
            if (this.filters.sugPairs) {
                const courseGroups = {};
                visibleOffers.forEach(o => {
                    if (!courseGroups[o.courseCode]) courseGroups[o.courseCode] = { ET: [], EP: [] };
                    if (o.isTheoretical) courseGroups[o.courseCode].ET.push(o);
                    if (o.isPractical) courseGroups[o.courseCode].EP.push(o);
                });

                const pairedOffers = new Set();
                Object.keys(courseGroups).forEach(code => {
                    const ets = courseGroups[code].ET;
                    const eps = courseGroups[code].EP;
                    ets.forEach(et => {
                        eps.forEach(ep => {
                            const canPair = et.sessions.some(etS => {
                                const etDay = this.getDayNumber(etS.CODIGODIA);
                                return ep.sessions.some(epS => {
                                    const epDay = this.getDayNumber(epS.CODIGODIA);
                                    if (etDay !== epDay) return false;
                                    return this.isConsecutive(etS.HORAFIN, epS.HORAINICIO) || this.isConsecutive(epS.HORAFIN, etS.HORAINICIO);
                                });
                            });
                            if (canPair) {
                                pairedOffers.add(et.consecutivo);
                                pairedOffers.add(ep.consecutivo);
                            }
                        });
                    });
                });
                visibleOffers = visibleOffers.filter(o => pairedOffers.has(o.consecutivo));
            }

            if (visibleOffers.length === 0) return;

            // Sort offers by time (day then start time)
            visibleOffers.sort((a, b) => {
                const dayA = this.getDayNumber(a.sessions[0].CODIGODIA);
                const dayB = this.getDayNumber(b.sessions[0].CODIGODIA);
                if (dayA !== dayB) return dayA - dayB;
                return a.sessions[0].HORAINICIO.localeCompare(b.sessions[0].HORAINICIO);
            });

            const planGroup = document.createElement('div');
            planGroup.className = `plan-group ${this.collapsedPlans.has('sug-' + plan.clave) ? 'collapsed' : ''}`;

            planGroup.innerHTML = `
                <div class="plan-name" onclick="window.simulator.toggleCollapse('sug-${plan.clave}', true)">
                    <span class="collapse-icon">${this.collapsedPlans.has('sug-' + plan.clave) ? '▶' : '▼'}</span>
                    <span class="plan-title">${plan.name}</span>
                    <span class="badge">${plan.clave}</span>
                </div>
                <div class="offers-container" id="sug-offers-${plan.clave}"></div>
            `;

            const offersContainer = planGroup.querySelector('.offers-container');
            visibleOffers.forEach(offer => {
                count++;
                const card = document.createElement('div');
                const isOverCapacity = offer.capacidad > 60;

                card.className = `offer-card ${isOverCapacity ? 'over-capacity' : ''} ${offer.isTheoretical ? 'theoretical' : ''} ${offer.isPractical ? 'practical' : ''}`;
                card.dataset.plan = plan.clave;
                card.dataset.consecutivo = offer.consecutivo;

                const timeHtml = offer.displayTimes.map(t => `
                    <div class="time-range">
                        <span>${this.getDayName(t.day).substring(0, 2)}</span>
                        <span>${t.start} - ${t.end} </span>
                    </div>
                `).join('');

                card.innerHTML = `
                    <div class="offer-name">${offer.sessions[0].NombreCurso}</div>
                    <div class="offer-info" style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 2px;">
                        ${offer.sessions[0].NOMBRES ? `${offer.sessions[0].APELLIDOPATERNO} ${offer.sessions[0].APELLIDOMATERNO}, ${offer.sessions[0].NOMBRES} (${offer.sessions[0].CODIGOSAPDOCENTE})` : 'Docente sin asignar'}
                    </div>
                    <div class="offer-info">
                        <span class="offer-code">${offer.abreviatura}</span>
                        <span class="offer-code">${offer.sessions[0].CODIGOAULA}</span>
                        <span class="offer-cap ${isOverCapacity ? 'text-danger' : ''}">Cap: ${offer.capacidad}</span>
                    </div>
                    <div class="offer-time">${timeHtml}</div>
                    ${isOverCapacity ? '<div class="warning-tag">Excede Capacidad (60)</div>' : ''}
                `;

                card.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.toggleOffer(plan.clave, offer);
                });
                offersContainer.appendChild(card);
            });

            if (offersContainer.children.length > 0) {
                suggestionsList.appendChild(planGroup);
            }
        });

        suggestionsCount.textContent = count.toString();
        if (count === 0 && Object.keys(this.schedule).length > 0) {
            suggestionsList.innerHTML = '<div style="padding: 1rem; color: var(--text-muted); text-align: center; font-size: 0.8rem;">No hay más cursos de otros planes que encajen en los huecos disponibles.</div>';
        }
    }

    renderGrid() {
        const grid = document.getElementById('schedule-grid');
        const headers = grid.querySelectorAll('.grid-header');
        grid.innerHTML = '';
        headers.forEach(h => grid.appendChild(h));

        this.timeSlots.forEach(slot => {
            const timeCell = document.createElement('div');
            timeCell.className = 'time-cell';
            timeCell.textContent = slot.start;
            grid.appendChild(timeCell);

            for (let d = 1; d <= 6; d++) {
                const slotCell = document.createElement('div');
                slotCell.className = 'slot-cell';
                slotCell.dataset.day = d;
                slotCell.dataset.time = slot.start;
                slotCell.id = `cell-${d}-${slot.start}`;
                grid.appendChild(slotCell);
            }
        });
    }

    toggleOffer(planClave, offer) {
        if (this.scheduleBlockedAll) {
            Swal.fire('Bloqueado', 'El horario está completamente bloqueado. Desmarca "Bloquear Todo" para hacer modificaciones.', 'warning');
            return;
        }

        const isAulaCourse = offer.sessions.some(s => s.CODIGOAULA && s.CODIGOAULA.toString() == this.loadedAula);
        if (this.scheduleBlockedAula && isAulaCourse && this.loadedAula) {
            Swal.fire('Bloqueado', `Las materias del aula base (${this.loadedAula}) están bloqueadas. Desmarca "Bloquear Aula" para modificarlas.`, 'warning');
            return;
        }

        const currentAssigned = this.assignedOffers.get(planClave) || [];
        const existingIndex = currentAssigned.findIndex(o => o.consecutivo === offer.consecutivo);

        let offersToToggle = [offer];

        if (this.filters.autoPair) {
            const pair = this.findPair(planClave, offer);
            if (pair) {
                if (existingIndex !== -1) {
                    // Unassigning. If pair is also assigned, unassign it too.
                    if (currentAssigned.some(o => o.consecutivo === pair.consecutivo)) {
                        offersToToggle.push(pair);
                    }
                } else {
                    // Assigning. If pair can be assigned, assign it too.
                    if (this.canAssign(pair)) {
                        offersToToggle.push(pair);
                    }
                }
            }
        }

        if (existingIndex !== -1) {
            // Unassign this specific offer (and its pair if applicable)
            offersToToggle.forEach(o => this.unassignSpecificOffer(planClave, o));
        } else {
            // Try to assign
            const validToAssign = offersToToggle.filter(o => this.canAssign(o));
            if (validToAssign.length > 0) {
                // Must evaluate assignment sequentially because one offer could potentially conflict with its pair
                // However they are mathematically consecutive on the same day, so they will not intersect slots.
                validToAssign.forEach(o => this.assignOffer(planClave, [o]));
                if (validToAssign.length < offersToToggle.length) {
                    Swal.fire('Aviso', 'Se asignó la materia, pero su pareja tuvo un conflicto de horario.', 'info');
                }
            } else {
                Swal.fire('Conflicto', 'Conflicto de horario con otras materias asignadas.', 'error');
            }
        }
        this.updateUI();
    }

    canAssign(offer) {
        return offer.sessions.every(session => {
            const dayNum = this.getDayNumber(session.CODIGODIA);
            const slots = this.getSlotsForSession(session);
            return slots.every(slot => {
                const key = `${dayNum}-${slot.start}`;
                return !this.schedule[key];
            });
        });
    }

    assignOffer(planClave, offers) {
        const current = this.assignedOffers.get(planClave) || [];
        const updated = [...current, ...offers];
        this.assignedOffers.set(planClave, updated);

        offers.forEach(offer => {
            offer.sessions.forEach(session => {
                const dayNum = this.getDayNumber(session.CODIGODIA);
                const slots = this.getSlotsForSession(session);
                slots.forEach(slot => {
                    const key = `${dayNum}-${slot.start}`;
                    this.schedule[key] = {
                        planClave,
                        abreviatura: offer.abreviatura,
                        consecutivo: offer.consecutivo,
                        plan: offer.sessions[0].PlanEstudio,
                        curso: offer.sessions[0].NombreCurso,
                        aula: offer.sessions[0].CODIGOAULA,
                        docente: offer.sessions[0].NOMBRES ? `${offer.sessions[0].APELLIDOPATERNO} ${offer.sessions[0].APELLIDOMATERNO}, ${offer.sessions[0].NOMBRES}` : 'Sin asignar'
                    };
                });
            });
        });
    }

    unassignSpecificOffer(planClave, offer) {
        const current = this.assignedOffers.get(planClave) || [];
        const updated = current.filter(o => o.consecutivo !== offer.consecutivo);

        if (updated.length === 0) {
            this.assignedOffers.delete(planClave);
        } else {
            this.assignedOffers.set(planClave, updated);
        }

        offer.sessions.forEach(session => {
            const dayNum = this.getDayNumber(session.CODIGODIA);
            const slots = this.getSlotsForSession(session);
            slots.forEach(slot => {
                const key = `${dayNum}-${slot.start}`;
                delete this.schedule[key];
            });
        });
    }

    unassignOffer(planClave) {
        const offers = this.assignedOffers.get(planClave);
        if (!offers) return;

        offers.forEach(offer => {
            offer.sessions.forEach(session => {
                const dayNum = this.getDayNumber(session.CODIGODIA);
                const slots = this.getSlotsForSession(session);
                slots.forEach(slot => {
                    const key = `${dayNum}-${slot.start}`;
                    delete this.schedule[key];
                });
            });
        });
        this.assignedOffers.delete(planClave);
    }

    updateUI() {
        document.querySelectorAll('.offer-card').forEach(card => {
            const plan = card.dataset.plan;
            const consec = card.dataset.consecutivo;
            const assigned = this.assignedOffers.get(plan) || [];

            card.classList.remove('selected');
            if (assigned.some(o => o.consecutivo.toString() === consec.toString())) {
                card.classList.add('selected');
            }
        });

        document.querySelectorAll('.slot-cell').forEach(cell => {
            cell.innerHTML = '';
            const day = cell.dataset.day;
            const time = cell.dataset.time;
            const key = `${day}-${time}`;
            console.log(this.schedule[key]);
            if (this.schedule[key]) {
                const data = this.schedule[key];
                const block = document.createElement('div');
                block.className = 'assigned-block';
                block.innerHTML = `
                    <div class="block-title">${data.plan}</div>
                    <div class="block-sub">${data.curso}</div>
                    <div class="block-sub" style="font-style: italic;">${data.docente}</div>
                    <div class="block-sub">${data.planClave} | ${data.aula}</div>
                `;
                block.onclick = (e) => {
                    e.stopPropagation();
                    if (this.scheduleBlockedAll) {
                        Swal.fire('Bloqueado', 'El horario está completamente bloqueado. Desmarca "Bloquear Todo" para remover materias.', 'warning');
                        return;
                    }

                    const isAulaCourse = data.aula && data.aula.toString() == this.loadedAula;
                    if (this.scheduleBlockedAula && isAulaCourse && this.loadedAula) {
                        Swal.fire('Bloqueado', `Las materias del aula base (${this.loadedAula}) están bloqueadas. Desmarca "Bloquear Aula" para removerlas.`, 'warning');
                        return;
                    }

                    const planOffers = this.assignedOffers.get(data.planClave);
                    const offer = planOffers.find(o => o.consecutivo === data.consecutivo);
                    this.unassignSpecificOffer(data.planClave, offer);
                    this.updateUI();
                };
                cell.appendChild(block);
            }
        });

        this.renderPlans();
        this.renderSuggestions();
        this.updateStats();
    }

    updateStats() {
        const assignedPlansCount = this.assignedOffers.size;
        document.getElementById('assigned-plans').textContent = `${assignedPlansCount}/8`;

        // The denominator for occupancy is exactly the number of weekly time slots (6 days * 21 blocks = 126)
        // because the room can hold 1 block per time slot.
        const totalSlots = 6 * this.timeSlots.length;
        const occupiedSlots = Object.keys(this.schedule).length;
        const pct = Math.round((occupiedSlots / totalSlots) * 100);
        document.getElementById('occupancy-pct').textContent = `${pct}%`;
    }

    downloadScheduleCSV() {
        if (Object.keys(this.schedule).length === 0) {
            Swal.fire('Vacío', 'El horario está vacío. No hay nada que descargar.', 'info');
            return;
        }

        const rows = [
            ['Plan (Clave)', 'Plan', 'Curso', 'Abreviatura', 'Docente', 'Día', 'Hora Inicio', 'Hora Fin', 'Aula']
        ];

        this.assignedOffers.forEach((offers, planClave) => {
            offers.forEach(offer => {
                offer.displayTimes.forEach(dt => {
                    const aula = offer.sessions[0].CODIGOAULA || '';
                    const planName = offer.sessions[0].PlanEstudio || offer.sessions[0].DENOMINACION || '';
                    const curso = offer.sessions[0].NombreCurso || '';
                    const docente = offer.sessions[0].NOMBRES ? `${offer.sessions[0].APELLIDOPATERNO} ${offer.sessions[0].APELLIDOMATERNO}, ${offer.sessions[0].NOMBRES} (${offer.sessions[0].CODIGOSAPDOCENTE})` : 'Sin asignar';

                    rows.push([
                        planClave,
                        `"${planName}"`,
                        `"${curso}"`,
                        offer.abreviatura,
                        `"${docente}"`,
                        this.getDayName(dt.day),
                        dt.start,
                        dt.end,
                        aula
                    ]);
                });
            });
        });

        this.exportToCSV(rows, 'horario_actual.csv');
    }

    downloadSuggestionsCSV() {
        const grouped = this.getGroupedOffers();
        const rows = [
            ['Plan (Clave)', 'Plan', 'Curso', 'Abreviatura', 'Docente', 'Capacidad', 'Horarios', 'Aula']
        ];

        let count = 0;
        Object.values(grouped).forEach(plan => {
            let visibleOffers = plan.offers;
            const currentAssigned = this.assignedOffers.get(plan.clave) || [];
            visibleOffers = visibleOffers.filter(o => {
                const isAlreadyAssigned = currentAssigned.some(ao => ao.consecutivo === o.consecutivo);
                return !isAlreadyAssigned && this.canAssign(o);
            });

            if (this.filters.onlyEtEp) visibleOffers = visibleOffers.filter(o => o.isTheoretical || o.isPractical);
            if (this.filters.onlyEt) visibleOffers = visibleOffers.filter(o => o.isTheoretical);
            if (this.filters.onlyEp) visibleOffers = visibleOffers.filter(o => o.isPractical);
            if (this.filters.program && !plan.name.toLowerCase().includes(this.filters.program.toLowerCase())) visibleOffers = [];

            visibleOffers.forEach(o => {
                count++;
                const times = o.displayTimes.map(dt => `${this.getDayName(dt.day).substring(0, 2)} ${dt.start}-${dt.end}`).join(' | ');
                const aula = o.sessions[0].CODIGOAULA || '';
                const planName = o.sessions[0].PlanEstudio || o.sessions[0].DENOMINACION || '';
                const curso = o.sessions[0].NombreCurso || '';
                const docente = o.sessions[0].NOMBRES ? `${o.sessions[0].APELLIDOPATERNO} ${o.sessions[0].APELLIDOMATERNO}, ${o.sessions[0].NOMBRES} (${o.sessions[0].CODIGOSAPDOCENTE})` : 'Sin asignar';

                rows.push([
                    plan.clave,
                    `"${planName}"`,
                    `"${curso}"`,
                    o.abreviatura,
                    `"${docente}"`,
                    o.capacidad,
                    `"${times}"`,
                    aula
                ]);
            });
        });

        if (count === 0) {
            Swal.fire('Sin Sugerencias', 'No hay sugerencias para descargar.', 'info');
            return;
        }

        this.exportToCSV(rows, 'sugerencias.csv');
    }

    exportToCSV(rows, filename) {
        const csvContent = rows.map(e => String(e).replace(/#/g, '')).join("\n");
        const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", filename);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    setupEventListeners() {
        document.getElementById('toggle-ofertas').addEventListener('click', (e) => {
            if (e.target.closest('.btn-icon')) return;
            document.querySelector('.lists-container').classList.toggle('ofertas-collapsed');
        });

        document.getElementById('toggle-sugerencias').addEventListener('click', (e) => {
            if (e.target.closest('.btn-icon')) return;
            document.querySelector('.lists-container').classList.toggle('sugerencias-collapsed');
        });

        document.getElementById('download-schedule').addEventListener('click', () => {
            this.downloadScheduleCSV();
        });

        document.getElementById('download-suggestions').addEventListener('click', () => {
            this.downloadSuggestionsCSV();
        });

        document.getElementById('reset-schedule').addEventListener('click', () => {
            if (this.scheduleBlockedAll) {
                Swal.fire('Bloqueado', 'El horario está completamente bloqueado. Desmarca "Bloquear Todo" para reiniciar.', 'warning');
                return;
            }
            if (this.scheduleBlockedAula) {
                // Only remove courses that do NOT belong to the loadedAula
                let removedAny = false;
                this.assignedOffers.forEach((offers, planClave) => {
                    offers.forEach(o => {
                        const isAulaCourse = o.sessions.some(s => s.CODIGOAULA && s.CODIGOAULA.toString() == this.loadedAula);
                        if (!isAulaCourse) {
                            this.unassignSpecificOffer(planClave, o);
                            removedAny = true;
                        }
                    });
                });
                if (!removedAny) Swal.fire('Sin Cambios', 'Las únicas materias asignadas corresponden al aula bloqueada.', 'info');
            } else {
                this.assignedOffers.clear();
                this.schedule = {};
            }
            this.updateUI();
        });

        document.getElementById('auto-optimize').addEventListener('click', () => {
            if (this.scheduleBlockedAll) {
                Swal.fire('Bloqueado', 'El horario está completamente bloqueado. Desmarca "Bloquear Todo" para optimizar.', 'warning');
                return;
            }
            this.autoOptimize();
        });

        document.getElementById('block-all').addEventListener('change', (e) => {
            this.scheduleBlockedAll = e.target.checked;
        });

        document.getElementById('block-aula').addEventListener('change', (e) => {
            this.scheduleBlockedAula = e.target.checked;
        });

        document.getElementById('filter-program').addEventListener('input', (e) => {
            this.filters.program = e.target.value;
            this.renderPlans();
            this.renderSuggestions();
        });

        document.getElementById('filter-day').addEventListener('change', (e) => {
            this.filters.day = e.target.value;
            this.renderPlans();
            this.renderSuggestions();
        });

        document.getElementById('filter-time').addEventListener('change', (e) => {
            this.filters.time = e.target.value;
            this.renderPlans();
            this.renderSuggestions();
        });

        document.getElementById('filter-aula').addEventListener('input', (e) => {
            this.filters.aula = e.target.value;
            this.renderPlans();
            this.renderSuggestions();
        });

        document.getElementById('load-aula').addEventListener('click', () => {
            const aulaCode = document.getElementById('filter-aula').value.trim();
            if (!aulaCode) {
                Swal.fire('Atención', 'Por favor, ingresa un código de aula.', 'warning');
                return;
            }
            this.loadClassroomOffers(aulaCode);
        });

        document.getElementById('filter-sug-pairs').addEventListener('change', (e) => {
            this.filters.sugPairs = e.target.checked;
            this.renderSuggestions();
        });

        document.getElementById('auto-assign-pair').addEventListener('change', (e) => {
            this.filters.autoPair = e.target.checked;
        });

        document.getElementById('filter-et-ep').addEventListener('change', (e) => {
            this.filters.onlyEtEp = e.target.checked;
            this.renderPlans();
            this.renderSuggestions();
        });

        document.getElementById('filter-et').addEventListener('change', (e) => {
            this.filters.onlyEt = e.target.checked;
            this.renderPlans();
            this.renderSuggestions();
        });

        document.getElementById('filter-ep').addEventListener('change', (e) => {
            this.filters.onlyEp = e.target.checked;
            this.renderPlans();
            this.renderSuggestions();
        });
    }

    loadClassroomOffers(aulaCode) {
        this.loadedAula = aulaCode;
        const grouped = this.getGroupedOffers();
        let addedCount = 0;
        let conflictCount = 0;

        Object.values(grouped).forEach(plan => {
            plan.offers.forEach(offer => {
                const belongsToAula = offer.sessions.some(s => s.CODIGOAULA && s.CODIGOAULA.toString() === aulaCode);
                if (belongsToAula) {
                    const currentAssigned = this.assignedOffers.get(plan.clave) || [];
                    const isAlreadyAssigned = currentAssigned.some(o => o.consecutivo === offer.consecutivo);

                    if (!isAlreadyAssigned) {
                        if (this.canAssign(offer)) {
                            this.assignOffer(plan.clave, [offer]);
                            addedCount++;
                        } else {
                            conflictCount++;
                        }
                    }
                }
            });
        });

        this.updateUI();
        if (addedCount > 0 || conflictCount > 0) {
            Swal.fire(
                'Aula Cargada',
                `Se asignaron ${addedCount} ofertas de la aula ${aulaCode}.${conflictCount > 0 ? ` Hubo ${conflictCount} conflictos de horario.` : ''}`,
                conflictCount > 0 ? 'warning' : 'success'
            );
        } else {
            Swal.fire('Sin resultados', `No se encontraron ofertas para la aula ${aulaCode} o ya estaban asignadas.`, 'info');
        }
    }

    autoOptimize() {
        this.assignedOffers.clear();
        this.schedule = {};

        const grouped = this.getGroupedOffers();
        const planClaves = Object.keys(grouped);

        let classroomFull = false;
        let iteration = 1;
        const maxIterations = 20;

        while (!classroomFull && iteration <= maxIterations) {
            let assignedInThisIteration = false;

            for (const planClave of planClaves) {
                const plan = grouped[planClave];
                const currentAssigned = this.assignedOffers.get(planClave) || [];

                if (currentAssigned.length >= iteration) continue;

                const availableOffers = plan.offers.filter(o =>
                    (o.isTheoretical || o.isPractical) &&
                    o.capacidad <= 60 &&
                    !currentAssigned.some(ao => ao.consecutivo === o.consecutivo)
                );

                const courseGroups = {};
                availableOffers.forEach(o => {
                    if (!courseGroups[o.courseCode]) courseGroups[o.courseCode] = { ET: [], EP: [], other: [] };
                    if (o.isTheoretical) courseGroups[o.courseCode].ET.push(o);
                    else if (o.isPractical) courseGroups[o.courseCode].EP.push(o);
                });

                let assignedForPlan = false;

                for (const code in courseGroups) {
                    const ets = courseGroups[code].ET;
                    const eps = courseGroups[code].EP;

                    for (const et of ets) {
                        for (const ep of eps) {
                            const canPair = et.sessions.some(etS => {
                                const etDay = this.getDayNumber(etS.CODIGODIA);
                                return ep.sessions.some(epS => {
                                    const epDay = this.getDayNumber(epS.CODIGODIA);
                                    if (etDay !== epDay) return false;
                                    return this.isConsecutive(etS.HORAFIN, epS.HORAINICIO) || this.isConsecutive(epS.HORAFIN, etS.HORAINICIO);
                                });
                            });

                            if (canPair && this.canAssign(et) && this.canAssign(ep)) {
                                this.assignOffer(planClave, [et, ep]);
                                assignedForPlan = true;
                                assignedInThisIteration = true;
                                break;
                            }
                        }
                        if (assignedForPlan) break;
                    }
                    if (assignedForPlan) break;
                }

                if (!assignedForPlan) {
                    const validETs = availableOffers.filter(o => o.isTheoretical)
                        .sort((a, b) => {
                            const dayA = this.getDayNumber(a.sessions[0].CODIGODIA);
                            const dayB = this.getDayNumber(b.sessions[0].CODIGODIA);
                            if (dayA !== dayB) return dayA - dayB;
                            return a.sessions[0].HORAINICIO.localeCompare(b.sessions[0].HORAINICIO);
                        });

                    for (const et of validETs) {
                        if (this.canAssign(et)) {
                            this.assignOffer(planClave, [et]);
                            assignedForPlan = true;
                            assignedInThisIteration = true;
                            break;
                        }
                    }
                }

                if (!assignedForPlan) {
                    const validEPs = availableOffers.filter(o => o.isPractical)
                        .sort((a, b) => {
                            const dayA = this.getDayNumber(a.sessions[0].CODIGODIA);
                            const dayB = this.getDayNumber(b.sessions[0].CODIGODIA);
                            if (dayA !== dayB) return dayA - dayB;
                            return a.sessions[0].HORAINICIO.localeCompare(b.sessions[0].HORAINICIO);
                        });

                    for (const ep of validEPs) {
                        if (this.canAssign(ep)) {
                            this.assignOffer(planClave, [ep]);
                            assignedForPlan = true;
                            assignedInThisIteration = true;
                            break;
                        }
                    }
                }
            }

            if (!assignedInThisIteration) {
                classroomFull = true;
            }

            const totalSlots = 6 * this.timeSlots.length;
            const occupiedSlots = Object.keys(this.schedule).length;
            if (occupiedSlots >= totalSlots) classroomFull = true;

            iteration++;
        }

        this.updateUI();
    }
}

window.addEventListener('DOMContentLoaded', () => {
    window.simulator = new ScheduleSimulator();
});
