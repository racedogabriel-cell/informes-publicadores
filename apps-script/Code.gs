/**
 * Conector Apps Script para "Informes de publicadores".
 * Instalación: en la planilla, Extensiones > Apps Script y pegar este archivo.
 *
 * doGet  — lectura consolidada (?action=reports)
 * doPost — recepción de lote del Portal Encargados (fase dry-run: NO escribe Sheets)
 */
const SPREADSHEET_ID = '1BcZ31qor91cGlrtRSEO6XsZDFiSVtP4PCZ5F910xoBs';
const GROUP_SHEETS = ['Grupo 1', 'Grupo 2'];
const SAVE_ACTION = 'saveGroup';
const DRY_RUN_MODE = 'dryRun';

function doGet(event) {
  const action = event && event.parameter && event.parameter.action;
  if (action !== 'reports') return json_({ error: 'Acción no válida. Usá ?action=reports' });
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  return json_({ generatedAt: new Date().toISOString(), groups: GROUP_SHEETS.map(name => readGroup_(spreadsheet.getSheetByName(name), name)) });
}

/**
 * Fase de prueba: valida estructura del payload y confirma recepción.
 * No abre la planilla. No escribe celdas.
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

  // nombre no forma parte del contrato de escritura; si viene, se ignora (no se valida como editable).
  return null;
}

function readGroup_(sheet, groupName) {
  if (!sheet) throw new Error('No existe la pestaña ' + groupName);
  const period = sheet.getRange('B3').getDisplayValue();
  const lastRow = sheet.getLastRow();
  const rows = lastRow >= 7 ? sheet.getRange(7, 1, lastRow - 6, 6).getDisplayValues() : [];
  return { grupo: groupName, mes: period, informes: rows.filter(row => row[0] && row[1]).map(row => ({ id: row[0], nombre: row[1], privilegio: row[2], horas: row[3], estudios: row[4], comentarios: row[5] })) };
}

function json_(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}
