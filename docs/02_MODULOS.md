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

**Objetivo:** Módulo oficial de personas dentro de la aplicación de administración de informes de actividad.

**Estado actual:** No iniciado.

**Funcionalidades aprobadas:**

- Existir como módulo oficial de navegación.
- Formar parte de la arquitectura aprobada del proyecto.

**Funcionalidades pendientes:**

- Especificación funcional aprobada.
- Implementación conforme a esa especificación.

**Funcionalidades fuera de alcance:**

- Cualquier implementación del módulo sin especificación funcional aprobada.
- Uso de `localStorage` como padrón.
- Exposición de datos sensibles no contemplados en una especificación aprobada.

---

## Informes

**Objetivo:** Consulta de informes mensuales para el encargado general.

**Estado actual:** En desarrollo.

**Funcionalidades aprobadas:**

- Consultar el endpoint de Apps Script (`action=reports`).
- Consolidar los datos de `Grupo 1` y `Grupo 2`.
- Filtrar entre los dos meses anteriores y el mes actual.
- Mostrar cantidad de personas, informes completos y pendientes.
- Operar en solo lectura.
- Permitir actualizar datos desde Google Sheets (botón de actualización).

**Funcionalidades pendientes:**

- Completar el módulo hasta estado **Terminado**, sin ampliar el alcance aprobado.
- Validar el comportamiento del filtro de meses respecto del mes seleccionado en la planilla (`B3`).

**Funcionalidades fuera de alcance:**

- Carga o edición de informes desde la PWA.
- Persistencia local de informes.
- Estadísticas históricas dentro de esta pantalla.
- Exposición de datos sensibles ajenos al contrato del endpoint.
- Cualquier funcionalidad no listada en el alcance aprobado del sprint.

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
