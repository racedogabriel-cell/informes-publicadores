# Especificación funcional — Módulo Informes

Documento normativo del comportamiento **aprobado** del módulo Informes.

- **Módulo:** Informes
- **Estado:** En desarrollo
- **Sprint:** Sprint Informes — consulta consolidada
- **Archivos de implementación relacionados:** `js/informes.js`, `js/sheets.js`, `js/config.js`, `js/router.js`, `apps-script/Code.gs`

## Vigencia

Esta documentación **reemplaza** la descripción anterior del comportamiento del módulo Informes (incluida la versión que documentaba la implementación vigente al 2026-08-07).

Hasta que el código sea actualizado para cumplir esta especificación, **puede existir una diferencia temporal entre la especificación y la implementación**. En ese intervalo rige la regla del contrato del proyecto: el código deberá adaptarse a la documentación, no al revés.

---

## 1. Propósito

La pantalla Informes es de solo lectura. Consulta el endpoint de Apps Script, consolida los grupos, aplica las reglas de negocio de completitud y muestra el estado del mes, de los grupos y de cada informe.

No escribe en Google Sheets. No usa `localStorage`.

---

## 2. Origen de los datos

### 2.1 Solicitud

1. La PWA solicita los informes al endpoint de Apps Script.
2. La solicitud usa `action=reports`.
3. La URL base del endpoint se configura en `js/config.js`.

### 2.2 Respuesta esperada

Objeto JSON con:

- `generatedAt`: fecha/hora ISO de generación.
- `groups`: arreglo de grupos.

Cada elemento de `groups` contiene:

- `grupo`
- `mes`
- `informes`

Cada elemento de `informes` contiene:

- `id`
- `nombre`
- `privilegio`
- `horas`
- `estudios`
- `comentarios`

### 2.3 Alcance de la lectura en Apps Script

El conector lee las pestañas del **período de trabajo**: `Grupo 1` y `Grupo 2`.

**Arquitectura aprobada:** el período vigente se obtiene de la hoja `Sistema` (`PeriodoActivo` / `EstadoPeriodo`), no por inferencia desde `B3`. Ver `docs/09_MODELO_DATOS_SHEETS.md` §2.

**Transición:** la implementación actual aún puede filtrar por `B3`/`mes` en la respuesta de grupos; esa inferencia queda deprecada y deberá sustituirse al implementar la lectura de `Sistema`.

Las hojas de grupo no son padrón: la lista se regenera desde `Personas` al abrir un período (módulo Períodos). El `Historial` de períodos cerrados queda fuera del alcance actual del módulo Informes.

---

## 3. Privilegios y validación de horas

### 3.1 Privilegio válido

Un privilegio se considera **válido** únicamente si es uno de:

- `Publicador`
- `Auxiliar`
- `Regular`
- `Inactivo`

Cualquier otro valor (incluido vacío) **no** es un privilegio válido.

### 3.2 Campo Horas (nombre físico)

El nombre físico del campo `horas` se mantiene por compatibilidad con Google Sheets.

Su interpretación depende del privilegio informado:

| Privilegio | Interpretación de `horas` |
|---|---|
| `Publicador` | Respuesta `Sí` / `No` |
| `Auxiliar` | Cantidad numérica de horas |
| `Regular` | Cantidad numérica de horas |
| `Inactivo` | No aplica |

### 3.3 Horas válidas según privilegio

#### Publicador

El campo `horas` solo admite respuestas equivalentes a **Sí** o **No**, aplicando la normalización de la sección 3.5.

Cualquier otro valor (incluido vacío o numérico) **no** es válido para Publicador.

#### Auxiliar

El campo `horas` solo admite un **valor numérico**.

#### Regular

El campo `horas` solo admite un **valor numérico**.

#### Inactivo

El campo `horas` **no aplica**.

No se exige valor en `horas` para considerar completo el informe de un integrante inactivo.

### 3.4 Valor numérico de horas

Se considera valor numérico de horas un valor que representa un número (por ejemplo `0`, `1`, `10.5` según el formato entregado por la planilla/endpoint), distinto de vacío y distinto de los literales equivalentes a `Sí` / `No`.

Para Publicador, Auxiliar y Regular, la validación de horas **depende del privilegio**. No se interpreta `Sí`/`No` (ni sus equivalentes normalizados) como válido para Auxiliar o Regular, ni un número como válido para Publicador.

### 3.5 Normalización de entradas

La normalización se utiliza **únicamente para validar** la entrada en la PWA.

- No modifica el valor almacenado en Google Sheets.
- No cambia la presentación de los datos en pantalla: se muestra el valor recibido tal como llega del endpoint.

#### Respuestas Sí / No (privilegio Publicador)

Para validar `horas` de un Publicador, se normaliza el texto así:

1. Se recortan espacios laterales.
2. Se ignoran mayúsculas y minúsculas.
3. Se ignoran tildes / diacríticos.

Tras esa normalización, se aceptan como **Sí** al menos:

- `Sí`
- `SI`
- `Si`
- `si`
- `sí`
- `SÍ`

Y como **No** al menos:

- `No`
- `NO`
- `no`

Cualquier otra cadena, aunque se parezca, no es válida.

---

## 4. Validación de campos

| Campo | Obligatorio | Regla de validación |
|---|---|---|
| `id` | Sí (para incluir la fila en el consolidado) | Debe estar presente e identificar al integrante. |
| `nombre` | Sí (para incluir la fila en el consolidado) | Debe estar presente. |
| `privilegio` | Sí (para completar el informe) | Debe ser exactamente uno de: `Publicador`, `Auxiliar`, `Regular`, `Inactivo`. |
| `horas` | Condicional | **Publicador:** equivalentes normalizados de `Sí` o `No` (sección 3.5). **Auxiliar** / **Regular:** solo valor numérico. **Inactivo:** no aplica; no se exige. |
| `estudios` | No | No interviene en la regla de completitud del informe. |
| `comentarios` | No | No interviene en la regla de completitud del informe. |

---

## 5. Informe individual

### 5.1 Privilegio Inactivo

Un integrante con privilegio **Inactivo**:

- no requiere completar informe mensual;
- el campo Horas no aplica;
- su informe se considera **completo por definición**.

### 5.2 Informe completado (resto de privilegios)

Para `Publicador`, `Auxiliar` y `Regular`, un informe se considera **completado** únicamente cuando se cumplen **las dos** condiciones:

1. el campo `privilegio` contiene un valor válido;
2. el campo `horas` contiene un valor válido **para ese privilegio**.

Si falta cualquiera de las dos, el informe **no** está completado.

No bastan `estudios` ni `comentarios` para considerar completado un informe.

### 5.3 Resumen de completitud por privilegio

| Privilegio | Condición de informe completo |
|---|---|
| `Inactivo` | Completo por definición |
| `Publicador` | `privilegio` válido y `horas` equivalente normalizado a `Sí` o `No` (sección 3.5) |
| `Auxiliar` | `privilegio` válido y `horas` numérico |
| `Regular` | `privilegio` válido y `horas` numérico |
| Vacío u otro valor | Pendiente |

### 5.4 Informe pendiente

Un informe se considera **pendiente** cuando no está completado según las reglas de esta sección.

---

## 6. Estado del grupo

Un grupo se considera **completo** únicamente cuando **todos** sus integrantes tienen el informe completo.

Los integrantes con privilegio `Inactivo` cuentan como completos a estos efectos.

Si al menos un integrante está pendiente, el grupo **no** está completo.

---

## 7. Estado del mes

El mes se considera **completo** únicamente cuando **todos** los grupos están completos.

Si al menos un grupo no está completo, el mes **no** está completo.

---

## 8. Contadores

Los contadores del módulo Informes deben calcularse con las reglas de esta especificación:

| Contador | Definición aprobada |
|---|---|
| Personas | Cantidad de informes (filas) incluidos en la vista consolidada del mes |
| Completos | Cantidad de informes individuales que cumplen la regla de completado (incluye `Inactivo`) |
| Pendientes | `Personas − Completos` |
| Estado del grupo | Completo o no completo, según la sección 6 |
| Estado del mes | Completo o no completo, según la sección 7 |

---

## 9. Filtro y consolidación de meses

### 9.1 Opciones de mes en la PWA

La interfaz ofrece el mes actual y los dos meses anteriores.

### 9.2 Criterio de inclusión

Se incluyen en la vista los grupos cuyo campo `mes` corresponde al mes seleccionado en la interfaz.

### 9.3 Consolidación

Las filas de los grupos incluidos se consolidan en una sola vista de solo lectura, conservando la identificación del grupo de origen.

### 9.4 Grupos con meses distintos

Si un grupo tiene un mes distinto al seleccionado, ese grupo no forma parte de la vista del mes seleccionado.

El estado del mes seleccionado se evalúa solo sobre los grupos incluidos en esa vista.

---

## 10. Presentación

La pantalla debe permitir:

- consultar el endpoint;
- mostrar estado de carga;
- mostrar error claro si la consulta falla;
- mostrar fecha y hora de generación del JSON;
- mostrar el mes informado;
- consolidar Grupo 1 y Grupo 2 cuando correspondan al mes;
- mostrar totales según las reglas de esta especificación;
- mostrar la tabla de informes recibidos;
- actualizar los datos desde Google Sheets.

Campos vacíos de privilegio, horas, estudios o comentarios se muestran de forma legible en la tabla (por ejemplo como guion), sin alterar la regla de completitud.

Para `Inactivo`, si `horas` viene vacío, la presentación puede mostrar guion; ello no impide considerarlo completo.

---

## 11. Errores de consulta

Si no hay conexión, el endpoint responde error, el cuerpo no es JSON válido, o el JSON trae un error explícito, la pantalla debe informar el fallo y no mostrar un consolidado como si la consulta hubiera sido exitosa.

---

## 12. Fuera de alcance de esta especificación

- Escritura o edición de informes desde la PWA.
- Autenticación.
- Módulos Inicio, Personas, Estadísticas y Configuración.
- Gráficos u otras estadísticas distintas de los contadores y estados definidos aquí.
- Uso de `localStorage` u otras fuentes de datos.
- Cambios a Apps Script o a la planilla de Google Sheets.

---

## 13. Resumen de reglas aprobadas

1. Privilegios válidos: `Publicador`, `Auxiliar`, `Regular`, `Inactivo`.
2. **Inactivo** no requiere informe mensual; Horas no aplica; completo por definición.
3. **Publicador** → horas equivalentes a `Sí` o `No`, sin depender de mayúsculas, minúsculas ni tilde (sección 3.5).
4. **Auxiliar** / **Regular** → horas solo valor numérico.
5. El nombre físico `horas` se mantiene por compatibilidad con Google Sheets; su interpretación depende del privilegio.
6. La normalización de Sí/No es solo para validar; no altera Sheets ni la presentación.
7. **Completado (Publicador/Auxiliar/Regular)** = privilegio válido **y** horas válidas para ese privilegio.
8. **Pendiente** = no completado.
9. **Grupo completo** = todos sus integrantes con informe completo.
10. **Mes completo** = todos los grupos completos.
11. Esta especificación reemplaza el comportamiento anterior documentado.
12. Ante divergencia, el código debe adaptarse a este documento.
