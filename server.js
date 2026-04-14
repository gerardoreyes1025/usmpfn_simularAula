const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
require('dotenv').config();
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// Servir archivos estáticos del frontend (index.html, script.js, style.css, etc.)
// Coloca aquí tus archivos estáticos en el mismo directorio del proyecto.
app.use(express.static(path.join(__dirname)));

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

const promisePool = pool.promise();

app.get('/api/ofertas', async (req, res) => {
    const query = `
        SELECT 
            pl.CLAVE AS ClavePlan,
            pl.DENOMINACION as PlanEstudio, 
            pl.CLAVEESCUELA,
            pe.CAPACIDADMAXIMA AS CapacidadPaquete,
            o.CONSECUTIVOOFERTA, 
            o.CLAVEEVENTO, 
            o.ABREVIATURAEVENTO, 
            e.DENOMINACION AS NombreCurso,
            o.ANO, 
            o.SEMESTRE, 
            o.CODIGOAULA, 
            a.DENOMINACION AS NombreAula,
            a.CODIGO AS CodigoAula,
            p.CODIGO AS CodigoPabellon,
            o.CODIGOSAPDOCENTE, 
            o.CODIGODIA, 
            o.HORAINICIO, 
            o.HORAFIN, 
            o.CODIGOTURNO, 
            o.VIGENCIA,
            e.ABREVIATURAPAQUETEEVENTOS,
            per.APELLIDOPATERNO,
            per.APELLIDOMATERNO,
            per.NOMBRES
        FROM planestudios pl
        INNER JOIN paqueteeventos2 pe ON pl.Clave = pe.Claveplanestudios
        INNER JOIN evento2 e ON pe.ABREVIATURA = e.ABREVIATURAPAQUETEEVENTOS
        INNER JOIN oferta2 o ON e.CLAVE = o.CLAVEEVENTO
        -- Relación con aula y pabellón
        INNER JOIN aula a ON o.CODIGOAULA = a.CODIGO 
        INNER JOIN pabellon p ON a.CODIGOPABELLON = p.CODIGO
        -- Relación con docente
        LEFT JOIN persona per ON o.CODIGOSAPDOCENTE = per.CODIGOSAP
        WHERE 
            -- Filtros de tiempo y estado
            o.ANO = 2026 
            AND o.SEMESTRE = '1' 
            AND o.VIGENCIA = 1
            AND e.ANO = 2026 
            AND e.SEMESTRE = '1'
            AND e.VIGENCIA = 1
            AND pe.ANO = 2026 
            AND pe.SEMESTRE = '1'
            AND pe.VIGENCIA = 1
            AND pl.VIGENCIA = 1  
            
            -- Filtro de Planes de Estudio específicos
            AND pl.Clave IN (

                '10202003', -- ARQUITECTURA
                '10200142', -- CIENCIAS
                '10201427', -- CIENCIAS V2
                '10202002', -- CIVIL
                '10201496', -- DERECHO
                '10202001', -- INDUSTRIAL Vers.04
                '10202007', -- ING. CIBERSEGURIDAD Vers.01
                '10202006', -- ING. CIENCIAS DE DATOS Vers.01
                '10202005', -- ING. INTELIGENCIA ARTIFICIAL Vers.01
                '10201755', -- MEDICINA HUMANA (PREGRADO vs 04)
                '10202010', -- MEDICINA HUMANA (PREGRADO vs 06)
                '10200378', -- ODONT.
                '10201531', -- ODONT.
                '10200147', -- PSICOLOGÍA
                '10201426'  -- PSICOLOGÍA V2
            )
            
            -- Filtro de Pabellones específicos
            AND p.CODIGO IN (2, 3, 4, 7, 8)
    `;

    //     '10201506', -- ADMINISTRACIÓN
    // '10201507', -- ADMINISTRACIÓN NEGOCIOS INTERNACIONALES
    // '10202003', -- ARQUITECTURA
    // '10200142', -- CIENCIAS
    // '10201427', -- CIENCIAS V2
    // '10202002', -- CIVIL
    // '10200044', -- CONT. Y FINAN.
    // '10201500', -- CONT. Y FINAN.
    // '10201496', -- DERECHO
    // '10200046', -- ECONOMÍA
    // '10201501', -- ECONOMÍA
    // '10202001', -- INDUSTRIAL Vers.04
    // '10202007', -- ING. CIBERSEGURIDAD Vers.01
    // '10202006', -- ING. CIENCIAS DE DATOS Vers.01
    // '10202005', -- ING. INTELIGENCIA ARTIFICIAL Vers.01
    // '10201755', -- MEDICINA HUMANA (PREGRADO vs 04)
    // '10202010', -- MEDICINA HUMANA (PREGRADO vs 06)
    // '10200378', -- ODONT.
    // '10201531', -- ODONT.
    // '10200147', -- PSICOLOGÍA
    // '10201426'  -- PSICOLOGÍA V2
    // AND pl.Clave IN (
    //     '10202003', '10201427', '10202002', 
    //     '10201496', '10202001', '10202010', 
    //     '10201531', '10201426', '10200147'

    // )
    try {
        const [rows] = await promisePool.query(query);
        res.json(rows);
    } catch (error) {
        console.error('Error fetching data:', error);
        res.status(500).json({ error: 'Database error' });
    }
});

app.get('/api/migracion/aulas', async (req, res) => {
    const query = `
        SELECT 
            a.CODIGO AS CodigoAula,
            a.DENOMINACION AS NombreAula,
            a.CAPACIDAD AS Capacidad,
            p.CODIGO AS CodigoPabellon,
            p.DENOMINACION AS NombrePabellon,
            p.CODIGOCAMPUS AS CodigoCampus
        FROM aula a
        INNER JOIN pabellon p ON a.CODIGOPABELLON = p.CODIGO
        WHERE a.VIGENCIA = 1
    `;
    try {
        const [rows] = await promisePool.query(query);
        res.json(rows);
    } catch (error) {
        console.error('Error fetching aulas:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.get('/api/migracion/ofertas', async (req, res) => {
    // Fetches essentially the same but includes course requirement capacity and campus code
    // To not break existing stuff, we keep it separate and simpler.
    const query = `
        SELECT 
            o.CONSECUTIVOOFERTA, 
            o.CLAVEEVENTO,
            e.ABREVIATURAPAQUETEEVENTOS,
            o.ABREVIATURAEVENTO,
            pe.CAPACIDADMAXIMA AS CapacidadNecesaria,
            a.CODIGO AS CodigoAula,
            a.CAPACIDAD AS CapacidadAula,
            p.CODIGOCAMPUS AS CodigoCampus,
            o.CODIGODIA, 
            o.HORAINICIO, 
            o.HORAFIN,
            e.DENOMINACION AS NombreCurso,
            TRIM(CONCAT(IFNULL(per.NOMBRES,''), ' ', IFNULL(per.APELLIDOPATERNO,''), ' ', IFNULL(per.APELLIDOMATERNO,''))) AS Docente
        FROM oferta2 o
        INNER JOIN evento2 e ON o.CLAVEEVENTO = e.CLAVE
        INNER JOIN paqueteeventos2 pe ON e.ABREVIATURAPAQUETEEVENTOS = pe.ABREVIATURA
        INNER JOIN aula a ON o.CODIGOAULA = a.CODIGO 
        INNER JOIN pabellon p ON a.CODIGOPABELLON = p.CODIGO
        LEFT JOIN persona per ON o.CODIGOSAPDOCENTE = per.CODIGOSAP
        WHERE 
            o.ANO = 2026 AND o.SEMESTRE = '1' AND o.VIGENCIA = 1
            AND e.ANO = 2026 AND e.SEMESTRE = '1' AND e.VIGENCIA = 1
            AND pe.ANO = 2026 AND pe.SEMESTRE = '1' AND pe.VIGENCIA = 1
    `;
    try {
        const [rows] = await promisePool.query(query);
        res.json(rows);
    } catch (error) {
        console.error('Error fetching migracion ofertas:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

const PORT = 3001;
app.listen(PORT, () => {
    console.log(`Servidor corriendo en el puerto ${PORT}`);
});

// Ruta por defecto para aplicaciones SPA o para servir index.html en la raíz
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});
