// Proxy de usar y tirar para poder revisar el diseño en móvil.
//
// POR QUÉ EXISTE. La técnica documentada en el repo (§23.8) era meter la página
// en un iframe de 390 px: las media queries responden al viewport del iframe, así
// que es una prueba real y no una simulación. Dejó de funcionar cuando §25.7
// añadió `X-Frame-Options: DENY` y `frame-ancestors 'none'` a la web — el
// navegador ya no deja incrustarla ni en su propio origen.
//
// Este proxy sirve usenotoria.app tal cual pero SIN esas dos cabeceras, así que
// el iframe vuelve a poder montarse. No toca nada del proyecto.
//
// Escucha en el 3001 a propósito: ese origen SÍ está en la lista de CORS del
// backend (`origensPermitidos` en brand-shield/src/index.js), así que las páginas
// que llaman a la API funcionan igual que en producción.
//
//   node proxy-movil.js      →  http://localhost:3001/...

const http = require('http');
const https = require('https');

const DESTINO = 'usenotoria.app';

http.createServer((req, res) => {
  const opciones = {
    hostname: DESTINO,
    port: 443,
    path: req.url,
    method: req.method,
    headers: { ...req.headers, host: DESTINO, 'accept-encoding': 'identity' },
  };

  const arriba = https.request(opciones, (r) => {
    const cabeceras = { ...r.headers };
    // Se quita lo que impide incrustar la página. Ojo: NO basta con
    // `frame-ancestors` (que mira quién puede enmarcarme). La CSP de la web
    // tambien trae `frame-src https://*.culqi.com ...` sin 'self', y esa dirige
    // el otro sentido: qué puede enmarcar la página PADRE. Con una sola de las
    // dos puesta, contentDocument sigue saliendo null.
    delete cabeceras['x-frame-options'];
    delete cabeceras['content-security-policy'];
    res.writeHead(r.statusCode, cabeceras);
    r.pipe(res);
  });

  arriba.on('error', (e) => { res.writeHead(502); res.end('proxy: ' + e.message); });
  req.pipe(arriba);
}).listen(3001, () => console.log('proxy movil escuchando en http://localhost:3001 -> ' + DESTINO));
