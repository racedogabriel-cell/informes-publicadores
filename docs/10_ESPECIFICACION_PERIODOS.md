# Especificación funcional — Módulo Períodos

Documento de **diseño aprobado**. Solo documentar. **No implementar** hasta sprint y aprobación explícitos.

- **Módulo:** Períodos
- **Portal:** Portal General (`/`)
- **Estado:** No iniciado
- **Modelo de datos:** `docs/09_MODELO_DATOS_SHEETS.md`
- **Roles:** solo Encargado General

---

## 1. Objetivo

Gestionar el ciclo de vida del período de informes:

1. Abrir un período.
2. Cerrar un período.
3. Generar las hojas `Grupo 1` y `Grupo 2` desde el padrón `Personas`.
4. Copiar la fotografía del período al `Historial`.
5. Limpiar / preparar las hojas de trabajo para el siguiente período.

---

## 2. Fuera de alcance (ahora)

- Cualquier implementación de UI o Apps Script de este módulo.
- Escritura definitiva de informes del Portal Encargados.
- Edición del padrón (eso corresponde al módulo **Personas**).
- Consulta analítica del historial (puede vivir en Informes/Estadísticas en sprints futuros).

---

## 3. Responsabilidades

| Acción | Descripción |
|---|---|
| Abrir período | Establece el período abierto (`B3`), regenera `Grupo 1` y `Grupo 2` desde `Personas` (`Activo = Sí`), A–B desde padrón, C–F vacíos. |
| Cerrar período | Copia todas las filas del período abierto al `Historial` con los campos mínimos del modelo; registra fecha de cierre. |
| Generar hojas de grupo | Materializa el padrón filtrado por grupo en las hojas de trabajo. |
| Copiar a Historial | Append-only; no modifica filas históricas previas. |
| Limpiar hojas de trabajo | Tras el cierre (o como parte de abrir el siguiente), deja el período abierto listo según la regla de regeneración. |
| Preparar siguiente período | Encadena cierre + apertura del nuevo mes según el flujo del modelo de datos. |

---

## 4. Flujo operativo (resumen)

```text
Mantener Personas
      ↓
Abrir período → regenerar Grupo 1 / Grupo 2
      ↓
Carga de informes (Encargados) + consulta (Informes)
      ↓
Cerrar período → copiar a Historial
      ↓
Preparar / abrir siguiente período
```

Detalle normativo: `docs/09_MODELO_DATOS_SHEETS.md` §§5–8.

---

## 5. Reglas de negocio (obligatorias)

1. Solo el Encargado General opera este módulo.
2. Los encargados de grupo **no** abren ni cierran períodos.
3. Al regenerar, A y B salen siempre de `Personas`; nunca se inventan desde Encargados.
4. Solo personas con `Activo = Sí` entran al período abierto.
5. El `Historial` es inmutable tras cada cierre.
6. Cambios posteriores de nombre o grupo en `Personas` **no** alteran el `Historial`.
7. No se borran fotografías históricas para “corregir” el pasado; las correcciones del padrón aplican hacia adelante.

---

## 6. Integración futura con Apps Script

Cuando se implemente (sprint futuro), Apps Script deberá exponer acciones dedicadas al ciclo de períodos (nombres exactos a definir en la implementación), por ejemplo:

- abrir / regenerar período;
- cerrar y archivar en `Historial`.

Esas acciones son **distintas** del `doPost` de guardado de informes del Portal Encargados (`saveGroup`).

---

## 7. Criterios de aceptación (para cuando se implemente)

1. Abrir período regenera `Grupo 1` y `Grupo 2` solo desde `Personas` activas.
2. Cerrar período agrega al `Historial` una fila por persona del período, sin modificar filas previas.
3. Tras un cambio de grupo o nombre en el padrón, un período ya cerrado permanece intacto en `Historial`.
4. El Portal Encargados sigue viendo solo el período abierto de su grupo.
5. No se implementan estas acciones dentro de `/encargados/`.

---

## 8. Relación con otros módulos

| Módulo | Relación |
|---|---|
| Personas | Mantiene el padrón que Períodos lee al regenerar. |
| Informes | Consulta el período abierto; historial cerrado es extensión futura. |
| Portal Encargados | Consume el período abierto; no gestiona el ciclo. |
| Estadísticas | Posible consumidor futuro del `Historial`. |
