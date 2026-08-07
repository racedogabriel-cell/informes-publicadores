# Decisiones de arquitectura

Registro de decisiones ya tomadas. No incluye propuestas futuras.

## 2026-08-07 — Versión oficial del proyecto

La carpeta `informes-publicadores` pasa a ser la única versión oficial del proyecto.

El proyecto anterior se conserva intacto solo como referencia histórica y no se continúa como línea de desarrollo.

## 2026-08-07 — Base limpia

Se reconstruyó una base limpia en lugar de limpiar in-place el proyecto desviado.

Motivo: durante el desarrollo se habían incorporado decisiones no aprobadas; el problema era de alcance, no solo de implementación puntual.

## 2026-08-07 — Arquitectura de capas

Arquitectura oficial aprobada:

```text
GitHub Pages → cliente(s) HTML/CSS/JS → Google Apps Script → Google Sheets
```

- GitHub Pages: hosting.
- Cliente: interfaces estáticas.
- Google Apps Script: backend compartido.
- Google Sheets: única fuente de datos.

## 2026-08-07 — Dos entradas en un solo repositorio

Queda aprobado el modelo:

- **Un único repositorio.**
- **Dos entradas independientes:**
  - `/` → Portal General (consulta);
  - `/encargados/` → Portal Encargados (edición).

No se adoptan dos proyectos/repositorios independientes.  
No se adopta una única aplicación con perfiles.

Ambos portales comparten Apps Script, Google Sheets, recursos comunes (CSS, utilidades, reglas de negocio) y documentación.

Cada portal tiene navegación y UX propias:

- Portal Encargados no muestra módulos del Portal General.
- Portal General no incluye funciones de edición del Portal Encargados.

## 2026-08-07 — Fuente única de datos

Google Sheets es la única fuente de datos.

Se elimina `localStorage` como persistencia o fuente de verdad.

No se incorporan bases de datos, Firebase, SQL ni otros servicios de datos.

## 2026-08-07 — Alcance del proyecto

El proyecto es una aplicación para administrar los informes de actividad de una congregación.

El desarrollo es modular. El módulo en desarrollo actual es Informes, sin limitar el proyecto a ese único módulo.

Los encargados de grupo cargan los informes en Google Sheets.

No hay otras congregaciones en el alcance actual.

## 2026-08-07 — Módulos oficiales y estados

Módulos oficiales: Inicio, Personas, Informes, Estadísticas, Configuración.

Estados posibles: No iniciado, En desarrollo, Terminado.

Que un módulo exista en la navegación no implica que deba implementarse.

## 2026-08-07 — Estado de desarrollo aprobado

- Infraestructura: Terminado.
- Informes: En desarrollo.
- Inicio: No iniciado.
- Personas: No iniciado.
- Estadísticas: No iniciado.
- Configuración: No iniciado.

## 2026-08-07 — Eliminación de desvíos

Se descartó de la base oficial:

- Dashboards demo.
- KPIs ficticios.
- Placeholders funcionales que simulan producto terminado.
- Almacenamiento local fuera de contrato.
- CRUD de Personas.
- Estadísticas implementadas sin aprobación.
- Configuraciones inventadas.
- Código muerto y funciones sin uso.
- Archivos experimentales ajenos al contrato.

## 2026-08-07 — Apps Script como backend de lectura

Apps Script expone los informes como JSON de solo lectura.

El endpoint no debe exponer datos sensibles (teléfonos, direcciones, contactos de emergencia u otros).

## 2026-08-07 — Proceso de desarrollo

Ninguna funcionalidad puede implementarse por iniciativa propia.

Proceso oficial: diseño funcional → aprobación → implementación → auditoría → correcciones → cierre del sprint.

## 2026-08-07 — Módulos aprobados vs. implementación

Inicio, Personas, Informes, Estadísticas y Configuración existen y están aprobados como módulos oficiales.

Un módulo en estado **No iniciado** no se implementa hasta contar con especificación funcional aprobada. Eso no lo excluye del proyecto.

## 2026-08-07 — Regla de módulos y prioridad documental

Toda funcionalidad debe pertenecer a un módulo oficial e indicar módulo, objetivo, estado y sprint.

La documentación aprobada prima sobre el código: ante divergencia, se adapta el código.
