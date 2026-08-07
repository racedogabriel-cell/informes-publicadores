/**
 * Conector Apps Script para "Informes de publicadores".
 * Instalación: Extensiones > Apps Script → pegar este archivo → nueva versión del deployment.
 *
 * doGet:
 *   ?action=reports
 *   ?action=system
 *   ?action=openPeriod&periodo=YYYY-MM
 * doPost:
 *   saveGroup (dry-run; sin escritura)
 */
const SPREADSHEET_ID = '1BcZ31qor91cGlrtRSEO6XsZDFiSVtP4PCZ5F910xoBs';
const GROUP_SHEETS = ['Grupo 1', 'Grupo 2'];
const PERSONAS_SHEET = 'Personas';
const SISTEMA_SHEET = 'Sistema';
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
    return json_({
      ok: false,
      error: 'Acción no válida.',
      message: 'Usá ?action=reports | ?action=system | ?action=openPeriod&periodo=YYYY-MM',
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
 * Idempotente: si ya hay período ABIERTO, no modifica nada.
 */
function openPeriod_(periodoRaw) {
  const periodo = normalizePeriodoKey_(periodoRaw);
  if (!periodo) {
    return {
      ok: false,
      error: 'Parámetro periodo inválido.',
      message: 'Indicá periodo=YYYY-MM (ejemplo: 2026-09).',
    };
  }

  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
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
      message: 'Creá la hoja Personas (ID, Nombre, Grupo, Activo) antes de abrir un período.',
    };
  }

  const activePeople = readActivePersonas_(personasSheet);
  const byGroup = {
    'Grupo 1': activePeople.filter(function (person) {
      return person.grupo === 'Grupo 1';
    }),
    'Grupo 2': activePeople.filter(function (person) {
      return person.grupo === 'Grupo 2';
    }),
  };

  const periodLabel = formatPeriodLabel_(periodo);
  const counts = {};

  for (var i = 0; i < GROUP_SHEETS.length; i++) {
    var groupName = GROUP_SHEETS[i];
    var sheet = spreadsheet.getSheetByName(groupName);
    if (!sheet) {
      return {
        ok: false,
        error: 'No existe la hoja ' + groupName + '.',
        message: 'La planilla debe contener las pestañas Grupo 1 y Grupo 2.',
      };
    }
    var people = byGroup[groupName];
    regenerateGroupSheet_(sheet, people, periodLabel);
    counts[groupName] = people.length;
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

function readActivePersonas_(sheet) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  var values = sheet.getRange(2, 1, lastRow - 1, 4).getDisplayValues();
  var people = [];

  for (var i = 0; i < values.length; i++) {
    var id = String(values[i][0] || '').trim();
    var nombre = String(values[i][1] || '').trim();
    var grupo = normalizeGrupo_(values[i][2]);
    var activo = isActivo_(values[i][3]);
    if (!id || !nombre || !activo || !grupo) continue;
    people.push({ id: id, nombre: nombre, grupo: grupo });
  }

  return people;
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
  var date = new Date(year, monthIndex, 1);
  var label = Utilities.formatDate(date, Session.getScriptTimeZone() || 'America/Argentina/Buenos_Aires', 'MMMM yyyy');
  // Utilities may return English depending on locale; force Spanish names.
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
 * Fase de prueba Encargados: valida estructura del payload y confirma recepción.
 * No escribe celdas.
 */
function doPost(event) {
  let payload;
  try {
    payload = parsePostPayload_(event);
  } catch (error) {
    return json_({
      ok: false,
      received: false,
      wroteToSheet: false,
      mode: DRY_RUN_MODE,
      error: String(error.message || error),
      message: 'No se pudo interpretar el cuerpo de la solicitud.',
    });
  }

  const validation = validateSaveGroupPayload_(payload);
  if (!validation.ok) {
    return json_({
      ok: false,
      received: false,
      wroteToSheet: false,
      mode: DRY_RUN_MODE,
      action: payload && payload.action,
      error: validation.error,
      errors: validation.errors || [],
      message: validation.error,
    });
  }

  const personas = payload.personas;
  return json_({
    ok: true,
    received: true,
    wroteToSheet: false,
    mode: DRY_RUN_MODE,
    action: SAVE_ACTION,
    grupo: payload.grupo,
    mes: payload.mes,
    counts: {
      received: personas.length,
      accepted: personas.length,
      rejected: 0,
    },
    errors: [],
    message: 'Lote recibido correctamente. No se modificó Google Sheets.',
  });
}

function parsePostPayload_(event) {
  if (!event || !event.postData || !event.postData.contents) {
    throw new Error('El cuerpo POST está vacío.');
  }
  const raw = String(event.postData.contents).trim();
  if (!raw) throw new Error('El cuerpo POST está vacío.');
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error('El cuerpo POST no es un JSON válido.');
  }
}

function validateSaveGroupPayload_(payload) {
  const errors = [];
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { ok: false, error: 'El payload debe ser un objeto JSON.', errors: errors };
  }

  if (payload.action !== SAVE_ACTION) {
    return { ok: false, error: 'Acción no válida. Se espera action=saveGroup.', errors: errors };
  }

  if (payload.mode !== DRY_RUN_MODE) {
    return {
      ok: false,
      error: 'En esta fase solo se admite mode=dryRun (sin escritura).',
      errors: errors,
    };
  }

  if (GROUP_SHEETS.indexOf(payload.grupo) === -1) {
    return { ok: false, error: 'grupo debe ser "Grupo 1" o "Grupo 2".', errors: errors };
  }

  if (typeof payload.mes !== 'string') {
    return { ok: false, error: 'mes debe ser un string (solo control).', errors: errors };
  }

  if (!Array.isArray(payload.personas)) {
    return { ok: false, error: 'personas debe ser un array.', errors: errors };
  }

  for (var i = 0; i < payload.personas.length; i++) {
    var person = payload.personas[i];
    var personError = validatePersonStructure_(person, i);
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
