# Conector de Google Sheets

Este script atiende:

- lectura del período de trabajo (`Grupo 1` / `Grupo 2`);
- lectura y apertura del ciclo mensual (`Sistema`, `Personas`);
- canal POST dry-run del Portal Encargados.

No entrega teléfonos, contactos de emergencia u otros datos ajenos al contrato.

## Instalación en la planilla

1. Abrí la planilla y elegí **Extensiones → Apps Script**.
2. Reemplazá el archivo `Code.gs` por el contenido de `Code.gs` de esta carpeta y guardá.
3. Actualizá la aplicación web (**Nueva versión** del deployment).
4. Confirmá que existan las hojas `Personas` (ID, Nombre, Grupo, Activo; datos desde fila 2) y, si falta, `Sistema` (se crea sola al primer uso).
5. La URL `/exec` debe coincidir con `js/config.js`.

## Lectura (`doGet`)

| Acción | Uso |
|---|---|
| `?action=reports` | Informes consolidados del período de trabajo |
| `?action=system` | Estado global de la hoja `Sistema` |
| `?action=openPeriod&periodo=YYYY-MM` | Abrir período (Portal General). Valida todo antes de escribir; LockService; no regenera si hay datos sin cierre formal. |
| `?action=closePeriod` | Cerrar período: copia a Historial y marca Sistema CERRADO. No limpia hojas de grupo. |

## Apertura de período

Orden seguro:

1. Adquiere `LockService` (script lock).
2. Valida `periodo=YYYY-MM` (mes vencido, p. ej. `2026-07`).
3. Lee `Sistema`. Si `EstadoPeriodo = ABIERTO` → error, sin cambios.
4. Valida `Personas` completo: IDs únicos, solo grupos `Grupo 1` / `Grupo 2`, filas coherentes.
5. Si no hubo cierre formal (`FechaCierre` vacío) e inspecciona residuos en grupos → error, **sin regenerar**.
6. Solo entonces regenera grupos (A–B desde padrón; C–F vacíos; `B3` espejo) y actualiza `Sistema`.

## Cierre de período

1. Adquiere `LockService`.
2. Exige `EstadoPeriodo = ABIERTO` y `PeriodoActivo` definido.
3. Lee registros válidos (ID + Nombre) de `Grupo 1` y `Grupo 2`.
4. Si el período ya existe en `Historial` → error, sin duplicar.
5. Append a `Historial` (Periodo, Grupo, ID, Nombre, Privilegio, Horas, Estudios, Comentarios, FechaCierre).
6. Actualiza `Sistema`: `EstadoPeriodo = CERRADO`, `FechaCierre`.
7. **No** limpia Grupo 1/2. **No** abre el siguiente período.

## Escritura Encargados — dry-run (`doPost`)

`action=saveGroup` + `mode=dryRun`: valida recepción, **no escribe** celdas.

## Acceso seguro

No publiques una aplicación web con acceso anónimo mientras no haya autenticación. GitHub Pages no puede guardar un secreto en el navegador.
