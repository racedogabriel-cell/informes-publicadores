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

- Administración de informes de actividad de una congregación.
- Un único repositorio publicado en GitHub Pages con dos entradas independientes:
  - `/` → Portal General (consulta);
  - `/encargados/` → Portal Encargados (edición).
- Lectura y, cuando esté aprobado e implementado, escritura de datos vía Google Apps Script sobre Google Sheets.
- Recursos comunes compartidos (CSS, utilidades, reglas de negocio) y documentación única.
- Módulos oficiales del Portal General como estructura de navegación de ese portal.
- Desarrollo modular: según especificación y aprobación.

### No incluido sin aprobación explícita

- Dos repositorios independientes para cada portal.
- Una única aplicación con perfiles de usuario.
- Mezclar en un mismo portal la navegación/UX del otro.
- Otras congregaciones.
- Cualquier fuente de datos distinta de Google Sheets.
- Implementar funcionalidades sin especificación funcional aprobada.

Los módulos Inicio, Personas, Períodos, Estadísticas y Configuración **existen y están aprobados** como parte de la arquitectura. Inicio, Estadísticas y Configuración están **No iniciado** (no implementar sin especificación/sprint). Personas y Períodos están **En desarrollo**.

## Tecnologías aprobadas

| Capa | Tecnología |
|---|---|
| Hosting | GitHub Pages (un repositorio, dos entradas) |
| Cliente | HTML + CSS + JavaScript (Portal General y Portal Encargados) |
| Backend | Google Apps Script |
| Datos | Google Sheets |

No están aprobados: bases de datos propias, Firebase, SQL u otros servicios de datos.

## Arquitectura oficial

```text
GitHub Pages (un solo repositorio)
├── `/` → Portal General (consulta)
└── `/encargados/` → Portal Encargados (edición)
         ↓
Google Apps Script
         ↓
Google Sheets
```

Recursos compartidos: Apps Script, Google Sheets, CSS/utilidades/reglas de negocio comunes y documentación.

Cada portal tiene navegación y UX propias. El Portal Encargados no muestra módulos del Portal General. El Portal General no incluye funciones de edición del Portal Encargados.

No existe ninguna otra fuente de datos.

Detalle: `docs/01_ARQUITECTURA.md`.

## Fuente única de datos

Google Sheets es la única fuente de datos del sistema.

El modelo de datos aprobado separa tres conceptos (detalle en `docs/09_MODELO_DATOS_SHEETS.md`):

- **`Personas`:** padrón maestro (única fuente de verdad sobre personas: identificación, grupo, activo y contacto/emergencia del padrón). Lo administra solo el Encargado General.
- **Hojas SheetKey `Grupo {ID}`:** período actualmente abierto (no son padrón). Los encargados de grupo completan solo el informe del período (columnas C–F), preferentemente vía Portal Encargados.
- **`Historial`:** fotografías inmutables de períodos cerrados.

Apps Script conecta ambos portales con la planilla.  
El Portal General consulta el consolidado del período abierto en solo lectura (módulo Informes) y, en el futuro, gestiona el ciclo mensual (módulo Períodos).

No utilizar `localStorage` como fuente de verdad.

## Módulos oficiales (Portal General)

1. Inicio
2. Personas
3. Informes
4. Períodos
5. Estadísticas
6. Configuración

Estos módulos existen como estructura oficial de navegación del **Portal General**. Que un módulo exista no significa que deba estar implementado.

El módulo **Períodos** está documentado en `docs/10_ESPECIFICACION_PERIODOS.md` (estado **No iniciado**: no implementar hasta sprint aprobado).

El **Portal Encargados** tiene su propia experiencia (carga del grupo) documentada en `docs/08_ESPECIFICACION_PORTAL_ENCARGADOS.md` y no incorpora esos módulos en su navegación.

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
- Implementar funcionalidades de Inicio, Personas, Períodos, Estadísticas o Configuración sin especificación funcional aprobada y sin sprint que lo autorice.
- Código muerto o funciones sin uso incorporadas «por si acaso».
- Archivos o experimentos ajenos al contrato.
- Bases de datos, Firebase, SQL u otros backends no listados.
- Funcionalidades aisladas que no pertenezcan a un módulo oficial.
- Cualquier funcionalidad no definida expresamente en la arquitectura o especificación aprobada.
