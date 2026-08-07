# Contrato del proyecto

Documento oficial. Fuente de verdad del alcance y las reglas de `informes-publicadores`.

## Objetivo del proyecto

El proyecto es una aplicación para administrar los informes de actividad de una congregación.

El desarrollo es modular. La aplicación se construye por módulos oficiales, cada uno con estado propio.

El módulo actualmente en desarrollo es **Informes**, pero el proyecto no se limita a ese módulo.

## Objetivo del sprint actual

Avanzar el módulo **Informes** como primer módulo funcional, dentro del alcance ya aprobado para ese módulo.

El detalle del sprint vigente está en `docs/06_SPRINT_ACTUAL.md`.

## Alcance

### Incluido en el proyecto

- Aplicación modular para administrar informes de actividad de una congregación.
- PWA estática publicada en GitHub Pages.
- Lectura de datos desde Google Sheets a través de Google Apps Script.
- Los cinco módulos oficiales como parte de la arquitectura.
- Desarrollo modular: un módulo a la vez, según estado y especificación aprobada.

### No incluido sin aprobación explícita

- Escritura desde la PWA hacia Google Sheets.
- Otras congregaciones.
- Cualquier fuente de datos distinta de Google Sheets.
- Implementar funcionalidades de un módulo en estado **No iniciado** sin especificación funcional aprobada.

Los módulos Inicio, Personas, Estadísticas y Configuración **existen y están aprobados** como parte de la arquitectura. Su estado actual es **No iniciado**: no se implementan funcionalidades de esos módulos hasta contar con especificación funcional aprobada.

## Tecnologías aprobadas

| Capa | Tecnología |
|---|---|
| Hosting | GitHub Pages |
| Cliente | PWA estática (HTML + CSS + JavaScript) |
| Backend de lectura | Google Apps Script |
| Datos | Google Sheets |

No están aprobados: bases de datos propias, Firebase, SQL u otros servicios de datos.

## Arquitectura oficial

```text
GitHub Pages
↓
PWA (HTML + CSS + JavaScript)
↓
Google Apps Script
↓
Google Sheets
```

No existe ninguna otra fuente de datos.

## Fuente única de datos

Google Sheets es la única fuente de datos del sistema.

- Los encargados de grupo cargan los informes en las pestañas `Grupo 1` y `Grupo 2`.
- Apps Script expone esos datos como JSON de solo lectura.
- La PWA consulta ese endpoint.

No utilizar `localStorage` como fuente de verdad.

## Módulos oficiales

1. Inicio
2. Personas
3. Informes
4. Estadísticas
5. Configuración

Estos módulos existen como estructura oficial de la aplicación. Que un módulo exista no significa que deba estar implementado.

## Estados posibles de un módulo

- **No iniciado**
- **En desarrollo**
- **Terminado**

No completar módulos por iniciativa propia.

## Reglas generales de desarrollo

1. La carpeta `informes-publicadores` es la única versión oficial del proyecto.
2. La documentación aprobada en `docs/` es la fuente oficial de verdad del proyecto.
3. Si existe una diferencia entre la documentación y el código, el código deberá adaptarse a la documentación, nunca al revés.
4. Ninguna funcionalidad puede implementarse sin aprobación previa.
5. No ampliar el alcance por criterio propio.
6. No inventar pantallas, KPIs, persistencias ni integraciones no aprobadas.
7. No modificar el proyecto anterior usado como referencia histórica.

### Regla de módulos

Toda funcionalidad deberá pertenecer a un módulo oficial.

No podrán incorporarse funcionalidades aisladas.

Cada implementación deberá indicar explícitamente:

- módulo
- objetivo
- estado
- sprint

### Prioridad de la documentación

La documentación aprobada es la fuente oficial de verdad del proyecto.

Si existe una diferencia entre la documentación y el código, el código deberá adaptarse a la documentación, nunca al revés.

## Funcionalidades explícitamente prohibidas salvo aprobación

- Usar `localStorage` como persistencia o fuente de verdad.
- Dashboards demo.
- KPIs ficticios.
- Placeholders funcionales que simulen producto terminado.
- Implementar funcionalidades de Inicio, Personas, Estadísticas o Configuración sin especificación funcional aprobada.
- Código muerto o funciones sin uso incorporadas «por si acaso».
- Archivos o experimentos ajenos al contrato.
- Bases de datos, Firebase, SQL u otros backends no listados.
- Funcionalidades aisladas que no pertenezcan a un módulo oficial.
- Cualquier funcionalidad no definida expresamente en la arquitectura o especificación aprobada.
