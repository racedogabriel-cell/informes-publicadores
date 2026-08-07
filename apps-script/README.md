# Conector de Google Sheets

Este script lee las pestañas `Grupo 1` y `Grupo 2` de la planilla de informes. No lee ni entrega teléfonos, contactos de emergencia u otros datos del padrón.

## Instalación en la planilla

1. Abrí la planilla y elegí **Extensiones → Apps Script**.
2. Reemplazá el archivo `Code.gs` por el contenido de `Code.gs` de esta carpeta y guardá.
3. Implementá (o actualizá) la aplicación web. La dirección final tendrá el formato `https://script.google.com/macros/s/.../exec`.
4. Copiá esa dirección en `js/config.js` de la aplicación.

Tras cada cambio en `Code.gs`, hay que **guardar y crear una nueva versión** del deployment web (o editar el deployment existente eligiendo la versión nueva). Si no, GitHub Pages seguirá hablando con el código anterior.

## Lectura (`doGet`)

Consulta: `?action=reports`  
Responde con ambos grupos, el mes seleccionado y las columnas de informes.

## Escritura — fase dry-run (`doPost`)

El Portal Encargados envía un POST con JSON (`Content-Type: text/plain`) y `action=saveGroup`, `mode=dryRun`.

En esta fase Apps Script:

- recibe y valida la estructura del lote;
- responde confirmando la recepción;
- **no abre la planilla para escribir**;
- **no modifica ninguna celda**.

La escritura real en columnas C–F queda para un sprint posterior, tras auditoría.

## Acceso seguro

No publiques una aplicación web con acceso anónimo mientras la aplicación administrativa no tenga autenticación. El enlace de una PWA en GitHub Pages es público y no puede guardar un secreto en el navegador.
