# Arquitectura

Arquitectura oficial del proyecto `informes-publicadores`.

```text
GitHub Pages
↓
PWA (HTML + CSS + JavaScript)
↓
Google Apps Script
↓
Google Sheets
```

## GitHub Pages

Responsabilidad: hospedar y servir la PWA estática.

- Publica los archivos del cliente (`index.html`, CSS, JavaScript, assets, manifest y service worker).
- No almacena datos de informes ni de personas.
- No ejecuta lógica de negocio sobre la planilla.

## PWA

Responsabilidad: interfaz de consulta del encargado general.

- Aplicación estática en HTML, CSS y JavaScript.
- Expone la navegación de los módulos oficiales.
- El módulo Informes consulta el endpoint de Apps Script, consolida ambos grupos y muestra el resultado en solo lectura.
- No es fuente de datos.
- No escribe en Google Sheets.

## Google Apps Script

Responsabilidad: conector de solo lectura entre la PWA y Google Sheets.

- Expone un endpoint web (`/exec`) consultable por la PWA.
- Acción aprobada: `?action=reports`.
- Lee las pestañas `Grupo 1` y `Grupo 2`.
- Devuelve JSON con la fecha de generación, el mes informado y los informes de cada grupo.
- No debe exponer teléfonos, direcciones, contactos de emergencia ni otros datos sensibles.

La URL del endpoint se configura en `js/config.js`. El código fuente del conector está en `apps-script/`.

## Google Sheets

Responsabilidad: carga y almacenamiento de los informes mensuales.

- Los encargados de grupo completan únicamente su pestaña (`Grupo 1` o `Grupo 2`).
- Celda `B3`: mes informado.
- Fila `5`: encabezados.
- Datos desde la fila `7`.
- Columnas: ID, Nombre del publicador, Privilegio, Horas, Estudios, Comentarios.
- Es la única fuente de datos del sistema.

## Comunicación entre capas

1. El encargado de grupo carga o actualiza informes en Google Sheets.
2. La PWA solicita `GET` al endpoint de Apps Script con `action=reports`.
3. Apps Script abre la planilla, lee ambos grupos y responde JSON.
4. La PWA consolida la respuesta y la muestra en el módulo Informes.

No hay otras vías de datos aprobadas entre el cliente y la planilla.
