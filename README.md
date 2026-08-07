# Informes de publicadores

PWA estática de consulta para el encargado general.

## Arquitectura

```text
GitHub Pages → PWA (HTML/CSS/JS) → Google Apps Script → Google Sheets
```

La única fuente de datos es Google Sheets, leída a través de Apps Script. No se usa `localStorage` ni otros servicios de datos.

## Módulos

| Módulo | Estado |
|---|---|
| Inicio | No iniciado |
| Personas | No iniciado |
| Informes | En desarrollo |
| Estadísticas | No iniciado |
| Configuración | No iniciado |

## Ejecutar localmente

Serví la carpeta con un servidor web local. El service worker no funciona abriendo `index.html` como archivo.

## Conector

La URL del endpoint está en `js/config.js`. El código fuente del conector está en `apps-script/`.
