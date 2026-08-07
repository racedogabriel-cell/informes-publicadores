# Modelo de datos — Google Sheets

Documento normativo del **modelo de datos aprobado** de la planilla.

- **Estado:** Aprobado (diseño). La implementación del ciclo de períodos y las hojas nuevas queda pendiente de sprints posteriores.
- **Alcance de esta etapa:** solo documentación. No implica cambios en Portal Encargados, `doPost` dry-run ni escritura definitiva de informes.
- **Referencias:** `docs/01_ARQUITECTURA.md`, `docs/10_ESPECIFICACION_PERIODOS.md`, `docs/02_MODULOS.md`.

---

## 1. Tres conceptos separados

| Concepto | Hoja(s) | Rol |
|---|---|---|
| **Padrón de personas (maestro)** | `Personas` | Única fuente de verdad sobre quiénes existen, a qué grupo pertenecen y si están activos. |
| **Período abierto** | `Grupo 1`, `Grupo 2` | Espacio de trabajo del mes en curso. No son padrón. |
| **Historial** | `Historial` | Fotografías inmutables de períodos cerrados. |

```text
Personas (maestro)
        │
        │  abrir período / regenerar
        ▼
Grupo 1 / Grupo 2  ←── encargados cargan informes (C–F)
        │
        │  cerrar período
        ▼
Historial (inmutable)
```

---

## 2. Hoja `Personas` (padrón maestro)

### 2.1 Propósito

Única fuente de verdad sobre las personas de la congregación.

### 2.2 Administración

- Administrada **únicamente** por el Encargado General.
- Canal previsto: módulo **Personas** del Portal General (especificación e implementación futuras).
- Durante la transición operativa puede editarse en Sheets solo por el Encargado General.
- Los **encargados de grupo nunca** editan esta hoja (ni por Portal Encargados ni por Sheets).

### 2.3 Campos mínimos

| Campo | Descripción |
|---|---|
| `ID` | Identificador estable de la persona. |
| `Nombre` | Nombre vigente en el padrón. |
| `Grupo` | Grupo actual: `Grupo 1` o `Grupo 2`. |
| `Activo` | `Sí` / `No`. |

### 2.4 Reglas

- Un `ID` identifica a una sola persona a lo largo del tiempo.
- Cambiar `Nombre` o `Grupo` en el padrón afecta solo períodos **futuros** (al regenerar las hojas de trabajo).
- `Activo = No`: la persona **no** se incluye al regenerar `Grupo 1` / `Grupo 2` para un nuevo período.
- Esta hoja **no** almacena privilegio, horas, estudios ni comentarios del mes.

### 2.5 Layout propuesto (referencia)

| Columna | Campo |
|---|---|
| A | ID |
| B | Nombre |
| C | Grupo |
| D | Activo |

Detalle de fila de encabezados y validaciones de hoja: a fijar en la especificación del módulo Personas / implementación del módulo Períodos.

---

## 3. Hojas `Grupo 1` y `Grupo 2` (período abierto)

### 3.1 Propósito

Representan **exclusivamente el período actualmente abierto**.

Dejan de ser un padrón. La lista de integrantes se **regenera** desde `Personas` cuando el Encargado General abre un nuevo período (módulo Períodos).

### 3.2 Origen de columnas

| Columnas | Origen | Editable por encargado de grupo |
|---|---|---|
| A–B (`ID`, `Nombre`) | Siempre del padrón `Personas` al regenerar | **No** |
| C–F (`Privilegio`, `Horas`, `Estudios`, `Comentarios`) | Informe del período abierto | **Sí** (vía Portal Encargados cuando corresponda) |

### 3.3 Layout operativo (sin cambio de forma física actual)

Se conserva el layout ya usado por Informes / Encargados:

| Ubicación | Uso |
|---|---|
| `B3` | Período / mes informado del período abierto |
| Fila 5 | Encabezados |
| Desde fila 7 | Datos del período |
| A | ID (desde padrón; nunca editable en Encargados) |
| B | Nombre (desde padrón; nunca editable en Encargados) |
| C–F | Informe del período |

### 3.4 Regeneración al abrir período

Al abrir un período, el sistema (módulo Períodos → Apps Script):

1. Lee `Personas`.
2. Incluye solo filas con `Activo = Sí`.
3. Distribuye por `Grupo` en `Grupo 1` o `Grupo 2`.
4. Escribe A–B desde el padrón.
5. Deja C–F vacíos (listos para la carga del período).
6. Establece `B3` con el período abierto.

No crea personas nuevas desde Encargados. No elimina del padrón al regenerar.

---

## 4. Hoja `Historial`

### 4.1 Propósito

Almacén append-only de períodos cerrados. Cada cierre mensual copia una **fotografía completa** del período.

### 4.2 Campos mínimos

| Campo | Descripción |
|---|---|
| Período | Mes/período cerrado (el valor vigente en `B3` al cerrar). |
| Grupo | Grupo al que pertenecía la fila en ese período. |
| ID | ID de la persona en ese momento. |
| Nombre | Nombre **exacto** al momento del cierre. |
| Privilegio | Valor de C al cierre. |
| Horas | Valor de D al cierre. |
| Estudios | Valor de E al cierre. |
| Comentarios | Valor de F al cierre. |
| Fecha de cierre | Marca temporal del cierre. |

### 4.3 Inmutabilidad

- El historial **nunca se modifica** tras el cierre.
- No se reescriben filas de períodos cerrados.
- No se borran fotografías por cambios posteriores en el padrón.

### 4.4 Layout propuesto (referencia)

Una fila por persona por período cerrado. Columnas en el orden de los campos mínimos anteriores (detalle de encabezados en la implementación del módulo Períodos).

---

## 5. Cambios de grupo

**Regla:** el historial conserva el grupo del momento del cierre. El padrón solo afecta períodos nuevos.

### Ejemplo

1. **Agosto** (período abierto): la persona está en `Personas` con `Grupo = Grupo 1` → aparece en hoja `Grupo 1`.
2. Se **cierra Agosto** → se copia al `Historial` con `Grupo = Grupo 1` (y el nombre de ese momento).
3. En el padrón se cambia a `Grupo = Grupo 2`.
4. Se **abre Septiembre** → la persona regenera en hoja `Grupo 2`.

**Resultado esperado:**

- Agosto permanece en `Historial` como **Grupo 1**.
- Septiembre aparece en el período abierto como **Grupo 2**.
- Nunca se modifica el historial.

---

## 6. Cambios de nombre

**Misma regla de fotografía.**

1. Agosto se cierra con el nombre entonces vigente → ese nombre queda en `Historial`.
2. Luego se corrige el nombre en `Personas`.
3. El nuevo período abierto muestra el nombre actualizado en A–B.
4. El historial de Agosto **no cambia**.

---

## 7. Estructura propuesta de la planilla

| Pestaña | Tipo | Quién escribe |
|---|---|---|
| `Personas` | Maestro | Solo Encargado General (módulo Personas / Sheets) |
| `Grupo 1` | Período abierto | Encargados de grupo: solo C–F. Regeneración A–B/`B3`: módulo Períodos |
| `Grupo 2` | Período abierto | Igual que `Grupo 1` |
| `Historial` | Archivo inmutable | Solo el proceso de período (módulo Períodos → Apps Script) |

Spreadsheet ID del proyecto: el ya configurado en Apps Script (sin cambio de planilla maestra en esta etapa documental).

---

## 8. Flujo completo del ciclo mensual

```text
1. Encargado General mantiene el padrón en Personas
   (altas, bajas lógicas vía Activo, cambios de nombre/grupo)
        ↓
2. Abrir período (módulo Períodos)
   - Definir período en B3 de Grupo 1 y Grupo 2
   - Regenerar filas desde Personas (Activo = Sí)
   - A–B desde padrón; C–F vacíos
        ↓
3. Carga del período
   - Encargados de grupo: Portal Encargados → informan C–F
   - Encargado General: Portal General → Informes (consulta del período abierto)
        ↓
4. Cerrar período (módulo Períodos)
   - Copiar fotografía completa de Grupo 1 y Grupo 2 → Historial
   - Incluir Período, Grupo, ID, Nombre, C–F y Fecha de cierre
   - No alterar filas ya existentes del Historial
        ↓
5. Preparar siguiente período
   - Limpiar / regenerar hojas de trabajo desde Personas
   - Establecer el nuevo valor de B3
   - Listo para el paso 3 del nuevo mes
```

### Responsabilidades por rol

| Rol | Personas | Período abierto | Historial |
|---|---|---|---|
| Encargado General | Administra | Abre/cierra vía Períodos; consulta Informes | Solo lectura (consulta futura) |
| Encargado de grupo | No toca | Edita solo C–F de su grupo | No toca |

---

## 9. Impacto en módulos existentes (diseño)

| Módulo / portal | Efecto de este modelo |
|---|---|
| Informes | Sigue leyendo el **período abierto** (`Grupo 1` / `Grupo 2`). Consulta de historial cerrado: fuera de esta etapa. |
| Portal Encargados | Sin cambio de lógica de guardado en esta etapa. Sigue operando sobre el período abierto; A–B solo lectura. |
| Personas (módulo UI) | Administrará la hoja `Personas` (especificación e implementación futuras). |
| Períodos | Nuevo módulo: ciclo abrir/cerrar/regenerar/copiar (solo documentado ahora). |

---

## 10. Fuera de alcance de esta etapa documental

- Crear o alterar físicamente las pestañas en la planilla live (salvo decisión operativa explícita posterior).
- Implementar el módulo Períodos.
- Implementar el módulo Personas.
- Cambiar `doPost`, dry-run o escritura definitiva del Portal Encargados.
- Migrar datos históricos existentes a `Historial` (se definirá al implementar el primer cierre).
