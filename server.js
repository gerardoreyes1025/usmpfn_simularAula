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
            p.CODIGO AS CodigoPabellon, -- Agregamos el código para verificar
            o.CODIGOSAPDOCENTE, 
            o.CODIGODIA, 
            o.HORAINICIO, 
            o.HORAFIN, 
            o.CODIGOTURNO, 
            o.VIGENCIA,
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
                '10202003', '10201427', '10202002', 
                '10201496', '10202001', '10202010', 
                '10201531', '10201426'
            )
            
            -- Filtro de Pabellones específicos
            AND p.CODIGO IN (2, 3, 4, 7, 8)
    `;

    //     -- Filtro de Planes de Estudio específicos
    // AND pl.Clave IN (
    //     '10201506', '10201507', '10202003', '10201427', '10202002', 
    //     '10201500', '10201496', '10201501', '10202001', '10202010', 
    //     '10201531', '10201426'
    // )

    try {
        const [rows] = await promisePool.query(query);
        res.json(rows);
    } catch (error) {
        console.error('Error fetching data:', error);
        res.status(500).json({ error: 'Database error' });
    }
});

const PORT = 3001;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

// Ruta por defecto para aplicaciones SPA o para servir index.html en la raíz
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});
