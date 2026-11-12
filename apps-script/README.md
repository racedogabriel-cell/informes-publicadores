# Conector de Google Sheets

Este script atiende:

- lectura del período de trabajo (hojas SheetKey `Grupo {ID}` del catálogo);
- lectura y apertura/cierre del ciclo mensual (`Sistema`, `Personas`, `Historial`);
- lectura del catálogo `Grupos` (`action=grupos`);
- escritura del catálogo `Grupos` (`createGrupo`, `updateGrupo`, `setGrupoActivo`);
- lectura/escritura del padrón `Personas` (`action=personas`, `createPersona`, `updatePersona`, `setPersonaActivo`);
- escritura Encargados: `savePerson` (auto-save) y `saveGroup` (fallback).

`action=reports` no entrega teléfonos ni contactos de emergencia. Esos datos solo salen por `action=personas` (Portal General).

## Instalación en la planilla

1. Abrí la planilla y elegí **Extensiones → Apps Script**.
2. Reemplazá el archivo `Code.gs` por el contenido de `Code.gs` de esta carpeta y guardá.
3. Actualizá la aplicación web (**Nueva versión** del deployment).
4. Confirmá que existan las hojas `Personas` (ID, Nombre, Grupo, Activo, NumeroContacto, ContactoEmergencia, NombreEmergencia, RelacionEmergencia; datos desde fila 2; columnas E–H como texto), `Grupos` (ID, Nombre, Color, Activo; semilla Fase 1) y, si falta, `Sistema` (se crea sola al primer uso).
5. La URL `/exec` debe coincidir con `js/config.js`.

## Lectura (`doGet`)

| Acción | Uso |
|---|---|
| `?action=reports` | Informes consolidados del período de trabajo |
| `?action=system` | Estado global de la hoja `Sistema` |
| `?action=historial&periodo=YYYY-MM` | Lectura solo consulta del `Historial` (o período activo si aún no está archivado) |
| `?action=openPeriod&periodo=YYYY-MM` | Abrir período (Portal General). Valida todo antes de escribir; LockService; no regenera si hay datos sin cierre formal. |
| `?action=closePeriod` | Cerrar período: copia/reemplaza Historial del período y marca Sistema CERRADO. |
| `?action=personas` | Padrón completo A–H (Portal General / módulo Personas). |
| `?action=grupos` | Catálogo de grupos (`Grupos`: id, nombre, color, activo). |
| `?action=grupos&activos=1` | Solo grupos con `Activo = Sí`. |

## Catálogo de grupos (`action=grupos`)

Requiere la hoja **`Grupos`** (Fase 1). Lectura vía GET. Escritura ABM vía POST (Portal General → Configuración). No materializa hojas de trabajo del período abierto.

Respuesta OK:

```json
{
  "ok": true,
  "generatedAt": "…",
  "grupos": [
    { "id": "1", "nombre": "Grupo 1", "color": "#2B6B4F", "activo": true }
  ]
}
```

### Escritura catálogo Grupos (`doPost`)

| Acción | Uso |
|---|---|
| `createGrupo` | Alta. ID `max+1`. Body: `{ nombre, color?, activo? }`. Color default rotativo si se omite. |
| `updateGrupo` | Edita `nombre` + `color` por `id` (ID inmutable). |
| `setGrupoActivo` | Activa/desactiva. Desactivar **falla** si hay personas `Activo=Sí` asignadas a ese grupo. |

Sin `deleteGrupo`. Nombre único (case-insensitive), color `#RRGGBB`, nombre 1–40 caracteres.
## Enriquecimiento de lectura (Fase 3)

Sin romper clientes actuales:

- `action=reports` → cada grupo incluye `grupo` (nombre, compat), `grupoId`, `color`.
- `action=personas` → cada persona incluye `grupo` (nombre, compat), `grupoId`, `grupoNombre`, `grupoColor`.

`Personas!C` guarda **GrupoID** (Fase 4). La API sigue exponiendo `grupo`/`grupoNombre` legibles.

## Apertura de período

Orden seguro:

1. Adquiere `LockService` (script lock).
2. Valida `periodo=YYYY-MM` (mes vencido, p. ej. `2026-07`).
3. Lee `Sistema`. Si `EstadoPeriodo = ABIERTO` → error, sin cambios.
4. Valida `Personas` completo: IDs únicos, grupos existentes y activos en catálogo `Grupos`, filas coherentes.
5. Si no hubo cierre formal (`FechaCierre` vacío) e inspecciona residuos en hojas SheetKey existentes → error, **sin regenerar**.
6. Crea hojas SheetKey faltantes (`Grupo {ID}`) si hace falta; regenera A–B desde padrón; C–F vacíos; `B3` espejo; actualiza `Sistema`.

Respuesta incluye `grupos` (mapa por nombre/SheetKey) y `gruposList` (`[{ id, nombre, sheetKey, count }]`).

## Cierre de período

1. Adquiere `LockService`.
2. Exige `EstadoPeriodo = ABIERTO` y `PeriodoActivo` definido.
3. Lee registros válidos (ID + Nombre) de cada hoja SheetKey existente del catálogo.
4. Escribe el snapshot en `Historial` (Periodo, **GrupoID**, Grupo=nombre congelado, ID, Nombre, Privilegio, Horas, Estudios, Comentarios, FechaCierre).
   - Si el período **no** tenía filas → append.
   - Si el período **ya** tenía filas → las **reemplaza** (solo ese período; no toca otros meses) y luego cierra.
5. Actualiza `Sistema`: `EstadoPeriodo = CERRADO`, `FechaCierre`.
6. **No** abre el siguiente período.
7. La respuesta incluye `replaced: true|false` según haya rearchivado.

Filas históricas previas a Fase 6: al primer cierre nuevo se inserta la columna `GrupoID` vacía en esas filas (**sin backfill**). Los nombres congelados en `Grupo` no se modifican.

## Escritura Encargados (`doPost`)

### `action=savePerson` + `mode=save` (auto-save actual)

Si el ID no existe en la hoja `Grupo {ID}`, materializa A–B desde el padrón Personas (append) y luego escribe C–F. No limpia filas ni toca B3/Sistema/Historial.

Una sola persona por request. Usado por el Portal Encargados al cambiar privilegio o al salir (blur) de Horas/Estudios/Comentarios.

1. Verifica `Sistema` con período activo y `EstadoPeriodo=ABIERTO`.
2. Exige `periodo === PeriodoActivo`.
3. Resuelve grupo por **`grupoId`** (preferido) o `grupo` legacy (nombre / `1` / `Grupo 1`) → SheetKey `Grupo {ID}`.
4. Ubica la persona **solo por ID** en la hoja del grupo.
5. Actualiza únicamente columnas C–F.
6. No exige completitud (permiso guardar incompleto; misma validación de formato que Informes).

### `action=saveGroup` + `mode=save` (fallback / rollback)

Lote completo. Se mantiene intacto; la UI nueva ya no lo usa.

1. Verifica `Sistema` con período activo y `EstadoPeriodo=ABIERTO`.
2. Misma resolución de grupo que `savePerson` (`grupoId` o legacy).
3. Ubica cada persona **solo por ID** en la hoja del grupo.
4. Actualiza únicamente columnas C–F.
5. Valida reglas de negocio persona a persona.
6. Un error no impide guardar las demás.

No modifica ID, Nombre, B3, Historial, Personas ni el ciclo de períodos.

## Escritura padrón Personas (`doPost`)

Portal General / módulo Personas. LockService compartido. No toca hojas SheetKey del período, Historial ni Informes.

| Acción | Uso |
|---|---|
| `createPersona` | Alta. ID generado en backend (`max+1`). Duplicado de nombre → error. |
| `updatePersona` | Edición por `id` (ID inmutable). |
| `setPersonaActivo` | Baja/reactivación lógica (`activo` true/false → Sí/No). |

Teléfonos y textos de emergencia se escriben como texto (formato `@`). No se copian a hojas de grupo.

## Migración a hoja Personas (una sola vez)

Archivo: `Migration.gs` (no es parte de la PWA).

1. En la planilla: **Extensiones → Apps Script**.
2. Creá un archivo **Migration.gs** y pegá el contenido del repo.
3. Guardá.
4. (Opcional) Ejecutá primero `simularMigracionPersonasDesdeGrupos` para ver el informe sin escribir.
5. Ejecutá `migrarPersonasDesdeGrupos`.
6. Revisá la hoja **Migracion_Informe** y los registros de ejecución.

No modifica `Grupo 1` ni `Grupo 2`. Si `Personas` ya tiene datos, no vuelve a correr.

## Inicialización de Sistema (primera instalación, una sola vez)

Mismo archivo: `Migration.gs`.

1. En la planilla: **Extensiones → Apps Script**.
2. Actualizá **Migration.gs** con el contenido del repo y guardá.
3. (Opcional) Ejecutá `simularInitializeSystem` para validar B3 sin escribir.
4. En el selector de funciones elegí **`initializeSystem`** → **Ejecutar ▶**.
5. Revisá la hoja **Migracion_Informe** y la hoja **Sistema**.

Adopta el período de `Grupo 1!B3` / `Grupo 2!B3` (deben coincidir) como `PeriodoActivo` en formato `YYYY-MM` con `EstadoPeriodo = ABIERTO`.

No modifica `Grupo 1`, `Grupo 2`, `Historial` ni `Personas`. No regenera hojas. No altera `openPeriod` / `closePeriod`. Si `Sistema.PeriodoActivo` ya tiene valor, no vuelve a correr.

## Catálogo de Grupos — Fase 1 (hoja + semilla, una sola vez)

Archivo: `Migration.gs`. **No** modifica `Code.gs`, `doGet`/`doPost`, hojas de trabajo, `Personas`, `Historial` ni `Sistema`.

Crea la hoja **`Grupos`** con la semilla aprobada:

| ID | Nombre | Color | Activo |
|---|---|---|---|
| `1` | `Grupo 1` | `#2B6B4F` | Sí |
| `2` | `Grupo 2` | `#2F5D8A` | Sí |

1. En Apps Script: actualizá **`Migration.gs`** con el contenido del repo y guardá.
2. (Opcional) Ejecutá **`simularInicializarCatalogoGrupos`** para validar sin escribir.
3. Ejecutá **`inicializarCatalogoGrupos`**.
4. Revisá la hoja **`Grupos`** y el informe en **`Migracion_Informe`**.

Si `Grupos` ya existe con exactamente esa semilla, no vuelve a escribir. Si tiene datos distintos, aborta sin sobrescribir. **No** renombra ni toca las pestañas de trabajo `Grupo 1` / `Grupo 2`.

## Personas!C → GrupoID — Fase 4 (una sola vez)

Archivo: `Migration.gs`.

Convierte la columna **Grupo** de `Personas` de nombre (`Grupo 1`) a **ID** (`1`).

1. Actualizá **`Migration.gs`** y **`Code.gs`** en Apps Script → Guardar.
2. Publicá **nueva versión** del web app (`Code.gs` ahora escribe IDs en altas/ediciones).
3. (Recomendado) Ejecutá **`simularMigrarPersonasGrupoAId`**.
4. Ejecutá **`migrarPersonasGrupoAId`**.
5. Revisá `Personas!C`, backup **`Personas_Backup_Fase4`** y **`Migracion_Informe`**.

Reglas:

- Si alguna persona tiene un grupo desconocido → **aborta sin escribir**.
- Antes de escribir crea backup `Personas_Backup_Fase4` (no sobrescribe si ya existe).
- No toca Historial, Sistema, ni hojas `Grupo 1` / `Grupo 2`.
- No regenera el período abierto.

## Carga de contacto/emergencia en Personas (enriquecimiento puntual)

Archivo: **`ContactosPersonas.gs`** (junto a `Migration.gs` en el mismo proyecto Apps Script).

Amplía el padrón con columnas E–H (`NumeroContacto`, `ContactoEmergencia`, `NombreEmergencia`, `RelacionEmergencia`) como **texto**.

1. En Apps Script: creá/actualizá **`Migration.gs`** y **`ContactosPersonas.gs`** con el contenido del repo (archivos separados; no pegar todo en uno solo).
2. Guardá.
3. Ejecutá primero **`simularCargaContactosPersonas`** y revisá la hoja **Migracion_Informe**.
4. Si el informe es correcto, ejecutá **`cargarContactosPersonas`**.

Reglas de la utilidad:

- Cruce por **Nombre** exacto.
- Aliases **aprobados manualmente** (p. ej. Carina→Karina, acentos, orden de nombre) también se escriben.
- Altas **aprobadas manualmente** (p. ej. Araya Julio) se crean en `Personas` con ID siguiente, Grupo indicado y contacto.
- Otros NO ENCONTRADO **no** se escriben y **no** crean personas.
- **No** modifica `Grupo 1`, `Grupo 2`, `Historial` ni `Sistema`.
- No toca `openPeriod` / `closePeriod` ni el contrato de Informes.

## Acceso seguro

No publiques una aplicación web con acceso anónimo mientras no haya autenticación. GitHub Pages no puede guardar un secreto en el navegador.
