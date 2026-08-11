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

**Objetivo:** Administrar el padrón maestro de personas (`hoja Personas`): única fuente de verdad sobre ID, nombre, grupo actual, activo y datos de contacto/emergencia del padrón.

**Estado actual:** En desarrollo.

**Funcionalidades aprobadas (diseño de modelo):**

- Existir como módulo oficial de navegación del Portal General.
- Ser el canal del Encargado General para el padrón (altas, bajas lógicas vía Activo, cambios de nombre y grupo, y datos de contacto/emergencia).
- Campos del padrón: ID, Nombre, Grupo, Activo (Sí/No), NumeroContacto, ContactoEmergencia, NombreEmergencia, RelacionEmergencia — ver `docs/09_MODELO_DATOS_SHEETS.md`.
- Los datos de contacto/emergencia pertenecen al padrón; no al módulo Informes ni a las hojas de grupo del período.

**En este sprint (UI + API padrón):**

- Listado real desde `action=personas`.
- Alta, edición, activar/desactivar (baja lógica).
- Búsqueda por nombre y filtros Todos / Activos / Inactivos / Grupo.

**Funcionalidades pendientes:**

- Cerrar el módulo hasta estado **Terminado** (auditoría de UX y despliegue Apps Script).
- Especificación formal adicional si se amplía el alcance.

**Funcionalidades fuera de alcance:**

- DELETE físico del padrón.
- Uso de `localStorage` como padrón.
- Exposición de contacto/emergencia en `action=reports` o Portal Encargados.
- Edición del padrón por encargados de grupo.
- Modificar el `Historial` al cambiar nombre o grupo.

---

## Informes

**Objetivo:** Consulta de informes del **período abierto** para el encargado general.

**Estado actual:** En desarrollo.

**Funcionalidades aprobadas:**

- Consultar el endpoint de Apps Script (`action=reports`).
- Consolidar los datos de las hojas SheetKey `Grupo {ID}` del período abierto.
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
- Estadísticas históricas dentro de esta pantalla (usar el módulo Historial).
- Exposición de datos sensibles ajenos al contrato del endpoint.
- Abrir/cerrar períodos (módulo Períodos).
- Cualquier funcionalidad no listada en el alcance aprobado del sprint.

---

## Períodos

**Objetivo:** Gestionar el ciclo mensual: abrir y cerrar período, regenerar hojas SheetKey desde `Personas`, copiar al `Historial` y preparar el siguiente período.

**Estado actual:** En desarrollo.

**Especificación de diseño:** `docs/10_ESPECIFICACION_PERIODOS.md`  
**Modelo de datos:** `docs/09_MODELO_DATOS_SHEETS.md`

**Funcionalidades aprobadas (diseño):**

- Existir como módulo oficial de navegación del Portal General.
- Abrir período.
- Cerrar período.
- Generar hojas de grupo desde el padrón.
- Copiar datos al Historial.
- Limpiar hojas de trabajo / preparar el siguiente período.

**En este sprint (UI):**

- Pantalla de administración con listado, período activo, estados y botones.
- Botones sin acciones sobre Google Sheets.

**Funcionalidades pendientes:**

- Apertura/cierre real vía Apps Script.
- Regeneración desde `Personas` y copia a `Historial`.

**Funcionalidades fuera de alcance:**

- Exponer estas acciones en el Portal Encargados.
- Alterar el Historial tras el cierre sin el flujo de Períodos.

---

## Historial

**Objetivo:** Consulta de solo lectura de informes archivados (y del período activo si aún no está en la hoja `Historial`).

**Estado actual:** En desarrollo.

**Funcionalidades aprobadas:**

- Existir como módulo oficial de navegación (reemplaza el slot de Estadísticas).
- Selector de los últimos 24 meses de calendario.
- Listado con la misma estructura visual del módulo Informes, sin acciones de edición.

**Funcionalidades fuera de alcance:**

- Crear, editar o eliminar informes desde este módulo.
- Gráficos, tendencias o estadísticas agregadas.
- Modificar filas de la hoja `Historial`.

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
