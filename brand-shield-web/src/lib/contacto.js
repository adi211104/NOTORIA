// Único lugar donde viven los datos de contacto públicos. Si cambian, cambian acá.
//
// 🔴 Vive en `lib/` y no dentro de `PieLegal.js` porque el número lo necesitan
// DOS cosas que se renderizan en sitios distintos: el pie legal (servidor) y el
// botón flotante de WhatsApp (cliente). Mientras el botón tuvo su propia copia
// —una variable de entorno de Vercel— cambiar el número exigía tocar dos sitios,
// y olvidar uno no falla: el pie anuncia el número nuevo y el botón sigue
// mandando al viejo. Es el mismo fallo mudo que ya costó los precios duplicados
// en `precios.js` y la matriz de planes en `planes.js`.
//
// ⚠️ DÓNDE PUEDE Y DÓNDE NO PUEDE APARECER EL RUC.
//
// El RUC abre la ficha pública de SUNAT, y ahí está el domicilio fiscal del
// titular — que en una E.I.R.L. suele ser su casa. No es un dato decorativo para
// rellenar pies de página.
//
// La **Ley 32080** (2 de julio de 2024) eliminó la obligación —que existía desde
// 2023— de consignar el RUC y la denominación social en los medios digitales
// donde se ofertan bienes o servicios. O sea que en el landing ya no pinta nada,
// y de ahí se quitó el 2026-08-17.
//
// Dónde SÍ se queda, porque ahí identifica al proveedor y es lo que miran Culqi
// e INDECOPI: Términos, Privacidad, Contacto, Devoluciones y el Libro de
// Reclamaciones. Y en los comprobantes, donde sigue siendo obligatorio de verdad
// — pero esos van al cliente que compró, no a la pantalla de todos.
//
// ⚠️ Lo que el código NO puede arreglar, y es una DECISIÓN TOMADA, no una tarea
// pendiente: la ficha RUC de SUNAT es pública y el domicilio fiscal es una casa
// particular, así que quien tenga el RUC llega a esa dirección aunque la web no
// la muestre. Quitar el RUC del pie solo tapa el atajo. La única salida real era
// mover el domicilio fiscal a una oficina virtual, y el dueño decidió el
// 2026-08-22 no hacerlo. No hay nada que arreglar acá: si alguien lo reabre, la
// discusión está en CLAUDE.md §15.
//
// ⚠️ El teléfono también vive FUERA del código, en sitios que este archivo no
// puede tocar: la ficha del Perfil de Empresa de Google y el propio WhatsApp
// Business. Al cambiarlo hay que cambiarlo también ahí, o Google seguirá
// publicando el número viejo.
export const CONTACTO = {
  razonSocial: 'NOTORIA E.I.R.L.',
  ruc: '20616239466',
  direccion: 'Cal. Isla Filipinas Mza. G9 Lote 8, La Perla, Provincia Constitucional del Callao, Perú',
  email: 'hola@usenotoria.app',
  telefono: '+51 916 383 038',
  telefonoLink: '+51916383038',
  // Solo dígitos con código de país: es el formato que exige wa.me.
  whatsapp: '51916383038',
  horario: 'Lunes a viernes de 9:00 a 18:00 h (hora de Perú)',
};
