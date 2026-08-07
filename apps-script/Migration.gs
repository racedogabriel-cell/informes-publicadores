/**
 * Utilidad de migración ÚNICA — planilla → hoja Personas.
 *
 * NO forma parte de la PWA ni de doGet/doPost.
 * Ejecutar manualmente desde el editor de Apps Script (una sola vez).
 *
 * Cómo ejecutar:
 * 1. Extensiones → Apps Script en la planilla.
 * 2. Creá un archivo nuevo "Migration.gs" y pegá este contenido (o reemplazá si ya existe).
 * 3. Guardá el proyecto.
 * 4. En el selector de funciones elegí: migrarPersonasDesdeGrupos
 * 5. Pulsá Ejecutar ▶ (autorizá si lo pide).
 * 6. Revisá Ver → Registros de ejecución (o la hoja Migracion_Informe).
 *
 * No modifica Grupo 1 ni Grupo 2.
 */
var MIGRATION_PERSONAS_HEADERS = ['ID', 'Nombre', 'Grupo', 'Activo'];
var MIGRATION_REPORT_SHEET = 'Migracion_Informe';

/**
 * Punto de entrada manual. Ejecutar desde el editor de Apps Script.
 */
function migrarPersonasDesdeGrupos() {
  var spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  var report = runPersonasMigration_(spreadsheet);
  writeMigrationReportSheet_(spreadsheet, report);
  Logger.log(JSON.stringify(report, null, 2));
  return report;
}

/**
 * Solo lectura: simula la migración sin escribir Personas.
 * Útil para revisar errores antes de la corrida real.
 */
function simularMigracionPersonasDesdeGrupos() {
  var spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  var report = runPersonasMigration_(spreadsheet, { dryRun: true });
  writeMigrationReportSheet_(spreadsheet, report);
  Logger.log(JSON.stringify(report, null, 2));
  return report;
}

function runPersonasMigration_(spreadsheet, options) {
  var dryRun = options && options.dryRun === true;
  var startedAt = new Date().toISOString();

  var personasSheet = spreadsheet.getSheetByName(PERSONAS_SHEET);
  var createdPersonas = false;

  if (!personasSheet) {
    if (!dryRun) {
      personasSheet = spreadsheet.insertSheet(PERSONAS_SHEET);
      personasSheet.getRange(1, 1, 1, MIGRATION_PERSONAS_HEADERS.length).setValues([MIGRATION_PERSONAS_HEADERS]);
      createdPersonas = true;
    }
  } else if (personasSheet.getLastRow() >= 2) {
    return {
      ok: false,
      dryRun: dryRun,
      startedAt: startedAt,
      finishedAt: new Date().toISOString(),
      message:
        'La hoja Personas ya tiene datos. La migración es de una sola vez y no se volvió a ejecutar. Ninguna fila fue modificada.',
      imported: 0,
      omitted: 0,
      duplicates: [],
      errors: [],
      omittedRows: [],
    };
  } else if (!dryRun && personasSheet.getLastRow() < 1) {
    personasSheet.getRange(1, 1, 1, MIGRATION_PERSONAS_HEADERS.length).setValues([MIGRATION_PERSONAS_HEADERS]);
  }

  var collected = [];
  var errors = [];
  var omittedRows = [];
  var idFirstSeen = {};

  for (var g = 0; g < GROUP_SHEETS.length; g++) {
    var groupName = GROUP_SHEETS[g];
    var sheet = spreadsheet.getSheetByName(groupName);
    if (!sheet) {
      errors.push({
        type: 'missing_sheet',
        grupo: groupName,
        message: 'No existe la hoja ' + groupName + '.',
      });
      continue;
    }

    var lastRow = sheet.getLastRow();
    if (lastRow < 7) continue;

    var values = sheet.getRange(7, 1, lastRow - 6, 2).getDisplayValues();
    for (var i = 0; i < values.length; i++) {
      var rowNumber = 7 + i;
      var id = String(values[i][0] || '').trim();
      var nombre = String(values[i][1] || '').trim();

      if (!id && !nombre) continue;

      if (!id) {
        omittedRows.push({
          sheet: groupName,
          row: rowNumber,
          id: null,
          nombre: nombre || null,
          reason: 'ID vacío',
        });
        continue;
      }

      if (!nombre) {
        omittedRows.push({
          sheet: groupName,
          row: rowNumber,
          id: id,
          nombre: null,
          reason: 'Nombre vacío',
        });
        errors.push({
          type: 'empty_name',
          sheet: groupName,
          row: rowNumber,
          id: id,
          message: 'Nombre vacío en ' + groupName + ' fila ' + rowNumber + '.',
        });
        continue;
      }

      if (idFirstSeen[id]) {
        var first = idFirstSeen[id];
        var inconsistentGroup = first.grupo !== groupName;
        omittedRows.push({
          sheet: groupName,
          row: rowNumber,
          id: id,
          nombre: nombre,
          reason: inconsistentGroup
            ? 'ID duplicado en otro grupo (inconsistente)'
            : 'ID duplicado',
        });
        errors.push({
          type: inconsistentGroup ? 'inconsistent_group' : 'duplicate_id',
          id: id,
          first: first,
          duplicate: { sheet: groupName, row: rowNumber, nombre: nombre, grupo: groupName },
          message: inconsistentGroup
            ? 'ID ' + id + ' aparece en ' + first.grupo + ' y en ' + groupName + '.'
            : 'ID ' + id + ' duplicado en ' + groupName + ' (filas ' + first.row + ' y ' + rowNumber + ').',
        });
        continue;
      }

      idFirstSeen[id] = {
        sheet: groupName,
        row: rowNumber,
        nombre: nombre,
        grupo: groupName,
      };

      collected.push({
        id: id,
        nombre: nombre,
        grupo: groupName,
        activo: 'Sí',
        sourceSheet: groupName,
        sourceRow: rowNumber,
      });
    }
  }

  // Detectar mismo nombre con IDs distintos (aviso, no omite).
  var nameToIds = {};
  for (var c = 0; c < collected.length; c++) {
    var key = collected[c].nombre.toLowerCase();
    if (!nameToIds[key]) nameToIds[key] = [];
    nameToIds[key].push(collected[c].id);
  }
  var nameWarnings = [];
  Object.keys(nameToIds).forEach(function (nameKey) {
    var ids = nameToIds[nameKey];
    var unique = [];
    for (var u = 0; u < ids.length; u++) {
      if (unique.indexOf(ids[u]) === -1) unique.push(ids[u]);
    }
    if (unique.length > 1) {
      nameWarnings.push({
        type: 'same_name_different_ids',
        nombre: collected.find(function (p) {
          return p.nombre.toLowerCase() === nameKey;
        }).nombre,
        ids: unique,
        message: 'El nombre aparece con distintos IDs: ' + unique.join(', '),
      });
    }
  });

  var duplicates = errors.filter(function (item) {
    return item.type === 'duplicate_id' || item.type === 'inconsistent_group';
  });

  if (!dryRun && collected.length) {
    var rows = collected.map(function (person) {
      return [person.id, person.nombre, person.grupo, person.activo];
    });
    var target = spreadsheet.getSheetByName(PERSONAS_SHEET);
    target.getRange(2, 1, rows.length, MIGRATION_PERSONAS_HEADERS.length).setValues(rows);
  }

  return {
    ok: true,
    dryRun: dryRun,
    startedAt: startedAt,
    finishedAt: new Date().toISOString(),
    createdPersonasSheet: createdPersonas,
    imported: dryRun ? 0 : collected.length,
    wouldImport: collected.length,
    omitted: omittedRows.length,
    duplicates: duplicates,
    errors: errors.concat(nameWarnings),
    omittedRows: omittedRows,
    message: dryRun
      ? 'Simulación terminada. Personas no fue escrita. Revisá el informe.'
      : 'Migración terminada. Se importaron ' +
        collected.length +
        ' persona(s) a Personas. Grupo 1 y Grupo 2 no fueron modificados.',
  };
}

function writeMigrationReportSheet_(spreadsheet, report) {
  var sheet = spreadsheet.getSheetByName(MIGRATION_REPORT_SHEET);
  if (!sheet) sheet = spreadsheet.insertSheet(MIGRATION_REPORT_SHEET);
  sheet.clearContents();

  var lines = [];
  lines.push(['Campo', 'Valor']);
  lines.push(['ok', String(report.ok)]);
  lines.push(['dryRun', String(report.dryRun)]);
  lines.push(['mensaje', report.message || '']);
  lines.push(['importadas', report.imported != null ? report.imported : '']);
  lines.push(['habrianImportado', report.wouldImport != null ? report.wouldImport : '']);
  lines.push(['omitidas', report.omitted != null ? report.omitted : '']);
  lines.push(['inicio', report.startedAt || '']);
  lines.push(['fin', report.finishedAt || '']);
  lines.push(['', '']);
  lines.push(['--- Errores / avisos ---', '']);
  lines.push(['tipo', 'detalle']);

  var errList = report.errors || [];
  for (var e = 0; e < errList.length; e++) {
    lines.push([errList[e].type || '', errList[e].message || JSON.stringify(errList[e])]);
  }

  lines.push(['', '']);
  lines.push(['--- Filas omitidas ---', '']);
  lines.push(['hoja', 'fila', 'id', 'nombre', 'motivo']);
  var omitted = report.omittedRows || [];
  for (var o = 0; o < omitted.length; o++) {
    lines.push([
      omitted[o].sheet || '',
      omitted[o].row || '',
      omitted[o].id || '',
      omitted[o].nombre || '',
      omitted[o].reason || '',
    ]);
  }

  var maxCols = 5;
  var normalized = lines.map(function (row) {
    var copy = row.slice();
    while (copy.length < maxCols) copy.push('');
    return copy.slice(0, maxCols);
  });
  sheet.getRange(1, 1, normalized.length, maxCols).setValues(normalized);
}
