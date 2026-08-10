/**
 * Conector Apps Script para "Informes de publicadores".
 * Instalación: Extensiones > Apps Script → pegar este archivo → nueva versión del deployment.
 *
 * doGet:
 *   ?action=reports
 *   ?action=system
 *   ?action=openPeriod&periodo=YYYY-MM
 *   ?action=closePeriod
 *   ?action=personas
 *   ?action=grupos | ?action=grupos&activos=1
 * doPost:
 *   saveGroup (escritura real C–F por ID en período ABIERTO; lote)
 *   savePerson (escritura real C–F de una sola persona; Encargados auto-save)
 *   createPersona / updatePersona / setPersonaActivo (padrón hoja Personas)
 *   createGrupo / updateGrupo / setGrupoActivo (catálogo hoja Grupos)
 */
const SPREADSHEET_ID = '1BcZ31qor91cGlrtRSEO6XsZDFiSVtP4PCZ5F910xoBs';
const PERSONAS_SHEET = 'Personas';
const GRUPOS_SHEET = 'Grupos';
const SISTEMA_SHEET = 'Sistema';
const HISTORIAL_SHEET = 'Historial';
const HISTORIAL_HEADERS = [
  'Periodo',
  'GrupoID',
  'Grupo',
  'ID',
  'Nombre',
  'Privilegio',
  'Horas',
  'Estudios',
  'Comentarios',
  'FechaCierre',
];
/** Encabezados legacy previos a Fase 6 (sin GrupoID). */
const HISTORIAL_HEADERS_LEGACY_ = [
  'Periodo',
  'Grupo',
  'ID',
  'Nombre',
  'Privilegio',
  'Horas',
  'Estudios',
  'Comentarios',
  'FechaCierre',
];
const SAVE_ACTION = 'saveGroup';
const SAVE_PERSON_ACTION = 'savePerson';
const CREATE_PERSONA_ACTION = 'createPersona';
const UPDATE_PERSONA_ACTION = 'updatePersona';
const SET_PERSONA_ACTIVO_ACTION = 'setPersonaActivo';
const CREATE_GRUPO_ACTION = 'createGrupo';
const UPDATE_GRUPO_ACTION = 'updateGrupo';
const SET_GRUPO_ACTIVO_ACTION = 'setGrupoActivo';
const GRUPO_NOMBRE_MAX_LEN_ = 40;
const GRUPO_DEFAULT_COLORS_ = ['#2B6B4F', '#2F5D8A', '#A15C2B', '#5A3D7A'];
const DRY_RUN_MODE = 'dryRun';
const ESTADO_ABIERTO = 'ABIERTO';
const ESTADO_CERRADO = 'CERRADO';
const SISTEMA_VERSION = '1';
const PERSONAS_HEADERS = [
  'ID',
  'Nombre',
  'Grupo',
  'Activo',
  'NumeroContacto',
  'ContactoEmergencia',
  'NombreEmergencia',
  'RelacionEmergencia',
];
const GRUPOS_HEADERS = ['ID', 'Nombre', 'Color', 'Activo'];
const GRUPO_COLOR_REGEX_ = /^#[0-9A-Fa-f]{6}$/;

function doGet(event) {
  const action = event && event.parameter && event.parameter.action;
  try {
    if (action === 'reports') {
      const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
      return json_({
        generatedAt: new Date().toISOString(),
        groups: buildReportsGroups_(spreadsheet),
      });
    }
    if (action === 'system') {
      return json_(readSystemState_());
    }
    if (action === 'openPeriod') {
      return json_(openPeriod_(event && event.parameter && event.parameter.periodo));
    }
    if (action === 'closePeriod') {
      return json_(closePeriod_());
    }
    if (action === 'personas') {
      return json_(listPersonas_());
    }
    if (action === 'grupos') {
      return json_(listGrupos_(event && event.parameter));
    }
    return json_({
      ok: false,
      error: 'Acción no válida.',
      message:
        'Usá ?action=reports | ?action=system | ?action=openPeriod&periodo=YYYY-MM | ?action=closePeriod | ?action=personas | ?action=grupos',
    });
  } catch (error) {
    return json_({
      ok: false,
      error: String(error.message || error),
      message: String(error.message || error),
    });
  }
}

/**
 * Abre un período: regenera hojas SheetKey (Grupo {ID}) desde Personas y actualiza Sistema.
 * Segura e idempotente: valida todo antes de escribir; LockService evita carreras.
 * Si ya hay período ABIERTO o quedan datos de un período anterior en las hojas de grupo,
 * no modifica ninguna hoja.
 * Fase 5: grupos operativos = catálogo Activo=Sí (dinámico).
 */
function openPeriod_(periodoRaw) {
  const periodo = normalizePeriodoKey_(periodoRaw);
  if (!periodo) {
    return {
      ok: false,
      error: 'Parámetro periodo inválido.',
      message: 'Indicá periodo=YYYY-MM (ejemplo: 2026-09). Ninguna hoja fue modificada.',
    };
  }

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    return {
      ok: false,
      error: 'No se pudo obtener el bloqueo.',
      message:
        'Otra operación de períodos está en curso. Reintentá en unos segundos. Ninguna hoja fue modificada.',
    };
  }

  try {
    return openPeriodLocked_(periodo);
  } finally {
    lock.releaseLock();
  }
}

function openPeriodLocked_(periodo) {
  const periodLabel = formatPeriodLabel_(periodo);
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);

  // --- Fase 1: solo lectura y validación (sin escrituras) ---

  const sistema = getOrCreateSistemaSheet_(spreadsheet);
  const state = readSistemaMap_(sistema);

  if (isEstadoAbierto_(state.EstadoPeriodo)) {
    return {
      ok: false,
      error: 'Ya existe un período abierto.',
      message:
        'No se abrió un nuevo período porque Sistema.EstadoPeriodo es ABIERTO (' +
        (state.PeriodoActivo || 'sin etiqueta') +
        '). Cerrá el período actual antes de abrir otro. Ninguna hoja fue modificada.',
      periodo: state.PeriodoActivo || null,
    };
  }

  const personasSheet = spreadsheet.getSheetByName(PERSONAS_SHEET);
  if (!personasSheet) {
    return {
      ok: false,
      error: 'No existe la hoja Personas.',
      message:
        'Creá la hoja Personas (ID, Nombre, Grupo, Activo) antes de abrir un período. Ninguna hoja fue modificada.',
    };
  }

  const targetsResult = listOperationalGroupTargets_(spreadsheet);
  if (!targetsResult.ok) {
    return {
      ok: false,
      error: targetsResult.error,
      message: targetsResult.message + ' Ninguna hoja fue modificada.',
      details: targetsResult.details || [],
    };
  }
  const targets = targetsResult.targets;

  const personasValidation = validatePersonasCatalog_(personasSheet, spreadsheet);
  if (!personasValidation.ok) {
    return {
      ok: false,
      error: personasValidation.error,
      message: personasValidation.message + ' Ninguna hoja fue modificada.',
      details: personasValidation.details || [],
    };
  }

  const groupSheets = {};
  const missingSheetIds = [];
  const formallyClosed =
    normalizeEstado_(state.EstadoPeriodo) === ESTADO_CERRADO &&
    String(state.FechaCierre || '').trim() !== '';

  for (var i = 0; i < targets.length; i++) {
    var target = targets[i];
    var existingSheet = spreadsheet.getSheetByName(target.sheetKey);
    if (!existingSheet) {
      missingSheetIds.push(target.id);
      groupSheets[target.id] = null;
      continue;
    }
    groupSheets[target.id] = existingSheet;

    // Tras cierre formal (Historial + FechaCierre), se permite regenerar al abrir el siguiente.
    if (!formallyClosed) {
      var prior = inspectGroupSheetPriorData_(existingSheet, target.sheetKey, periodLabel);
      if (prior.blocked) {
        return {
          ok: false,
          error: 'Hay datos de un período anterior en ' + target.sheetKey + '.',
          message:
            prior.message +
            ' No se regeneraron las hojas automáticamente. Cerrá el período anterior (o limpiá las hojas de grupo de forma controlada) antes de abrir uno nuevo. Ninguna hoja fue modificada.',
          grupo: target.nombre,
          grupoId: target.id,
          periodoAnterior: prior.b3 || null,
          filasConDatos: prior.peopleCount,
        };
      }
    }
  }

  const activePeople = personasValidation.activePeople;
  const byGroupId = {};
  for (var t = 0; t < targets.length; t++) {
    byGroupId[targets[t].id] = [];
  }
  for (var p = 0; p < activePeople.length; p++) {
    var person = activePeople[p];
    if (byGroupId[person.grupoId]) {
      byGroupId[person.grupoId].push(person);
    }
  }

  // --- Fase 2: escrituras (solo si toda la validación pasó) ---

  for (var m = 0; m < missingSheetIds.length; m++) {
    var missingId = missingSheetIds[m];
    var missingTarget = null;
    for (var mt = 0; mt < targets.length; mt++) {
      if (targets[mt].id === missingId) {
        missingTarget = targets[mt];
        break;
      }
    }
    var ensured = ensureGroupWorkSheet_(spreadsheet, missingTarget.sheetKey);
    if (!ensured.ok) {
      return {
        ok: false,
        error: ensured.error,
        message:
          ensured.message +
          ' Puede haber quedado una hoja nueva sin regenerar; revisá la planilla.',
        grupo: missingTarget.nombre,
        grupoId: missingTarget.id,
      };
    }
    groupSheets[missingId] = ensured.sheet;
  }

  const counts = {};
  const gruposList = [];
  for (var g = 0; g < targets.length; g++) {
    var tgt = targets[g];
    var people = byGroupId[tgt.id] || [];
    regenerateGroupSheet_(groupSheets[tgt.id], people, periodLabel);
    counts[tgt.nombre] = people.length;
    // Compat: también indexar por SheetKey ("Grupo {ID}").
    counts[tgt.sheetKey] = people.length;
    gruposList.push({
      id: tgt.id,
      nombre: tgt.nombre,
      sheetKey: tgt.sheetKey,
      count: people.length,
    });
  }

  writeSistemaOpen_(sistema, periodo);

  return {
    ok: true,
    periodo: periodo,
    label: periodLabel,
    estado: ESTADO_ABIERTO,
    grupos: counts,
    gruposList: gruposList,
    message: 'Período abierto correctamente.',
  };
}

/**
 * Valida el padrón completo antes de abrir.
 * Fase 5: grupos contra catálogo (ID/nombre); personas activas requieren grupo activo.
 */
function validatePersonasCatalog_(sheet, spreadsheet) {
  var ss = spreadsheet || (sheet && sheet.getParent && sheet.getParent());
  var catalog = readGruposCatalog_(ss, { validate: true });
  if (!catalog.ok) {
    return {
      ok: false,
      error: catalog.error || 'Catálogo Grupos inválido.',
      message: catalog.message || 'No se pudo validar el catálogo Grupos.',
      details: catalog.details || [],
      activePeople: [],
    };
  }

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return { ok: true, activePeople: [], details: [] };
  }

  var values = sheet.getRange(2, 1, lastRow - 1, 4).getDisplayValues();
  var seenIds = {};
  var activePeople = [];
  var details = [];

  for (var i = 0; i < values.length; i++) {
    var rowNumber = i + 2;
    var id = String(values[i][0] || '').trim();
    var nombre = String(values[i][1] || '').trim();
    var grupoRaw = String(values[i][2] || '').trim();
    var activoRaw = values[i][3];

    if (!id && !nombre && !grupoRaw && !String(activoRaw || '').trim()) {
      continue;
    }

    if (!id || !nombre) {
      details.push({
        row: rowNumber,
        id: id || null,
        error: 'La fila debe tener ID y Nombre.',
      });
      continue;
    }

    if (seenIds[id]) {
      details.push({
        row: rowNumber,
        id: id,
        error: 'ID duplicado (también en fila ' + seenIds[id] + ').',
      });
      continue;
    }
    seenIds[id] = rowNumber;

    var resolved = resolveGrupoRef_(catalog.grupos, grupoRaw);
    if (!resolved) {
      details.push({
        row: rowNumber,
        id: id,
        error: 'Grupo inválido o inexistente en el catálogo: "' + grupoRaw + '".',
      });
      continue;
    }

    if (isActivo_(activoRaw)) {
      if (!resolved.activo) {
        details.push({
          row: rowNumber,
          id: id,
          error:
            'La persona está activa pero su grupo "' +
            resolved.nombre +
            '" (ID ' +
            resolved.id +
            ') está inactivo.',
        });
        continue;
      }
      activePeople.push({
        id: id,
        nombre: nombre,
        grupoId: String(resolved.id),
        grupo: resolved.nombre,
      });
    }
  }

  if (details.length) {
    return {
      ok: false,
      error: 'El padrón Personas no es válido.',
      message:
        'Se encontraron ' +
        details.length +
        ' problema(s) en Personas (IDs duplicados, filas incompletas o grupos inválidos).',
      details: details,
      activePeople: [],
    };
  }

  return { ok: true, activePeople: activePeople, details: [] };
}

/**
 * Detecta residuos de un período anterior en una hoja de grupo.
 * Bloquea la regeneración automática si hay personas o un espejo B3 distinto.
 */
function inspectGroupSheetPriorData_(sheet, groupName, periodLabel) {
  var b3 = String(sheet.getRange('B3').getDisplayValue() || '').trim();
  var lastRow = sheet.getLastRow();
  var peopleCount = 0;

  if (lastRow >= 7) {
    var rows = sheet.getRange(7, 1, lastRow - 6, 2).getDisplayValues();
    for (var r = 0; r < rows.length; r++) {
      if (String(rows[r][0] || '').trim() && String(rows[r][1] || '').trim()) {
        peopleCount++;
      }
    }
  }

  if (peopleCount > 0) {
    return {
      blocked: true,
      b3: b3,
      peopleCount: peopleCount,
      message:
        groupName +
        ' tiene ' +
        peopleCount +
        ' persona(s) cargada(s)' +
        (b3 ? ' (B3="' + b3 + '")' : '') +
        '.',
    };
  }

  if (b3 && b3 !== periodLabel) {
    return {
      blocked: true,
      b3: b3,
      peopleCount: 0,
      message:
        groupName +
        ' tiene el espejo B3="' +
        b3 +
        '" (período distinto de "' +
        periodLabel +
        '").',
    };
  }

  return { blocked: false, b3: b3, peopleCount: 0 };
}

/**
 * Cierra el período abierto: copia hojas SheetKey del catálogo a Historial y marca Sistema como CERRADO.
 * No limpia las hojas de grupo. No abre el siguiente período.
 */
function closePeriod_() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    return {
      ok: false,
      error: 'No se pudo obtener el bloqueo.',
      message:
        'Otra operación de períodos está en curso. Reintentá en unos segundos. Ninguna hoja fue modificada.',
    };
  }

  try {
    return closePeriodLocked_();
  } finally {
    lock.releaseLock();
  }
}

function closePeriodLocked_() {
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sistema = getOrCreateSistemaSheet_(spreadsheet);
  const state = readSistemaMap_(sistema);

  if (!isEstadoAbierto_(state.EstadoPeriodo)) {
    return {
      ok: false,
      error: 'No hay un período abierto.',
      message:
        'Sistema.EstadoPeriodo no es ABIERTO. No hay nada que cerrar. Ninguna hoja fue modificada.',
      periodo: state.PeriodoActivo || null,
    };
  }

  const periodo = String(state.PeriodoActivo || '').trim();
  if (!periodo) {
    return {
      ok: false,
      error: 'PeriodoActivo vacío.',
      message:
        'Hay un estado ABIERTO pero PeriodoActivo está vacío. Corregí Sistema antes de cerrar. Ninguna hoja fue modificada.',
    };
  }

  // Todos los grupos del catálogo (activos e inactivos) cuya hoja de trabajo exista.
  const catalog = readGruposCatalog_(spreadsheet, { validate: true });
  if (!catalog.ok) {
    return {
      ok: false,
      error: catalog.error || 'Catálogo Grupos inválido.',
      message: (catalog.message || catalog.error) + ' Ninguna hoja fue modificada.',
      details: catalog.details || [],
    };
  }

  const closeTargets = catalog.grupos
    .slice()
    .sort(function (a, b) {
      return Number(a.id) - Number(b.id);
    })
    .map(function (grupo) {
      return {
        id: String(grupo.id),
        nombre: grupo.nombre,
        sheetKey: sheetKeyForGrupoId_(grupo.id),
      };
    });

  const snapshot = [];
  const counts = {};
  const gruposList = [];
  var sheetsFound = 0;

  for (var i = 0; i < closeTargets.length; i++) {
    var target = closeTargets[i];
    var sheet = spreadsheet.getSheetByName(target.sheetKey);
    if (!sheet) {
      continue;
    }
    sheetsFound++;

    var groupData = readGroup_(sheet, target.sheetKey);
    counts[target.nombre] = groupData.informes.length;
    counts[target.sheetKey] = groupData.informes.length;
    gruposList.push({
      id: target.id,
      nombre: target.nombre,
      sheetKey: target.sheetKey,
      count: groupData.informes.length,
    });

    for (var r = 0; r < groupData.informes.length; r++) {
      var row = groupData.informes[r];
      snapshot.push({
        periodo: periodo,
        // Fase 5: congela el nombre del catálogo al cierre (GrupoID en Historial = Fase 6).
        grupo: target.nombre,
        grupoId: target.id,
        id: String(row.id || ''),
        nombre: String(row.nombre || ''),
        privilegio: String(row.privilegio || ''),
        horas: String(row.horas || ''),
        estudios: String(row.estudios || ''),
        comentarios: String(row.comentarios || ''),
      });
    }
  }

  if (!sheetsFound) {
    return {
      ok: false,
      error: 'No se encontraron hojas de grupo para archivar.',
      message:
        'No hay pestañas SheetKey (Grupo {ID}) para los grupos del catálogo. Ninguna hoja fue modificada.',
    };
  }

  const historial = getOrCreateHistorialSheet_(spreadsheet);
  if (historialHasPeriodo_(historial, periodo)) {
    return {
      ok: false,
      error: 'El período ya está en Historial.',
      message:
        'Ya existen filas en Historial para el período ' +
        periodo +
        '. No se duplicó el archivo ni se modificó Sistema.',
      periodo: periodo,
    };
  }

  const fechaCierre = new Date().toISOString();

  appendHistorialRows_(historial, snapshot, fechaCierre);
  writeSistemaClose_(sistema, fechaCierre);

  return {
    ok: true,
    periodo: periodo,
    estado: ESTADO_CERRADO,
    fechaCierre: fechaCierre,
    grupos: counts,
    gruposList: gruposList,
    archived: snapshot.length,
    message:
      'Período cerrado correctamente. Historial actualizado. Las hojas de grupo no fueron limpiadas.',
  };
}

function getOrCreateHistorialSheet_(spreadsheet) {
  var sheet = spreadsheet.getSheetByName(HISTORIAL_SHEET);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(HISTORIAL_SHEET);
    sheet.getRange(1, 1, 1, HISTORIAL_HEADERS.length).setValues([HISTORIAL_HEADERS]);
    return sheet;
  }

  ensureHistorialHeaders_(sheet);
  return sheet;
}

/**
 * Fase 6: asegura encabezados Periodo | GrupoID | Grupo | …
 * Si la hoja es legacy (sin GrupoID), inserta columna vacía B y actualiza encabezados.
 * NO rellena GrupoID en filas históricas existentes (sin backfill).
 */
function ensureHistorialHeaders_(sheet) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 1) {
    sheet.getRange(1, 1, 1, HISTORIAL_HEADERS.length).setValues([HISTORIAL_HEADERS]);
    return { upgraded: false };
  }

  var lastCol = Math.max(sheet.getLastColumn(), 1);
  var headers = sheet.getRange(1, 1, 1, Math.max(lastCol, HISTORIAL_HEADERS.length)).getDisplayValues()[0];
  var h0 = String(headers[0] || '').trim();
  var h1 = String(headers[1] || '').trim();
  var h2 = String(headers[2] || '').trim();

  if (h0 === 'Periodo' && h1 === 'GrupoID' && h2 === 'Grupo') {
    return { upgraded: false };
  }

  var legacyMatch =
    h0 === 'Periodo' &&
    h1 === 'Grupo' &&
    (h2 === 'ID' || String(headers[2] || '').trim() === HISTORIAL_HEADERS_LEGACY_[2]);

  if (legacyMatch || (h0 === 'Periodo' && h1 === 'Grupo' && h2 !== 'GrupoID')) {
    sheet.insertColumnAfter(1);
    sheet.getRange(1, 1, 1, HISTORIAL_HEADERS.length).setValues([HISTORIAL_HEADERS]);
    return { upgraded: true };
  }

  if (!h0 && !h1) {
    sheet.getRange(1, 1, 1, HISTORIAL_HEADERS.length).setValues([HISTORIAL_HEADERS]);
    return { upgraded: false };
  }

  return { upgraded: false };
}

function historialHasPeriodo_(sheet, periodo) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return false;
  var values = sheet.getRange(2, 1, lastRow - 1, 1).getDisplayValues();
  for (var i = 0; i < values.length; i++) {
    if (String(values[i][0] || '').trim() === periodo) return true;
  }
  return false;
}

function appendHistorialRows_(sheet, snapshot, fechaCierre) {
  if (!snapshot.length) return;
  ensureHistorialHeaders_(sheet);
  var rows = snapshot.map(function (item) {
    return [
      item.periodo,
      String(item.grupoId || ''),
      item.grupo,
      item.id,
      item.nombre,
      item.privilegio,
      item.horas,
      item.estudios,
      item.comentarios,
      fechaCierre,
    ];
  });
  var startRow = Math.max(sheet.getLastRow() + 1, 2);
  sheet.getRange(startRow, 1, rows.length, HISTORIAL_HEADERS.length).setValues(rows);
}

function writeSistemaClose_(sheet, fechaCierre) {
  var map = readSistemaMap_(sheet);
  map.EstadoPeriodo = ESTADO_CERRADO;
  map.FechaCierre = fechaCierre;
  map.Version = map.Version || SISTEMA_VERSION;
  writeSistemaMap_(sheet, map);
}

function readSystemState_() {
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sistema = getOrCreateSistemaSheet_(spreadsheet);
  const state = readSistemaMap_(sistema);
  return {
    ok: true,
    PeriodoActivo: state.PeriodoActivo || '',
    EstadoPeriodo: normalizeEstado_(state.EstadoPeriodo) || ESTADO_CERRADO,
    FechaApertura: state.FechaApertura || '',
    FechaCierre: state.FechaCierre || '',
    Version: state.Version || SISTEMA_VERSION,
  };
}

function getOrCreateSistemaSheet_(spreadsheet) {
  var sheet = spreadsheet.getSheetByName(SISTEMA_SHEET);
  if (sheet) return sheet;

  sheet = spreadsheet.insertSheet(SISTEMA_SHEET);
  sheet.getRange(1, 1, 5, 2).setValues([
    ['PeriodoActivo', ''],
    ['EstadoPeriodo', ESTADO_CERRADO],
    ['FechaApertura', ''],
    ['FechaCierre', ''],
    ['Version', SISTEMA_VERSION],
  ]);
  return sheet;
}

function readSistemaMap_(sheet) {
  var lastRow = Math.max(sheet.getLastRow(), 1);
  var values = sheet.getRange(1, 1, lastRow, 2).getDisplayValues();
  var map = {};
  for (var i = 0; i < values.length; i++) {
    var key = String(values[i][0] || '').trim();
    if (!key) continue;
    map[key] = String(values[i][1] || '').trim();
  }
  return map;
}

function writeSistemaOpen_(sheet, periodo) {
  var map = readSistemaMap_(sheet);
  map.PeriodoActivo = periodo;
  map.EstadoPeriodo = ESTADO_ABIERTO;
  map.FechaApertura = new Date().toISOString();
  map.FechaCierre = '';
  map.Version = map.Version || SISTEMA_VERSION;
  writeSistemaMap_(sheet, map);
}

function writeSistemaMap_(sheet, map) {
  var keys = ['PeriodoActivo', 'EstadoPeriodo', 'FechaApertura', 'FechaCierre', 'Version'];
  var rows = keys.map(function (key) {
    return [key, map[key] != null ? String(map[key]) : ''];
  });
  sheet.clearContents();
  sheet.getRange(1, 1, rows.length, 2).setValues(rows);
}

function regenerateGroupSheet_(sheet, people, periodLabel) {
  sheet.getRange('B3').setValue(periodLabel);

  var lastRow = sheet.getLastRow();
  if (lastRow >= 7) {
    sheet.getRange(7, 1, lastRow - 6, 6).clearContent();
  }

  if (!people.length) return;

  var rows = people.map(function (person) {
    return [person.id, person.nombre, '', '', '', ''];
  });
  sheet.getRange(7, 1, rows.length, 6).setValues(rows);
}

function normalizePeriodoKey_(raw) {
  var value = String(raw || '').trim();
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) return null;
  return value;
}

function formatPeriodLabel_(periodoKey) {
  var parts = periodoKey.split('-');
  var year = Number(parts[0]);
  var monthIndex = Number(parts[1]) - 1;
  var months = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
  ];
  return months[monthIndex] + ' ' + year;
}

function isActivo_(raw) {
  var value = String(raw || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  return value === 'si' || value === 's' || value === 'yes' || value === 'true' || value === '1';
}

function normalizeEstado_(raw) {
  var value = String(raw || '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (value === 'ABIERTO') return ESTADO_ABIERTO;
  if (value === 'CERRADO') return ESTADO_CERRADO;
  return value;
}

function isEstadoAbierto_(raw) {
  return normalizeEstado_(raw) === ESTADO_ABIERTO;
}

/**
 * Guardado real del Portal Encargados.
 * - action=saveGroup  → lote (compatibilidad / rollback)
 * - action=savePerson → una persona (auto-save)
 * Escribe solo C–F por ID en el período ABIERTO. No toca Períodos/Historial/Personas/Sistema (salvo lectura).
 */
function doPost(event) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    return json_({
      ok: false,
      wroteToSheet: false,
      error: 'No se pudo obtener el bloqueo.',
      message: 'Otra operación está en curso. Reintentá en unos segundos.',
      updated: [],
      errors: [],
    });
  }

  try {
    var payload = parsePostPayload_(event);
    if (payload && payload.action === SAVE_PERSON_ACTION) {
      return json_(savePersonFromPayload_(payload));
    }
    if (payload && payload.action === CREATE_PERSONA_ACTION) {
      return json_(createPersonaFromPayload_(payload));
    }
    if (payload && payload.action === UPDATE_PERSONA_ACTION) {
      return json_(updatePersonaFromPayload_(payload));
    }
    if (payload && payload.action === SET_PERSONA_ACTIVO_ACTION) {
      return json_(setPersonaActivoFromPayload_(payload));
    }
    if (payload && payload.action === CREATE_GRUPO_ACTION) {
      return json_(createGrupoFromPayload_(payload));
    }
    if (payload && payload.action === UPDATE_GRUPO_ACTION) {
      return json_(updateGrupoFromPayload_(payload));
    }
    if (payload && payload.action === SET_GRUPO_ACTIVO_ACTION) {
      return json_(setGrupoActivoFromPayload_(payload));
    }
    return json_(saveGroupFromPayload_(payload));
  } catch (error) {
    return json_({
      ok: false,
      wroteToSheet: false,
      error: String(error.message || error),
      message: String(error.message || error),
      updated: [],
      errors: [],
    });
  } finally {
    lock.releaseLock();
  }
}

function saveGroup_(event) {
  return saveGroupFromPayload_(parsePostPayload_(event));
}

function saveGroupFromPayload_(payload) {
  var requestCheck = validateSaveGroupRequest_(payload);
  if (!requestCheck.ok) {
    return {
      ok: false,
      wroteToSheet: false,
      action: SAVE_ACTION,
      error: requestCheck.error,
      message: requestCheck.error,
      errors: requestCheck.errors || [],
      updated: [],
    };
  }

  var context = resolveSaveContext_(payload);
  if (!context.ok) {
    return Object.assign(
      {
        wroteToSheet: false,
        action: SAVE_ACTION,
        updated: [],
        errors: [],
      },
      context,
    );
  }

  var idRowMap = buildIdRowMap_(context.sheet);
  var updated = [];
  var errors = [];
  var wroteAny = false;

  for (var i = 0; i < payload.personas.length; i++) {
    var result = writePersonFields_(context.sheet, idRowMap, payload.personas[i], i, context.grupo);
    if (result.error) {
      errors.push(result.error);
      continue;
    }
    wroteAny = true;
    updated.push(result.updated);
  }

  var received = payload.personas.length;
  var partial = errors.length > 0 && updated.length > 0;
  var allFailed = errors.length > 0 && updated.length === 0;

  return {
    ok: !allFailed || received === 0,
    wroteToSheet: wroteAny,
    action: SAVE_ACTION,
    grupo: context.grupo,
    grupoId: context.grupoId,
    sheetKey: context.sheetKey,
    periodo: context.periodoActivo,
    mes: payload.mes,
    counts: {
      received: received,
      updated: updated.length,
      rejected: errors.length,
    },
    updated: updated,
    errors: errors,
    message: allFailed
      ? 'No se actualizó ninguna persona. Revisá los errores.'
      : partial
        ? 'Guardado parcial: ' +
          updated.length +
          ' actualizada(s), ' +
          errors.length +
          ' con error.'
        : 'Grupo guardado correctamente (' + updated.length + ' persona(s)).',
  };
}

/**
 * Auto-save Encargados: una sola persona. No exige completitud.
 * Reutiliza validación de negocio y escritura C–F de saveGroup.
 */
function savePersonFromPayload_(payload) {
  var requestCheck = validateSavePersonRequest_(payload);
  if (!requestCheck.ok) {
    return {
      ok: false,
      wroteToSheet: false,
      action: SAVE_PERSON_ACTION,
      error: requestCheck.error,
      message: requestCheck.error,
      errors: requestCheck.errors || [],
      updated: [],
    };
  }

  var context = resolveSaveContext_(payload);
  if (!context.ok) {
    return Object.assign(
      {
        wroteToSheet: false,
        action: SAVE_PERSON_ACTION,
        updated: [],
        errors: [],
      },
      context,
    );
  }

  var idRowMap = buildIdRowMap_(context.sheet);
  var result = writePersonFields_(context.sheet, idRowMap, payload.persona, 0, context.grupo);

  if (result.error) {
    return {
      ok: false,
      wroteToSheet: false,
      action: SAVE_PERSON_ACTION,
      grupo: context.grupo,
      grupoId: context.grupoId,
      sheetKey: context.sheetKey,
      periodo: context.periodoActivo,
      mes: payload.mes,
      counts: { received: 1, updated: 0, rejected: 1 },
      updated: [],
      errors: [result.error],
      message: result.error.error || 'No se actualizó la persona.',
    };
  }

  return {
    ok: true,
    wroteToSheet: true,
    action: SAVE_PERSON_ACTION,
    grupo: context.grupo,
    grupoId: context.grupoId,
    sheetKey: context.sheetKey,
    periodo: context.periodoActivo,
    mes: payload.mes,
    counts: { received: 1, updated: 1, rejected: 0 },
    updated: [result.updated],
    errors: [],
    message: 'Persona guardada correctamente.',
  };
}

function resolveSaveContext_(payload) {
  var spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sistema = getOrCreateSistemaSheet_(spreadsheet);
  var state = readSistemaMap_(sistema);

  if (!isEstadoAbierto_(state.EstadoPeriodo) || !String(state.PeriodoActivo || '').trim()) {
    return {
      ok: false,
      error: 'No hay un período abierto.',
      message:
        'No se puede guardar: Sistema debe tener PeriodoActivo y EstadoPeriodo=ABIERTO. Ninguna celda fue modificada.',
      periodo: state.PeriodoActivo || null,
    };
  }

  var periodoActivo = String(state.PeriodoActivo).trim();
  var payloadPeriodo = String(payload.periodo || '').trim();
  if (payloadPeriodo !== periodoActivo) {
    return {
      ok: false,
      error: 'El período del lote no coincide con Sistema.',
      message:
        'El Portal Encargados envió periodo="' +
        payloadPeriodo +
        '" pero Sistema.PeriodoActivo="' +
        periodoActivo +
        '". Recargá el grupo e intentá de nuevo. Ninguna celda fue modificada.',
      periodo: periodoActivo,
    };
  }

  var grupoRef = resolveSaveGrupoRef_(payload, spreadsheet);
  if (!grupoRef.ok) {
    return {
      ok: false,
      error: grupoRef.error,
      message: (grupoRef.message || grupoRef.error) + ' Ninguna celda fue modificada.',
      periodo: periodoActivo,
    };
  }

  var sheet = spreadsheet.getSheetByName(grupoRef.sheetKey);
  if (!sheet) {
    return {
      ok: false,
      error: 'No existe la hoja ' + grupoRef.sheetKey + '.',
      message:
        'No se encontró la hoja del grupo (' +
        grupoRef.sheetKey +
        '). Ninguna celda fue modificada.',
      periodo: periodoActivo,
    };
  }

  return {
    ok: true,
    spreadsheet: spreadsheet,
    sheet: sheet,
    grupo: grupoRef.resolved.nombre,
    grupoId: String(grupoRef.resolved.id),
    sheetKey: grupoRef.sheetKey,
    periodoActivo: periodoActivo,
    state: state,
  };
}

function writePersonFields_(sheet, idRowMap, person, index, grupo) {
  var id = String(person.id).trim();
  var business = validatePersonBusiness_(person);

  if (!business.ok) {
    return { error: { id: id, index: index, error: business.error } };
  }

  var row = idRowMap[id];
  if (!row) {
    return {
      error: {
        id: id,
        index: index,
        error: 'No se encontró el ID en la hoja ' + grupo + '.',
      },
    };
  }

  // Solo C–F. Nunca A, B ni B3.
  sheet.getRange(row, 3, 1, 4).setValues([
    [
      business.values.privilegio,
      business.values.horas,
      business.values.estudios,
      business.values.comentarios,
    ],
  ]);

  return { updated: { id: id, row: row } };
}

function buildIdRowMap_(sheet) {
  var map = {};
  var lastRow = sheet.getLastRow();
  if (lastRow < 7) return map;
  var ids = sheet.getRange(7, 1, lastRow - 6, 1).getDisplayValues();
  for (var i = 0; i < ids.length; i++) {
    var id = String(ids[i][0] || '').trim();
    if (id && map[id] == null) map[id] = 7 + i;
  }
  return map;
}

/**
 * Validación de negocio por persona (docs/07 + docs/08).
 * Vacío en privilegio = pendiente permitido.
 * Publicador: persiste Sí/No canónico.
 */
function validatePersonBusiness_(person) {
  var privilegio = String(person.privilegio || '').trim();
  var horas = String(person.horas || '').trim();
  var estudios = String(person.estudios || '').trim();
  var comentarios = String(person.comentarios || '').trim();

  if (estudios !== '') {
    if (!/^\d+$/.test(estudios)) {
      return { ok: false, error: 'Estudios debe ser un entero ≥ 0 o vacío.' };
    }
  }

  if (privilegio === '') {
    if (horas !== '') {
      return { ok: false, error: 'Con privilegio vacío, Horas debe quedar vacío (informe pendiente).' };
    }
    return {
      ok: true,
      values: {
        privilegio: '',
        horas: '',
        estudios: estudios,
        comentarios: comentarios,
      },
    };
  }

  var validPrivileges = { Publicador: 1, Auxiliar: 1, Regular: 1, Inactivo: 1 };
  if (!validPrivileges[privilegio]) {
    return {
      ok: false,
      error: 'Privilegio inválido. Usá Publicador, Auxiliar, Regular o Inactivo.',
    };
  }

  if (privilegio === 'Inactivo') {
    return {
      ok: true,
      values: {
        privilegio: 'Inactivo',
        horas: '',
        estudios: estudios,
        comentarios: comentarios,
      },
    };
  }

  if (privilegio === 'Publicador') {
    if (horas === '') {
      return {
        ok: true,
        values: {
          privilegio: 'Publicador',
          horas: '',
          estudios: estudios,
          comentarios: comentarios,
        },
      };
    }
    var yn = normalizeYesNoToken_(horas);
    if (!yn) {
      return {
        ok: false,
        error: 'Horas de Publicador debe ser Sí o No (se admiten variantes sin tilde / mayúsculas).',
      };
    }
    return {
      ok: true,
      values: {
        privilegio: 'Publicador',
        horas: yn === 'si' ? 'Sí' : 'No',
        estudios: estudios,
        comentarios: comentarios,
      },
    };
  }

  // Auxiliar / Regular
  if (horas === '') {
    return {
      ok: true,
      values: {
        privilegio: privilegio,
        horas: '',
        estudios: estudios,
        comentarios: comentarios,
      },
    };
  }

  if (!isNumericHours_(horas)) {
    return {
      ok: false,
      error: 'Horas de ' + privilegio + ' debe ser un entero ≥ 0 (sin decimales).',
    };
  }

  return {
    ok: true,
    values: {
      privilegio: privilegio,
      horas: horas,
      estudios: estudios,
      comentarios: comentarios,
    },
  };
}

function normalizeYesNoToken_(value) {
  var text = String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (text === 'si') return 'si';
  if (text === 'no') return 'no';
  return null;
}

function isNumericHours_(value) {
  var text = String(value || '').trim();
  if (!text) return false;
  if (normalizeYesNoToken_(text)) return false;
  return /^\d+$/.test(text);
}

function parsePostPayload_(event) {
  if (!event || !event.postData || !event.postData.contents) {
    throw new Error('El cuerpo POST está vacío.');
  }
  var raw = String(event.postData.contents).trim();
  if (!raw) throw new Error('El cuerpo POST está vacío.');
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error('El cuerpo POST no es un JSON válido.');
  }
}

function validateSaveGroupRequest_(payload) {
  var errors = [];
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { ok: false, error: 'El payload debe ser un objeto JSON.', errors: errors };
  }

  if (payload.action !== SAVE_ACTION) {
    return { ok: false, error: 'Acción no válida. Se espera action=saveGroup.', errors: errors };
  }

  if (payload.mode === DRY_RUN_MODE) {
    return {
      ok: false,
      error: 'mode=dryRun ya no está disponible. Enviá mode=save.',
      errors: errors,
    };
  }

  if (payload.mode != null && payload.mode !== 'save') {
    return { ok: false, error: 'mode debe ser "save".', errors: errors };
  }

  if (!hasSaveGrupoRef_(payload)) {
    return {
      ok: false,
      error: 'grupoId o grupo es obligatorio.',
      errors: errors,
    };
  }

  if (typeof payload.mes !== 'string') {
    return { ok: false, error: 'mes debe ser un string (solo control).', errors: errors };
  }

  if (typeof payload.periodo !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(String(payload.periodo).trim())) {
    return {
      ok: false,
      error: 'periodo debe ser YYYY-MM y coincidir con Sistema.PeriodoActivo.',
      errors: errors,
    };
  }

  if (!Array.isArray(payload.personas)) {
    return { ok: false, error: 'personas debe ser un array.', errors: errors };
  }

  for (var i = 0; i < payload.personas.length; i++) {
    var personError = validatePersonStructure_(payload.personas[i], i);
    if (personError) errors.push(personError);
  }

  if (errors.length) {
    return {
      ok: false,
      error: 'El lote tiene ' + errors.length + ' persona(s) con estructura inválida.',
      errors: errors,
    };
  }

  return { ok: true, errors: [] };
}

function validateSavePersonRequest_(payload) {
  var errors = [];
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { ok: false, error: 'El payload debe ser un objeto JSON.', errors: errors };
  }

  if (payload.action !== SAVE_PERSON_ACTION) {
    return { ok: false, error: 'Acción no válida. Se espera action=savePerson.', errors: errors };
  }

  if (payload.mode === DRY_RUN_MODE) {
    return {
      ok: false,
      error: 'mode=dryRun ya no está disponible. Enviá mode=save.',
      errors: errors,
    };
  }

  if (payload.mode != null && payload.mode !== 'save') {
    return { ok: false, error: 'mode debe ser "save".', errors: errors };
  }

  if (!hasSaveGrupoRef_(payload)) {
    return {
      ok: false,
      error: 'grupoId o grupo es obligatorio.',
      errors: errors,
    };
  }

  if (typeof payload.mes !== 'string') {
    return { ok: false, error: 'mes debe ser un string (solo control).', errors: errors };
  }

  if (typeof payload.periodo !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(String(payload.periodo).trim())) {
    return {
      ok: false,
      error: 'periodo debe ser YYYY-MM y coincidir con Sistema.PeriodoActivo.',
      errors: errors,
    };
  }

  if (!payload.persona || typeof payload.persona !== 'object' || Array.isArray(payload.persona)) {
    return { ok: false, error: 'persona debe ser un objeto.', errors: errors };
  }

  var personError = validatePersonStructure_(payload.persona, 0);
  if (personError) {
    return {
      ok: false,
      error: 'La persona tiene estructura inválida.',
      errors: [personError],
    };
  }

  return { ok: true, errors: [] };
}

function hasSaveGrupoRef_(payload) {
  var hasId = payload && payload.grupoId != null && String(payload.grupoId).trim() !== '';
  var hasGrupo = payload && payload.grupo != null && String(payload.grupo).trim() !== '';
  return !!(hasId || hasGrupo);
}

/**
 * Fase 7: resuelve grupoId (preferido) o grupo legacy → catálogo + SheetKey.
 */
function resolveSaveGrupoRef_(payload, spreadsheet) {
  var raw = '';
  if (payload && payload.grupoId != null && String(payload.grupoId).trim() !== '') {
    raw = String(payload.grupoId).trim();
  } else if (payload && payload.grupo != null && String(payload.grupo).trim() !== '') {
    raw = String(payload.grupo).trim();
  }
  if (!raw) {
    return { ok: false, error: 'grupoId o grupo es obligatorio.' };
  }

  var catalog = readGruposCatalog_(spreadsheet, { validate: true });
  if (!catalog.ok) {
    return {
      ok: false,
      error: catalog.error || 'Catálogo Grupos inválido.',
      message: catalog.message || catalog.error,
    };
  }

  var resolved = resolveGrupoRef_(catalog.grupos, raw);
  if (!resolved) {
    return {
      ok: false,
      error: 'Grupo inválido o inexistente: "' + raw + '".',
    };
  }
  if (!resolved.activo) {
    return {
      ok: false,
      error: 'El grupo "' + resolved.nombre + '" está inactivo. No se puede guardar.',
    };
  }

  var sheetKey = sheetKeyForGrupoId_(resolved.id);
  if (!sheetKey) {
    return { ok: false, error: 'No se pudo determinar SheetKey para el grupo.' };
  }

  return { ok: true, resolved: resolved, sheetKey: sheetKey };
}

function validatePersonStructure_(person, index) {
  if (!person || typeof person !== 'object' || Array.isArray(person)) {
    return { index: index, id: null, error: 'La persona debe ser un objeto.' };
  }

  var id = person.id;
  if (id === null || id === undefined || String(id).trim() === '') {
    return { index: index, id: null, error: 'id es obligatorio.' };
  }

  var fields = ['privilegio', 'horas', 'estudios', 'comentarios'];
  for (var f = 0; f < fields.length; f++) {
    var key = fields[f];
    if (!(key in person)) {
      return { index: index, id: String(id), error: 'Falta el campo ' + key + '.' };
    }
    if (typeof person[key] !== 'string') {
      return { index: index, id: String(id), error: key + ' debe ser string.' };
    }
  }

  return null;
}

function readGroup_(sheet, groupName) {
  if (!sheet) throw new Error('No existe la pestaña ' + groupName);
  const period = sheet.getRange('B3').getDisplayValue();
  const lastRow = sheet.getLastRow();
  const rows = lastRow >= 7 ? sheet.getRange(7, 1, lastRow - 6, 6).getDisplayValues() : [];
  return {
    grupo: groupName,
    mes: period,
    informes: rows
      .filter(function (row) {
        return row[0] && row[1];
      })
      .map(function (row) {
        return {
          id: row[0],
          nombre: row[1],
          privilegio: row[2],
          horas: row[3],
          estudios: row[4],
          comentarios: row[5],
        };
      }),
  };
}

/**
 * reports enriquecido: `grupo` (nombre) + grupoId/color.
 * Solo incluye grupos activos cuya hoja SheetKey ya exista (no materializa a mitad de período).
 */
function buildReportsGroups_(spreadsheet) {
  var targetsResult = listOperationalGroupTargets_(spreadsheet);
  var targets = [];

  if (targetsResult.ok) {
    targets = targetsResult.targets || [];
  } else {
    // Fallback soft: catálogo sin validación estricta (sin hardcode de hojas).
    var soft = (getCatalogGruposSoft_(spreadsheet) || []).filter(function (grupo) {
      return grupo.activo === true;
    });
    if (!soft.length) {
      soft = getCatalogGruposSoft_(spreadsheet) || [];
    }
    targets = soft
      .slice()
      .sort(function (a, b) {
        return Number(a.id) - Number(b.id);
      })
      .map(function (grupo) {
        return {
          id: String(grupo.id),
          nombre: grupo.nombre,
          color: grupo.color,
          sheetKey: sheetKeyForGrupoId_(grupo.id),
        };
      });
  }

  var groups = [];
  for (var i = 0; i < targets.length; i++) {
    var target = targets[i];
    var sheet = spreadsheet.getSheetByName(target.sheetKey);
    // Spec D.5: un grupo nuevo no aparece en el trabajo del período hasta materializarse.
    if (!sheet) continue;
    var group = readGroup_(sheet, target.sheetKey);
    groups.push({
      grupo: target.nombre,
      grupoId: String(target.id),
      color: String(target.color || ''),
      mes: group.mes,
      informes: group.informes,
    });
  }
  return groups;
}

/**
 * Listado del padrón Personas (A-H). No expone datos en action=reports.
 * Fase 3: agrega grupoId / grupoNombre / grupoColor sin quitar `grupo`.
 */
function listPersonas_() {
  var spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = spreadsheet.getSheetByName(PERSONAS_SHEET);
  if (!sheet) {
    return {
      ok: false,
      error: 'No existe la hoja Personas.',
      message: 'Creá la hoja Personas antes de consultar el padrón.',
      personas: [],
    };
  }

  ensurePersonasHeaders_(sheet);
  var rows = readPersonasRows_(sheet);
  var catalogGrupos = getCatalogGruposSoft_(spreadsheet);
  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    personas: rows.map(function (row) {
      return personaToPublic_(row, catalogGrupos);
    }),
  };
}

function createPersonaFromPayload_(payload) {
  var fields = normalizePersonaFields_(payload, { requireNombre: true, requireGrupo: true });
  if (!fields.ok) {
    return {
      ok: false,
      wroteToSheet: false,
      action: CREATE_PERSONA_ACTION,
      error: fields.error,
      message: fields.error,
    };
  }

  var spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = spreadsheet.getSheetByName(PERSONAS_SHEET);
  if (!sheet) {
    return {
      ok: false,
      wroteToSheet: false,
      action: CREATE_PERSONA_ACTION,
      error: 'No existe la hoja Personas.',
      message: 'No existe la hoja Personas.',
    };
  }

  ensurePersonasHeaders_(sheet);
  var existing = readPersonasRows_(sheet);
  if (findPersonaByNombreKey_(existing, fields.nombreKey)) {
    return {
      ok: false,
      wroteToSheet: false,
      action: CREATE_PERSONA_ACTION,
      error: 'Ya existe una persona con ese nombre.',
      message: 'Ya existe una persona con ese nombre.',
    };
  }

  var grupoStore = resolvePersonaGrupoIdToStore_(spreadsheet, fields);
  if (!grupoStore.ok) {
    return {
      ok: false,
      wroteToSheet: false,
      action: CREATE_PERSONA_ACTION,
      error: grupoStore.error,
      message: grupoStore.error,
    };
  }

  var id = nextPersonasIdFromRows_(existing);
  var activoLabel = fields.activo ? 'Sí' : 'No';
  var appendRow = sheet.getLastRow() + 1;
  sheet.getRange(appendRow, 1, 1, 8).setNumberFormat('@');
  sheet.getRange(appendRow, 1, 1, 8).setValues([
    [
      id,
      fields.nombre,
      grupoStore.grupoId,
      activoLabel,
      fields.numeroContacto,
      fields.contactoEmergencia,
      fields.nombreEmergencia,
      fields.relacionEmergencia,
    ],
  ]);

  return {
    ok: true,
    wroteToSheet: true,
    action: CREATE_PERSONA_ACTION,
    message: 'Persona creada.',
    persona: personaToPublic_(
      {
        row: appendRow,
        id: id,
        nombre: fields.nombre,
        grupo: grupoStore.grupoId,
        activo: fields.activo,
        numeroContacto: fields.numeroContacto,
        contactoEmergencia: fields.contactoEmergencia,
        nombreEmergencia: fields.nombreEmergencia,
        relacionEmergencia: fields.relacionEmergencia,
      },
      grupoStore.catalogGrupos
    ),
  };
}

function updatePersonaFromPayload_(payload) {
  var id = String((payload && payload.id) || '').trim();
  if (!id) {
    return {
      ok: false,
      wroteToSheet: false,
      action: UPDATE_PERSONA_ACTION,
      error: 'id es obligatorio.',
      message: 'id es obligatorio.',
    };
  }

  var fields = normalizePersonaFields_(payload, { requireNombre: true, requireGrupo: true });
  if (!fields.ok) {
    return {
      ok: false,
      wroteToSheet: false,
      action: UPDATE_PERSONA_ACTION,
      error: fields.error,
      message: fields.error,
    };
  }

  var spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = spreadsheet.getSheetByName(PERSONAS_SHEET);
  if (!sheet) {
    return {
      ok: false,
      wroteToSheet: false,
      action: UPDATE_PERSONA_ACTION,
      error: 'No existe la hoja Personas.',
      message: 'No existe la hoja Personas.',
    };
  }

  ensurePersonasHeaders_(sheet);
  var existing = readPersonasRows_(sheet);
  var current = findPersonaById_(existing, id);
  if (!current) {
    return {
      ok: false,
      wroteToSheet: false,
      action: UPDATE_PERSONA_ACTION,
      error: 'No existe una persona con ese ID.',
      message: 'No existe una persona con ese ID.',
    };
  }

  var duplicate = findPersonaByNombreKey_(existing, fields.nombreKey);
  if (duplicate && String(duplicate.id) !== String(id)) {
    return {
      ok: false,
      wroteToSheet: false,
      action: UPDATE_PERSONA_ACTION,
      error: 'Ya existe una persona con ese nombre.',
      message: 'Ya existe una persona con ese nombre.',
    };
  }

  var grupoStore = resolvePersonaGrupoIdToStore_(spreadsheet, fields);
  if (!grupoStore.ok) {
    return {
      ok: false,
      wroteToSheet: false,
      action: UPDATE_PERSONA_ACTION,
      error: grupoStore.error,
      message: grupoStore.error,
    };
  }

  var activoLabel = fields.activo ? 'Sí' : 'No';
  sheet.getRange(current.row, 1, 1, 8).setNumberFormat('@');
  sheet.getRange(current.row, 1, 1, 8).setValues([
    [
      current.id,
      fields.nombre,
      grupoStore.grupoId,
      activoLabel,
      fields.numeroContacto,
      fields.contactoEmergencia,
      fields.nombreEmergencia,
      fields.relacionEmergencia,
    ],
  ]);

  return {
    ok: true,
    wroteToSheet: true,
    action: UPDATE_PERSONA_ACTION,
    message: 'Persona actualizada.',
    persona: personaToPublic_(
      {
        row: current.row,
        id: current.id,
        nombre: fields.nombre,
        grupo: grupoStore.grupoId,
        activo: fields.activo,
        numeroContacto: fields.numeroContacto,
        contactoEmergencia: fields.contactoEmergencia,
        nombreEmergencia: fields.nombreEmergencia,
        relacionEmergencia: fields.relacionEmergencia,
      },
      grupoStore.catalogGrupos
    ),
  };
}

function setPersonaActivoFromPayload_(payload) {
  var id = String((payload && payload.id) || '').trim();
  if (!id) {
    return {
      ok: false,
      wroteToSheet: false,
      action: SET_PERSONA_ACTIVO_ACTION,
      error: 'id es obligatorio.',
      message: 'id es obligatorio.',
    };
  }

  if (payload.activo === undefined || payload.activo === null || payload.activo === '') {
    return {
      ok: false,
      wroteToSheet: false,
      action: SET_PERSONA_ACTIVO_ACTION,
      error: 'activo es obligatorio.',
      message: 'activo es obligatorio.',
    };
  }

  var activo = coerceActivoFlag_(payload.activo);
  var spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = spreadsheet.getSheetByName(PERSONAS_SHEET);
  if (!sheet) {
    return {
      ok: false,
      wroteToSheet: false,
      action: SET_PERSONA_ACTIVO_ACTION,
      error: 'No existe la hoja Personas.',
      message: 'No existe la hoja Personas.',
    };
  }

  ensurePersonasHeaders_(sheet);
  var existing = readPersonasRows_(sheet);
  var current = findPersonaById_(existing, id);
  if (!current) {
    return {
      ok: false,
      wroteToSheet: false,
      action: SET_PERSONA_ACTIVO_ACTION,
      error: 'No existe una persona con ese ID.',
      message: 'No existe una persona con ese ID.',
    };
  }

  var activoLabel = activo ? 'Sí' : 'No';
  sheet.getRange(current.row, 4).setNumberFormat('@');
  sheet.getRange(current.row, 4).setValue(activoLabel);

  current.activo = activo;
  return {
    ok: true,
    wroteToSheet: true,
    action: SET_PERSONA_ACTIVO_ACTION,
    message: activo ? 'Persona activada.' : 'Persona desactivada.',
    persona: personaToPublic_(current, getCatalogGruposSoft_(spreadsheet)),
  };
}

function ensurePersonasHeaders_(sheet) {
  var lastCol = Math.max(sheet.getLastColumn(), 1);
  if (lastCol < 8 || sheet.getLastRow() < 1) {
    sheet.getRange(1, 1, 1, PERSONAS_HEADERS.length).setValues([PERSONAS_HEADERS]);
  } else {
    var headers = sheet.getRange(1, 1, 1, 8).getDisplayValues()[0];
    var need = false;
    for (var h = 0; h < PERSONAS_HEADERS.length; h++) {
      if (String(headers[h] || '').trim() !== PERSONAS_HEADERS[h]) {
        need = true;
        break;
      }
    }
    if (need) {
      sheet.getRange(1, 1, 1, PERSONAS_HEADERS.length).setValues([PERSONAS_HEADERS]);
    }
  }
  var lastRow = sheet.getLastRow();
  if (lastRow >= 2) {
    sheet.getRange(2, 5, lastRow - 1, 4).setNumberFormat('@');
  }
}

function readPersonasRows_(sheet) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  var values = sheet.getRange(2, 1, lastRow - 1, 8).getDisplayValues();
  var rows = [];
  for (var i = 0; i < values.length; i++) {
    var id = String(values[i][0] || '').trim();
    var nombre = String(values[i][1] || '').trim();
    var grupoRaw = String(values[i][2] || '').trim();
    var activoRaw = values[i][3];
    if (!id && !nombre && !grupoRaw && !String(activoRaw || '').trim()) continue;
    rows.push({
      row: i + 2,
      id: id,
      nombre: nombre,
      // Fase 4: se conserva el valor crudo de Personas!C (GrupoID o legacy nombre).
      grupo: grupoRaw,
      activo: isActivo_(activoRaw),
      numeroContacto: String(values[i][4] == null ? '' : values[i][4]),
      contactoEmergencia: String(values[i][5] == null ? '' : values[i][5]),
      nombreEmergencia: String(values[i][6] == null ? '' : values[i][6]),
      relacionEmergencia: String(values[i][7] == null ? '' : values[i][7]),
    });
  }
  return rows;
}

function personaToPublic_(row, catalogGrupos) {
  var storedGrupo = String(row.grupo || '');
  var resolved = resolveGrupoRef_(catalogGrupos || [], storedGrupo);
  var grupoNombre = resolved ? String(resolved.nombre) : storedGrupo;
  return {
    id: String(row.id || ''),
    nombre: String(row.nombre || ''),
    // Compatibilidad: `grupo` sigue siendo el nombre legible.
    grupo: grupoNombre,
    grupoId: resolved ? String(resolved.id) : '',
    grupoNombre: grupoNombre,
    grupoColor: resolved ? String(resolved.color) : '',
    activo: row.activo === true,
    numeroContacto: String(row.numeroContacto || ''),
    contactoEmergencia: String(row.contactoEmergencia || ''),
    nombreEmergencia: String(row.nombreEmergencia || ''),
    relacionEmergencia: String(row.relacionEmergencia || ''),
  };
}

function normalizePersonaNombreKey_(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function asTextField_(raw) {
  if (raw === undefined || raw === null) return '';
  return String(raw);
}

function coerceActivoFlag_(raw) {
  if (raw === true || raw === false) return raw;
  if (typeof raw === 'number') return raw !== 0;
  return isActivo_(raw);
}

function normalizePersonaFields_(payload, options) {
  var requireNombre = !options || options.requireNombre !== false;
  var requireGrupo = !options || options.requireGrupo !== false;
  var nombre = String((payload && payload.nombre) || '').trim();
  // Compat: acepta grupoId (preferido) o grupo (nombre / SheetKey / "1").
  var grupoRaw = String(
    (payload && (payload.grupoId != null && payload.grupoId !== ''
      ? payload.grupoId
      : payload.grupo)) ||
      ''
  ).trim();

  if (requireNombre && !nombre) {
    return { ok: false, error: 'El nombre es obligatorio.' };
  }
  if (requireGrupo && !grupoRaw) {
    return {
      ok: false,
      error: 'El grupo es obligatorio.',
    };
  }

  var activo =
    payload && payload.activo !== undefined && payload.activo !== null && payload.activo !== ''
      ? coerceActivoFlag_(payload.activo)
      : true;

  return {
    ok: true,
    nombre: nombre,
    nombreKey: normalizePersonaNombreKey_(nombre),
    grupo: grupoRaw,
    grupoRaw: grupoRaw,
    activo: activo,
    numeroContacto: asTextField_(payload && payload.numeroContacto),
    contactoEmergencia: asTextField_(payload && payload.contactoEmergencia),
    nombreEmergencia: asTextField_(payload && payload.nombreEmergencia),
    relacionEmergencia: asTextField_(payload && payload.relacionEmergencia),
  };
}

/**
 * Resuelve el valor a persistir en Personas!C = GrupoID.
 * Fase 4: el padrón guarda ID, no el nombre.
 */
function resolvePersonaGrupoIdToStore_(spreadsheet, fields) {
  var catalogGrupos = getCatalogGruposSoft_(spreadsheet);
  var resolved =
    resolveGrupoRef_(catalogGrupos, fields.grupoRaw) ||
    resolveGrupoRef_(catalogGrupos, fields.grupo);
  if (!resolved) {
    return {
      ok: false,
      error: 'Grupo inválido o ausente en el catálogo Grupos.',
    };
  }
  if (!resolved.activo) {
    return {
      ok: false,
      error: 'El grupo "' + resolved.nombre + '" está inactivo. Elegí un grupo activo.',
    };
  }
  return { ok: true, grupoId: String(resolved.id), resolved: resolved, catalogGrupos: catalogGrupos };
}

function findPersonaById_(rows, id) {
  var target = String(id || '').trim();
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].id) === target) return rows[i];
  }
  return null;
}

function findPersonaByNombreKey_(rows, nombreKey) {
  var key = String(nombreKey || '');
  for (var i = 0; i < rows.length; i++) {
    if (normalizePersonaNombreKey_(rows[i].nombre) === key) return rows[i];
  }
  return null;
}

function nextPersonasIdFromRows_(rows) {
  var maxId = 0;
  for (var i = 0; i < rows.length; i++) {
    var num = Number(String(rows[i].id || '').trim());
    if (!isNaN(num) && num > maxId) maxId = num;
  }
  return String(maxId + 1);
}

/**
 * Catálogo de grupos (hoja Grupos).
 * Lectura (Fase 2) + escritura ABM Configuración (Fase 11).
 * create/update/setActivo no materializan hojas de trabajo del período abierto.
 */

function createGrupoFromPayload_(payload) {
  var fields = normalizeGrupoFields_(payload, { requireNombre: true, requireColor: false });
  if (!fields.ok) {
    return {
      ok: false,
      wroteToSheet: false,
      action: CREATE_GRUPO_ACTION,
      error: fields.error,
      message: fields.error,
    };
  }

  var spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = spreadsheet.getSheetByName(GRUPOS_SHEET);
  if (!sheet) {
    return {
      ok: false,
      wroteToSheet: false,
      action: CREATE_GRUPO_ACTION,
      error: 'No existe la hoja Grupos.',
      message: 'No existe la hoja Grupos.',
    };
  }

  ensureGruposHeaders_(sheet);
  var catalog = readGruposCatalog_(spreadsheet, { validate: false });
  var existing = catalog.grupos || [];

  if (findGrupoByNombre_(existing, fields.nombre)) {
    return {
      ok: false,
      wroteToSheet: false,
      action: CREATE_GRUPO_ACTION,
      error: 'Ya existe un grupo con ese nombre.',
      message: 'Ya existe un grupo con ese nombre.',
    };
  }

  var color = fields.color || pickDefaultGrupoColor_(existing);
  var id = nextGruposIdFromRows_(existing);
  var activo = fields.activo;
  var activoLabel = activo ? 'Sí' : 'No';
  var appendRow = sheet.getLastRow() + 1;
  sheet.getRange(appendRow, 1, 1, 4).setNumberFormat('@');
  sheet.getRange(appendRow, 1, 1, 4).setValues([[id, fields.nombre, color, activoLabel]]);

  return {
    ok: true,
    wroteToSheet: true,
    action: CREATE_GRUPO_ACTION,
    message: 'Grupo creado.',
    grupo: grupoToPublic_({
      id: id,
      nombre: fields.nombre,
      color: color,
      activo: activo,
    }),
  };
}

function updateGrupoFromPayload_(payload) {
  var id = String((payload && payload.id) || '').trim();
  if (!id) {
    return {
      ok: false,
      wroteToSheet: false,
      action: UPDATE_GRUPO_ACTION,
      error: 'id es obligatorio.',
      message: 'id es obligatorio.',
    };
  }

  var fields = normalizeGrupoFields_(payload, { requireNombre: true, requireColor: true });
  if (!fields.ok) {
    return {
      ok: false,
      wroteToSheet: false,
      action: UPDATE_GRUPO_ACTION,
      error: fields.error,
      message: fields.error,
    };
  }

  var spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = spreadsheet.getSheetByName(GRUPOS_SHEET);
  if (!sheet) {
    return {
      ok: false,
      wroteToSheet: false,
      action: UPDATE_GRUPO_ACTION,
      error: 'No existe la hoja Grupos.',
      message: 'No existe la hoja Grupos.',
    };
  }

  ensureGruposHeaders_(sheet);
  var catalog = readGruposCatalog_(spreadsheet, { validate: false });
  var existing = catalog.grupos || [];
  var current = findGrupoById_(existing, id);
  if (!current) {
    return {
      ok: false,
      wroteToSheet: false,
      action: UPDATE_GRUPO_ACTION,
      error: 'No existe un grupo con ese ID.',
      message: 'No existe un grupo con ese ID.',
    };
  }

  var duplicate = findGrupoByNombre_(existing, fields.nombre);
  if (duplicate && String(duplicate.id) !== String(id)) {
    return {
      ok: false,
      wroteToSheet: false,
      action: UPDATE_GRUPO_ACTION,
      error: 'Ya existe un grupo con ese nombre.',
      message: 'Ya existe un grupo con ese nombre.',
    };
  }

  sheet.getRange(current.row, 1, 1, 4).setNumberFormat('@');
  sheet.getRange(current.row, 1, 1, 4).setValues([
    [current.id, fields.nombre, fields.color, current.activo ? 'Sí' : 'No'],
  ]);

  return {
    ok: true,
    wroteToSheet: true,
    action: UPDATE_GRUPO_ACTION,
    message: 'Grupo actualizado.',
    grupo: grupoToPublic_({
      id: current.id,
      nombre: fields.nombre,
      color: fields.color,
      activo: current.activo,
    }),
  };
}

function setGrupoActivoFromPayload_(payload) {
  var id = String((payload && payload.id) || '').trim();
  if (!id) {
    return {
      ok: false,
      wroteToSheet: false,
      action: SET_GRUPO_ACTIVO_ACTION,
      error: 'id es obligatorio.',
      message: 'id es obligatorio.',
    };
  }

  if (payload.activo === undefined || payload.activo === null || payload.activo === '') {
    return {
      ok: false,
      wroteToSheet: false,
      action: SET_GRUPO_ACTIVO_ACTION,
      error: 'activo es obligatorio.',
      message: 'activo es obligatorio.',
    };
  }

  var activo = coerceActivoFlag_(payload.activo);
  var spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = spreadsheet.getSheetByName(GRUPOS_SHEET);
  if (!sheet) {
    return {
      ok: false,
      wroteToSheet: false,
      action: SET_GRUPO_ACTIVO_ACTION,
      error: 'No existe la hoja Grupos.',
      message: 'No existe la hoja Grupos.',
    };
  }

  ensureGruposHeaders_(sheet);
  var catalog = readGruposCatalog_(spreadsheet, { validate: false });
  var existing = catalog.grupos || [];
  var current = findGrupoById_(existing, id);
  if (!current) {
    return {
      ok: false,
      wroteToSheet: false,
      action: SET_GRUPO_ACTIVO_ACTION,
      error: 'No existe un grupo con ese ID.',
      message: 'No existe un grupo con ese ID.',
    };
  }

  if (!activo && current.activo) {
    var blockers = countActivePersonasInGrupo_(spreadsheet, id);
    if (blockers.count > 0) {
      return {
        ok: false,
        wroteToSheet: false,
        action: SET_GRUPO_ACTIVO_ACTION,
        error: 'No se puede desactivar: hay personas activas asignadas a este grupo.',
        message:
          'Reasigná o desactivá las ' +
          blockers.count +
          ' persona(s) activa(s) de este grupo antes de desactivarlo.',
        activePersonas: blockers.count,
      };
    }
  }

  var activoLabel = activo ? 'Sí' : 'No';
  sheet.getRange(current.row, 4).setNumberFormat('@');
  sheet.getRange(current.row, 4).setValue(activoLabel);

  return {
    ok: true,
    wroteToSheet: true,
    action: SET_GRUPO_ACTIVO_ACTION,
    message: activo ? 'Grupo activado.' : 'Grupo desactivado.',
    grupo: grupoToPublic_({
      id: current.id,
      nombre: current.nombre,
      color: current.color,
      activo: activo,
    }),
  };
}

function normalizeGrupoFields_(payload, options) {
  options = options || {};
  var requireNombre = options.requireNombre !== false;
  var requireColor = options.requireColor === true;
  var nombre = String((payload && payload.nombre) || '').trim().replace(/\s+/g, ' ');

  if (requireNombre && !nombre) {
    return { ok: false, error: 'El nombre es obligatorio.' };
  }
  if (nombre && nombre.length > GRUPO_NOMBRE_MAX_LEN_) {
    return {
      ok: false,
      error: 'El nombre no puede superar ' + GRUPO_NOMBRE_MAX_LEN_ + ' caracteres.',
    };
  }

  var colorRaw = payload && payload.color != null ? String(payload.color).trim() : '';
  var color = colorRaw ? normalizeGrupoColor_(colorRaw) : null;
  if (requireColor || colorRaw) {
    if (!color) {
      return { ok: false, error: 'Color inválido. Usá formato #RRGGBB.' };
    }
  }

  var activo =
    payload && payload.activo !== undefined && payload.activo !== null && payload.activo !== ''
      ? coerceActivoFlag_(payload.activo)
      : true;

  return {
    ok: true,
    nombre: nombre,
    color: color,
    activo: activo,
  };
}

function nextGruposIdFromRows_(grupos) {
  var maxId = 0;
  for (var i = 0; i < (grupos || []).length; i++) {
    var num = Number(String(grupos[i].id || '').trim());
    if (!isNaN(num) && num > maxId) maxId = num;
  }
  return String(maxId + 1);
}

function pickDefaultGrupoColor_(grupos) {
  var used = {};
  for (var i = 0; i < (grupos || []).length; i++) {
    used[String(grupos[i].color || '').toUpperCase()] = true;
  }
  for (var c = 0; c < GRUPO_DEFAULT_COLORS_.length; c++) {
    if (!used[GRUPO_DEFAULT_COLORS_[c]]) return GRUPO_DEFAULT_COLORS_[c];
  }
  var index = (grupos || []).length % GRUPO_DEFAULT_COLORS_.length;
  return GRUPO_DEFAULT_COLORS_[index];
}

/** Personas Activo=Sí cuyo GrupoID (o legacy resuelto) apunta al grupo. */
function countActivePersonasInGrupo_(spreadsheet, grupoId) {
  var targetId = String(grupoId || '').trim();
  if (!targetId) return { count: 0 };
  var personasSheet = spreadsheet.getSheetByName(PERSONAS_SHEET);
  if (!personasSheet) return { count: 0 };
  var catalog = getCatalogGruposSoft_(spreadsheet);
  var rows = readPersonasRows_(personasSheet);
  var count = 0;
  for (var i = 0; i < rows.length; i++) {
    if (!rows[i].activo) continue;
    var resolved = resolveGrupoRef_(catalog, rows[i].grupo);
    if (resolved && String(resolved.id) === targetId) count += 1;
  }
  return { count: count };
}

function ensureGruposHeaders_(sheet) {
  var lastCol = Math.max(sheet.getLastColumn(), 1);
  if (lastCol < 4 || sheet.getLastRow() < 1) {
    sheet.getRange(1, 1, 1, GRUPOS_HEADERS.length).setValues([GRUPOS_HEADERS]);
  } else {
    var headers = sheet.getRange(1, 1, 1, 4).getDisplayValues()[0];
    var need = false;
    for (var h = 0; h < GRUPOS_HEADERS.length; h++) {
      if (String(headers[h] || '').trim() !== GRUPOS_HEADERS[h]) {
        need = true;
        break;
      }
    }
    if (need) {
      sheet.getRange(1, 1, 1, GRUPOS_HEADERS.length).setValues([GRUPOS_HEADERS]);
    }
  }
}

function listGrupos_(parameter) {
  var spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  var onlyActive = isActivosQueryFlag_(parameter && parameter.activos);
  var catalog = readGruposCatalog_(spreadsheet, { onlyActive: onlyActive, validate: true });
  if (!catalog.ok) {
    return {
      ok: false,
      error: catalog.error,
      message: catalog.message,
      details: catalog.details || [],
      grupos: [],
    };
  }
  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    grupos: catalog.grupos.map(function (grupo) {
      return grupoToPublic_(grupo);
    }),
  };
}

function isActivosQueryFlag_(raw) {
  var value = String(raw == null ? '' : raw)
    .trim()
    .toLowerCase();
  return value === '1' || value === 'true' || value === 'si' || value === 'sí' || value === 'yes';
}

/**
 * Lee la hoja Grupos.
 * options.onlyActive — filtra Activo=Sí
 * options.validate — si true, valida integridad y falla con details
 */
function readGruposCatalog_(spreadsheet, options) {
  options = options || {};
  var sheet = spreadsheet.getSheetByName(GRUPOS_SHEET);
  if (!sheet) {
    return {
      ok: false,
      error: 'No existe la hoja Grupos.',
      message: 'Creá la hoja Grupos (Fase 1) antes de consultar el catálogo.',
      details: [],
      grupos: [],
    };
  }

  var lastRow = sheet.getLastRow();
  if (lastRow < 1) {
    return {
      ok: false,
      error: 'La hoja Grupos está vacía.',
      message: 'La hoja Grupos no tiene encabezados ni datos.',
      details: [],
      grupos: [],
    };
  }

  var headerValues = sheet.getRange(1, 1, 1, 4).getDisplayValues()[0];
  for (var h = 0; h < GRUPOS_HEADERS.length; h++) {
    if (String(headerValues[h] || '').trim() !== GRUPOS_HEADERS[h]) {
      return {
        ok: false,
        error: 'Encabezados inválidos en Grupos.',
        message:
          'Se esperaban columnas ID, Nombre, Color, Activo. Revisá la fila 1 de la hoja Grupos.',
        details: [],
        grupos: [],
      };
    }
  }

  if (lastRow < 2) {
    return { ok: true, grupos: [], details: [] };
  }

  var values = sheet.getRange(2, 1, lastRow - 1, 4).getDisplayValues();
  var grupos = [];
  var details = [];
  var seenIds = {};
  var seenNames = {};

  for (var i = 0; i < values.length; i++) {
    var rowNumber = i + 2;
    var id = String(values[i][0] || '').trim();
    var nombre = String(values[i][1] || '').trim();
    var colorRaw = String(values[i][2] || '').trim();
    var activoRaw = values[i][3];

    if (!id && !nombre && !colorRaw && !String(activoRaw || '').trim()) {
      continue;
    }

    if (!id || !nombre) {
      details.push({
        row: rowNumber,
        id: id || null,
        error: 'La fila debe tener ID y Nombre.',
      });
      continue;
    }

    if (seenIds[id]) {
      details.push({
        row: rowNumber,
        id: id,
        error: 'ID duplicado (también en fila ' + seenIds[id] + ').',
      });
      continue;
    }
    seenIds[id] = rowNumber;

    var nombreKey = normalizeGrupoNombreKey_(nombre);
    if (seenNames[nombreKey]) {
      details.push({
        row: rowNumber,
        id: id,
        error: 'Nombre duplicado "' + nombre + '" (también en fila ' + seenNames[nombreKey] + ').',
      });
      continue;
    }
    seenNames[nombreKey] = rowNumber;

    var color = normalizeGrupoColor_(colorRaw);
    if (!color) {
      details.push({
        row: rowNumber,
        id: id,
        error: 'Color inválido "' + colorRaw + '". Usá formato #RRGGBB.',
      });
      continue;
    }

    if (!String(activoRaw || '').trim()) {
      details.push({
        row: rowNumber,
        id: id,
        error: 'Activo es obligatorio (Sí/No).',
      });
      continue;
    }

    grupos.push({
      row: rowNumber,
      id: id,
      nombre: nombre,
      color: color,
      activo: isActivo_(activoRaw),
    });
  }

  if (options.validate && details.length) {
    return {
      ok: false,
      error: 'El catálogo Grupos no es válido.',
      message:
        'Se encontraron ' + details.length + ' problema(s) en la hoja Grupos.',
      details: details,
      grupos: [],
    };
  }

  if (options.onlyActive) {
    grupos = grupos.filter(function (grupo) {
      return grupo.activo === true;
    });
  }

  return { ok: true, grupos: grupos, details: details };
}

function grupoToPublic_(grupo) {
  return {
    id: String(grupo.id || ''),
    nombre: String(grupo.nombre || ''),
    color: String(grupo.color || ''),
    activo: grupo.activo === true,
  };
}

function normalizeGrupoColor_(raw) {
  var value = String(raw || '').trim();
  if (!GRUPO_COLOR_REGEX_.test(value)) return null;
  return value.toUpperCase();
}

function normalizeGrupoNombreKey_(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function findGrupoById_(grupos, id) {
  var target = String(id || '').trim();
  if (!target) return null;
  for (var i = 0; i < grupos.length; i++) {
    if (String(grupos[i].id) === target) return grupos[i];
  }
  return null;
}

function findGrupoByNombre_(grupos, nombre) {
  var key = normalizeGrupoNombreKey_(nombre);
  if (!key) return null;
  for (var i = 0; i < grupos.length; i++) {
    if (normalizeGrupoNombreKey_(grupos[i].nombre) === key) return grupos[i];
  }
  return null;
}

/** SheetKey de trabajo del período: "Grupo " + ID (spec). No renombra hojas existentes. */
function sheetKeyForGrupoId_(grupoId) {
  var id = String(grupoId || '').trim();
  if (!id) return null;
  return 'Grupo ' + id;
}

function listActiveGrupos_(spreadsheet) {
  return readGruposCatalog_(spreadsheet, { onlyActive: true, validate: true });
}

/** Lectura soft del catálogo para enriquecer respuestas sin fallar reports/personas. */
function getCatalogGruposSoft_(spreadsheet) {
  var catalog = readGruposCatalog_(spreadsheet, { validate: false });
  return catalog.grupos || [];
}

/**
 * Grupos operativos del período: Activo=Sí, ordenados por ID.
 * Cada target incluye SheetKey = "Grupo " + ID.
 */
function listOperationalGroupTargets_(spreadsheet) {
  var catalog = readGruposCatalog_(spreadsheet, { onlyActive: true, validate: true });
  if (!catalog.ok) {
    return {
      ok: false,
      error: catalog.error || 'Catálogo Grupos inválido.',
      message: catalog.message || 'No se pudo leer el catálogo de grupos activos.',
      details: catalog.details || [],
      targets: [],
    };
  }

  var targets = catalog.grupos
    .slice()
    .sort(function (a, b) {
      return Number(a.id) - Number(b.id);
    })
    .map(function (grupo) {
      return {
        id: String(grupo.id),
        nombre: grupo.nombre,
        color: grupo.color,
        sheetKey: sheetKeyForGrupoId_(grupo.id),
      };
    });

  return { ok: true, targets: targets, grupos: catalog.grupos };
}

/**
 * Asegura la pestaña de trabajo SheetKey. No regenera filas (eso lo hace regenerateGroupSheet_).
 */
function ensureGroupWorkSheet_(spreadsheet, sheetKey) {
  var key = String(sheetKey || '').trim();
  if (!key) {
    return {
      ok: false,
      error: 'SheetKey vacío.',
      message: 'No se puede crear una hoja de grupo sin SheetKey.',
      sheet: null,
      created: false,
    };
  }

  var sheet = spreadsheet.getSheetByName(key);
  if (sheet) {
    return { ok: true, sheet: sheet, created: false };
  }

  try {
    sheet = spreadsheet.insertSheet(key);
    sheet.getRange(5, 1, 1, 6).setValues([
      ['ID', 'Nombre', 'Privilegio', 'Horas', 'Estudios', 'Comentarios'],
    ]);
    return { ok: true, sheet: sheet, created: true };
  } catch (error) {
    return {
      ok: false,
      error: 'No se pudo crear la hoja ' + key + '.',
      message: String(error.message || error),
      sheet: null,
      created: false,
    };
  }
}

/**
 * Resuelve una referencia de grupo (ID, nombre o SheetKey "Grupo {ID}")
 * contra el catálogo. No escribe nada.
 */
function resolveGrupoRef_(catalogGrupos, raw) {
  var value = String(raw || '').trim();
  if (!value || !catalogGrupos || !catalogGrupos.length) return null;

  var byId = findGrupoById_(catalogGrupos, value);
  if (byId) return byId;

  var byName = findGrupoByNombre_(catalogGrupos, value);
  if (byName) return byName;

  var sheetKeyMatch = value.match(/^grupo\s*(\d+)$/i);
  if (sheetKeyMatch) {
    byId = findGrupoById_(catalogGrupos, sheetKeyMatch[1]);
    if (byId) return byId;
  }

  return null;
}

function json_(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}
