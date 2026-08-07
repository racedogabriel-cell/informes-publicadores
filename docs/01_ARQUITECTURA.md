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
- Navegación propia con los módulos oficiales del Portal General (Inicio, Personas, Informes, Períodos, Estadísticas, Configuración).
- El módulo Informes consulta Apps Script, consolida ambos grupos del **período abierto** y muestra el resultado en solo lectura.
- El módulo Períodos (diseño aprobado; sin implementar) gestionará abrir/cerrar período, regenerar hojas de grupo desde `Personas` y archivar en `Historial`.
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
- Lectura: `doGet` / `action=reports` (período abierto: `Grupo 1` y `Grupo 2`; variantes futuras según se aprueben).
- Escritura de informes: `doPost` para el guardado del Portal Encargados (procesamiento independiente por persona; solo C–F del período abierto).
- Escritura de ciclo mensual (futuro, módulo Períodos): regenerar período abierto desde `Personas` y copiar cierres a `Historial` — distinta del guardado de encargados.
- No debe exponer teléfonos, direcciones, contactos de emergencia ni otros datos sensibles ajenos al contrato de informes.

La URL del endpoint se configura en el cliente (p. ej. `js/config.js` o equivalente compartido). El código fuente del conector está en `apps-script/`.

---

## Google Sheets

Responsabilidad: fuente única de datos del sistema.

Modelo aprobado (detalle: `docs/09_MODELO_DATOS_SHEETS.md`):

| Pestaña | Concepto |
|---|---|
| `Personas` | Padrón maestro (ID, Nombre, Grupo, Activo). Solo Encargado General. |
| `Grupo 1` / `Grupo 2` | Período actualmente abierto (no padrón). |
| `Historial` | Períodos cerrados; inmutable. |

Período abierto (`Grupo 1` / `Grupo 2`):

- Celda `B3`: período / mes informado.
- Fila `5`: encabezados.
- Datos desde la fila `7`.
- Columnas A–B (`ID`, `Nombre`): provienen del padrón al regenerar el período.
- Columnas C–F: Privilegio, Horas, Estudios, Comentarios (informe del período).

---

## Comunicación entre capas

### Consulta (Portal General)

1. El encargado general abre `/`.
2. El módulo Informes solicita `GET` a Apps Script (`action=reports`).
3. Apps Script lee ambos grupos y responde JSON.
4. El Portal General muestra el consolidado en solo lectura.

### Edición (Portal Encargados)

1. El encargado de grupo abre `/encargados/` (grupo determinado).
2. El portal lee los datos de su grupo del **período abierto** vía Apps Script.
3. El encargado edita solo C–F y pulsa **Guardar Grupo**.
4. Apps Script procesa cada persona de forma independiente y responde el resultado.
5. Los cambios del período abierto quedan en `Grupo 1` / `Grupo 2` y son visibles luego en Informes.

### Ciclo mensual (Portal General → Períodos; futuro)

1. El Encargado General mantiene `Personas`.
2. Abre período → regenera `Grupo 1` / `Grupo 2` desde el padrón.
3. Tras la carga, cierra período → copia fotografía a `Historial`.
4. Prepara el siguiente período.

No hay otras vías de datos aprobadas (sin Firebase, SQL u otros backends).
