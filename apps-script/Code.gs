/**
 * Conector de solo lectura para "Informes de publicadores".
 * Instalación: en la planilla, ir a Extensiones > Apps Script y pegar este archivo.
 */
const SPREADSHEET_ID = '1BcZ31qor91cGlrtRSEO6XsZDFiSVtP4PCZ5F910xoBs';
const GROUP_SHEETS = ['Grupo 1', 'Grupo 2'];

function doGet(event) {
  const action = event && event.parameter && event.parameter.action;
  if (action !== 'reports') return json_({ error: 'Acción no válida. Usá ?action=reports' });
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  return json_({ generatedAt: new Date().toISOString(), groups: GROUP_SHEETS.map(name => readGroup_(spreadsheet.getSheetByName(name), name)) });
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
