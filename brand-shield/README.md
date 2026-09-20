# Brand-Shield API

Monitor de reputación en tiempo real para negocios locales del Perú.

## Stack
- **Runtime:** Node.js 20 LTS
- **Framework:** Express.js
- **Base de datos:** PostgreSQL + Prisma ORM
- **Pagos:** Culqi
- **Emails:** Resend
- **Hosting:** Railway

---

## Instalación local

```bash
# 1. Clonar e instalar dependencias
npm install

# 2. Configurar variables de entorno
cp .env.example .env
# Edita .env con tus claves reales

# 3. Generar el cliente de Prisma
npm run db:generate

# 4. Crear las tablas en la base de datos
npm run db:push

# 5. Iniciar en modo desarrollo
npm run dev
```

El servidor corre en `http://localhost:3000`

---

## Endpoints principales

### Auth
| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | /api/auth/registro | Crear cuenta |
| POST | /api/auth/login | Iniciar sesión |
| GET | /api/auth/perfil | Ver perfil (auth) |
| PATCH | /api/auth/preferencias-alertas | Qué alertas recibir y con qué frecuencia (auth) |

### Negocios
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | /api/negocios | Listar mis negocios (auth) |
| POST | /api/negocios | Agregar negocio (auth) |
| GET | /api/negocios/:id | Detalle con alertas (auth) |
| DELETE | /api/negocios/:id | Desactivar monitoreo (auth) |
| POST | /api/negocios/:id/facebook | Conectar Facebook (auth) |

### Alertas
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | /api/alertas | Ver todas mis alertas (auth) |
| PATCH | /api/alertas/:id/leer | Marcar como leída (auth) |
| PATCH | /api/alertas/leer-todas | Marcar todas como leídas (auth) |

### Health
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | /health | Estado del servidor |

---

## Ejecutar monitoreo manualmente (desarrollo)

```js
// Desde Node REPL o un script temporal
const { ejecutarAhora } = require('./src/workers/monitoreo.worker');
ejecutarAhora();
```

---

## Despliegue en Railway

1. Conectar repositorio en Railway
2. Agregar servicio PostgreSQL en el mismo proyecto
3. Railway auto-inyecta `DATABASE_URL`
4. Agregar el resto de variables en Railway → Variables
5. Deploy automático en cada push a main

---

## Variables de entorno requeridas

Ver `.env.example` para la lista completa.
