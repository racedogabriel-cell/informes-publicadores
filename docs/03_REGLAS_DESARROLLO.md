# Reglas de desarrollo

Proceso oficial del proyecto `informes-publicadores`.

## Principio rector

Ninguna funcionalidad puede implementarse por iniciativa propia.

Toda implementación requiere diseño funcional previo y aprobación explícita.

## Prioridad de la documentación

La documentación aprobada es la fuente oficial de verdad del proyecto.

Si existe una diferencia entre la documentación y el código, el código deberá adaptarse a la documentación, nunca al revés.

## Regla de módulos

Toda funcionalidad deberá pertenecer a un módulo oficial.

No podrán incorporarse funcionalidades aisladas.

Cada implementación deberá indicar explícitamente:

- módulo
- objetivo
- estado
- sprint

## Proceso oficial

### 1. Diseño funcional

Definir qué se va a construir, sobre qué módulo, con qué alcance y qué queda fuera.

El diseño debe alinearse con `docs/00_CONTRATO_PROYECTO.md` y `docs/01_ARQUITECTURA.md`.

### 2. Aprobación

El diseño debe ser aprobado antes de escribir código de producto.

Sin aprobación no hay implementación.

### 3. Implementación

Implementar únicamente lo aprobado.

No agregar mejoras, ideas, módulos ni integraciones no pedidas.

### 4. Auditoría

Revisar que lo implementado respete el contrato, la arquitectura y el diseño aprobado.

Detectar desvíos, código fuera de alcance y deuda introducida sin aprobación.

### 5. Correcciones

Corregir solo los desvíos y defectos identificados respecto de lo aprobado.

No usar la fase de corrección para ampliar alcance.

### 6. Cierre del sprint

Cerrar cuando lo aprobado esté implementado y auditado.

Actualizar el estado del módulo correspondiente (`No iniciado` / `En desarrollo` / `Terminado`) solo con base en el resultado real del sprint.

## Reglas adicionales

- La carpeta `informes-publicadores` es la única versión oficial.
- La documentación en `docs/` es la fuente de verdad documental.
- Que un módulo exista en la navegación no autoriza a implementarlo.
- No completar módulos marcados como «No iniciado».
- No reintroducir `localStorage`, dashboards demo, KPIs ficticios ni funcionalidades descartadas en la base limpia.
- Ante duda de alcance: no implementar; documentar la duda y esperar aprobación.
