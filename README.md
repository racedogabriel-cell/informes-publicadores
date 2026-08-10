# Informes de publicadores

PWA estática de consulta para el encargado general.

## Arquitectura

```text
GitHub Pages (un repositorio)
├── `/` → Portal General (consulta)
└── `/encargados/` → Portal Encargados (edición)
         ↓
Google Apps Script → Google Sheets
```

Recursos compartidos: Apps Script, Sheets, CSS/utilidades/reglas de negocio y `docs/`.

Detalle: `docs/01_ARQUITECTURA.md`.

## Módulos

| Módulo | Estado |
|---|---|
| Inicio | No iniciado |
| Personas | En desarrollo |
| Informes | En desarrollo |
| Estadísticas | No iniciado |
| Configuración | No iniciado |

## Ejecutar localmente

Serví la carpeta con un servidor web local. El service worker no funciona abriendo `index.html` como archivo.

## Conector

La URL del endpoint está en `js/config.js`. El código fuente del conector está en `apps-script/`.
