/**
 * Carga puntual de contacto/emergencia en hoja Personas.
 *
 * NO forma parte de la PWA ni de doGet/doPost.
 * NO modifica openPeriod / closePeriod.
 * NO modifica hojas de trabajo del período, Historial ni Sistema.
 *
 * Ejecutar manualmente:
 *   1. simularCargaContactosPersonas
 *   2. cargarContactosPersonas
 *
 * Requiere Migration.gs en el mismo proyecto (writeMigrationReportSheet_).
 */
var PERSONAS_CONTACT_HEADERS = [
  'NumeroContacto',
  'ContactoEmergencia',
  'NombreEmergencia',
  'RelacionEmergencia'
];

/**
 * Solo lectura: cruza la lista de contactos contra Personas sin escribir.
 */
function simularCargaContactosPersonas() {
  var spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  var report = runCargaContactosPersonas_(spreadsheet, { dryRun: true });
  writeMigrationReportSheet_(spreadsheet, report);
  Logger.log(JSON.stringify(report, null, 2));
  return report;
}

/**
 * Escribe encabezados E-H si faltan y carga contacto/emergencia en:
 * - MATCH EXACTO de Nombre
 * - aliases aprobados manualmente (ver contactNameAliasesApproved_)
 * - altas aprobadas manualmente (ver contactApprovedAltas_)
 * No escribe NO ENCONTRADO ni posibles no aprobados.
 * No modifica hojas de trabajo del período, Historial ni Sistema (salvo alta en hoja Personas).
 */
function cargarContactosPersonas() {
  var spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  var report = runCargaContactosPersonas_(spreadsheet, { dryRun: false });
  writeMigrationReportSheet_(spreadsheet, report);
  Logger.log(JSON.stringify(report, null, 2));
  return report;
}

/**
 * Mapeo aprobado manualmente: nombre en lista de contactos -> Nombre exacto en padrón.
 * No es coincidencia aproximada automática.
 */
function contactNameAliasesApproved_() {
  return {
    'Altamiranda Rosa': 'Rosa Altamiranda',
    'Bonaguidi Carina': 'Bonaguidi Karina',
    'Farias Gladis': 'Farias Gladys',
    'Harnaud Nicolas': 'Harnaud Nicolás',
    'Hernandez Daniel': 'Hernández Daniel',
    'Hernandez Susana': 'Hernández Susana',
    'Ocarazca Jose': 'Ocaranza José',
    'Ocarazca Patricia': 'Ocaranza Patricia',
    'Reinoso Jesica': 'Jesica Reinoso',
    'Rosales Elisabet': 'Rosales Elizabeth',
    'Sola Angel': 'Sola Ángel',
  };
}

/**
 * Altas aprobadas manualmente cuando el nombre de la lista no existe en el padrón.
 * `grupo` debe ser GrupoID del catálogo (p. ej. "1"); corregible en Sheets si hace falta.
 */
function contactApprovedAltas_() {
  return {
    'Araya Julio': {
      nombre: 'Araya Julio',
      grupo: '1',
      activo: 'Sí',
    },
  };
}

function nextPersonasId_(padronRows) {
  var maxId = 0;
  for (var n = 0; n < padronRows.length; n++) {
    var num = Number(String(padronRows[n].id || '').trim());
    if (!isNaN(num) && num > maxId) maxId = num;
  }
  return String(maxId + 1);
}

function contactSourceRows_() {
  // Teléfonos como string literales. No normalizar espacios/guiones.
  return [
    ['Altamiranda Rosa', '2395 421459', '2314 497258', 'Nelida Carrizo', 'Hermana'],
    ['Araya Julio', '2395 421286', '', '', ''],
    ['Arraztoa Bernarda', '2395 471891', '', '', ''],
    ['Bonaguidi Adalberto', '2395 400583', '11 2755 0840', 'Rosa Remik', 'Amiga'],
    ['Bonaguidi Carina', '2396 415207', '9 336 440 9076', 'Analia Najar', 'Amiga'],
    ['Bonaguidi Mirta', '2395 400583', '11 2755 0840', 'Rosa Remik', 'Amiga'],
    ['Cinos Susana', '2396 512405', '1148 892107', 'Mario Amato', 'Primo'],
    ['Di Ferdinando Liana', '2954 570402', '2314 611929', 'Omar Di Ferdinando', 'Abuelo'],
    ['Di Ferdinando Miqueas', '2396 434876', '2314 611929', 'Omar Di Ferdinando', 'Abuelo'],
    ['Di Ferdinando Sergio', '2396 517076', '2314 611929', 'Omar Di Ferdinando', 'Papa'],
    ['Di Ferdinando Viviana', '2396 469917', '2314 611929', 'Omar Di Ferdinando', 'Suegro'],
    ['Diaz Alejandro', '2395 42-0373', '2396 51-6980', 'Ezequiel Hernandez', 'Primo'],
    ['Diaz Carlitos', '2395 40-1565', '2397 51-6980', 'Ezequiel Hernandez', 'Primo'],
    ['Diaz Carlos', '2395 40-1971', '2398 51-6980', 'Ezequiel Hernandez', 'Sobrino'],
    ['Diaz Laura', '2395 42-5086', '2399 51-6980', 'Ezequiel Hernandez', 'Sobrino'],
    ['Diaz Maria Rosa', '2396 400032', '2302 597434', 'Alberto Linsitto', 'Cuñado'],
    ['Diez Antonio', '2395 432015', '2345 666369', 'Carlos Y Liliana', 'Amigos'],
    ['Diez Claudia', '2395 432015', '2345 666369', 'Carlos Y Liliana', 'Amigos'],
    ['Ducco Lourdes', '2395 405639', '2342 532759', 'Rosa Ducco', 'Suegra'],
    ['Farias Gladis', '2396 419661', '2954 315396', 'Mario Faria', 'Hijo'],
    ['Farias Mario', '2396 419661', '2954 315396', 'Mario Faria', 'Hijo'],
    ['Gelabert Claudia', '2395 422059', '11 2755 0840', 'Rosa Remik', 'Amiga'],
    ['Gomez Alicia', '11 3260 5016', '11 6421 7819', 'Marta', 'Hermana'],
    ['Habitante Alfonsina', '', '11 2253-8644', 'Carolina Brandt', 'Tia'],
    ['Habitante Mirta', '2395 410066', '2396 516980', 'Ezequiel Hernandez', 'Sobrino'],
    ['Harnaud Antonela', '2396 420964', '2396 616057', 'Claudia Saez', 'Suegra'],
    ['Harnaud Nicolas', '2396 628777', '2396 616057', 'Claudia Saez', 'Mamá'],
    ['Hernandez Daniel', '2395 41-3283', '2396 51-6980', 'Ezequiel Hernandez', 'Hijo'],
    ['Hernandez Susana', '2395 42-5717', '2396 51-6980', 'Ezequiel Hernandez', 'Hijo'],
    ['Lopez Lorena', '2396 415893', '2396 430017', 'Amparo', 'Hermana'],
    ['Ocarazca Jose', '11 6965-2058', '9236 4587123', 'Walter', ''],
    ['Ocarazca Patricia', '2395 416831', '9236 4587123', 'Walter', ''],
    ['Perez Elsa', '2396 617252', '2345 666369', 'Carlos Y Liliana', 'Amigos'],
    ['Perez Roberto', '2396 421429', '2396 406462', 'Florencia Gori', 'Hermana'],
    ['Racedo Gabriel', '11 4980-7326', '11 2253-8644', 'Carolina Brandt', 'Hermana'],
    ['Racedo Selva', '11 5722-3102', '11 2236-1897', 'Marcela Racedo', 'Suegra'],
    ['Reinoso Jesica', '2314 468342', '', '', ''],
    ['Renatti Yolanda', '2396 510199', '2396 520274', 'Mercedes Cejas', 'Amiga'],
    ['Reyna Carina', '2396 417564', '2396 575657', 'Johanna Intile', 'Hija'],
    ['Reyna Jose', '2396 517446', '2396 575657', 'Johanna Intile', ''],
    ['Rosales Elisabet', '2396 611863', '2392 466100', 'Carmen', 'Abuela'],
    ['Rosales Joel', '2392 630621', '2392 466100', 'Carmen', 'Abuela'],
    ['Sola Angel', '2395 400881', '2392 602521', 'Pablo Sola', 'Hijo'],
    ['Sola Angela', '2395 402172', '2392 602521', 'Pablo Sola', 'HIjo'],
    ['Sola David', '', '2392 602521', 'Pablo Sola', 'Hermano'],
    ['Torres Miguel', '2396 51-0768', '11 3301-1227', 'Ismael Guassardo', 'Amigo'],
    ['Vega Olga', '2396 416146', '2314 503654', 'Emirna', 'Hermana'],
  ];
}

function normalizePersonNameKey_(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function sortedNameTokens_(key) {
  return key.split(' ').filter(Boolean).sort().join(' ');
}

function levenshtein_(a, b) {
  var s = String(a || '');
  var t = String(b || '');
  var n = s.length;
  var m = t.length;
  if (n === 0) return m;
  if (m === 0) return n;
  var prev = [];
  var curr = [];
  var i;
  var j;
  for (j = 0; j <= m; j++) prev[j] = j;
  for (i = 1; i <= n; i++) {
    curr[0] = i;
    for (j = 1; j <= m; j++) {
      var cost = s.charAt(i - 1) === t.charAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    prev = curr.slice();
  }
  return prev[m];
}

function findPossibleNameMatches_(fuenteNombre, padronRows) {
  var fuenteKey = normalizePersonNameKey_(fuenteNombre);
  var fuenteSorted = sortedNameTokens_(fuenteKey);
  var results = [];
  var seen = {};

  for (var i = 0; i < padronRows.length; i++) {
    var row = padronRows[i];
    var raw = row.nombre;
    if (raw === fuenteNombre) continue;
    var key = normalizePersonNameKey_(raw);
    var motivo = '';

    if (key === fuenteKey) {
      motivo = 'acentos/mayúsculas/espacios';
    } else if (sortedNameTokens_(key) === fuenteSorted && fuenteSorted) {
      motivo = 'mismo tokens, distinto orden';
    } else {
      var dist = levenshtein_(fuenteKey, key);
      // Solo diferencias mínimas de escritura (p. ej. Carina/Karina, Gladis/Gladys).
      if (dist > 0 && dist <= 2) {
        motivo = 'posible ortografía (distancia ' + dist + ')';
      }
    }

    if (!motivo) continue;
    if (seen[row.id]) continue;
    seen[row.id] = true;
    results.push({
      id: row.id,
      nombre: raw,
      row: row.row,
      motivo: motivo,
    });
  }
  return results;
}

function ensurePersonasContactHeaders_(sheet) {
  var lastCol = Math.max(sheet.getLastColumn(), 4);
  if (lastCol < 8) {
    sheet.getRange(1, 5, 1, 4).setValues([PERSONAS_CONTACT_HEADERS]);
  } else {
    var headers = sheet.getRange(1, 5, 1, 4).getDisplayValues()[0];
    var needWrite = false;
    for (var h = 0; h < 4; h++) {
      if (String(headers[h] || '').trim() !== PERSONAS_CONTACT_HEADERS[h]) {
        needWrite = true;
        break;
      }
    }
    if (needWrite) {
      sheet.getRange(1, 5, 1, 4).setValues([PERSONAS_CONTACT_HEADERS]);
    }
  }
  // Forzar texto en E-H para no convertir telefonos a numero.
  var lastRow = Math.max(sheet.getLastRow(), 2);
  sheet.getRange(2, 5, lastRow - 1, 4).setNumberFormat('@');
  sheet.getRange(1, 5, 1, 4).setNumberFormat('@');
}

function runCargaContactosPersonas_(spreadsheet, options) {
  var dryRun = options && options.dryRun === true;
  var startedAt = new Date().toISOString();
  var source = contactSourceRows_();

  var sheet = spreadsheet.getSheetByName(PERSONAS_SHEET);
  if (!sheet) {
    return {
      ok: false,
      utility: dryRun ? 'simularCargaContactosPersonas' : 'cargarContactosPersonas',
      dryRun: dryRun,
      startedAt: startedAt,
      finishedAt: new Date().toISOString(),
      message: 'No existe la hoja Personas. Ninguna fila fue modificada.',
      matchExactCount: 0,
      possibleMatchCount: 0,
      notFoundCount: source.length,
      padronSinContactoCount: 0,
      writtenCount: 0,
      matchExact: [],
      possibleMatch: [],
      notFound: source.map(function (row) {
        return row[0];
      }),
      padronSinContacto: [],
      errors: [{ type: 'missing_sheet', message: 'Falta la hoja Personas.' }],
    };
  }

  var lastRow = sheet.getLastRow();
  var padronRows = [];
  if (lastRow >= 2) {
    var values = sheet.getRange(2, 1, lastRow - 1, 4).getDisplayValues();
    for (var i = 0; i < values.length; i++) {
      var id = String(values[i][0] || '').trim();
      var nombre = String(values[i][1] || '').trim();
      var grupo = String(values[i][2] || '').trim();
      var activo = String(values[i][3] || '').trim();
      if (!id && !nombre && !grupo && !activo) continue;
      padronRows.push({
        row: i + 2,
        id: id,
        nombre: nombre,
        grupo: grupo,
        activo: activo,
      });
    }
  }

  var byExactName = {};
  for (var p = 0; p < padronRows.length; p++) {
    var person = padronRows[p];
    if (!byExactName[person.nombre]) byExactName[person.nombre] = [];
    byExactName[person.nombre].push(person);
  }

  var matchExact = [];
  var matchApproved = [];
  var approvedAltas = [];
  var possibleMatch = [];
  var notFound = [];
  var matchedIds = {};
  var errors = [];
  var aliases = contactNameAliasesApproved_();
  var altas = contactApprovedAltas_();

  for (var s = 0; s < source.length; s++) {
    var src = source[s];
    var fuenteNombre = String(src[0] || '').trim();
    var payload = {
      fuente: fuenteNombre,
      numeroContacto: String(src[1] == null ? '' : src[1]),
      contactoEmergencia: String(src[2] == null ? '' : src[2]),
      nombreEmergencia: String(src[3] == null ? '' : src[3]),
      relacionEmergencia: String(src[4] == null ? '' : src[4]),
    };

    var hits = byExactName[fuenteNombre] || [];
    var matchKind = 'exact';

    if (!hits.length && aliases[fuenteNombre]) {
      hits = byExactName[aliases[fuenteNombre]] || [];
      matchKind = 'approved_alias';
    }

    if (hits.length === 1) {
      var entry = {
        fuente: fuenteNombre,
        id: hits[0].id,
        nombrePadron: hits[0].nombre,
        row: hits[0].row,
        matchKind: matchKind,
        values: [
          payload.numeroContacto,
          payload.contactoEmergencia,
          payload.nombreEmergencia,
          payload.relacionEmergencia,
        ],
      };
      matchExact.push(entry);
      if (matchKind === 'approved_alias') matchApproved.push(entry);
      matchedIds[hits[0].id] = true;
      continue;
    }

    if (hits.length > 1) {
      errors.push({
        type: 'duplicate_name',
        message:
          'Nombre duplicado en padron para cruce: "' +
          fuenteNombre +
          '" -> "' +
          (aliases[fuenteNombre] || fuenteNombre) +
          '" (' +
          hits.length +
          ' filas). No se escribio.',
      });
      possibleMatch.push({
        fuente: fuenteNombre,
        candidato: hits
          .map(function (h) {
            return h.nombre + ' (id ' + h.id + ', fila ' + h.row + ')';
          })
          .join('; '),
        motivo: 'nombre duplicado en padrón',
      });
      continue;
    }

    if (altas[fuenteNombre]) {
      var altaDef = altas[fuenteNombre];
      var newId = nextPersonasId_(padronRows);
      var newRow = {
        id: newId,
        nombre: String(altaDef.nombre || fuenteNombre).trim(),
        grupo: String(altaDef.grupo || '').trim(),
        activo: String(altaDef.activo || 'Sí').trim(),
        values: [
          payload.numeroContacto,
          payload.contactoEmergencia,
          payload.nombreEmergencia,
          payload.relacionEmergencia,
        ],
        fuente: fuenteNombre,
      };

      var catalogGrupos = getCatalogGruposSoft_(spreadsheet);
      var resolvedGrupo = resolveGrupoRef_(catalogGrupos, newRow.grupo);
      if (!resolvedGrupo || !resolvedGrupo.activo) {
        errors.push({
          type: 'invalid_alta_grupo',
          message:
            'Alta aprobada "' +
            fuenteNombre +
            '" tiene Grupo inválido o inactivo: "' +
            newRow.grupo +
            '".',
        });
        notFound.push(fuenteNombre);
        continue;
      }
      newRow.grupo = String(resolvedGrupo.id);

      approvedAltas.push(newRow);
      // Reservar el ID en memoria para no reutilizarlo si hubiera más altas.
      padronRows.push({
        row: null,
        id: newRow.id,
        nombre: newRow.nombre,
        grupo: newRow.grupo,
        activo: newRow.activo,
      });
      if (!byExactName[newRow.nombre]) byExactName[newRow.nombre] = [];
      byExactName[newRow.nombre].push({
        row: null,
        id: newRow.id,
        nombre: newRow.nombre,
        grupo: newRow.grupo,
        activo: newRow.activo,
      });
      matchedIds[newRow.id] = true;
      continue;
    }

    var possibles = findPossibleNameMatches_(fuenteNombre, padronRows);
    if (possibles.length) {
      for (var q = 0; q < possibles.length; q++) {
        possibleMatch.push({
          fuente: fuenteNombre,
          candidato: possibles[q].nombre + ' (id ' + possibles[q].id + ', fila ' + possibles[q].row + ')',
          motivo: possibles[q].motivo,
        });
      }
    } else {
      notFound.push(fuenteNombre);
    }
  }

  var padronSinContacto = [];
  for (var r = 0; r < padronRows.length; r++) {
    if (!matchedIds[padronRows[r].id]) {
      padronSinContacto.push({
        id: padronRows[r].id,
        nombre: padronRows[r].nombre,
        row: padronRows[r].row,
      });
    }
  }

  var writtenCount = 0;
  var createdCount = 0;
  if (!dryRun) {
    ensurePersonasContactHeaders_(sheet);

    for (var a = 0; a < approvedAltas.length; a++) {
      var alta = approvedAltas[a];
      var appendRow = sheet.getLastRow() + 1;
      sheet.getRange(appendRow, 1, 1, 8).setNumberFormat('@');
      sheet.getRange(appendRow, 1, 1, 8).setValues([
        [
          alta.id,
          alta.nombre,
          alta.grupo,
          alta.activo,
          alta.values[0],
          alta.values[1],
          alta.values[2],
          alta.values[3],
        ],
      ]);
      alta.row = appendRow;
      createdCount++;
      writtenCount++;
    }

    for (var w = 0; w < matchExact.length; w++) {
      var item = matchExact[w];
      sheet.getRange(item.row, 5, 1, 4).setNumberFormat('@');
      sheet.getRange(item.row, 5, 1, 4).setValues([item.values]);
      writtenCount++;
    }
  }

  return {
    ok: errors.length === 0,
    utility: dryRun ? 'simularCargaContactosPersonas' : 'cargarContactosPersonas',
    dryRun: dryRun,
    startedAt: startedAt,
    finishedAt: new Date().toISOString(),
    message: dryRun
      ? 'Simulación terminada. Personas no fue escrita. Incluye exactos, aliases y altas aprobadas.'
      : 'Carga terminada. Actualizadas ' +
        (writtenCount - createdCount) +
        ' filas y creadas ' +
        createdCount +
        ' altas aprobadas en Personas.',
    matchExactCount: matchExact.length,
    matchApprovedCount: matchApproved.length,
    approvedAltaCount: approvedAltas.length,
    possibleMatchCount: possibleMatch.length,
    notFoundCount: notFound.length,
    padronSinContactoCount: padronSinContacto.length,
    writtenCount: writtenCount,
    createdCount: createdCount,
    sourceCount: source.length,
    matchExact: matchExact.map(function (m) {
      return {
        fuente: m.fuente,
        id: m.id,
        nombrePadron: m.nombrePadron,
        row: m.row,
        matchKind: m.matchKind || 'exact',
      };
    }),
    approvedAltas: approvedAltas.map(function (m) {
      return {
        fuente: m.fuente,
        id: m.id,
        nombre: m.nombre,
        grupo: m.grupo,
        activo: m.activo,
        row: m.row,
      };
    }),
    possibleMatch: possibleMatch,
    notFound: notFound,
    padronSinContacto: padronSinContacto,
    errors: errors,
  };
}
