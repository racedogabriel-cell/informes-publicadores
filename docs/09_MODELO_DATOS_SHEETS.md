# Modelo de datos — Google Sheets

Documento normativo del **modelo de datos aprobado** de la planilla.

- **Estado:** Aprobado (diseño). La implementación del ciclo de períodos y las hojas nuevas queda pendiente de sprints posteriores.
- **Alcance de esta etapa:** solo documentación. No implica cambios de código, Portal Encargados, Apps Script ni escritura en la planilla live.
- **Referencias:** `docs/01_ARQUITECTURA.md`, `docs/10_ESPECIFICACION_PERIODOS.md`, `docs/02_MODULOS.md`.

---

## 1. Cuatro conceptos separados

| Concepto | Hoja(s) | Rol |
|---|---|---|
| **Estado global del sistema** | `Sistema` | Única fuente de verdad del período vigente y su estado. |
| **Padrón de personas (maestro)** | `Personas` | Única fuente de verdad sobre quiénes existen, a qué grupo pertenecen (`GrupoID`), si están activos y sus datos de contacto/emergencia del padrón. |
| **Catálogo de grupos** | `Grupos` | Maestro de grupos (ID, Nombre, Color, Activo). Administrado desde Configuración. |
| **Período abierto (trabajo)** | SheetKey `Grupo {ID}` | Espacio de trabajo del mes en curso. No son padrón ni autoridad del período. |
| **Historial** | `Historial` | Fotografías inmutables de períodos cerrados (GrupoID + nombre congelado). |

```text
Sistema (PeriodoActivo / EstadoPeriodo / …)
        │
        │  gobierna qué período está vigente
        ▼
Personas (maestro) + Grupos (catálogo)
        ──abrir período / regenerar──► Grupo {ID} (SheetKey)
                                              │
                                              │ cerrar período
                                              ▼
                                         Historial (inmutable)
```

---

## 2. Hoja `Sistema` (estado global)

### 2.1 Propósito

Única fuente de verdad para conocer el **período vigente** y el estado del ciclo mensual.

Una vez implementada esta arquitectura:

- Ni el Portal General ni el Portal Encargados **inferirán** el período desde `B3` de las hojas de grupo.
- Apps Script y ambos portales leerán el período activo desde `Sistema`.

### 2.2 Administración

- Escrita únicamente por el módulo **Períodos** (vía Apps Script) al abrir o cerrar un período.
- Lectura: Portal General (Períodos, Informes) y Portal Encargados (contexto del mes), a través de Apps Script.
- Los encargados de grupo **no** editan esta hoja.

### 2.3 Campos iniciales

| Campo | Descripción |
|---|---|
| `PeriodoActivo` | Identificador/etiqueta del período vigente (p. ej. `Agosto 2026`). |
| `EstadoPeriodo` | `Abierto` o `Cerrado`. |
| `FechaApertura` | Marca temporal de la última apertura. |
| `FechaCierre` | Marca temporal del último cierre (vacío si el período está abierto). |
| `Version` | Versión del esquema / contrato de estado global (para evoluciones controladas). |

### 2.4 Reglas

1. Existe **una sola** fila (o celda-par) de estado vigente; no es un historial de períodos.
2. Al **abrir** un período: se actualizan `PeriodoActivo`, `EstadoPeriodo = Abierto`, `FechaApertura`; se limpia o anula `FechaCierre` según la regla de implementación.
3. Al **cerrar** un período: `EstadoPeriodo = Cerrado`, se registra `FechaCierre`; el valor de `PeriodoActivo` permanece como el período recién cerrado hasta la próxima apertura (o según se fije en la implementación, sin contradecir que `Sistema` es la autoridad).
4. `Version` se incrementa solo cuando cambie el contrato de esta hoja, no en cada apertura/cierre.
5. Ningún cliente debe tratar `B3` de las hojas SheetKey como fuente de verdad del período una vez migrado a `Sistema`.

### 2.5 Relación con `B3` (hojas de grupo)

- `B3` en hojas SheetKey `Grupo {ID}` puede seguir existiendo como **espejo operativo** o ayuda visual en la planilla.
- Tras la migración, `B3` **no** es autoridad: si diverge de `Sistema`, prevalece `Sistema`.
- La sincronización de `B3` (si se mantiene) la realiza el módulo Períodos al abrir/cerrar, no los portales por inferencia.

### 2.6 Layout propuesto (referencia)

Una hoja de configuración con pares campo/valor (columna A = clave, columna B = valor) o una fila única con encabezados. Detalle físico a fijar en la implementación del módulo Períodos.

---

## 3. Hoja `Personas` (padrón maestro)

### 3.1 Propósito

Única fuente de verdad sobre las personas de la congregación.

### 3.2 Administración

- Administrada **únicamente** por el Encargado General.
- Canal previsto: módulo **Personas** del Portal General (especificación e implementación futuras).
- Durante la transición operativa puede editarse en Sheets solo por el Encargado General.
- Los **encargados de grupo nunca** editan esta hoja (ni por Portal Encargados ni por Sheets).

### 3.3 Campos del padrón

| Campo | Tipo | Descripción |
|---|---|---|
| `ID` | texto | Identificador estable de la persona. |
| `Nombre` | texto | Nombre vigente en el padrón. |
| `Grupo` | texto | **GrupoID** del catálogo (`Grupos!A`). La API expone también nombre/color resueltos. |
| `Activo` | texto | `Sí` / `No`. |
| `NumeroContacto` | texto | Teléfono u otro contacto de la persona. Se conserva el valor tal cual (espacios, guiones, formato); **no** convertir a número. |
| `ContactoEmergencia` | texto | Teléfono u otro contacto de emergencia. Misma regla de texto literal. |
| `NombreEmergencia` | texto | Nombre de la persona de contacto de emergencia. |
| `RelacionEmergencia` | texto | Relación con la persona de emergencia (p. ej. Hermana, Amiga). |

Campos vacíos se dejan en blanco. No usar marcadores tipo `N/A`, `-`, `Desconocido` o `Sin datos`.

### 3.4 Reglas

- Un `ID` identifica a una sola persona a lo largo del tiempo.
- Cambiar `Nombre` o `Grupo` en el padrón afecta solo períodos **futuros** (al regenerar las hojas de trabajo).
- `Activo = No`: la persona **no** se incluye al regenerar hojas SheetKey para un nuevo período.
- Los campos de contacto/emergencia **no** se copian a las hojas SheetKey al abrir un período.
- Esta hoja **no** almacena privilegio, horas, estudios ni comentarios del mes (esos viven en el período abierto / Historial).
- `NumeroContacto`, `ContactoEmergencia`, `NombreEmergencia` y `RelacionEmergencia` son datos del **padrón**, no del informe mensual.
- Apps Script **no** debe exponer estos campos en el contrato de Informes (`action=reports`) ni en el guardado de encargados.

### 3.5 Layout de la hoja

| Columna | Campo |
|---|---|
| A | ID |
| B | Nombre |
| C | Grupo |
| D | Activo |
| E | NumeroContacto |
| F | ContactoEmergencia |
| G | NombreEmergencia |
| H | RelacionEmergencia |

Las columnas E–H deben tratarse como **texto** en Sheets (evitar coerción numérica de teléfonos).

---

## 4. Hojas SheetKey `Grupo {ID}` (período abierto)

### 4.1 Propósito

Representan **exclusivamente el espacio de trabajo** del período actualmente abierto según `Sistema`.

Dejan de ser un padrón. La lista de integrantes se **regenera** desde `Personas` cuando el Encargado General abre un nuevo período (módulo Períodos).

### 4.2 Origen de columnas

| Columnas | Origen | Editable por encargado de grupo |
|---|---|---|
| A–B (`ID`, `Nombre`) | Siempre del padrón `Personas` al regenerar | **No** |
| C–F (`Privilegio`, `Horas`, `Estudios`, `Comentarios`) | Informe del período abierto | **Sí** (vía Portal Encargados cuando corresponda) |

### 4.3 Layout operativo (sin cambio de forma física actual)

| Ubicación | Uso |
|---|---|
| `B3` | Espejo opcional del período (no fuente de verdad; ver §2.5) |
| Fila 5 | Encabezados |
| Desde fila 7 | Datos del período |
| A | ID (desde padrón; nunca editable en Encargados) |
| B | Nombre (desde padrón; nunca editable en Encargados) |
| C–F | Informe del período |

### 4.4 Regeneración al abrir período

Al abrir un período, el sistema (módulo Períodos → Apps Script):

1. Actualiza la hoja `Sistema` (`PeriodoActivo`, `EstadoPeriodo = Abierto`, `FechaApertura`, etc.).
2. Lee `Personas`.
3. Incluye solo filas con `Activo = Sí`.
4. Distribuye por `GrupoID` en la hoja SheetKey `Grupo {ID}` correspondiente.
5. Escribe A–B desde el padrón.
6. Deja C–F vacíos (listos para la carga del período).
7. Si se mantiene el espejo, alinea `B3` de ambas hojas al `PeriodoActivo` de `Sistema`.

No crea personas nuevas desde Encargados. No elimina del padrón al regenerar.

---

## 5. Hoja `Historial`

### 5.1 Propósito

Almacén append-only de períodos cerrados. Cada cierre mensual copia una **fotografía completa** del período.

### 5.2 Campos mínimos

| Campo | Descripción |
|---|---|
| Período | Mes/período cerrado (tomado de `Sistema.PeriodoActivo` al cerrar). |
| Grupo | Grupo al que pertenecía la fila en ese período. |
| ID | ID de la persona en ese momento. |
| Nombre | Nombre **exacto** al momento del cierre. |
| Privilegio | Valor de C al cierre. |
| Horas | Valor de D al cierre. |
| Estudios | Valor de E al cierre. |
| Comentarios | Valor de F al cierre. |
| Fecha de cierre | Marca temporal del cierre (alineada a `Sistema.FechaCierre`). |

### 5.3 Inmutabilidad

- El historial **nunca se modifica** tras el cierre.
- No se reescriben filas de períodos cerrados.
- No se borran fotografías por cambios posteriores en el padrón.

### 5.4 Layout propuesto (referencia)

Una fila por persona por período cerrado. Columnas en el orden de los campos mínimos anteriores (detalle de encabezados en la implementación del módulo Períodos).

---

## 6. Cambios de grupo

**Regla:** el historial conserva el grupo del momento del cierre. El padrón solo afecta períodos nuevos.

### Ejemplo

1. **Agosto** (período abierto según `Sistema`): la persona está en `Personas` con `GrupoID = 1` → aparece en hoja `Grupo 1`.
2. Se **cierra Agosto** → se actualiza `Sistema` y se copia al `Historial` con `GrupoID` + nombre congelado.
3. En el padrón se cambia a otro `GrupoID` (p. ej. `2`).
4. Se **abre Septiembre** → `Sistema` pasa a Septiembre / Abierto; la persona regenera en la hoja SheetKey de su nuevo grupo.

**Resultado esperado:**

- Agosto permanece en `Historial` con el nombre congelado al cierre.
- Septiembre aparece en el período de trabajo según el `GrupoID` vigente del padrón.
- Nunca se modifica el historial.

---

## 7. Cambios de nombre

**Misma regla de fotografía.**

1. Agosto se cierra con el nombre entonces vigente → ese nombre queda en `Historial`.
2. Luego se corrige el nombre en `Personas`.
3. El nuevo período abierto muestra el nombre actualizado en A–B.
4. El historial de Agosto **no cambia**.

---

## 8. Estructura propuesta de la planilla

| Pestaña | Tipo | Quién escribe |
|---|---|---|
| `Sistema` | Estado global | Solo módulo Períodos → Apps Script |
| `Personas` | Maestro | Solo Encargado General (módulo Personas / Sheets) |
| `Grupo {ID}` | Trabajo del período | Encargados de grupo: solo C–F. Regeneración A–B: módulo Períodos |
| `Grupos` | Catálogo | Solo Admin vía Configuración / Apps Script |
| `Historial` | Archivo inmutable | Solo el cierre de período (módulo Períodos → Apps Script) |

Spreadsheet ID del proyecto: el ya configurado en Apps Script (sin cambio de planilla maestra en esta etapa documental).

---

## 9. Flujo completo del ciclo mensual

```text
1. Encargado General mantiene el padrón en Personas
   (altas, bajas lógicas vía Activo, cambios de nombre/grupo)
        ↓
2. Abrir período (módulo Períodos)
   - Actualizar hoja Sistema (PeriodoActivo, EstadoPeriodo=Abierto, FechaApertura)
   - Regenerar filas desde Personas (Activo = Sí)
   - A–B desde padrón; C–F vacíos
   - Alinear espejo B3 si se mantiene
        ↓
3. Carga del período
   - Portales leen el período vigente desde Sistema (vía Apps Script)
   - Encargados de grupo: Portal Encargados → informan C–F
   - Encargado General: Portal General → Informes (consulta del período de trabajo)
        ↓
4. Cerrar período (módulo Períodos)
   - Actualizar Sistema (EstadoPeriodo=Cerrado, FechaCierre)
   - Copiar fotografía completa de hojas SheetKey → Historial
   - No alterar filas ya existentes del Historial
        ↓
5. Preparar siguiente período
   - Abrir el nuevo período (paso 2) cuando corresponda
```

### Responsabilidades por rol

| Rol | Sistema | Personas | Período de trabajo | Historial |
|---|---|---|---|---|
| Encargado General | Vía Períodos | Administra | Abre/cierra; consulta Informes | Solo lectura (consulta futura) |
| Encargado de grupo | Solo lectura (contexto) | No toca | Edita solo C–F de su grupo | No toca |

---

## 10. Impacto en módulos existentes (diseño)

| Módulo / portal | Efecto de este modelo |
|---|---|
| Informes | El período a mostrar se toma de `Sistema` (no se infiere de `B3`). Los datos de filas siguen viniendo de las hojas SheetKey. |
| Portal Encargados | El mes/período de contexto se toma de `Sistema`. No edita `Sistema`. Guardado sigue limitado a C–F. |
| Personas (módulo UI) | Administrará la hoja `Personas`. |
| Períodos | Único escritor de `Sistema`; regenera grupos; archiva en `Historial`. |

**Transición:** mientras la lectura desde `Sistema` no esté implementada en código, Informes/Encargados pueden seguir usando `B3` de forma legacy. Esa inferencia queda **deprecada** por este documento y deberá eliminarse al implementar la arquitectura.

---

## 11. Fuera de alcance de esta etapa documental

- Crear o alterar físicamente las pestañas en la planilla live.
- Implementar apertura/cierre real del módulo Períodos.
- Cambiar código de Portal General, Portal Encargados o Apps Script.
- Escritura definitiva de informes del Portal Encargados.
- Migrar datos históricos existentes a `Historial`.
