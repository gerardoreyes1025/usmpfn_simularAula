/**
 * Mock data representing the result of the SQL query provided by the user.
 * 15 Study Plans, each with several offers.
 */
const MOCK_DATA = [
    {
        ClavePlan: '10201506',
        DENOMINACION: 'INGENIERÍA DE SISTEMAS',
        CLAVEESCUELA: 'SIST',
        CapacidadPaquete: 45,
        CONSECUTIVOOFERTA: 101,
        CLAVEEVENTO: 'EV001',
        ABREVIATURAEVENTO: 'FUND1',
        ANO: 2026,
        SEMESTRE: 1,
        CODIGOAULA: 'A101',
        CODIGOSAPDOCENTE: 'D001',
        CODIGODIA: 1, // Lunes
        HORAINICIO: '07:16',
        HORAFIN: '08:00',
        CODIGOTURNO: 'M',
        VIGENCIA: 1
    },
    {
        ClavePlan: '10201506',
        DENOMINACION: 'INGENIERÍA DE SISTEMAS',
        CLAVEESCUELA: 'SIST',
        CapacidadPaquete: 45,
        CONSECUTIVOOFERTA: 101,
        CLAVEEVENTO: 'EV001',
        ABREVIATURAEVENTO: 'FUND1',
        ANO: 2026,
        SEMESTRE: 1,
        CODIGOAULA: 'A101',
        CODIGOSAPDOCENTE: 'D001',
        CODIGODIA: 3, // Miércoles
        HORAINICIO: '07:16',
        HORAFIN: '08:00',
        CODIGOTURNO: 'M',
        VIGENCIA: 1
    },
    {
        ClavePlan: '10201507',
        DENOMINACION: 'INGENIERÍA INDUSTRIAL',
        CLAVEESCUELA: 'IND',
        CapacidadPaquete: 50,
        CONSECUTIVOOFERTA: 201,
        CLAVEEVENTO: 'EV002',
        ABREVIATURAEVENTO: 'CALC1',
        ANO: 2026,
        SEMESTRE: 1,
        CODIGOAULA: 'A102',
        CODIGOSAPDOCENTE: 'D002',
        CODIGODIA: 2, // Martes
        HORAINICIO: '08:01',
        HORAFIN: '08:45',
        CODIGOTURNO: 'M',
        VIGENCIA: 1
    },
    // ... adding more variety to cover all 15 plans and different times
];

// Helper to generate more mock data for the 15 plans
const planClaves = [
    '10201506', '10201507', '10202003', '10201427', '10202002',
    '10201500', '10201496', '10201501', '10202001', '10202007',
    '10202006', '10202005', '10202010', '10201531', '10201426'
];

const planNames = [
    'Sistemas I', 'Industrial II', 'Administración III', 'Economía IV', 'Derecho V',
    'Psicología VI', 'Medicina VII', 'Arquitectura VIII', 'Contabilidad IX', 'Turismo X',
    'Comunicación XI', 'Educación XII', 'Enfermería XIII', 'Negocios XIV', 'Marketing XV'
];

const days = [1, 2, 3, 4, 5, 6]; // Lunes a Sábado
const timeSlots = [
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

const generatedData = [];
planClaves.forEach((clave, index) => {
    const planName = planNames[index];
    // Create 5 offers for each plan to choose from
    for (let o = 0; o < 5; o++) {
        const consec = (index + 1) * 100 + o;
        const capacity = 40 + Math.floor(Math.random() * 30); // 40 to 70

        // Random day
        const day = days[Math.floor(Math.random() * days.length)];
        // Random start slot, but let's try to make some of them contiguous
        const slotIndex = (index + o) % timeSlots.length;
        const slot = timeSlots[slotIndex];

        generatedData.push({
            ClavePlan: clave,
            DENOMINACION: planName,
            CLAVEESCUELA: planName.substring(0, 3).toUpperCase(),
            CapacidadPaquete: capacity,
            CONSECUTIVOOFERTA: consec,
            CLAVEEVENTO: `EV${consec}`,
            ABREVIATURAEVENTO: `${planName.substring(0, 4).toUpperCase()}-${o}`,
            ANO: 2026,
            SEMESTRE: 1,
            CODIGOAULA: '',
            CODIGOSAPDOCENTE: `DOC-${consec}`,
            CODIGODIA: day,
            HORAINICIO: slot.start,
            HORAFIN: slot.end,
            CODIGOTURNO: slot.start < '13:00' ? 'M' : 'T',
            VIGENCIA: 1
        });
    }
});

export const data = generatedData;
export const slots = timeSlots;
