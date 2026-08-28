// Mueve la conexión de TikTok (Accounts API) de un negocio a otro.
//
// Existe porque la cuenta @usenotoria estaba colgada del negocio de una cuenta
// de prueba que se iba a borrar, y era la ÚNICA conexión de TikTok viva en
// producción. Borrar la cuenta se la habría llevado por delante.
//
// 🔴 Copiar, no cortar: el producto ya contempla que una misma cuenta de TikTok
//    esté en varios negocios —los tokens se persisten con `updateMany` justo por
//    eso (§8.2)—, así que dejar el origen intacto hasta que el destino esté
//    comprobado no rompe nada y deja marcha atrás.
//
// ⚠️ `DELETE /api/auth/cuenta` NO revoca el token en TikTok, solo borra las
//    filas. Por eso borrar la cuenta de origen después NO tumba la conexión del
//    destino. Si algún día ese borrado empieza a revocar, esta receta deja de
//    valer y hay que reconectar por OAuth.
//
//   node scripts/mover-tiktok.js <negocioIdOrigen> <negocioIdDestino> [--aplicar]
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const CAMPOS = [
  'tiktokBizId', 'tiktokBizAccessToken', 'tiktokBizRefreshToken', 'tiktokBizTokenExpira',
  'tiktokOpenId', 'tiktokAccessToken', 'tiktokRefreshToken', 'tiktokTokenExpira',
  'tiktokNombre', 'tiktokAvatar', 'tiktokUsername', 'tiktokPerfilUrl',
];
// Nunca se imprime un token: solo si está y cuánto mide.
const SECRETOS = new Set(['tiktokBizAccessToken', 'tiktokBizRefreshToken', 'tiktokAccessToken', 'tiktokRefreshToken']);
const muestra = (k, v) => v == null ? '(vacío)' : SECRETOS.has(k) ? `presente, ${String(v).length} car.` : String(v);

(async () => {
  const [origenId, destinoId] = process.argv.slice(2);
  const aplicar = process.argv.includes('--aplicar');
  if (!origenId || !destinoId) { console.error('Faltan los dos ids de negocio.'); process.exit(1); }

  const sel = { id: true, nombre: true, activo: true, usuario: { select: { email: true, plan: true } } };
  CAMPOS.forEach(c => sel[c] = true);
  const origen = await prisma.negocio.findUnique({ where: { id: origenId }, select: sel });
  const destino = await prisma.negocio.findUnique({ where: { id: destinoId }, select: sel });
  if (!origen || !destino) { console.error('No existe alguno de los dos negocios.'); process.exit(1); }

  console.log('ORIGEN :', origen.nombre, '|', origen.usuario.email, '|', origen.usuario.plan);
  console.log('DESTINO:', destino.nombre, '|', destino.usuario.email, '|', destino.usuario.plan);

  if (!origen.tiktokBizId) { console.error('\nEl origen no tiene conexión de Accounts API. Nada que mover.'); process.exit(1); }
  if (destino.tiktokBizId) { console.error('\nEl destino YA tiene una conexión de TikTok. Se aborta para no pisarla.'); process.exit(1); }

  console.log('\n  campo                    origen                        -> destino (ahora)');
  const data = {};
  for (const c of CAMPOS) {
    if (origen[c] == null) continue;
    data[c] = origen[c];
    console.log('   ', c.padEnd(24), muestra(c, origen[c]).padEnd(29), '->', muestra(c, destino[c]));
  }

  if (!aplicar) { console.log('\n(ensayo — nada escrito. Repetir con --aplicar)'); await prisma.$disconnect(); return; }

  await prisma.negocio.update({ where: { id: destinoId }, data });
  const post = await prisma.negocio.findUnique({ where: { id: destinoId }, select: sel });
  const ok = CAMPOS.every(c => origen[c] == null || String(post[c]) === String(origen[c]));
  console.log('\n' + (ok ? '✅ Copiado y verificado leyendo la fila de vuelta.' : '❌ Algo no coincide tras el update.'));
  console.log('   El origen se deja INTACTO a propósito: hasta que el destino esté probado, es la marcha atrás.');
  await prisma.$disconnect();
})().catch(async e => { console.error('ERROR:', e.message); await prisma.$disconnect(); process.exit(1); });
