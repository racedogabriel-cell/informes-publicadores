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
| `?action=openPeriod&periodo=YYYY-MM` | Abrir período (Portal General) |

## Apertura de período

1. Lee `Sistema`. Si `EstadoPeriodo = ABIERTO`, error y **ninguna** modificación.
2. Lee `Personas` (solo `Activo = Sí`).
3. Regenera `Grupo 1` y `Grupo 2` (A–B desde padrón; C–F vacíos; `B3` espejo).
4. Actualiza `Sistema` (`PeriodoActivo`, `EstadoPeriodo=ABIERTO`, `FechaApertura`).

El cierre y la copia a `Historial` aún no están implementados.

## Escritura Encargados — dry-run (`doPost`)

`action=saveGroup` + `mode=dryRun`: valida recepción, **no escribe** celdas.

## Acceso seguro

No publiques una aplicación web con acceso anónimo mientras no haya autenticación. GitHub Pages no puede guardar un secreto en el navegador.
