# Conector de Google Sheets

Este script lee únicamente las pestañas `Grupo 1` y `Grupo 2` de la planilla de informes. No lee ni entrega teléfonos, contactos de emergencia u otros datos del padrón.

## Instalación en la planilla

1. Abrí la planilla y elegí **Extensiones → Apps Script**.
2. Reemplazá el archivo `Code.gs` por el contenido de `Code.gs` de esta carpeta y guardá.
3. Al implementar una aplicación web, la dirección final tendrá el formato `https://script.google.com/macros/s/.../exec`.
4. Copiá esa dirección en `js/config.js` de la aplicación.

El endpoint admite la consulta `?action=reports` y responde con ambos grupos, el mes seleccionado y las columnas de informes.

## Acceso seguro

No publiques una aplicación web con acceso anónimo mientras la aplicación administrativa no tenga autenticación. El enlace de una PWA en GitHub Pages es público y no puede guardar un secreto en el navegador.
