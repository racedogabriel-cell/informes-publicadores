# Especificación funcional — Portal Encargados

**Estado del documento:** borrador alineado a la arquitectura de dos entradas — pendiente de aprobación final para implementar.  
**No implementar** hasta aprobación explícita.

- **Entrada:** `/encargados/` dentro del mismo repositorio `informes-publicadores`.  
- **Portal hermano:** Portal General en `/` (consulta; no comparte navegación ni UX).  
- **Recursos compartidos:** Apps Script, Google Sheets, CSS/utilidades/reglas de negocio comunes y documentación.  
- **Alcance:** permitir que cada encargado complete los informes de **su grupo** por interfaz web, reemplazando la edición directa de Google Sheets.  
- **Reglas de completitud:** las mismas definidas en `docs/07_ESPECIFICACION_INFORMES.md`.

Arquitectura de referencia: `docs/01_ARQUITECTURA.md`.

---

## 0. Arquitectura del Portal Encargados

Modelo aprobado: **un solo repositorio**, **dos entradas independientes**.

```text
GitHub Pages (repositorio único)
├── `/` → Portal General (consulta)
└── `/encargados/` → Portal Encargados (edición)
         ↓
Google Apps Script
         ↓
Google Sheets
```

### Separación de experiencias

- El Portal Encargados tiene navegación y UX propias.
- **No** muestra módulos del Portal General (Inicio, Personas, Informes, Estadísticas, Configuración).
- El Portal General **no** incluye funciones de edición del Portal Encargados.
- No es una aplicación con perfiles: son dos entradas, no dos modos de la misma UI.

### Recursos compartidos con el Portal General

- Google Apps Script (mismo conector).
- Google Sheets (misma planilla).
- Recursos comunes de cliente (CSS, utilidades, reglas de negocio).
- Documentación en `docs/`.

---

## 1. Objetivo del módulo

Permitir al encargado de grupo:

1. Abrir el **Portal Encargados** en `/encargados/`.
2. Trabajar directamente sobre el **grupo determinado** de esa instancia (sin elegir grupo libremente).
3. Ver el mes informado (solo lectura) y la lista de integrantes de su grupo.
4. Completar o corregir únicamente: `privilegio`, `horas`, `estudios`, `comentarios`.
5. Presionar **una sola acción** — **Guardar Grupo** — para persistir el trabajo.
6. Recibir un resultado claro: grupo guardado correctamente, o guardado con errores identificando qué personas requieren corrección.

### Objetivo de diseño del guardado

Mantener una experiencia simple para el encargado (**una sola acción de guardado**), pero conservar en el backend un **procesamiento independiente por persona**, para facilitar validaciones, recuperación ante errores y futuras auditorías.

El encargado general seguirá consultando el consolidado en el **Portal General (`/`) → Informes** (solo lectura).

### Fuera de alcance de esta especificación

- Convertir ambos portales en una sola UI con perfiles.
- Separar el Portal Encargados en otro repositorio.
- Mostrar módulos del Portal General dentro de `/encargados/`.
- Selección libre de grupo por el encargado.
- Edición del mes (`B3`).
- Edición de `id` o `nombre`.
- Administración del padrón (altas/bajas).
- Guardado automático por cada fila.
- Otras congregaciones.
- Autenticación con proveedores externos (Firebase, OAuth de terceros, etc.).
- Bases de datos distintas de Google Sheets.
- Uso de `localStorage` como fuente de verdad.

### Identificación del grupo

El portal se abre **ya asociado a un grupo determinado** (`Grupo 1` o `Grupo 2`).

El mecanismo definitivo de identificación (enlace, configuración de despliegue, u otro medio dentro del stack aprobado) **se definirá más adelante**.  
En esta especificación solo se establece que el encargado **no** selecciona el grupo en la interfaz.

---

## 2. Flujo completo del usuario

```text
Encargado abre Portal Encargados (grupo ya determinado)
        ↓
La aplicación solicita al Apps Script los datos de ese grupo (lectura)
        ↓
Se muestra el mes informado (B3, solo lectura) y la lista de personas
        ↓
El encargado completa o modifica los informes de las personas del grupo
        ↓
El encargado presiona Guardar Grupo
        ↓
La UI pasa a estado Guardando...
        ↓
La aplicación envía el grupo completo en una sola operación (doPost)
        ↓
Apps Script procesa internamente cada persona de forma independiente
        ↓
Respuesta con resultado global + detalle por persona
        ↓
UI: Grupo guardado correctamente
   o: Guardado con errores (marcando quiénes fallaron)
```

### Relación con el Portal General

Después de un guardado, el Portal General (Informes) verá los cambios persistidos en la próxima sincronización/lectura de `action=reports`.

---

## 3. Pantallas necesarias

### 3.1 Pantalla de carga del grupo

**Contenido:**

- Identificación del grupo determinado (solo lectura).
- Indicación de “Cargando informes…”.

**Comportamiento:**

- No hay pantalla de selección de grupo.
- Si la lectura falla → error + reintentar.
- Si tiene éxito → pantalla de edición.

### 3.2 Pantalla de edición del grupo (pantalla principal)

**Contenido:**

- Grupo activo (determinado, no seleccionable).
- Mes informado (`B3`, **solo lectura**).
- Resumen del grupo: personas, completos, pendientes (mismas reglas que Informes).
- Lista de integrantes, una fila por persona.
- Por persona:
  - `id` y `nombre`: visibles, **nunca editables**.
  - `privilegio`, `horas`, `estudios`, `comentarios`: **únicos campos editables**.
- Botón principal único: **Guardar Grupo**.

**Comportamiento:**

- El usuario trabaja sobre el **grupo completo**.
- **No** hay guardado automático por fila.
- **No** hay botón de guardado individual por persona.
- `horas` adapta su control según `privilegio` (Sí/No para Publicador; numérico para Auxiliar/Regular; no aplica / deshabilitado para Inactivo).
- Se pueden incluir en el guardado personas con informe aún pendiente (campos vacíos permitidos), salvo formato inválido.
- El resumen de completos/pendientes se recalcula en pantalla al editar.

### 3.3 Flujo visual del botón Guardar Grupo

Estados de la acción principal:

1. **Guardar Grupo** — estado inicial / listo para enviar.
2. **Guardando...** — mientras la operación está en curso (botón deshabilitado para evitar doble envío).
3. Resultado:
   - **Grupo guardado correctamente** — todas las personas procesadas sin error.
   - **Guardado con errores** — una o más personas fallaron; la interfaz identifica claramente cuáles requieren corrección.

### 3.4 Resultado de guardado

**Grupo guardado correctamente:**

- Mensaje global de éxito.
- Las filas quedan alineadas a lo persistido (o se relee el grupo).

**Guardado con errores:**

- Mensaje global: guardado con errores.
- Indicación de cuántas personas se guardaron y cuántas fallaron (según la respuesta del backend).
- Cada persona con error se identifica claramente en la lista (fila marcada + mensaje asociado).
- Las personas guardadas correctamente no se bloquean; el encargado puede corregir solo las que fallaron y volver a pulsar **Guardar Grupo**.

---

## 4. Reglas de negocio

### 4.1 Alcance por grupo

- La instancia del Portal Encargados opera sobre **un único grupo determinado**.
- No puede leer ni escribir la otra pestaña.
- No puede agregar ni eliminar integrantes.
- `id` y `nombre` **nunca** son editables.

### 4.2 Mes informado

- El mes del grupo es el valor de `B3`.
- Es **solo lectura** en el Portal Encargados.
- No se modifica desde la UI.

### 4.3 Campos editables

Únicamente:

- `privilegio`
- `horas`
- `estudios`
- `comentarios`

### 4.4 Completitud (alineada a Informes)

Se aplican las mismas reglas de `docs/07_ESPECIFICACION_INFORMES.md`:

| Privilegio | Informe completo cuando… |
|---|---|
| `Inactivo` | Completo por definición; `horas` no aplica |
| `Publicador` | Privilegio válido y `horas` equivalente a Sí/No (con normalización) |
| `Auxiliar` | Privilegio válido y `horas` numérico |
| `Regular` | Privilegio válido y `horas` numérico |
| Vacío / otro | Pendiente |

- Grupo completo: todos sus integrantes con informe completo.
- `estudios` y `comentarios` no definen completitud.

### 4.5 Modelo de guardado (UI vs backend)

| Capa | Comportamiento |
|---|---|
| Interfaz | Una sola acción: **Guardar Grupo**. Envía el grupo completo en una operación. Sin guardado automático por fila. |
| Apps Script | Aunque reciba el grupo completo, **procesa cada persona de forma independiente**. |

Consecuencias:

- Un error en una persona **no impide** guardar las demás.
- El resultado debe informar qué personas se guardaron y cuáles fallaron.
- Está permitido que una persona quede pendiente (campos vacíos) si el formato es válido.
- No está permitido persistir valores con **formato inválido** para esa persona.

### 4.6 Fuente de verdad

- Google Sheets es la única fuente de verdad.
- Tras el guardado, la UI refleja el resultado reportado por Apps Script (y/o releer el grupo).
- No se usa `localStorage` para persistir informes.

---

## 5. Validaciones de cada campo

Validación en **cliente** (antes de enviar Guardar Grupo) y nuevamente en **Apps Script** (por cada persona, antes de escribir esa fila).

| Campo | Editable | Obligatorio al guardar | Regla |
|---|---|---|---|
| `id` | **No** | Sí (identifica la fila) | Nunca editable. Ubica la fila en la pestaña del grupo. |
| `nombre` | **No** | No viaja como editable | Nunca editable. Solo lectura en UI. |
| `privilegio` | **Sí** | No (vacío = pendiente) | Si tiene valor: exactamente `Publicador`, `Auxiliar`, `Regular`, `Inactivo`. |
| `horas` | **Sí** (condicional) | Condicional | Vacío permitido. Si tiene valor: **Publicador** → Sí/No normalizado; **Auxiliar/Regular** → numérico; **Inactivo** → no aplica. |
| `estudios` | **Sí** | No | Si tiene valor: entero ≥ 0. Vacío permitido. |
| `comentarios` | **Sí** | No | Texto libre. Vacío permitido. Tope técnico a definir en implementación (preferible rechazo explícito si excede). |
| `grupo` | No (contexto fijo) | Sí en el request | El grupo determinado de la instancia. |
| `mes` | **No** | Informativo en el request | Solo lectura; se envía para detectar inconsistencia con `B3`. |

### 5.1 Validación en cliente antes de Guardar Grupo

- La UI puede marcar anticipadamente filas con formato inválido.
- Esas filas inválidas no deberían enviarse como “listas para persistir”, o bien se envían y el backend las rechazará individualmente sin abortar el resto.
- **Definición de esta especificación:** el backend es la autoridad final; procesa persona por persona y reporta éxitos y errores individuales.

### 5.2 Normalización Sí/No

Igual que en Informes (`07_ESPECIFICACION_INFORMES.md`, sección 3.5): solo para validar.  
**Definición de esta especificación:** Apps Script persiste la forma canónica `Sí` o `No` cuando el privilegio es Publicador y la entrada es un equivalente válido.

### 5.3 Valor numérico de horas

Misma definición que Informes: número finito; se admite `.` o `,` en la entrada; no se aceptan literales Sí/No.

---

## 6. Casos de error

| Caso | Comportamiento esperado |
|---|---|
| Fallo de red al cargar | Mensaje: no se pudieron cargar los informes. Reintentar. |
| Endpoint de lectura inválido / HTTP error | Error de conexión. Sin formulario engañoso. |
| JSON de lectura inválido | Error de respuesta inválida. Reintentar. |
| Grupo determinado ausente en la respuesta | Error: no se encontró el grupo. |
| Formato inválido en una o más personas | Al guardar, esas personas figuran con error; las válidas pueden guardarse. UI en **Guardado con errores**. |
| Fallo de red en la operación Guardar Grupo | Mensaje global de error de conexión. Conservar edición en pantalla. Reintentar Guardar Grupo. |
| Apps Script reporta errores parciales | UI: **Guardado con errores** + detalle por persona. |
| Apps Script falla por completo (p. ej. planilla inaccesible) | Mensaje global de error. Sin asumir guardados parciales salvo que la respuesta los detalle. |
| Timeout | Tratar como error de conexión; sugerir recargar para verificar qué quedó persistido. |

---

## 7. Flujo de guardado

### 7.1 Experiencia de usuario

1. El encargado abre el grupo y completa o modifica los informes.
2. Presiona **Guardar Grupo**.
3. La UI muestra **Guardando...** y deshabilita un nuevo envío.
4. Se envía **una sola operación** con los datos del grupo.
5. Según el resultado:
   - **Grupo guardado correctamente**; o
   - **Guardado con errores**, identificando qué personas requieren corrección.
6. El encargado corrige solo lo necesario y puede volver a pulsar **Guardar Grupo**.

### 7.2 Comportamiento del backend

Aunque el usuario envíe el grupo completo en una sola operación, Apps Script deberá:

1. Recibir la solicitud de guardado del grupo.
2. Recorrer las personas incluidas.
3. **Procesar cada persona de forma independiente** (validar y escribir o rechazar esa fila).
4. Continuar con las siguientes personas aunque una falle.
5. Devolver un resultado que permita informar el detalle por persona.

Esto permite que:

- un error en una persona no impida guardar las demás;
- el resultado indique exactamente qué personas se guardaron correctamente y cuáles presentaron errores.

### 7.3 Resultado esperado de Apps Script (comportamiento, no formato JSON definitivo)

El resultado del guardado deberá permitir informar, como mínimo:

- cantidad de registros guardados correctamente;
- cantidad de registros con error;
- detalle de cada error asociado a la persona correspondiente (identificada de forma inequívoca, p. ej. por `id` y/o nombre).

También deberá permitir a la UI distinguir:

- éxito total del grupo;
- éxito parcial (guardado con errores);
- fallo total de la operación (cuando no hubo procesamiento útil por persona).

**Nota:** no se fija todavía el formato definitivo del JSON de respuesta; solo el comportamiento esperado. El contrato exacto de campos se definirá en la implementación o en una ampliación posterior de esta especificación.

### 7.4 Contenido enviado desde la UI (comportamiento)

La operación única de **Guardar Grupo** envía el contexto del grupo determinado, el mes leído (solo control) y la lista de personas con sus campos editables (`privilegio`, `horas`, `estudios`, `comentarios`) más el `id` para localizar la fila.

No se envía `nombre` como dato editable.  
No hay una petición HTTP por cada fila desde la UI.

---

## 8. Integración con Apps Script (`doPost`)

### 8.1 Extensión del conector compartido

El mismo proyecto Apps Script atiende:

- Portal General: `doGet` / `action=reports` (lectura consolidada).
- Portal Encargados: lectura del grupo + `doPost` de guardado de grupo con procesamiento interno por persona.

### 8.2 Responsabilidades de `doPost` (guardado de grupo)

1. Parsear el cuerpo de la solicitud.
2. Validar que la acción corresponda al guardado del grupo del Portal Encargados.
3. Validar `grupo` ∈ {`Grupo 1`, `Grupo 2`}.
4. Abrir la planilla y la pestaña del grupo.
5. Aplicar controles de contexto necesarios (p. ej. consistencia de `mes` con `B3` según la regla definida para el caso).
6. Para **cada persona** del payload, de forma independiente:
   - validar formato;
   - ubicar la fila por `id` en esa pestaña;
   - si es válida → escribir solo columnas C–F;
   - si no → registrar error de esa persona y continuar;
7. No crear filas nuevas.
8. No borrar filas.
9. No modificar columnas A–B (`id`, `nombre`).
10. No modificar `B3`.
11. Devolver un resultado con conteos y detalle por persona (ver sección 7.3).

### 8.3 Lectura usada por el Portal Encargados

Compatible con el stack aprobado:

- Reutilizar `doGet?action=reports` y filtrar en cliente por el grupo determinado; o
- Agregar una acción de lectura de un solo grupo.

**Definición de esta especificación:** se puede reutilizar la lectura consolidada y filtrar por el grupo determinado, sin alterar el contrato ya usado por el Portal General. Una acción dedicada de un solo grupo queda como optimización opcional posterior.

### 8.4 Invocación desde GitHub Pages

Ambas aplicaciones en Pages invocan el mismo Apps Script.  
No se introducen backends intermedios ni tecnologías nuevas.

---

## 9. Integración con Google Sheets

### 9.1 Planilla compartida

- Mismo Spreadsheet ID del proyecto.
- Pestañas: `Grupo 1`, `Grupo 2`.

### 9.2 Layout (sin cambio de modelo)

| Ubicación | Uso |
|---|---|
| `B3` | Mes informado (solo lectura desde Portal Encargados) |
| Fila 5 | Encabezados |
| Desde fila 7 | Datos |
| Columna A | ID (nunca editable) |
| Columna B | Nombre (nunca editable) |
| Columna C | Privilegio (editable) |
| Columna D | Horas (editable) |
| Columna E | Estudios (editable) |
| Columna F | Comentarios (editable) |

### 9.3 Escritura

- Cada persona se escribe de forma independiente dentro de la misma operación de guardado de grupo.
- Solo se modifican C–F de las filas que validaron correctamente.
- Las filas con error no se escriben.
- Debe enviarse valores compatibles con las validaciones existentes de la planilla.

### 9.4 Transición operativa

- Portal Encargados reemplaza progresivamente la edición directa en Sheets.
- Mientras coexisten, Sheets sigue siendo la fuente de verdad.
- Portal General solo consulta.

---

## 10. Casos límite

### 10.1 Doble edición sobre la misma persona

- Dos operaciones Guardar Grupo concurrentes: *last write wins* a nivel de cada fila efectivamente escrita.
- No hay bloqueo optimista en esta versión.

### 10.2 Error en una persona y éxito en otra

- Backend procesa independiente.
- La UI muestra **Guardado con errores** y marca solo a quienes fallaron.

### 10.3 Datos incompletos

- Se puede persistir una persona con privilegio/horas vacíos (queda pendiente) si no hay error de formato.
- Formato inválido → error de esa persona; el resto puede guardarse.

### 10.4 Errores de conexión

- Carga del grupo: error global + reintento.
- Guardar Grupo: si la petición no completa, error global; conservar edición; reintentar.

### 10.5 ID inexistente

- Esa persona cuenta como error en el detalle.
- No se crea la persona.
- Las demás pueden guardarse.

### 10.6 ID de otro grupo

- La búsqueda de ID se limita a la pestaña del grupo determinado.
- Si no está → error de esa persona.

### 10.7 Cambio de mes en Sheets entre lectura y guardado

- Si el control de consistencia de mes aplica a toda la operación y falla el contexto, puede tratarse como fallo total.
- Si se valida por persona tras leer `B3`, el comportamiento debe quedar explícito en la implementación; esta especificación exige que el encargado reciba un resultado interpretable y pueda recargar el grupo.

### 10.8 Alta/baja de integrantes fuera del Portal

- El Portal no da de alta ni de baja.
- IDs desaparecidos → error en esas personas.
- Personas nuevas → aparecen al recargar.

### 10.9 Doble clic en Guardar Grupo

- Durante **Guardando...** la acción permanece deshabilitada.

### 10.10 Reintento tras guardado parcial

- El encargado corrige las personas marcadas con error.
- Vuelve a pulsar **Guardar Grupo**.
- El backend vuelve a procesar el envío persona por persona.

### 10.11 `estudios` / `comentarios` inválidos

- Estudios no numérico → error de esa persona.
- Comentarios que excedan el tope técnico → error de esa persona.

---

## 11. Impacto sobre el Portal General

- Sigue en `/` como entrada de solo consulta.
- No incorpora la UI ni las funciones de edición de `/encargados/`.
- Informes permanece de solo lectura.
- Tras guardados del Portal Encargados, Informes refleja los datos persistidos en la siguiente lectura.
- No cambian las reglas de completitud de Informes.
- Ambos portales comparten Apps Script, Sheets, recursos comunes y documentación.

---

## 12. Criterios de aceptación (para cuando se apruebe e implemente)

1. Portal Encargados vive en `/encargados/` del mismo repositorio; no es otro repo ni un perfil del Portal General.
2. Se abre con un grupo determinado; el encargado no elige grupo libremente.
3. El mes es solo lectura.
4. Solo se editan privilegio, horas, estudios y comentarios; nunca id ni nombre.
5. El usuario trabaja el grupo completo y usa una sola acción: **Guardar Grupo**.
6. No hay guardado automático por fila.
7. Apps Script procesa cada persona de forma independiente dentro de esa operación.
8. Un error en una persona no impide guardar las demás.
9. La UI distingue **Grupo guardado correctamente** vs **Guardado con errores**, identificando quiénes fallaron.
10. El resultado del backend permite conocer cantidades de éxitos/errores y el detalle por persona.
11. El Portal General en `/` sigue siendo solo consulta y no incluye edición de encargados.
12. El Portal Encargados no muestra módulos del Portal General.
13. No se introducen tecnologías fuera de Pages → Apps Script → Sheets.
14. No se usa `localStorage` como fuente de verdad.

---

## 13. Decisiones pendientes (no bloquean el modelo funcional ya definido)

1. Mecanismo definitivo de identificación del grupo al abrir el portal.
2. Si la lectura del grupo usará filtro cliente sobre `action=reports` o una acción dedicada.
3. Formato JSON definitivo del request/response de Guardar Grupo.
4. Tope técnico exacto de longitud de comentarios.
5. Actualización formal del contrato del proyecto (`docs/00_…`) al aprobar la escritura desde el Portal Encargados.

---

## 14. Resumen

En un único repositorio, el Portal Encargados se publica en `/encargados/` con UX propia de edición por grupo determinado y mes de solo lectura. El encargado completa el grupo y confirma con **Guardar Grupo**. Apps Script procesa y reporta cada persona de forma independiente. El Portal General en `/` permanece como entrada de consulta, sin funciones de edición, compartiendo Apps Script, Sheets, recursos comunes y documentación.
