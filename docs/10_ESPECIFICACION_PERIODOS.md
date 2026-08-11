# Especificación funcional — Módulo Períodos

Documento de **diseño aprobado**. Primera etapa de implementación: **solo UI** en el Portal General (sin acciones sobre Sheets).

- **Módulo:** Períodos
- **Portal:** Portal General (`/`)
- **Estado:** En desarrollo
- **Sprint vigente:** Sprint Períodos — interfaz de administración
- **Modelo de datos:** `docs/09_MODELO_DATOS_SHEETS.md`
- **Roles:** solo Encargado General

---

## 1. Objetivo

Gestionar el ciclo de vida del período de informes:

1. Abrir un período.
2. Cerrar un período.
3. Actualizar el estado global en la hoja `Sistema`.
4. Generar las hojas SheetKey `Grupo {ID}` desde el padrón `Personas` (grupos activos del catálogo).
5. Copiar la fotografía del período al `Historial`.
6. Limpiar / preparar las hojas de trabajo para el siguiente período.

---

## 2. Fuera de alcance (etapa UI actual)

- Apertura/cierre real sobre Google Sheets.
- Escritura en `Sistema`, `Historial` o regeneración de hojas SheetKey del período.
- Escritura definitiva de informes del Portal Encargados.
- Edición del padrón (módulo **Personas**).
- Consulta analítica del historial (Informes/Historial en sprints futuros).

---

## 3. Estado global (`Sistema`)

El módulo Períodos es el **único escritor** de la hoja `Sistema`, que es la única fuente de verdad del período vigente.

Campos iniciales (detalle en `docs/09_MODELO_DATOS_SHEETS.md` §2):

| Campo | Uso |
|---|---|
| `PeriodoActivo` | Período vigente |
| `EstadoPeriodo` | `Abierto` / `Cerrado` |
| `FechaApertura` | Última apertura |
| `FechaCierre` | Último cierre |
| `Version` | Versión del esquema de estado |

### Reglas

1. Abrir/cerrar período **siempre** actualiza `Sistema` antes o como parte atómica de la operación.
2. Portal General e Informes leen el período desde `Sistema` (vía Apps Script), no desde `B3`.
3. Portal Encargados muestra el mes/período de contexto desde `Sistema`, no lo infiere desde `B3`.
4. `B3` en hojas de grupo, si se conserva, es solo espejo alineado por Períodos; nunca autoridad.

---

## 4. Responsabilidades

| Acción | Descripción |
|---|---|
| Abrir período | Actualiza `Sistema` (`PeriodoActivo`, `EstadoPeriodo = Abierto`, `FechaApertura`); regenera hojas SheetKey `Grupo {ID}` desde `Personas` (`Activo = Sí`), A–B desde padrón, C–F vacíos; alinea espejo `B3` si aplica. |
| Cerrar período | Actualiza `Sistema` (`EstadoPeriodo = Cerrado`, `FechaCierre`); copia todas las filas del período de trabajo al `Historial`. |
| Generar hojas de grupo | Materializa el padrón filtrado por grupo en las hojas de trabajo. |
| Copiar a Historial | Append-only; no modifica filas históricas previas. |
| Limpiar hojas de trabajo | Tras el cierre (o como parte de abrir el siguiente), deja el trabajo listo según la regeneración. |
| Preparar siguiente período | Encadena cierre + apertura del nuevo mes según el flujo del modelo de datos. |

---

## 5. Flujo operativo (resumen)

```text
Mantener Personas
      ↓
Abrir período → actualizar Sistema → regenerar hojas SheetKey Grupo {ID}
      ↓
Carga de informes (Encargados) + consulta (Informes)
  (ambos leen período vigente desde Sistema)
      ↓
Cerrar período → actualizar Sistema → copiar a Historial
      ↓
Preparar / abrir siguiente período
```

Detalle normativo: `docs/09_MODELO_DATOS_SHEETS.md`.

---

## 6. Reglas de negocio (obligatorias)

1. Solo el Encargado General opera este módulo.
2. Los encargados de grupo **no** abren ni cierran períodos.
3. `Sistema` es la única fuente de verdad del período vigente.
4. Ningún portal infiere el período desde `B3` una vez implementada esta arquitectura.
5. Al regenerar, A y B salen siempre de `Personas`; nunca se inventan desde Encargados.
6. Solo personas con `Activo = Sí` entran al período de trabajo.
7. El `Historial` es inmutable tras cada cierre.
8. Cambios posteriores de nombre o grupo en `Personas` **no** alteran el `Historial`.
9. No se borran fotografías históricas para “corregir” el pasado; las correcciones del padrón aplican hacia adelante.

---

## 7. Integración futura con Apps Script

Cuando se implemente la apertura/cierre real, Apps Script deberá:

- exponer lectura del estado global (`Sistema`);
- exponer acciones de abrir / regenerar período y cerrar / archivar en `Historial`;
- escribir `Sistema` en cada apertura y cierre.

Esas acciones son **distintas** del `doPost` de guardado de informes del Portal Encargados (`saveGroup`).

---

## 8. Criterios de aceptación (para cuando se implemente la apertura/cierre real)

1. Abrir período actualiza `Sistema` y regenera hojas SheetKey solo desde `Personas` activas con grupo activo.
2. Cerrar período actualiza `Sistema` y agrega al `Historial` una fila por persona del período, sin modificar filas previas.
3. Informes y Portal Encargados obtienen el período vigente desde `Sistema`, no desde `B3`.
4. Tras un cambio de grupo o nombre en el padrón, un período ya cerrado permanece intacto en `Historial`.
5. El Portal Encargados sigue viendo solo el grupo determinado sobre el período de trabajo.
6. No se implementan abrir/cerrar dentro de `/encargados/`.

---

## 9. Relación con otros módulos

| Módulo | Relación |
|---|---|
| Personas | Mantiene el padrón que Períodos lee al regenerar. |
| Informes | Consulta filas del período de trabajo; el período vigente lo toma de `Sistema`. |
| Portal Encargados | Consume el período de trabajo; contexto de mes desde `Sistema`; no gestiona el ciclo. |
| Historial | Consumidor de consulta de la hoja `Historial`. |
