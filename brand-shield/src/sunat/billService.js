// brand-shield/src/sunat/billService.js
// Cliente del web service de SUNAT (SEE - Del Contribuyente).
//
// El comprobante viaja como un ZIP que contiene el XML firmado, en base64,
// dentro de un sobre SOAP autenticado con WS-Security UsernameToken. SUNAT
// responde con un CDR (Constancia de Recepción), que también viene como ZIP en
// base64 y es la prueba de que el comprobante fue aceptado. Sin CDR aceptado,
// el comprobante no existe para efectos tributarios.
//
// Credenciales: usuario SOL SECUNDARIO (RUC + usuario + clave), nunca el
// principal. En el entorno beta se usa el RUC de pruebas 20000000001 con
// usuario MODDATOS / clave moddatos.

const axios = require('axios');
const JSZip = require('jszip');

const ENDPOINTS = {
  beta: 'https://e-beta.sunat.gob.pe/ol-ti-itcpfegem-beta/billService',
  produccion: 'https://e-factura.sunat.gob.pe/ol-ti-itcpfegem/billService',
};

const entorno = () => (process.env.SUNAT_ENTORNO === 'produccion' ? 'produccion' : 'beta');
const endpoint = () => process.env.SUNAT_ENDPOINT || ENDPOINTS[entorno()];

const credenciales = () => {
  const ruc = process.env.EMISOR_RUC || '20616239466';
  const usuario = process.env.SUNAT_SOL_USUARIO;
  const clave = process.env.SUNAT_SOL_CLAVE;
  if (!usuario || !clave) throw new Error('Faltan SUNAT_SOL_USUARIO y SUNAT_SOL_CLAVE');
  return { username: `${ruc}${usuario}`, password: clave };
};

const configurado = () => !!(process.env.SUNAT_SOL_USUARIO && process.env.SUNAT_SOL_CLAVE);

// Empaqueta el XML firmado en el ZIP que espera SUNAT: un único archivo con el
// mismo nombre base que el ZIP.
const empaquetar = async (xmlFirmado, nombreArchivo) => {
  const zip = new JSZip();
  zip.file(`${nombreArchivo}.xml`, xmlFirmado);
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
};

const sobreSoap = (nombreArchivo, zipBase64) => {
  const { username, password } = credenciales();
  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ser="http://service.sunat.gob.pe" xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd">
  <soapenv:Header>
    <wsse:Security>
      <wsse:UsernameToken>
        <wsse:Username>${username}</wsse:Username>
        <wsse:Password>${password}</wsse:Password>
      </wsse:UsernameToken>
    </wsse:Security>
  </soapenv:Header>
  <soapenv:Body>
    <ser:sendBill>
      <fileName>${nombreArchivo}.zip</fileName>
      <contentFile>${zipBase64}</contentFile>
    </ser:sendBill>
  </soapenv:Body>
</soapenv:Envelope>`;
};

const entre = (texto, etiqueta) => {
  const m = texto.match(new RegExp(`<(?:\\w+:)?${etiqueta}[^>]*>([\\s\\S]*?)</(?:\\w+:)?${etiqueta}>`));
  return m ? m[1].trim() : null;
};

// Abre el ZIP del CDR y extrae el estado que declara SUNAT.
// ResponseCode "0" = aceptado. Cualquier otro valor es rechazo, y el
// comprobante NO tiene validez tributaria aunque se haya entregado al cliente.
const leerCdr = async (zipBuffer) => {
  const zip = await JSZip.loadAsync(zipBuffer);
  const archivo = Object.keys(zip.files).find((n) => n.toLowerCase().endsWith('.xml') && !zip.files[n].dir);
  if (!archivo) throw new Error('El CDR no contiene ningún XML');

  const xml = await zip.file(archivo).async('string');
  const codigo = entre(xml, 'ResponseCode');
  const descripcion = entre(xml, 'Description');

  // Las observaciones no invalidan el comprobante, pero conviene registrarlas
  const notas = [...xml.matchAll(/<(?:\w+:)?Note[^>]*>([\s\S]*?)<\/(?:\w+:)?Note>/g)].map((m) => m[1].trim());

  return { codigo, descripcion, notas, xml, aceptado: codigo === '0' };
};

// Envía un comprobante y devuelve el resultado del CDR.
//
// Distingue tres desenlaces, porque exigen reacciones distintas:
//   aceptado            → guardar el CDR, listo
//   rechazado           → el comprobante es inválido; hay que corregir y reemitir
//   error de transporte → reintentar; el comprobante sigue pendiente
//
// No lanza excepción ante un rechazo de SUNAT: un rechazo es información, no un
// fallo del proceso. Sí propaga los errores de red para que la cola reintente.
const enviar = async ({ xmlFirmado, nombreArchivo, timeoutMs = 30000 }) => {
  const zip = await empaquetar(xmlFirmado, nombreArchivo);
  const envelope = sobreSoap(nombreArchivo, zip.toString('base64'));

  let respuesta;
  try {
    respuesta = await axios.post(endpoint(), envelope, {
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        SOAPAction: '',
      },
      timeout: timeoutMs,
      // Las respuestas de error de SUNAT llegan con HTTP 500 y un SOAP Fault en
      // el cuerpo; hay que leerlo en vez de tratarlo como fallo de transporte.
      validateStatus: (s) => s === 200 || s === 500,
    });
  } catch (error) {
    const status = error.response?.status;
    let mensaje = error.message;
    if (error.code === 'ECONNABORTED') {
      mensaje = `SUNAT no respondió en ${timeoutMs / 1000}s`;
    } else if (status === 401) {
      // En beta suele ser el usuario MODDATOS saturado (es compartido por todos
      // los que prueban); en producción, credenciales SOL incorrectas.
      mensaje = 'SUNAT devolvió 401: credenciales rechazadas o servicio saturado';
    } else if (status) {
      mensaje = `SUNAT devolvió HTTP ${status}`;
    }
    return { estado: 'ERROR_TRANSPORTE', aceptado: false, httpStatus: status || null, mensaje };
  }

  const cuerpo = String(respuesta.data);

  // SOAP Fault: SUNAT rechazó el documento o las credenciales
  if (cuerpo.includes('Fault')) {
    const codigo = entre(cuerpo, 'faultcode');
    const mensaje = entre(cuerpo, 'faultstring');
    return {
      estado: 'RECHAZADO',
      aceptado: false,
      codigo: codigo ? codigo.replace(/^\w+:/, '') : null,
      mensaje: mensaje || 'SUNAT devolvió un fault sin descripción',
    };
  }

  const contenido = entre(cuerpo, 'applicationResponse');
  if (!contenido) {
    return { estado: 'ERROR_TRANSPORTE', aceptado: false, mensaje: 'Respuesta de SUNAT sin applicationResponse' };
  }

  const cdr = await leerCdr(Buffer.from(contenido, 'base64'));
  return {
    estado: cdr.aceptado ? 'ACEPTADO' : 'RECHAZADO',
    aceptado: cdr.aceptado,
    codigo: cdr.codigo,
    mensaje: cdr.descripcion,
    notas: cdr.notas,
    cdrXml: cdr.xml,
    cdrZip: Buffer.from(contenido, 'base64'),
  };
};

// ── Envío asíncrono: resúmenes y bajas ────────────────────
//
// Los resúmenes diarios de boletas y las comunicaciones de baja NO se envían
// como un comprobante suelto. `sendSummary` no devuelve el CDR: devuelve un
// TICKET, y hay que volver a preguntar por él con `getStatus` hasta que SUNAT
// termine de procesarlo. Por eso el ticket se persiste — si el proceso se cae
// entre el envío y la consulta, sin el ticket no hay forma de saber si SUNAT
// aceptó el resumen, y reenviarlo daría un duplicado.
const sobreSoapOperacion = (operacion, cuerpo) => {
  const { username, password } = credenciales();
  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ser="http://service.sunat.gob.pe" xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd">
  <soapenv:Header>
    <wsse:Security>
      <wsse:UsernameToken>
        <wsse:Username>${username}</wsse:Username>
        <wsse:Password>${password}</wsse:Password>
      </wsse:UsernameToken>
    </wsse:Security>
  </soapenv:Header>
  <soapenv:Body>
    <ser:${operacion}>${cuerpo}</ser:${operacion}>
  </soapenv:Body>
</soapenv:Envelope>`;
};

const pedir = async (envelope, timeoutMs) => {
  try {
    const r = await axios.post(endpoint(), envelope, {
      headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: '' },
      timeout: timeoutMs,
      validateStatus: (s) => s === 200 || s === 500,
    });
    return { ok: true, cuerpo: String(r.data) };
  } catch (error) {
    const status = error.response?.status;
    let mensaje = error.message;
    if (error.code === 'ECONNABORTED') mensaje = `SUNAT no respondió en ${timeoutMs / 1000}s`;
    else if (status === 401) mensaje = 'SUNAT devolvió 401: credenciales rechazadas o servicio saturado';
    else if (status) mensaje = `SUNAT devolvió HTTP ${status}`;
    return { ok: false, mensaje, httpStatus: status || null };
  }
};

// Envía un resumen (RC) o una baja (RA). Devuelve el ticket con el que después
// se consulta el resultado.
const enviarResumen = async ({ xmlFirmado, nombreArchivo, timeoutMs = 30000 }) => {
  const zip = await empaquetar(xmlFirmado, nombreArchivo);
  const envelope = sobreSoapOperacion('sendSummary',
    `<fileName>${nombreArchivo}.zip</fileName><contentFile>${zip.toString('base64')}</contentFile>`);

  const r = await pedir(envelope, timeoutMs);
  if (!r.ok) return { estado: 'ERROR_TRANSPORTE', mensaje: r.mensaje, httpStatus: r.httpStatus };

  if (r.cuerpo.includes('Fault')) {
    return {
      estado: 'RECHAZADO',
      codigo: (entre(r.cuerpo, 'faultcode') || '').replace(/^\w+:/, '') || null,
      mensaje: entre(r.cuerpo, 'faultstring') || 'SUNAT devolvió un fault sin descripción',
    };
  }

  const ticket = entre(r.cuerpo, 'ticket');
  if (!ticket) return { estado: 'ERROR_TRANSPORTE', mensaje: 'SUNAT no devolvió ticket' };
  return { estado: 'EN_PROCESO', ticket };
};

// Consulta el resultado de un ticket.
//
// statusCode: "0" procesado y aceptado · "98" en proceso (hay que reintentar)
// · "99" procesado con errores. El CDR viene en `content` solo cuando ya
// terminó, y es la prueba que hay que conservar.
const consultarTicket = async ({ ticket, timeoutMs = 30000 }) => {
  const envelope = sobreSoapOperacion('getStatus', `<ticket>${ticket}</ticket>`);
  const r = await pedir(envelope, timeoutMs);
  if (!r.ok) return { estado: 'ERROR_TRANSPORTE', mensaje: r.mensaje, httpStatus: r.httpStatus };

  if (r.cuerpo.includes('Fault')) {
    return {
      estado: 'RECHAZADO',
      codigo: (entre(r.cuerpo, 'faultcode') || '').replace(/^\w+:/, '') || null,
      mensaje: entre(r.cuerpo, 'faultstring') || 'SUNAT devolvió un fault sin descripción',
    };
  }

  const statusCode = entre(r.cuerpo, 'statusCode');
  if (statusCode === '98') return { estado: 'EN_PROCESO', statusCode };

  const contenido = entre(r.cuerpo, 'content');
  if (!contenido) {
    return { estado: 'ERROR_TRANSPORTE', statusCode, mensaje: `SUNAT devolvió statusCode ${statusCode} sin CDR` };
  }

  const cdr = await leerCdr(Buffer.from(contenido, 'base64'));
  return {
    estado: cdr.aceptado ? 'ACEPTADO' : 'RECHAZADO',
    statusCode,
    codigo: cdr.codigo,
    mensaje: cdr.descripcion,
    notas: cdr.notas,
    cdrXml: cdr.xml,
  };
};

module.exports = {
  enviar, enviarResumen, consultarTicket,
  empaquetar, leerCdr, configurado, endpoint, entorno, ENDPOINTS,
};
