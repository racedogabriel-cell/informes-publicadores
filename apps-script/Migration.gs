/**
 * Utilidades de migración ÚNICAS (primera instalación).
 *
 * NO forman parte de la PWA ni de doGet/doPost.
 * NO modifican openPeriod / closePeriod.
 * Ejecutar manualmente desde el editor de Apps Script (una sola vez cada una).
 *
 * Funciones:
 *   - migrarPersonasDesdeGrupos / simularMigracionPersonasDesdeGrupos
 *   - initializeSystem / simularInitializeSystem
 *
 * Cómo ejecutar (ejemplo initializeSystem):
 * 1. Extensiones → Apps Script en la planilla.
 * 2. Creá/actualizá el archivo "Migration.gs" con este contenido.
 * 3. Guardá el proyecto (junto a Code.gs).
 * 4. En el selector de funciones elegí: initializeSystem
 * 5. Pulsá Ejecutar ▶ (autorizá si lo pide).
 * 6. Revisá Ver → Registros de ejecución (o la hoja Migracion_Informe).
 *
 * No modifica Grupo 1, Grupo 2, Historial ni Personas.
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

/**
 * Primera instalación: adopta la planilla existente como período ABIERTO inicial.
 * Solo escribe la hoja Sistema. No regenera grupos ni toca Historial/Personas.
 */
function initializeSystem() {
  var spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  var report = runInitializeSystem_(spreadsheet);
  writeMigrationReportSheet_(spreadsheet, report);
  Logger.log(JSON.stringify(report, null, 2));
  return report;
}

/**
 * Simula initializeSystem sin escribir Sistema.
 */
function simularInitializeSystem() {
  var spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  var report = runInitializeSystem_(spreadsheet, { dryRun: true });
  writeMigrationReportSheet_(spreadsheet, report);
  Logger.log(JSON.stringify(report, null, 2));
  return report;
}

function runInitializeSystem_(spreadsheet, options) {
  var dryRun = options && options.dryRun === true;
  var startedAt = new Date().toISOString();
  var errors = [];

  var sistemaSheet = spreadsheet.getSheetByName(SISTEMA_SHEET);
  if (sistemaSheet) {
    var existing = readSistemaMap_(sistemaSheet);
    var periodoRegistrado = String(existing.PeriodoActivo || '').trim();
    if (periodoRegistrado) {
      return {
        ok: false,
        utility: 'initializeSystem',
        dryRun: dryRun,
        startedAt: startedAt,
        finishedAt: new Date().toISOString(),
        PeriodoActivo: periodoRegistrado,
        EstadoPeriodo: existing.EstadoPeriodo || '',
        message:
          'Sistema ya tiene un período registrado (' +
          periodoRegistrado +
          '). initializeSystem es de una sola vez y no se volvió a ejecutar. Ninguna hoja fue modificada.',
        errors: [
          {
            type: 'sistema_already_initialized',
            message: 'PeriodoActivo ya definido: ' + periodoRegistrado,
          },
        ],
      };
    }
  }

  var b3ByGroup = {};
  for (var g = 0; g < GROUP_SHEETS.length; g++) {
    var groupName = GROUP_SHEETS[g];
    var groupSheet = spreadsheet.getSheetByName(groupName);
    if (!groupSheet) {
      errors.push({
        type: 'missing_sheet',
        grupo: groupName,
        message: 'No existe la hoja ' + groupName + '.',
      });
      continue;
    }
    b3ByGroup[groupName] = String(groupSheet.getRange('B3').getDisplayValue() || '').trim();
  }

  if (errors.length) {
    return buildInitializeFailure_(dryRun, startedAt, b3ByGroup, errors, 'Faltan hojas de grupo. Ninguna hoja fue modificada.');
  }

  var b3Grupo1 = b3ByGroup['Grupo 1'];
  var b3Grupo2 = b3ByGroup['Grupo 2'];

  if (!b3Grupo1 || !b3Grupo2) {
    if (!b3Grupo1) {
      errors.push({
        type: 'empty_b3',
        grupo: 'Grupo 1',
        message: 'Grupo 1!B3 está vacío.',
      });
    }
    if (!b3Grupo2) {
      errors.push({
        type: 'empty_b3',
        grupo: 'Grupo 2',
        message: 'Grupo 2!B3 está vacío.',
      });
    }
    return buildInitializeFailure_(
      dryRun,
      startedAt,
      b3ByGroup,
      errors,
      'B3 incompleto en los grupos. Ninguna hoja fue modificada.'
    );
  }

  if (b3Grupo1 !== b3Grupo2) {
    errors.push({
      type: 'inconsistent_period',
      message:
        'Grupo 1!B3="' +
        b3Grupo1 +
        '" y Grupo 2!B3="' +
        b3Grupo2 +
        '" no coinciden.',
    });
    return buildInitializeFailure_(
      dryRun,
      startedAt,
      b3ByGroup,
      errors,
      'Los grupos no tienen el mismo período en B3. Ninguna hoja fue modificada.'
    );
  }

  var periodoKey = parsePeriodLabelToKey_(b3Grupo1);
  if (!periodoKey) {
    errors.push({
      type: 'unparseable_period',
      message:
        'No se pudo interpretar B3="' +
        b3Grupo1 +
        '" como período (se espera "Julio 2026" o YYYY-MM).',
    });
    return buildInitializeFailure_(
      dryRun,
      startedAt,
      b3ByGroup,
      errors,
      'Período de B3 no reconocido. Ninguna hoja fue modificada.'
    );
  }

  var fechaApertura = new Date().toISOString();
  var createdSistema = false;

  if (!dryRun) {
    if (!sistemaSheet) {
      sistemaSheet = spreadsheet.insertSheet(SISTEMA_SHEET);
      createdSistema = true;
    }
    writeSistemaMap_(sistemaSheet, {
      PeriodoActivo: periodoKey,
      EstadoPeriodo: ESTADO_ABIERTO,
      FechaApertura: fechaApertura,
      FechaCierre: '',
      Version: SISTEMA_VERSION,
    });
  }

  return {
    ok: true,
    utility: 'initializeSystem',
    dryRun: dryRun,
    startedAt: startedAt,
    finishedAt: new Date().toISOString(),
    createdSistemaSheet: createdSistema,
    b3: b3ByGroup,
    PeriodoActivo: dryRun ? null : periodoKey,
    wouldSetPeriodoActivo: periodoKey,
    EstadoPeriodo: dryRun ? null : ESTADO_ABIERTO,
    FechaApertura: dryRun ? null : fechaApertura,
    Version: SISTEMA_VERSION,
    message: dryRun
      ? 'Simulación terminada. Sistema no fue escrita. Se adoptaría el período ' +
        periodoKey +
        ' (' +
        b3Grupo1 +
        ') como ABIERTO.'
      : 'Sistema inicializado. Período ' +
        periodoKey +
        ' (' +
        b3Grupo1 +
        ') adoptado como ABIERTO. Grupo 1, Grupo 2, Historial y Personas no fueron modificados.',
    errors: [],
  };
}

function buildInitializeFailure_(dryRun, startedAt, b3ByGroup, errors, message) {
  return {
    ok: false,
    utility: 'initializeSystem',
    dryRun: dryRun,
    startedAt: startedAt,
    finishedAt: new Date().toISOString(),
    b3: b3ByGroup || {},
    message: message,
    errors: errors || [],
  };
}

/**
 * Acepta YYYY-MM o etiqueta canónica "Julio 2026" (también "Julio de 2026").
 */
function parsePeriodLabelToKey_(raw) {
  var value = String(raw || '').trim();
  var asKey = normalizePeriodoKey_(value);
  if (asKey) return asKey;

  var match = value.match(/^([A-Za-záéíóúÁÉÍÓÚüÜñÑ]+)\s+(?:de\s+)?(\d{4})$/i);
  if (!match) return null;

  var monthName = String(match[1] || '').toLowerCase();
  var year = match[2];
  var months = {
    enero: '01',
    febrero: '02',
    marzo: '03',
    abril: '04',
    mayo: '05',
    junio: '06',
    julio: '07',
    agosto: '08',
    septiembre: '09',
    setiembre: '09',
    octubre: '10',
    noviembre: '11',
    diciembre: '12',
  };
  var month = months[monthName];
  if (!month) return null;
  return normalizePeriodoKey_(year + '-' + month);
}

function writeMigrationReportSheet_(spreadsheet, report) {
  var sheet = spreadsheet.getSheetByName(MIGRATION_REPORT_SHEET);
  if (!sheet) sheet = spreadsheet.insertSheet(MIGRATION_REPORT_SHEET);
  sheet.clearContents();

  var lines = [];
  lines.push(['Campo', 'Valor']);
  lines.push(['utility', report.utility || 'migrarPersonasDesdeGrupos']);
  lines.push(['ok', String(report.ok)]);
  lines.push(['dryRun', String(report.dryRun)]);
  lines.push(['mensaje', report.message || '']);
  lines.push(['PeriodoActivo', report.PeriodoActivo != null ? report.PeriodoActivo : '']);
  lines.push([
    'wouldSetPeriodoActivo',
    report.wouldSetPeriodoActivo != null ? report.wouldSetPeriodoActivo : '',
  ]);
  lines.push(['EstadoPeriodo', report.EstadoPeriodo != null ? report.EstadoPeriodo : '']);
  lines.push(['FechaApertura', report.FechaApertura != null ? report.FechaApertura : '']);
  lines.push(['Version', report.Version != null ? report.Version : '']);
  lines.push(['importadas', report.imported != null ? report.imported : '']);
  lines.push(['habrianImportado', report.wouldImport != null ? report.wouldImport : '']);
  lines.push(['omitidas', report.omitted != null ? report.omitted : '']);
  lines.push(['inicio', report.startedAt || '']);
  lines.push(['fin', report.finishedAt || '']);

  if (report.b3) {
    lines.push(['B3 Grupo 1', report.b3['Grupo 1'] || '']);
    lines.push(['B3 Grupo 2', report.b3['Grupo 2'] || '']);
  }

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
