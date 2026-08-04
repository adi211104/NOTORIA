// brand-shield/scripts/prueba-publico.js
// Prueba el endpoint público del widget del landing contra la Google Places
// API REAL (gasta ~6 llamadas de cuota), sin levantar el backend completo:
// monta solo publico.routes en un puerto temporal, así no arrancan los crons.
//   node scripts/prueba-publico.js
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const express = require('express');
const axios = require('axios');
const publico = require('../src/api/routes/publico.routes');

const app = express();
app.use('/api/publico', publico);
const server = app.listen(3999, async () => {
  const base = 'http://localhost:3999/api/publico';
  let fallos = 0;
  try {
    const busq = await axios.get(`${base}/buscar-negocio`, { params: { q: 'Central restaurante Lima' } });
    console.log('✓ BUSCAR:', busq.status, '|', busq.data.length, 'resultados');
    if (!busq.data.length) { console.error('✗ búsqueda sin resultados'); fallos++; }
    else console.log(' ', busq.data[0].nombre, '—', busq.data[0].direccion);

    if (busq.data[0]) {
      const ana = await axios.get(`${base}/analizar`, { params: { placeId: busq.data[0].placeId } });
      const d = ana.data;
      console.log('✓ ANALIZAR:', ana.status, '| rating', d.rating, '|', d.totalResenas, 'reseñas |', d.resenasAnalizadas, 'analizadas |', d.sospechosas, 'sospechosas');
      if (d.muestra) console.log('  muestra:', JSON.stringify(d.muestra));

      const t0 = Date.now();
      await axios.get(`${base}/analizar`, { params: { placeId: busq.data[0].placeId } });
      const ms = Date.now() - t0;
      console.log(ms < 50 ? `✓ CACHE: segunda llamada en ${ms} ms` : `✗ CACHE dudoso: ${ms} ms (¿fue a Google?)`);
      if (ms >= 50) fallos++;
    }

    const corto = await axios.get(`${base}/buscar-negocio`, { params: { q: 'ab' }, validateStatus: () => true });
    console.log(corto.status === 400 ? '✓ VALIDACIÓN q corta: 400' : `✗ q corta devolvió ${corto.status}`);
    if (corto.status !== 400) fallos++;
  } catch (e) {
    console.error('✗ FALLO:', e.response ? `${e.response.status} ${JSON.stringify(e.response.data)}` : e.message);
    fallos++;
  } finally {
    server.close();
    process.exit(fallos ? 1 : 0);
  }
});
