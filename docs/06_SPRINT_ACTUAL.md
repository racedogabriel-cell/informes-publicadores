# Sprint actual

Documento del sprint vigente. No define sprints futuros.

## Nombre del sprint

Sprint Períodos — interfaz de administración

## Objetivo

Implementar la primera versión de la pantalla de administración de períodos en el Portal General, sin acciones reales sobre Google Sheets.

## Módulo

Períodos

## Estado

En desarrollo

## Alcance

- Nuevo módulo Períodos en el Portal General.
- Listado de períodos.
- Indicación del período activo.
- Estado Abierto / Cerrado.
- Botones Abrir nuevo período y Cerrar período (sin ejecución sobre Sheets).
- Arquitectura preparada para la apertura/cierre real posteriores.

## Qué no incluye

- Apertura o cierre real del período en Google Sheets.
- Regeneración de `Grupo 1` / `Grupo 2` desde `Personas`.
- Escritura en `Historial`.
- Cambios en Portal Encargados, Apps Script o escritura definitiva de informes.
- Módulos Inicio, Personas, Estadísticas o Configuración.

## Criterios de aceptación

1. El módulo Períodos aparece en la navegación del Portal General.
2. La pantalla muestra listado, período activo y estado Abierto/Cerrado.
3. Los botones Abrir / Cerrar están visibles y no modifican Google Sheets.
4. Quedan puntos de extensión listos para la integración real posterior.
5. No se modifican Portal Encargados, Apps Script, Historial ni la planilla.
