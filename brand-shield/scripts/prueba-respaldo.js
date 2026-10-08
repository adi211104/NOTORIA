// node scripts/prueba-respaldo.js
//
// El respaldo tiene que poder RESTAURARSE: toda tabla del schema entra (o está
// excluida con motivo) y el orden respeta cada clave foránea. Lo contrasta con
// prisma/schema.prisma, sin base. Nació del simulacro del 2026-10-07, que se
// cayó en la primera FK con un respaldo que `--verificar` daba por íntegro.

const fs = require('fs');
const path = require('path');
const { TABLAS, NO_SE_RESPALDAN } = require('./lib-respaldo-tablas');

let ok = 0; let mal = 0;
const check = (n, c, d = '') => { if (c) { ok += 1; console.log('  ✓', n); } else { mal += 1; console.log('  ✗', n, d); } };
const delegado = (modelo) => modelo[0].toLowerCase() + modelo.slice(1);

const schema = fs.readFileSync(path.join(__dirname, '..', 'prisma', 'schema.prisma'), 'utf8').replace(/\r\n/g, '\n');
const modelos = [...schema.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)].map(([, nombre, cuerpo]) => ({
  nombre: delegado(nombre),
  // Relaciones con `fields:` = esta tabla guarda la FK → depende del otro modelo.
  padres: [...cuerpo.matchAll(/^\s*\w+\s+(\w+)\??\s+@relation\([^)]*fields:/gm)].map((m) => delegado(m[1])),
}));

console.log('\n1. Toda tabla del schema se respalda (o se excluye con motivo)');
const faltan = modelos.map((m) => m.nombre).filter((n) => !TABLAS.includes(n) && !(n in NO_SE_RESPALDAN));
check('ningún modelo queda fuera del respaldo sin motivo', modelos.length > 20 && faltan.length === 0, faltan.join(', '));
const sobran = TABLAS.filter((t) => !modelos.some((m) => m.nombre === t));
check('el respaldo no nombra tablas que ya no existen', sobran.length === 0, sobran.join(', '));
check('sin duplicados en el orden', new Set(TABLAS).size === TABLAS.length);

console.log('\n2. El orden respeta todas las claves foráneas');
const malas = [];
for (const m of modelos) {
  for (const p of m.padres) {
    if (p === m.nombre || !TABLAS.includes(m.nombre) || !TABLAS.includes(p)) continue;
    if (TABLAS.indexOf(p) > TABLAS.indexOf(m.nombre)) malas.push(`${m.nombre} va antes que su padre ${p}`);
  }
}
check('cada tabla va después de las tablas a las que apunta', malas.length === 0, malas.join(' · '));
const comp = modelos.find((m) => m.nombre === 'comprobante');
check('CONTROL: la prueba ve la FK que tumbó el simulacro (comprobante → resumenSunat)', comp?.padres.includes('resumenSunat'), JSON.stringify(comp?.padres));

console.log('\n3. Las dos puntas usan la misma lista');
const sinCom = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
check('respaldo.js lee lib-respaldo-tablas', /require\('\.\/lib-respaldo-tablas'\)/.test(sinCom(fs.readFileSync(path.join(__dirname, 'respaldo.js'), 'utf8'))));
check('restaurar.js lee lib-respaldo-tablas y NO el orden guardado en el archivo', /require\('\.\/lib-respaldo-tablas'\)/.test(sinCom(fs.readFileSync(path.join(__dirname, 'restaurar.js'), 'utf8'))));

console.log(`\n${ok} pasaron, ${mal} fallaron`);
process.exit(mal ? 1 : 0);
