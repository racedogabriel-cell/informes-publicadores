# Sprint actual

Documento del sprint vigente. No define sprints futuros.

## Nombre del sprint

Sprint — Guardado real de informes

## Objetivo

Reemplazar el dry-run del Portal Encargados por la escritura real de C–F sobre el período abierto (`action=saveGroup`).

## Módulo

Portal Encargados / Informes (persistencia)

## Estado

En desarrollo

## Alcance

- `doPost` con escritura real por ID.
- Validación de negocio alineada a docs/07 y docs/08.
- Botón Guardar Grupo del Portal Encargados ejecuta el POST real.
- Resultado con actualizadas / errores.

## Qué no incluye

- Cambios de UI del Portal Encargados (salvo feedback/marcado de errores).
- Cambios al Portal General.
- Cambios a apertura/cierre de períodos, Historial, Personas o modelo de datos.
