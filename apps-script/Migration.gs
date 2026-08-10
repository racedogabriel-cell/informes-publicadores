/**
 * Utilidades de migracion UNICAS (primera instalacion).
 *
 * NO forman parte de la PWA ni de doGet/doPost.
 * NO modifican openPeriod / closePeriod.
 * Ejecutar manualmente desde el editor de Apps Script.
 *
 * Funciones:
 *   - migrarPersonasDesdeGrupos / simularMigracionPersonasDesdeGrupos
 *   - initializeSystem / simularInitializeSystem
 *   - inicializarCatalogoGrupos / simularInicializarCatalogoGrupos  (Fase 1)
 *   - migrarPersonasGrupoAId / simularMigrarPersonasGrupoAId      (Fase 4)
 *
 * Contactos del padron: ver archivo ContactosPersonas.gs
 *   - simularCargaContactosPersonas / cargarContactosPersonas
 */
var MIGRATION_PERSONAS_HEADERS = [
  'ID',
  'Nombre',
  'Grupo',
  'Activo',
  'NumeroContacto',
  'ContactoEmergencia',
  'NombreEmergencia',
  'RelacionEmergencia',
];
var MIGRATION_REPORT_SHEET = 'Migracion_Informe';
var PERSONAS_BACKUP_FASE4_SHEET = 'Personas_Backup_Fase4';
var GRUPOS_CATALOG_SHEET = 'Grupos';
var GRUPOS_CATALOG_HEADERS = ['ID', 'Nombre', 'Color', 'Activo'];
/** Semilla aprobada (spec Catálogo de Grupos). IDs estables; no renombra hojas de trabajo. */
var GRUPOS_CATALOG_SEED = [
  ['1', 'Grupo 1', '#2B6B4F', 'Sí'],
  ['2', 'Grupo 2', '#2F5D8A', 'Sí'],
];
/**
 * Hojas de trabajo históricas usadas por migraciones one-shot (pre-catálogo).
 * No es la fuente runtime del sistema: el runtime usa SheetKey "Grupo {ID}".
 */
var LEGACY_WORK_SHEETS = ['Grupo 1', 'Grupo 2'];

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

  for (var g = 0; g < LEGACY_WORK_SHEETS.length; g++) {
    var groupName = LEGACY_WORK_SHEETS[g];
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
  for (var g = 0; g < LEGACY_WORK_SHEETS.length; g++) {
    var groupName = LEGACY_WORK_SHEETS[g];
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

/**
 * Fase 4 — Migrar Personas!C de nombre ("Grupo 1") a GrupoID ("1").
 * NO modifica openPeriod/closePeriod, Historial, Sistema ni hojas Grupo 1/Grupo 2.
 * Si hay algún grupo desconocido, aborta sin escribir.
 * Antes de escribir: copia el padrón a Personas_Backup_Fase4 (si aún no existe).
 */
function migrarPersonasGrupoAId() {
  var spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  var report = runMigrarPersonasGrupoAId_(spreadsheet, { dryRun: false });
  writeMigrationReportSheet_(spreadsheet, report);
  Logger.log(JSON.stringify(report, null, 2));
  return report;
}

function simularMigrarPersonasGrupoAId() {
  var spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  var report = runMigrarPersonasGrupoAId_(spreadsheet, { dryRun: true });
  writeMigrationReportSheet_(spreadsheet, report);
  Logger.log(JSON.stringify(report, null, 2));
  return report;
}

function runMigrarPersonasGrupoAId_(spreadsheet, options) {
  var dryRun = options && options.dryRun === true;
  var startedAt = new Date().toISOString();
  var errors = [];
  var changes = [];
  var alreadyId = 0;
  var wouldWrite = 0;

  var catalog = readGruposCatalog_(spreadsheet, { validate: true });
  if (!catalog.ok) {
    return {
      ok: false,
      dryRun: dryRun,
      utility: 'migrarPersonasGrupoAId',
      startedAt: startedAt,
      finishedAt: new Date().toISOString(),
      imported: 0,
      writtenCount: 0,
      errors: (catalog.details || []).concat([
        { type: 'catalog', message: catalog.message || catalog.error },
      ]),
      message: 'Catálogo Grupos inválido. Ninguna fila de Personas fue modificada.',
    };
  }

  var personasSheet = spreadsheet.getSheetByName(PERSONAS_SHEET);
  if (!personasSheet) {
    return {
      ok: false,
      dryRun: dryRun,
      utility: 'migrarPersonasGrupoAId',
      startedAt: startedAt,
      finishedAt: new Date().toISOString(),
      imported: 0,
      writtenCount: 0,
      errors: [{ type: 'missing_sheet', message: 'No existe la hoja Personas.' }],
      message: 'No existe Personas. Ninguna hoja fue modificada.',
    };
  }

  var lastRow = personasSheet.getLastRow();
  if (lastRow < 2) {
    return {
      ok: true,
      dryRun: dryRun,
      utility: 'migrarPersonasGrupoAId',
      startedAt: startedAt,
      finishedAt: new Date().toISOString(),
      imported: 0,
      writtenCount: 0,
      alreadyId: 0,
      changes: [],
      errors: [],
      message: 'Personas no tiene filas de datos. Nada que migrar.',
    };
  }

  var values = personasSheet.getRange(2, 1, lastRow - 1, 4).getDisplayValues();
  var updates = [];

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
      errors.push({
        type: 'incomplete_row',
        message: 'Fila ' + rowNumber + ': faltan ID o Nombre.',
      });
      continue;
    }

    if (!grupoRaw) {
      errors.push({
        type: 'missing_grupo',
        message: 'Fila ' + rowNumber + ' (ID ' + id + '): Grupo vacío.',
      });
      continue;
    }

    var resolved = resolveGrupoRef_(catalog.grupos, grupoRaw);
    if (!resolved) {
      errors.push({
        type: 'unknown_grupo',
        message:
          'Fila ' +
          rowNumber +
          ' (ID ' +
          id +
          ', "' +
          nombre +
          '"): grupo desconocido "' +
          grupoRaw +
          '". Migración abortada.',
      });
      continue;
    }

    var targetId = String(resolved.id);
    if (grupoRaw === targetId) {
      alreadyId++;
      continue;
    }

    wouldWrite++;
    updates.push({ row: rowNumber, id: id, nombre: nombre, from: grupoRaw, to: targetId });
    changes.push({
      sheet: PERSONAS_SHEET,
      row: rowNumber,
      id: id,
      nombre: nombre,
      reason: grupoRaw + ' → ' + targetId,
    });
  }

  if (errors.length) {
    return {
      ok: false,
      dryRun: dryRun,
      utility: 'migrarPersonasGrupoAId',
      startedAt: startedAt,
      finishedAt: new Date().toISOString(),
      imported: values.length,
      writtenCount: 0,
      wouldImport: wouldWrite,
      alreadyId: alreadyId,
      omittedRows: changes,
      errors: errors,
      message:
        'Se encontraron ' +
        errors.length +
        ' problema(s). No se escribió Personas ni backup.',
    };
  }

  if (dryRun) {
    return {
      ok: true,
      dryRun: true,
      utility: 'migrarPersonasGrupoAId',
      startedAt: startedAt,
      finishedAt: new Date().toISOString(),
      imported: alreadyId + wouldWrite,
      wouldImport: wouldWrite,
      alreadyId: alreadyId,
      writtenCount: 0,
      omittedRows: changes,
      errors: [],
      message:
        'Simulación OK. Se migrarían ' +
        wouldWrite +
        ' fila(s) a GrupoID. Ya en ID: ' +
        alreadyId +
        '. No se escribió nada.',
    };
  }

  if (!wouldWrite) {
    return {
      ok: true,
      dryRun: false,
      utility: 'migrarPersonasGrupoAId',
      startedAt: startedAt,
      finishedAt: new Date().toISOString(),
      imported: alreadyId,
      writtenCount: 0,
      alreadyId: alreadyId,
      omittedRows: [],
      errors: [],
      message: 'Personas!C ya está en GrupoID. No se modificó nada.',
    };
  }

  var backupCreated = ensurePersonasBackupFase4_(spreadsheet, personasSheet);
  if (backupCreated.error) {
    return {
      ok: false,
      dryRun: false,
      utility: 'migrarPersonasGrupoAId',
      startedAt: startedAt,
      finishedAt: new Date().toISOString(),
      imported: alreadyId + wouldWrite,
      writtenCount: 0,
      errors: [{ type: 'backup_failed', message: backupCreated.error }],
      message: 'No se pudo crear el backup. Personas no fue modificada.',
    };
  }

  for (var u = 0; u < updates.length; u++) {
    personasSheet.getRange(updates[u].row, 3).setNumberFormat('@');
    personasSheet.getRange(updates[u].row, 3).setValue(updates[u].to);
  }

  return {
    ok: true,
    dryRun: false,
    utility: 'migrarPersonasGrupoAId',
    startedAt: startedAt,
    finishedAt: new Date().toISOString(),
    imported: alreadyId + wouldWrite,
    writtenCount: wouldWrite,
    alreadyId: alreadyId,
    backupSheet: PERSONAS_BACKUP_FASE4_SHEET,
    backupCreated: backupCreated.created === true,
    omittedRows: changes,
    errors: [],
    message:
      'Migración OK. ' +
      wouldWrite +
      ' fila(s) actualizadas a GrupoID. Backup: ' +
      PERSONAS_BACKUP_FASE4_SHEET +
      '. Historial/Sistema/hojas de grupo no fueron modificados.',
  };
}

function ensurePersonasBackupFase4_(spreadsheet, personasSheet) {
  var existing = spreadsheet.getSheetByName(PERSONAS_BACKUP_FASE4_SHEET);
  if (existing) {
    return { created: false, error: null };
  }

  try {
    var backup = personasSheet.copyTo(spreadsheet);
    backup.setName(PERSONAS_BACKUP_FASE4_SHEET);
    return { created: true, error: null };
  } catch (error) {
    return { created: false, error: String(error.message || error) };
  }
}

/**
 * Fase 1 — Catálogo de Grupos.
 * Crea la hoja Grupos con semilla ID 1/2. No toca Code.gs ni doGet/doPost.
 * NO modifica Grupo 1, Grupo 2, Personas, Historial ni Sistema.
 * NO regenera el período abierto.
 */
function inicializarCatalogoGrupos() {
  var spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  var report = runInicializarCatalogoGrupos_(spreadsheet, { dryRun: false });
  writeMigrationReportSheet_(spreadsheet, report);
  Logger.log(JSON.stringify(report, null, 2));
  return report;
}

/**
 * Solo lectura / simulación de la Fase 1. No escribe la hoja Grupos.
 */
function simularInicializarCatalogoGrupos() {
  var spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  var report = runInicializarCatalogoGrupos_(spreadsheet, { dryRun: true });
  writeMigrationReportSheet_(spreadsheet, report);
  Logger.log(JSON.stringify(report, null, 2));
  return report;
}

function runInicializarCatalogoGrupos_(spreadsheet, options) {
  var dryRun = options && options.dryRun === true;
  var startedAt = new Date().toISOString();
  var errors = [];
  var workSheetNames = LEGACY_WORK_SHEETS.slice();
  var untouched = LEGACY_WORK_SHEETS.concat(['Personas', 'Historial', 'Sistema']);
  var existingWorkSheets = {};

  for (var w = 0; w < workSheetNames.length; w++) {
    var workName = workSheetNames[w];
    existingWorkSheets[workName] = !!spreadsheet.getSheetByName(workName);
    if (!existingWorkSheets[workName]) {
      errors.push({
        type: 'missing_work_sheet',
        message: 'No existe la hoja de trabajo "' + workName + '". No se creó el catálogo.',
      });
    }
  }

  var seedPreview = GRUPOS_CATALOG_SEED.map(function (row) {
    return { id: row[0], nombre: row[1], color: row[2], activo: row[3] };
  });

  if (errors.length) {
    return {
      ok: false,
      dryRun: dryRun,
      utility: 'inicializarCatalogoGrupos',
      startedAt: startedAt,
      finishedAt: new Date().toISOString(),
      createdSheet: false,
      wroteSeed: false,
      sheetName: GRUPOS_CATALOG_SHEET,
      seed: seedPreview,
      existingWorkSheets: existingWorkSheets,
      untouched: untouched,
      errors: errors,
      message:
        'Faltan hojas de trabajo del período. Ninguna hoja fue modificada.',
    };
  }

  var sheet = spreadsheet.getSheetByName(GRUPOS_CATALOG_SHEET);
  var createdSheet = false;

  if (sheet) {
    var lastRow = sheet.getLastRow();
    if (lastRow >= 2) {
      var existing = sheet.getRange(1, 1, lastRow, 4).getDisplayValues();
      var matchesSeed = catalogMatchesSeed_(existing);
      if (matchesSeed) {
        return {
          ok: true,
          dryRun: dryRun,
          utility: 'inicializarCatalogoGrupos',
          startedAt: startedAt,
          finishedAt: new Date().toISOString(),
          createdSheet: false,
          wroteSeed: false,
          alreadyPresent: true,
          sheetName: GRUPOS_CATALOG_SHEET,
          seed: seedPreview,
          rows: GRUPOS_CATALOG_SEED.length,
          existingWorkSheets: existingWorkSheets,
          untouched: untouched,
          errors: [],
          message:
            'La hoja Grupos ya existe con la semilla esperada (ID 1/2). No se modificó nada.',
        };
      }

      errors.push({
        type: 'grupos_already_has_data',
        message:
          'La hoja Grupos ya tiene datos distintos a la semilla. No se sobrescribió. Revisá manualmente.',
      });
      return {
        ok: false,
        dryRun: dryRun,
        utility: 'inicializarCatalogoGrupos',
        startedAt: startedAt,
        finishedAt: new Date().toISOString(),
        createdSheet: false,
        wroteSeed: false,
        sheetName: GRUPOS_CATALOG_SHEET,
        seed: seedPreview,
        existingWorkSheets: existingWorkSheets,
        untouched: untouched,
        errors: errors,
        message:
          'La hoja Grupos ya tiene datos. Operación one-shot abortada. Ninguna fila fue modificada.',
      };
    }
  }

  if (dryRun) {
    return {
      ok: true,
      dryRun: true,
      utility: 'inicializarCatalogoGrupos',
      startedAt: startedAt,
      finishedAt: new Date().toISOString(),
      createdSheet: false,
      wroteSeed: false,
      wouldCreateSheet: !sheet,
      wouldWriteSeed: true,
      sheetName: GRUPOS_CATALOG_SHEET,
      seed: seedPreview,
      rows: GRUPOS_CATALOG_SEED.length,
      existingWorkSheets: existingWorkSheets,
      untouched: untouched,
      errors: [],
      message:
        'Simulación OK. Se crearía/completaría la hoja Grupos con 2 filas semilla. No se escribió nada.',
    };
  }

  if (!sheet) {
    sheet = spreadsheet.insertSheet(GRUPOS_CATALOG_SHEET);
    createdSheet = true;
  }

  sheet.getRange(1, 1, 1, GRUPOS_CATALOG_HEADERS.length).setValues([GRUPOS_CATALOG_HEADERS]);
  sheet.getRange(2, 1, GRUPOS_CATALOG_SEED.length, 4).setNumberFormat('@');
  sheet.getRange(2, 1, GRUPOS_CATALOG_SEED.length, 4).setValues(GRUPOS_CATALOG_SEED);

  return {
    ok: true,
    dryRun: false,
    utility: 'inicializarCatalogoGrupos',
    startedAt: startedAt,
    finishedAt: new Date().toISOString(),
    createdSheet: createdSheet,
    wroteSeed: true,
    sheetName: GRUPOS_CATALOG_SHEET,
    seed: seedPreview,
    rows: GRUPOS_CATALOG_SEED.length,
    existingWorkSheets: existingWorkSheets,
    untouched: untouched,
    errors: [],
    message:
      (createdSheet ? 'Hoja Grupos creada. ' : 'Hoja Grupos completada. ') +
      'Semilla ID 1=Grupo 1, ID 2=Grupo 2. Hojas de trabajo, Personas, Historial y Sistema no fueron modificados.',
  };
}

function catalogMatchesSeed_(values) {
  if (!values || values.length < 1 + GRUPOS_CATALOG_SEED.length) return false;
  for (var h = 0; h < GRUPOS_CATALOG_HEADERS.length; h++) {
    if (String(values[0][h] || '').trim() !== GRUPOS_CATALOG_HEADERS[h]) return false;
  }
  for (var r = 0; r < GRUPOS_CATALOG_SEED.length; r++) {
    for (var c = 0; c < 4; c++) {
      if (String(values[r + 1][c] || '').trim() !== String(GRUPOS_CATALOG_SEED[r][c])) {
        return false;
      }
    }
  }
  // Si hay filas extra además de la semilla, no se considera match exacto.
  if (values.length > 1 + GRUPOS_CATALOG_SEED.length) {
    for (var extra = 1 + GRUPOS_CATALOG_SEED.length; extra < values.length; extra++) {
      var hasContent = false;
      for (var ec = 0; ec < 4; ec++) {
        if (String(values[extra][ec] || '').trim()) {
          hasContent = true;
          break;
        }
      }
      if (hasContent) return false;
    }
  }
  return true;
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
  lines.push(['matchExacto', report.matchExactCount != null ? report.matchExactCount : '']);
  lines.push([
    'matchAprobadoAlias',
    report.matchApprovedCount != null ? report.matchApprovedCount : '',
  ]);
  lines.push([
    'altasAprobadas',
    report.approvedAltaCount != null ? report.approvedAltaCount : '',
  ]);
  lines.push(['posibleMatch', report.possibleMatchCount != null ? report.possibleMatchCount : '']);
  lines.push(['noEncontrado', report.notFoundCount != null ? report.notFoundCount : '']);
  lines.push([
    'padronSinContacto',
    report.padronSinContactoCount != null ? report.padronSinContactoCount : '',
  ]);
  lines.push(['escritas', report.writtenCount != null ? report.writtenCount : '']);
  lines.push(['sheetName', report.sheetName != null ? report.sheetName : '']);
  lines.push(['createdSheet', report.createdSheet != null ? String(report.createdSheet) : '']);
  lines.push(['wroteSeed', report.wroteSeed != null ? String(report.wroteSeed) : '']);
  lines.push(['alreadyPresent', report.alreadyPresent != null ? String(report.alreadyPresent) : '']);
  lines.push(['rows', report.rows != null ? String(report.rows) : '']);
  lines.push(['writtenCount', report.writtenCount != null ? String(report.writtenCount) : '']);
  lines.push(['alreadyId', report.alreadyId != null ? String(report.alreadyId) : '']);
  lines.push(['backupSheet', report.backupSheet != null ? report.backupSheet : '']);
  lines.push(['backupCreated', report.backupCreated != null ? String(report.backupCreated) : '']);
  lines.push(['inicio', report.startedAt || '']);
  lines.push(['fin', report.finishedAt || '']);

  if (report.seed && report.seed.length) {
    lines.push(['', '']);
    lines.push(['--- Semilla Grupos ---', '']);
    lines.push(['id', 'nombre', 'color', 'activo']);
    for (var s = 0; s < report.seed.length; s++) {
      lines.push([
        report.seed[s].id || '',
        report.seed[s].nombre || '',
        report.seed[s].color || '',
        report.seed[s].activo || '',
      ]);
    }
  }

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

  if (report.matchExact || report.possibleMatch || report.notFound || report.padronSinContacto) {
    lines.push(['', '']);
    lines.push(['--- MATCH EXACTO / ALIAS APROBADO ---', '']);
    lines.push(['fuente', 'id', 'nombrePadron', 'fila', 'tipo']);
    var exact = report.matchExact || [];
    for (var x = 0; x < exact.length; x++) {
      lines.push([
        exact[x].fuente || '',
        exact[x].id || '',
        exact[x].nombrePadron || '',
        exact[x].row != null ? String(exact[x].row) : '',
        exact[x].matchKind || 'exact',
      ]);
    }

    lines.push(['', '']);
    lines.push(['--- ALTAS APROBADAS ---', '']);
    lines.push(['fuente', 'id', 'nombre', 'grupo', 'activo']);
    var altasReport = report.approvedAltas || [];
    for (var al = 0; al < altasReport.length; al++) {
      lines.push([
        altasReport[al].fuente || '',
        altasReport[al].id || '',
        altasReport[al].nombre || '',
        altasReport[al].grupo || '',
        altasReport[al].activo || '',
      ]);
    }

    lines.push(['', '']);
    lines.push(['--- POSIBLE MATCH (no escrito) ---', '']);
    lines.push(['fuente', 'candidato', 'motivo']);
    var possible = report.possibleMatch || [];
    for (var p = 0; p < possible.length; p++) {
      lines.push([
        possible[p].fuente || '',
        possible[p].candidato || '',
        possible[p].motivo || '',
      ]);
    }

    lines.push(['', '']);
    lines.push(['--- NO ENCONTRADO (no escrito) ---', '']);
    lines.push(['fuente', '', '']);
    var missing = report.notFound || [];
    for (var n = 0; n < missing.length; n++) {
      lines.push([missing[n], '', '']);
    }

    lines.push(['', '']);
    lines.push(['--- PADRÓN SIN DATOS DE CONTACTO ---', '']);
    lines.push(['id', 'nombre', 'fila']);
    var sin = report.padronSinContacto || [];
    for (var s = 0; s < sin.length; s++) {
      lines.push([
        sin[s].id || '',
        sin[s].nombre || '',
        sin[s].row != null ? String(sin[s].row) : '',
      ]);
    }
  }

  var maxCols = 5;
  var normalized = lines.map(function (row) {
    var copy = row.slice();
    while (copy.length < maxCols) copy.push('');
    return copy.slice(0, maxCols);
  });
  sheet.getRange(1, 1, normalized.length, maxCols).setValues(normalized);
}

