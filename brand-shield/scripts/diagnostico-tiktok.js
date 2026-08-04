// Diagnóstico REAL de la conexión de TikTok, contra la API y la BD de prod.
//
// Responde la pregunta que el panel no puede: "subí un video y no aparece nada,
// ¿de quién es el problema?". Va paso por paso y dice en cuál se traba:
//   1. ¿hay cuenta conectada y el token sirve?  (se renueva si venció)
//   2. ¿la app puede LISTAR los videos?          (scope video.list)
//   3. ¿puede LEER los comentarios de un video?  (scope comment.list)
//
// Correr:
//   cd brand-shield
//   railway run --service api node scripts/diagnostico-tiktok.js
//
// `railway run` inyecta TIKTOK_CLIENT_KEY/SECRET del servicio api; sin eso no
// hay con qué renovar el token y el script no puede hacer nada.

const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');

if (!process.env.TIKTOK_CLIENT_KEY) {
  console.error('\n✖ Faltan las credenciales de TikTok.');
  console.error('  Correr con: railway run --service api node scripts/diagnostico-tiktok.js\n');
  process.exit(1);
}

// Railway inyecta la URL INTERNA de Postgres (postgres.railway.internal), que
// solo resuelve dentro de su red. Desde una máquina de desarrollo hay que usar
// la pública del .env local — es la misma base de datos.
const envLocal = path.join(RAIZ, '.env');
if (fs.existsSync(envLocal)) {
  const local = require('dotenv').parse(fs.readFileSync(envLocal));
  if (local.DATABASE_URL && /railway\.internal/.test(process.env.DATABASE_URL || '')) {
    process.env.DATABASE_URL = local.DATABASE_URL;
  }
}

const axios = require('axios');
const prisma = require('../src/lib/prisma');
const { tokenTikTokVigente } = require('../src/lib/tiktokToken');

const API = 'https://open.tiktokapis.com/v2';
const detalle = (e) => e.response?.data?.error?.message || e.response?.data?.error || e.message;
const codigo = (e) => e.response?.data?.error?.code || '';

(async () => {
  const negocios = await prisma.negocio.findMany({
    where: { tiktokAccessToken: { not: null } },
    select: {
      id: true, nombre: true, tiktokOpenId: true, tiktokAccessToken: true,
      tiktokRefreshToken: true, tiktokTokenExpira: true, tiktokNombre: true,
    },
  });

  if (!negocios.length) {
    console.log('\nNingún negocio tiene una cuenta de TikTok conectada.');
    console.log('Conectala desde el panel: Dashboard → Conexiones → TikTok.\n');
    return;
  }

  console.log(`\nScopes configurados (TIKTOK_SCOPES): ${process.env.TIKTOK_SCOPES || '(default) user.info.basic,video.list'}`);

  for (const negocio of negocios) {
    console.log(`\n${'─'.repeat(60)}\n${negocio.nombre}  —  cuenta: ${negocio.tiktokNombre || '(sin nombre)'}`);

    // 1. Token ------------------------------------------------------------
    const vencido = negocio.tiktokTokenExpira && negocio.tiktokTokenExpira <= new Date();
    console.log(`\n1. Token — vence ${negocio.tiktokTokenExpira?.toISOString() || '(sin fecha)'}${vencido ? '  ⚠️ vencido, se intenta renovar' : ''}`);

    const token = await tokenTikTokVigente(negocio);
    if (!token) {
      console.log('   ✖ No hay token utilizable. Hay que RECONECTAR la cuenta desde el panel.');
      continue;
    }
    console.log('   ✔ Token vigente.');

    try {
      const { data } = await axios.get(`${API}/user/info/`, {
        headers: { Authorization: `Bearer ${token}` },
        params: { fields: 'open_id,display_name' },
      });
      console.log(`   ✔ La API responde: ${data.data?.user?.display_name}`);
    } catch (e) {
      console.log(`   ✖ user/info falla: ${detalle(e)}`);
      continue;
    }

    // 2. Videos -----------------------------------------------------------
    console.log('\n2. Videos (scope video.list)');
    let videos = [];
    try {
      const { data } = await axios.post(`${API}/video/list/`, { max_count: 10 }, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        params: { fields: 'id,title,create_time,comment_count,share_url' },
      });
      videos = data.data?.videos || [];
      console.log(`   ✔ ${videos.length} video(s) visibles para la app:`);
      for (const v of videos) {
        const fecha = new Date((v.create_time || 0) * 1000).toISOString().slice(0, 16).replace('T', ' ');
        console.log(`      · ${fecha} — ${v.comment_count ?? '?'} comentario(s) — ${(v.title || '(sin título)').slice(0, 50)}`);
      }
      if (!videos.length) {
        console.log('      (la cuenta no tiene videos, o la app en Sandbox no ve los de esta cuenta)');
      }
    } catch (e) {
      console.log(`   ✖ video/list falla: ${codigo(e)} — ${detalle(e)}`);
      if (codigo(e) === 'scope_not_authorized') {
        console.log('     → El token se emitió SIN video.list. Habilitar el scope en la consola de');
        console.log('       TikTok, poner TIKTOK_SCOPES en Railway y RECONECTAR la cuenta (el token');
        console.log('       viejo no gana permisos solo).');
      }
      continue;
    }

    // 3. Comentarios ------------------------------------------------------
    console.log('\n3. Comentarios (scope comment.list)');
    if (!videos.length) {
      console.log('   — sin videos que consultar.');
    } else {
      try {
        const { data } = await axios.post(`${API}/comment/list/`, { video_id: videos[0].id, count: 20 }, {
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        });
        const coms = data.data?.comments || [];
        console.log(`   ✔ ${coms.length} comentario(s) leídos del video más reciente.`);
        for (const c of coms.slice(0, 5)) {
          console.log(`      · ${c.username || 'usuario'}: ${(c.text || '').slice(0, 60)}`);
        }
      } catch (e) {
        const http = e.response?.status;
        console.log(`   ✖ comment/list falla: HTTP ${http} ${codigo(e)} — ${detalle(e)}`);
        if (http === 404) {
          // Comprobado el 2026-07-30 con un token válido y video.list funcionando:
          // la ruta devuelve un 404 en HTML, o sea que el servidor ni la conoce.
          console.log('     → 404 = la ruta NO EXISTE en la Display API. No es un permiso');
          console.log('       pendiente: la lectura y respuesta de comentarios vive en la');
          console.log('       TikTok API for Business (business-api.tiktok.com), que es otro');
          console.log('       portal, otra app y otro OAuth. Ver CLAUDE.md §15-quinquies.');
        }
      }
    }

    const enBd = await prisma.comentarioSocial.count({ where: { negocioId: negocio.id } });
    console.log(`\n   Comentarios guardados en Notoria: ${enBd}`);
  }

  console.log(`\n${'─'.repeat(60)}\n`);
})()
  .catch((e) => { console.error('\nFATAL:', e.message, '\n'); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
