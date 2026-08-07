# Arquitectura

Arquitectura oficial del proyecto `informes-publicadores`.

## Modelo de cliente aprobado

**Un único repositorio** con **dos entradas independientes** en GitHub Pages:

| Ruta | Portal | Rol |
|---|---|---|
| `/` | Portal General | Consulta (encargado general) |
| `/encargados/` | Portal Encargados | Edición del grupo determinado (encargado de grupo) |

No son dos repositorios independientes.  
No es una única aplicación con perfiles.

Cada portal tiene su propia navegación y experiencia de usuario.

- El Portal Encargados **no** muestra módulos del Portal General.
- El Portal General **no** incluye funciones de edición del Portal Encargados.

### Recursos compartidos

- Google Apps Script
- Google Sheets
- Recursos comunes (CSS, utilidades y reglas de negocio)
- Documentación (`docs/`)

### Diagrama

```text
                    ┌─────────────────────────┐
                    │      GitHub Pages       │
                    │  (un solo repositorio)  │
                    └───────────┬─────────────┘
                                │
              ┌─────────────────┴─────────────────┐
              │                                   │
              ▼                                   ▼
     `/` Portal General                 `/encargados/` Portal Encargados
     (consulta)                         (edición)
              │                                   │
              └─────────────────┬─────────────────┘
                                │
                                ▼
                        Google Apps Script
                                │
                                ▼
                          Google Sheets
```

Stack de capas (sin cambio de tecnologías):

```text
GitHub Pages
↓
PWA / clientes estáticos (HTML + CSS + JavaScript)
↓
Google Apps Script
↓
Google Sheets
```

---

## GitHub Pages

Responsabilidad: hospedar y servir el repositorio estático.

- Publica el Portal General en `/`.
- Publica el Portal Encargados en `/encargados/`.
- Sirve recursos comunes (CSS, utilidades, assets compartidos).
- No almacena datos de informes ni de personas.
- No ejecuta lógica de negocio sobre la planilla.

---

## Portal General (`/`)

Responsabilidad: consola de consulta del encargado general.

- Entrada: `/` (p. ej. `index.html` en la raíz).
- Navegación propia con los módulos oficiales del Portal General (Inicio, Personas, Informes, Estadísticas, Configuración).
- El módulo Informes consulta Apps Script, consolida ambos grupos y muestra el resultado en solo lectura.
- No incluye la experiencia ni las funciones de edición del Portal Encargados.
- No es fuente de datos.

---

## Portal Encargados (`/encargados/`)

Responsabilidad: carga de informes del grupo determinado por el encargado de grupo.

- Entrada independiente bajo `/encargados/`.
- Navegación y UX propias; no muestra módulos del Portal General.
- Mes de solo lectura; edición solo de privilegio, horas, estudios y comentarios.
- Guardado mediante una sola acción **Guardar Grupo**; Apps Script procesa cada persona de forma independiente.
- Detalle funcional: `docs/08_ESPECIFICACION_PORTAL_ENCARGADOS.md`.

---

## Recursos comunes

Responsabilidad: evitar duplicación innecesaria entre portales.

Incluyen, entre otros:

- estilos compartidos;
- utilidades de cliente;
- reglas de negocio de completitud/validación alineadas a `docs/07_ESPECIFICACION_INFORMES.md`;
- configuración del endpoint de Apps Script cuando corresponda compartirla;
- documentación del proyecto en `docs/`.

Los recursos comunes **no** unifican la navegación ni mezclan las experiencias de usuario.

---

## Google Apps Script

Responsabilidad: conector compartido entre ambos portales y Google Sheets.

- Un mismo proyecto/endpoint atiende a Portal General y Portal Encargados.
- Lectura: `doGet` / `action=reports` (y variantes de lectura que se aprueben).
- Escritura: `doPost` para el guardado del Portal Encargados (procesamiento independiente por persona).
- Lee y escribe las pestañas `Grupo 1` y `Grupo 2` según la operación.
- No debe exponer teléfonos, direcciones, contactos de emergencia ni otros datos sensibles ajenos al contrato de informes.

La URL del endpoint se configura en el cliente (p. ej. `js/config.js` o equivalente compartido). El código fuente del conector está en `apps-script/`.

---

## Google Sheets

Responsabilidad: fuente única de datos de los informes mensuales.

- Pestañas: `Grupo 1` y `Grupo 2`.
- Celda `B3`: mes informado.
- Fila `5`: encabezados.
- Datos desde la fila `7`.
- Columnas: ID, Nombre del publicador, Privilegio, Horas, Estudios, Comentarios.
- Es la única fuente de datos del sistema.

---

## Comunicación entre capas

### Consulta (Portal General)

1. El encargado general abre `/`.
2. El módulo Informes solicita `GET` a Apps Script (`action=reports`).
3. Apps Script lee ambos grupos y responde JSON.
4. El Portal General muestra el consolidado en solo lectura.

### Edición (Portal Encargados)

1. El encargado de grupo abre `/encargados/` (grupo determinado).
2. El portal lee los datos de su grupo vía Apps Script.
3. El encargado edita y pulsa **Guardar Grupo**.
4. Apps Script procesa cada persona de forma independiente y responde el resultado.
5. Los cambios quedan en Google Sheets y son visibles luego en el Portal General.

No hay otras vías de datos aprobadas (sin Firebase, SQL u otros backends).
