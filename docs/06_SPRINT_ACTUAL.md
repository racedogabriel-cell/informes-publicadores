# Sprint actual

Documento del sprint vigente. No define sprints futuros.

## Nombre del sprint

Sprint — Cerrar período

## Objetivo

Implementar `action=closePeriod`: archivar el período abierto en Historial y marcar Sistema como CERRADO.

## Módulo

Períodos

## Estado

En desarrollo

## Alcance

- Verificar período ABIERTO.
- Copiar registros válidos de Grupo 1 y Grupo 2 a Historial.
- Actualizar Sistema (`EstadoPeriodo = CERRADO`, `FechaCierre`).
- Invocación desde Portal General.
- Período sugerido = mes vencido.

## Qué no incluye

- Limpiar Grupo 1 / Grupo 2 al cerrar.
- Abrir automáticamente el siguiente período.
- Escritura real del Portal Encargados.
- Cambios en Portal Encargados.

## Criterios de aceptación

1. Sin período ABIERTO → error y sin cambios.
2. Con período ABIERTO → Historial recibe la fotografía y Sistema queda CERRADO.
3. Las hojas de grupo no se limpian.
4. LockService protege la operación.
