# Sprint actual

Documento del sprint vigente. No define sprints futuros.

## Nombre del sprint

Sprint — Motor de Períodos

## Objetivo

Implementar la lógica real de apertura de un período (`action=openPeriod`).

## Módulo

Períodos

## Estado

En desarrollo

## Alcance

- Acción Apps Script `openPeriod`.
- Lectura de apoyo `action=system`.
- Regeneración de `Grupo 1` / `Grupo 2` desde `Personas` (solo activos).
- Actualización de hoja `Sistema`.
- Invocación desde Portal General → Períodos.

## Qué no incluye

- Cierre de período.
- Copia al `Historial`.
- Escritura definitiva del Portal Encargados.
- Validaciones del POST de informes.

## Criterios de aceptación

1. Si ya hay período ABIERTO, no se modifica ninguna hoja y se devuelve error claro.
2. Si no hay período abierto, se regeneran los grupos y se actualiza `Sistema`.
3. La respuesta JSON indica `ok`, `periodo` y conteos por grupo.
4. El Portal Encargados no se modifica en este sprint.
