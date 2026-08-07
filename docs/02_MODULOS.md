# Módulos

Fichas de los módulos oficiales. Todos existen y están aprobados como parte de la arquitectura.

Estados posibles: **No iniciado** · **En desarrollo** · **Terminado**

No implementar funcionalidades de un módulo en estado **No iniciado** hasta contar con especificación funcional aprobada.

---

## Inicio

**Objetivo:** Punto de entrada de la aplicación.

**Estado actual:** No iniciado.

**Funcionalidades aprobadas:**

- Existir como módulo oficial de navegación.

**Funcionalidades pendientes:**

- Especificación funcional aprobada.
- Implementación conforme a esa especificación.

**Funcionalidades fuera de alcance:**

- Dashboards demo.
- KPIs ficticios.
- Cualquier contenido implementado sin especificación funcional aprobada.

---

## Personas

**Objetivo:** Administrar el padrón maestro de personas (`hoja Personas`): única fuente de verdad sobre ID, nombre, grupo actual y activo.

**Estado actual:** No iniciado.

**Funcionalidades aprobadas (diseño de modelo):**

- Existir como módulo oficial de navegación del Portal General.
- Ser el canal del Encargado General para el padrón (altas, bajas lógicas vía Activo, cambios de nombre y grupo).
- Campos mínimos del padrón: ID, Nombre, Grupo, Activo (Sí/No) — ver `docs/09_MODELO_DATOS_SHEETS.md`.

**Funcionalidades pendientes:**

- Especificación funcional de UI aprobada para implementación.
- Implementación conforme a esa especificación.
- Integración Apps Script de lectura/escritura del padrón (distinta del guardado de encargados).

**Funcionalidades fuera de alcance:**

- Cualquier implementación del módulo sin especificación funcional de UI / sprint aprobado.
- Uso de `localStorage` como padrón.
- Exposición de datos sensibles no contemplados en una especificación aprobada.
- Edición del padrón por encargados de grupo.
- Modificar el `Historial` al cambiar nombre o grupo.

---

## Informes

**Objetivo:** Consulta de informes del **período abierto** para el encargado general.

**Estado actual:** En desarrollo.

**Funcionalidades aprobadas:**

- Consultar el endpoint de Apps Script (`action=reports`).
- Consolidar los datos de `Grupo 1` y `Grupo 2` (período abierto).
- Filtrar entre los dos meses anteriores y el mes actual.
- Mostrar cantidad de personas, informes completos y pendientes.
- Operar en solo lectura.
- Permitir actualizar datos desde Google Sheets (botón de actualización).

**Funcionalidades pendientes:**

- Completar el módulo hasta estado **Terminado**, sin ampliar el alcance aprobado.
- Validar el comportamiento del filtro de meses respecto del mes seleccionado en la planilla (`B3`).
- (Futuro, fuera del sprint actual) consulta de períodos cerrados desde `Historial`.

**Funcionalidades fuera de alcance:**

- Carga o edición de informes desde la PWA.
- Persistencia local de informes.
- Estadísticas históricas dentro de esta pantalla.
- Exposición de datos sensibles ajenos al contrato del endpoint.
- Abrir/cerrar períodos (módulo Períodos).
- Cualquier funcionalidad no listada en el alcance aprobado del sprint.

---

## Períodos

**Objetivo:** Gestionar el ciclo mensual: abrir y cerrar período, regenerar `Grupo 1`/`Grupo 2` desde `Personas`, copiar al `Historial` y preparar el siguiente período.

**Estado actual:** No iniciado.

**Especificación de diseño:** `docs/10_ESPECIFICACION_PERIODOS.md`  
**Modelo de datos:** `docs/09_MODELO_DATOS_SHEETS.md`

**Funcionalidades aprobadas (diseño):**

- Existir como módulo oficial de navegación del Portal General.
- Abrir período.
- Cerrar período.
- Generar hojas de grupo desde el padrón.
- Copiar datos al Historial.
- Limpiar hojas de trabajo / preparar el siguiente período.

**Funcionalidades pendientes:**

- Sprint de implementación aprobado.
- UI e integración Apps Script del ciclo.

**Funcionalidades fuera de alcance:**

- Implementar ahora sin sprint.
- Exponer estas acciones en el Portal Encargados.
- Alterar el Historial tras el cierre.

---

## Estadísticas

**Objetivo:** Módulo oficial de estadísticas.

**Estado actual:** No iniciado.

**Funcionalidades aprobadas:**

- Existir como módulo oficial de navegación.

**Funcionalidades pendientes:**

- Especificación funcional aprobada.
- Implementación conforme a esa especificación.

**Funcionalidades fuera de alcance:**

- Gráficos, históricos o tendencias implementados sin especificación funcional aprobada.
- Placeholders que simulen estadísticas reales.

---

## Configuración

**Objetivo:** Módulo oficial de configuración.

**Estado actual:** No iniciado.

**Funcionalidades aprobadas:**

- Existir como módulo oficial de navegación.
- La URL del conector de Apps Script se mantiene en `js/config.js` como parte de la infraestructura.

**Funcionalidades pendientes:**

- Especificación funcional aprobada del módulo de pantalla.
- Implementación conforme a esa especificación.

**Funcionalidades fuera de alcance:**

- Pantallas de configuración inventadas.
- Checklists o flujos que simulen integraciones no aprobadas.
- Introducción de nuevas fuentes de datos o servicios.
