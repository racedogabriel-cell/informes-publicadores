/**
 * Conector Apps Script para "Informes de publicadores".
 * Instalación: Extensiones > Apps Script → pegar este archivo → nueva versión del deployment.
 *
 * doGet:
 *   ?action=reports
 *   ?action=system
 *   ?action=openPeriod&periodo=YYYY-MM
 *   ?action=closePeriod
 * doPost:
 *   saveGroup (escritura real C–F por ID en período ABIERTO)
 */
const SPREADSHEET_ID = '1BcZ31qor91cGlrtRSEO6XsZDFiSVtP4PCZ5F910xoBs';
const GROUP_SHEETS = ['Grupo 1', 'Grupo 2'];
const PERSONAS_SHEET = 'Personas';
const SISTEMA_SHEET = 'Sistema';
const HISTORIAL_SHEET = 'Historial';
const HISTORIAL_HEADERS = [
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
const DRY_RUN_MODE = 'dryRun';
const ESTADO_ABIERTO = 'ABIERTO';
const ESTADO_CERRADO = 'CERRADO';
const SISTEMA_VERSION = '1';

function doGet(event) {
  const action = event && event.parameter && event.parameter.action;
  try {
    if (action === 'reports') {
      const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
      return json_({
        generatedAt: new Date().toISOString(),
        groups: GROUP_SHEETS.map(function (name) {
          return readGroup_(spreadsheet.getSheetByName(name), name);
        }),
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
    return json_({
      ok: false,
      error: 'Acción no válida.',
      message:
        'Usá ?action=reports | ?action=system | ?action=openPeriod&periodo=YYYY-MM | ?action=closePeriod',
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
 * Abre un período: regenera Grupo 1/2 desde Personas y actualiza Sistema.
 * Segura e idempotente: valida todo antes de escribir; LockService evita carreras.
 * Si ya hay período ABIERTO o quedan datos de un período anterior en las hojas de grupo,
 * no modifica ninguna hoja.
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

  const personasValidation = validatePersonasCatalog_(personasSheet);
  if (!personasValidation.ok) {
    return {
      ok: false,
      error: personasValidation.error,
      message: personasValidation.message + ' Ninguna hoja fue modificada.',
      details: personasValidation.details || [],
    };
  }

  const groupSheets = {};
  const formallyClosed =
    normalizeEstado_(state.EstadoPeriodo) === ESTADO_CERRADO &&
    String(state.FechaCierre || '').trim() !== '';

  for (var i = 0; i < GROUP_SHEETS.length; i++) {
    var groupName = GROUP_SHEETS[i];
    var sheet = spreadsheet.getSheetByName(groupName);
    if (!sheet) {
      return {
        ok: false,
        error: 'No existe la hoja ' + groupName + '.',
        message: 'La planilla debe contener las pestañas Grupo 1 y Grupo 2. Ninguna hoja fue modificada.',
      };
    }
    groupSheets[groupName] = sheet;

    // Tras cierre formal (Historial + FechaCierre), se permite regenerar al abrir el siguiente.
    if (!formallyClosed) {
      var prior = inspectGroupSheetPriorData_(sheet, groupName, periodLabel);
      if (prior.blocked) {
        return {
          ok: false,
          error: 'Hay datos de un período anterior en ' + groupName + '.',
          message:
            prior.message +
            ' No se regeneraron las hojas automáticamente. Cerrá el período anterior (o limpiá las hojas de grupo de forma controlada) antes de abrir uno nuevo. Ninguna hoja fue modificada.',
          grupo: groupName,
          periodoAnterior: prior.b3 || null,
          filasConDatos: prior.peopleCount,
        };
      }
    }
  }

  const activePeople = personasValidation.activePeople;
  const byGroup = {
    'Grupo 1': activePeople.filter(function (person) {
      return person.grupo === 'Grupo 1';
    }),
    'Grupo 2': activePeople.filter(function (person) {
      return person.grupo === 'Grupo 2';
    }),
  };

  // --- Fase 2: escrituras (solo si toda la validación pasó) ---

  const counts = {};
  for (var g = 0; g < GROUP_SHEETS.length; g++) {
    var name = GROUP_SHEETS[g];
    var people = byGroup[name];
    regenerateGroupSheet_(groupSheets[name], people, periodLabel);
    counts[name] = people.length;
  }

  writeSistemaOpen_(sistema, periodo);

  return {
    ok: true,
    periodo: periodo,
    label: periodLabel,
    estado: ESTADO_ABIERTO,
    grupos: counts,
    message: 'Período abierto correctamente.',
  };
}

/**
 * Valida el padrón completo antes de abrir.
 * Rechaza IDs duplicados y grupos distintos de Grupo 1 / Grupo 2.
 */
function validatePersonasCatalog_(sheet) {
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

    var grupo = normalizeGrupo_(grupoRaw);
    if (!grupo) {
      details.push({
        row: rowNumber,
        id: id,
        error: 'Grupo inválido "' + grupoRaw + '". Solo se admiten Grupo 1 y Grupo 2.',
      });
      continue;
    }

    if (isActivo_(activoRaw)) {
      activePeople.push({ id: id, nombre: nombre, grupo: grupo });
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
 * Cierra el período abierto: copia Grupo 1/2 a Historial y marca Sistema como CERRADO.
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

  const snapshot = [];
  const counts = { 'Grupo 1': 0, 'Grupo 2': 0 };

  for (var i = 0; i < GROUP_SHEETS.length; i++) {
    var groupName = GROUP_SHEETS[i];
    var sheet = spreadsheet.getSheetByName(groupName);
    if (!sheet) {
      return {
        ok: false,
        error: 'No existe la hoja ' + groupName + '.',
        message: 'No se puede cerrar sin las hojas de grupo. Ninguna hoja fue modificada.',
      };
    }

    var groupData = readGroup_(sheet, groupName);
    counts[groupName] = groupData.informes.length;
    for (var r = 0; r < groupData.informes.length; r++) {
      var row = groupData.informes[r];
      snapshot.push({
        periodo: periodo,
        grupo: groupName,
        id: String(row.id || ''),
        nombre: String(row.nombre || ''),
        privilegio: String(row.privilegio || ''),
        horas: String(row.horas || ''),
        estudios: String(row.estudios || ''),
        comentarios: String(row.comentarios || ''),
      });
    }
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

  if (sheet.getLastRow() < 1) {
    sheet.getRange(1, 1, 1, HISTORIAL_HEADERS.length).setValues([HISTORIAL_HEADERS]);
  }
  return sheet;
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
  var rows = snapshot.map(function (item) {
    return [
      item.periodo,
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

function normalizeGrupo_(raw) {
  var value = String(raw || '').trim();
  if (value === '1' || /^grupo\s*1$/i.test(value) || value === 'Grupo 1') return 'Grupo 1';
  if (value === '2' || /^grupo\s*2$/i.test(value) || value === 'Grupo 2') return 'Grupo 2';
  return null;
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
 * Guardado real del Portal Encargados: action=saveGroup.
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
    return json_(saveGroup_(event));
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
  var payload;
  try {
    payload = parsePostPayload_(event);
  } catch (error) {
    return {
      ok: false,
      wroteToSheet: false,
      action: SAVE_ACTION,
      error: String(error.message || error),
      message: 'No se pudo interpretar el cuerpo de la solicitud.',
      updated: [],
      errors: [],
    };
  }

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

  var spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sistema = getOrCreateSistemaSheet_(spreadsheet);
  var state = readSistemaMap_(sistema);

  if (!isEstadoAbierto_(state.EstadoPeriodo) || !String(state.PeriodoActivo || '').trim()) {
    return {
      ok: false,
      wroteToSheet: false,
      action: SAVE_ACTION,
      error: 'No hay un período abierto.',
      message:
        'No se puede guardar: Sistema debe tener PeriodoActivo y EstadoPeriodo=ABIERTO. Ninguna celda fue modificada.',
      periodo: state.PeriodoActivo || null,
      updated: [],
      errors: [],
    };
  }

  var periodoActivo = String(state.PeriodoActivo).trim();
  var payloadPeriodo = String(payload.periodo || '').trim();
  if (payloadPeriodo !== periodoActivo) {
    return {
      ok: false,
      wroteToSheet: false,
      action: SAVE_ACTION,
      error: 'El período del lote no coincide con Sistema.',
      message:
        'El Portal Encargados envió periodo="' +
        payloadPeriodo +
        '" pero Sistema.PeriodoActivo="' +
        periodoActivo +
        '". Recargá el grupo e intentá de nuevo. Ninguna celda fue modificada.',
      periodo: periodoActivo,
      updated: [],
      errors: [],
    };
  }

  var grupo = payload.grupo;
  var sheet = spreadsheet.getSheetByName(grupo);
  if (!sheet) {
    return {
      ok: false,
      wroteToSheet: false,
      action: SAVE_ACTION,
      error: 'No existe la hoja ' + grupo + '.',
      message: 'No se encontró la hoja del grupo. Ninguna celda fue modificada.',
      updated: [],
      errors: [],
    };
  }

  var idRowMap = buildIdRowMap_(sheet);
  var updated = [];
  var errors = [];
  var wroteAny = false;

  for (var i = 0; i < payload.personas.length; i++) {
    var person = payload.personas[i];
    var id = String(person.id).trim();
    var business = validatePersonBusiness_(person);

    if (!business.ok) {
      errors.push({ id: id, index: i, error: business.error });
      continue;
    }

    var row = idRowMap[id];
    if (!row) {
      errors.push({
        id: id,
        index: i,
        error: 'No se encontró el ID en la hoja ' + grupo + '.',
      });
      continue;
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
    wroteAny = true;
    updated.push({ id: id, row: row });
  }

  var received = payload.personas.length;
  var partial = errors.length > 0 && updated.length > 0;
  var allFailed = errors.length > 0 && updated.length === 0;

  return {
    ok: !allFailed || received === 0,
    wroteToSheet: wroteAny,
    action: SAVE_ACTION,
    grupo: grupo,
    periodo: state.PeriodoActivo,
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
      error: 'Horas de ' + privilegio + ' debe ser un valor numérico (se admite . o ,).',
    };
  }

  return {
    ok: true,
    values: {
      privilegio: privilegio,
      horas: horas.replace(',', '.'),
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
  var normalized = text.replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(normalized)) return false;
  return isFinite(Number(normalized));
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

  if (GROUP_SHEETS.indexOf(payload.grupo) === -1) {
    return { ok: false, error: 'grupo debe ser "Grupo 1" o "Grupo 2".', errors: errors };
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

function json_(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}
