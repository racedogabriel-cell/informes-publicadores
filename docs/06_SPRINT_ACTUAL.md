# Sprint actual

Documento del sprint vigente. No define sprints futuros.

## Nombre del sprint

Sprint Informes — consulta consolidada

## Objetivo

Avanzar el módulo Informes como primer módulo funcional de la aplicación, dentro del alcance ya aprobado.

## Módulo

Informes

## Estado

En desarrollo

## Alcance

Consulta de solo lectura de los informes mensuales cargados en Google Sheets, a través de Google Apps Script, para el encargado general.

## Qué incluye

- Consultar el endpoint de Apps Script (`action=reports`).
- Consolidar los datos de `Grupo 1` y `Grupo 2`.
- Filtrar entre los dos meses anteriores y el mes actual.
- Mostrar cantidad de personas, informes completos y pendientes.
- Mantener la pantalla en solo lectura.
- Permitir actualizar datos desde Google Sheets.

## Qué no incluye

- Funcionalidades de Inicio, Personas, Estadísticas o Configuración.
- Escritura o edición de informes desde la PWA.
- Uso de `localStorage` u otras fuentes de datos.
- Dashboards, KPIs ficticios o placeholders de otros módulos.
- Publicación en GitHub Pages, salvo que se indique expresamente en este sprint.
- Cualquier ampliación del alcance del módulo Informes no listada arriba.

## Criterios de aceptación

1. La consulta de informes se realiza únicamente vía Apps Script → Google Sheets.
2. Se consolidan ambos grupos en una vista de solo lectura.
3. El filtro de mes contempla el mes actual y los dos anteriores.
4. Se muestran los conteos de personas, informes completos y pendientes.
5. Existe una acción para actualizar los datos desde Google Sheets.
6. No se implementan funcionalidades fuera del alcance de este sprint.
7. Toda implementación queda asociada a: módulo Informes, objetivo de este sprint, estado En desarrollo, y este sprint.
