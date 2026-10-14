const SERVER_VERSION = 30;
const SHEET_NAME = "Hoja 1";
const SKU_SHEET_NAME = "Maestro SKU";
const SLOTTING_SHEET_NAME = "Zonas SKU";
const COUNT_SHEET_NAME = "Conteos Inventario";
const PRESENCE_SHEET_NAME = "Sesiones Activas";
const STAFF_SHEET_NAME = "Legajos";
const ACCESS_SHEET_NAME = "Claves de Acceso";
const COLUMNS = [
  "id_movimiento",
  "fecha_hora_utc",
  "fecha_local",
  "tipo",
  "sku",
  "posicion_origen",
  "posicion_destino",
  "cantidad",
  "delta_ocupacion",
  "permanencia_horas",
  "usuario",
  "estado",
  "actualizado_en",
  "unidad_logistica",
  "pallets",
  "bultos",
  "unidades",
  "contenido_json",
  "id_conteo",
  "motivo_ajuste",
  "contenido_anterior_json",
  "id_pallet",
];
const SKU_COLUMNS = ["sku","description","ean","category","unit","unitsPerCase","casesPerPallet","unitsPerPallet","weightKg","lotControl","expiryControl","minStock","maxStock","preferredLocation","active","dailyConsumption","velocityClass","positionsRequired","minDays","maxDays","productGroup"];
const SLOTTING_COLUMNS = ["id","velocityClass","aisle","side","rackFrom","rackTo","moduleFrom","moduleTo","level","scope"];
const COUNT_COLUMNS = ["id_conteo","fecha_hora_utc","fecha_local","posicion","esperado_json","encontrado_json","resultado","estado","observacion","usuario","ajuste_id","ajustado_por","ajustado_en","inventario_id","alcance","responsable"];
const PRESENCE_COLUMNS = ["session_id","usuario","nombre_puesto","rol","ambito","ultima_actividad"];
const STAFF_COLUMNS = ["legajo","nombre","rol","ambito","activo","pin_hash","actualizado_en"];
const ACCESS_COLUMNS = ["ambito","clave_hash","actualizado_en"];
const STAFF_ROLES = ["operations","picking","inventory","supervisor","admin"];

// Ejecutar una sola vez desde Apps Script después de crear la propiedad privada
// GPS_INITIAL_ADMIN_KEY. La clave temporal se elimina al finalizar.
function configureGpsAdminKey() {
  const properties = PropertiesService.getScriptProperties();
  const plainKey = clean(properties.getProperty("GPS_INITIAL_ADMIN_KEY"));
  if (!/^\d{6}$/.test(plainKey)) throw new Error("GPS_INITIAL_ADMIN_KEY debe contener exactamente seis dígitos.");
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, plainKey, Utilities.Charset.UTF_8);
  const hash = digest.map((value) => (value < 0 ? value + 256 : value).toString(16).padStart(2, "0")).join("");
  properties.setProperty("GPS_ADMIN_KEY_HASH", hash);
  properties.deleteProperty("GPS_INITIAL_ADMIN_KEY");
  return "Clave administrativa inicial configurada. La propiedad temporal fue eliminada.";
}

const BASELINE_STOCK = {
  "C1.12.3": { sku: "333333", cantidad: 1 },
  "D2.02.0": { sku: "123123", cantidad: 1 },
  "H1.20.2": { sku: "22222", cantidad: 1 },
};

function doGet(event) {
  const callback = safeCallback(event && event.parameter && event.parameter.callback);
  try {
    const action = clean(event && event.parameter && event.parameter.action) || "list";
    const payload = JSON.parse(clean(event && event.parameter && event.parameter.payload) || "{}");
    if (action === "list") return jsonp(callback, { ok: true, version: SERVER_VERSION, records: readRecords() });
    if (action === "sku_list") return jsonp(callback, { ok: true, version: SERVER_VERSION, items: readSkuMaster() });
    if (action === "slotting_list") return jsonp(callback, { ok: true, version: SERVER_VERSION, items: readSlottingRules() });
    if (action === "count_list") return jsonp(callback, { ok: true, version: SERVER_VERSION, items: readInventoryCounts() });
    if (action === "presence_list") return jsonp(callback, { ok: true, version: SERVER_VERSION, items: readActivePresence() });
    if (action === "staff_login") return jsonp(callback, authenticateStaff(payload.legajo, payload.ambito, payload.access_hash));
    if (action === "staff_list") return jsonp(callback, readStaff(payload.admin_password));
    if (action === "staff_save") return jsonp(callback, saveStaff(payload.item, payload.admin_password));
    if (action === "access_list") return jsonp(callback, readAccessConfiguration(payload.admin_password));
    if (action === "access_save") return jsonp(callback, saveAccessConfiguration(payload.changes, payload.admin_password));
    if (action === "sku_save") return jsonp(callback, saveSkuItems([payload.item], payload.admin_password));
    if (action === "sku_bulk") return jsonp(callback, saveSkuItems(payload.items, payload.admin_password));
    if (action === "slotting_save") return jsonp(callback, saveSlottingRule(payload.rule, payload.admin_password));
    if (action === "slotting_delete") return jsonp(callback, deleteSlottingRule(payload.id, payload.admin_password));
    if (action === "count_save") return jsonp(callback, saveInventoryCount(payload.count));
    if (action === "count_adjust") return jsonp(callback, applyInventoryCountAdjustment(payload.count_id, payload.movement, payload.admin_password));
    if (action === "presence_ping") return jsonp(callback, savePresence(payload.presence));
    if (action === "presence_leave") return jsonp(callback, removePresence(payload.session_id));
    if (action !== "command") return jsonp(callback, { ok: false, retryable: false, error: "Acción no válida." });

    const result = processCommand(payload);
    return jsonp(callback, result);
  } catch (error) {
    return jsonp(callback, { ok: false, retryable: true, error: String(error) });
  }
}

function readSkuMaster() {
  const sheet = getSkuSheet();
  const values = sheet.getDataRange().getDisplayValues();
  if (values.length < 2) return [];
  return values.slice(1).filter((row) => clean(row[0])).map((row) => {
    const item = {};
    SKU_COLUMNS.forEach((column, index) => item[column] = row[index] == null ? "" : row[index]);
    return item;
  });
}

function saveSkuItems(items, adminPassword) {
  if (!isAdminPassword(adminPassword)) return { ok: false, retryable: false, error: "Se requiere autorización de administrador." };
  if (!Array.isArray(items) || !items.length) return { ok: false, retryable: false, error: "No hay SKU para guardar." };
  const normalized = items.map((source) => {
    const item = {};
    SKU_COLUMNS.forEach((column) => item[column] = source && source[column] != null ? source[column] : "");
    item.sku = clean(item.sku);
    item.description = clean(item.description);
    return item;
  }).filter((item) => item.sku && item.description);
  if (!normalized.length) return { ok: false, retryable: false, error: "Ninguna fila contiene SKU y descripción." };

  const lock = LockService.getDocumentLock();
  if (!lock.tryLock(15000)) return { ok: false, retryable: true, error: "El maestro está ocupado. Reintenta en unos segundos." };
  try {
    const sheet = getSkuSheet();
    const existing = sheet.getDataRange().getDisplayValues();
    const rows = new Map();
    existing.slice(1).forEach((row, index) => rows.set(clean(row[0]).toLowerCase(), index + 2));
    normalized.forEach((item) => {
      const values = SKU_COLUMNS.map((column) => item[column]);
      const row = rows.get(item.sku.toLowerCase());
      if (row) sheet.getRange(row, 1, 1, SKU_COLUMNS.length).setValues([values]);
      else {
        sheet.appendRow(values);
        rows.set(item.sku.toLowerCase(), sheet.getLastRow());
      }
    });
    SpreadsheetApp.flush();
    return { ok: true, version: SERVER_VERSION, saved: normalized.length };
  } finally {
    lock.releaseLock();
  }
}

function getSkuSheet() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = spreadsheet.getSheetByName(SKU_SHEET_NAME);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(SKU_SHEET_NAME);
    sheet.appendRow(SKU_COLUMNS);
    sheet.setFrozenRows(1);
  }
  const headers = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), SKU_COLUMNS.length)).getDisplayValues()[0];
  SKU_COLUMNS.forEach((column, index) => {
    if (headers[index] !== column) sheet.getRange(1, index + 1).setValue(column);
  });
  return sheet;
}

function readSlottingRules() {
  const values = getSlottingSheet().getDataRange().getDisplayValues();
  if (values.length < 2) return [];
  return values.slice(1).filter((row) => clean(row[0])).map((row) => {
    const item = {};
    SLOTTING_COLUMNS.forEach((column, index) => item[column] = row[index] == null ? "" : row[index]);
    return item;
  });
}

function saveSlottingRule(source, adminPassword) {
  if (!isAdminPassword(adminPassword)) return { ok: false, retryable: false, error: "Se requiere autorización de administrador." };
  const item = {};
  SLOTTING_COLUMNS.forEach((column) => item[column] = source && source[column] != null ? source[column] : "");
  if (!clean(item.id) || !clean(item.velocityClass)) return { ok: false, retryable: false, error: "La regla de zona está incompleta." };
  const sheet = getSlottingSheet();
  const rows = sheet.getDataRange().getDisplayValues();
  const index = rows.findIndex((row, rowIndex) => rowIndex > 0 && clean(row[0]) === clean(item.id));
  const values = SLOTTING_COLUMNS.map((column) => item[column]);
  if (index > 0) sheet.getRange(index + 1, 1, 1, values.length).setValues([values]);
  else sheet.appendRow(values);
  return { ok: true, version: SERVER_VERSION };
}

function deleteSlottingRule(id, adminPassword) {
  if (!isAdminPassword(adminPassword)) return { ok: false, retryable: false, error: "Se requiere autorización de administrador." };
  const sheet = getSlottingSheet();
  const rows = sheet.getDataRange().getDisplayValues();
  const index = rows.findIndex((row, rowIndex) => rowIndex > 0 && clean(row[0]) === clean(id));
  if (index > 0) sheet.deleteRow(index + 1);
  return { ok: true, version: SERVER_VERSION };
}

function getSlottingSheet() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = spreadsheet.getSheetByName(SLOTTING_SHEET_NAME);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(SLOTTING_SHEET_NAME);
    sheet.appendRow(SLOTTING_COLUMNS);
    sheet.setFrozenRows(1);
  }
  const headers = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), SLOTTING_COLUMNS.length)).getDisplayValues()[0];
  SLOTTING_COLUMNS.forEach((column, index) => {
    if (headers[index] !== column) sheet.getRange(1, index + 1).setValue(column);
  });
  return sheet;
}

function readInventoryCounts() {
  const values = getCountSheet().getDataRange().getDisplayValues();
  if (values.length < 2) return [];
  return values.slice(1).filter((row) => clean(row[0])).map((row) => {
    const item = {};
    COUNT_COLUMNS.forEach((column, index) => item[column] = row[index] == null ? "" : row[index]);
    return item;
  });
}

function saveInventoryCount(source) {
  const item = {};
  COUNT_COLUMNS.forEach((column) => item[column] = source && source[column] != null ? source[column] : "");
  item.id_conteo = clean(item.id_conteo);
  item.posicion = normalizePosition(item.posicion);
  item.estado = clean(item.estado).toUpperCase();
  item.resultado = clean(item.resultado).toUpperCase();
  if (!item.id_conteo || !item.posicion || !clean(item.fecha_hora_utc) || !clean(item.usuario)) {
    return { ok: false, retryable: false, error: "El conteo está incompleto." };
  }
  if (!clean(item.inventario_id)) return { ok: false, retryable: false, error: "El conteo no está asociado a un inventario." };
  if (!["COINCIDE", "DIFERENCIA"].includes(item.resultado)) return { ok: false, retryable: false, error: "Resultado de conteo no válido." };
  const skuError = validateCountSkus(item);
  if (skuError) return { ok: false, retryable: false, error: skuError };
  item.estado = item.resultado === "COINCIDE" ? "CERRADO" : "PENDIENTE";

  const lock = LockService.getDocumentLock();
  if (!lock.tryLock(15000)) return { ok: false, retryable: true, error: "Los conteos están ocupados. Reintenta en unos segundos." };
  try {
    const sheet = getCountSheet();
    const duplicate = sheet.getDataRange().getDisplayValues().some((row, index) => index > 0 && clean(row[0]) === item.id_conteo);
    if (duplicate) return { ok: true, duplicate: true, version: SERVER_VERSION };
    sheet.appendRow(COUNT_COLUMNS.map((column) => item[column]));
    SpreadsheetApp.flush();
    return { ok: true, version: SERVER_VERSION };
  } finally {
    lock.releaseLock();
  }
}

function applyInventoryCountAdjustment(countId, movementSource, adminPassword) {
  if (!isAdminPassword(adminPassword)) return { ok: false, retryable: false, error: "Se requiere autorización de supervisor o administrador." };
  const lock = LockService.getDocumentLock();
  if (!lock.tryLock(15000)) return { ok: false, retryable: true, error: "El inventario está ocupado. Reintenta en unos segundos." };
  try {
    const countSheet = getCountSheet();
    const countRows = countSheet.getDataRange().getDisplayValues();
    const countIndex = countRows.findIndex((row, index) => index > 0 && clean(row[0]) === clean(countId));
    if (countIndex < 1) return { ok: false, retryable: false, error: "No existe el conteo indicado." };
    const count = {};
    COUNT_COLUMNS.forEach((column, index) => count[column] = countRows[countIndex][index] == null ? "" : countRows[countIndex][index]);
    if (clean(count.estado).toUpperCase() !== "PENDIENTE") return { ok: false, retryable: false, error: "El conteo ya fue cerrado o ajustado." };

    const movement = normalizeRecord(movementSource);
    movement.tipo = "ADJUST";
    movement.id_conteo = clean(countId);
    const basicError = validateBasicRecord(movement);
    if (basicError) return { ok: false, retryable: false, error: basicError };
    const records = readRecords();
    const validationError = validateCommand(movement, records);
    if (validationError) return { ok: false, retryable: false, error: validationError };

    createDailyBackup();
    getSheet().appendRow(COLUMNS.map((column) => movement[column]));
    const statusColumn = COUNT_COLUMNS.indexOf("estado") + 1;
    countSheet.getRange(countIndex + 1, statusColumn).setValue("AJUSTADO");
    countSheet.getRange(countIndex + 1, COUNT_COLUMNS.indexOf("ajuste_id") + 1).setValue(movement.id_movimiento);
    countSheet.getRange(countIndex + 1, COUNT_COLUMNS.indexOf("ajustado_por") + 1).setValue(movement.usuario);
    countSheet.getRange(countIndex + 1, COUNT_COLUMNS.indexOf("ajustado_en") + 1).setValue(movement.actualizado_en);
    SpreadsheetApp.flush();
    return { ok: true, version: SERVER_VERSION, movement_id: movement.id_movimiento };
  } finally {
    lock.releaseLock();
  }
}

function getCountSheet() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = spreadsheet.getSheetByName(COUNT_SHEET_NAME);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(COUNT_SHEET_NAME);
    sheet.appendRow(COUNT_COLUMNS);
    sheet.setFrozenRows(1);
  }
  const headers = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), COUNT_COLUMNS.length)).getDisplayValues()[0];
  COUNT_COLUMNS.forEach((column, index) => {
    if (headers[index] !== column) sheet.getRange(1, index + 1).setValue(column);
  });
  return sheet;
}

function readActivePresence() {
  const values = getPresenceSheet().getDataRange().getDisplayValues();
  const cutoff = Date.now() - 3 * 60 * 1000;
  return values.slice(1).filter((row) => clean(row[0]) && Date.parse(row[5]) >= cutoff).map((row) => {
    const item = {};
    PRESENCE_COLUMNS.forEach((column, index) => item[column] = row[index] == null ? "" : row[index]);
    return item;
  });
}

function savePresence(source) {
  const item = {};
  PRESENCE_COLUMNS.forEach((column) => item[column] = source && source[column] != null ? source[column] : "");
  item.session_id = clean(item.session_id);
  item.usuario = clean(item.usuario);
  item.nombre_puesto = clean(item.nombre_puesto) || item.usuario;
  item.rol = clean(item.rol).toLowerCase();
  item.ambito = clean(item.ambito).toUpperCase();
  item.ultima_actividad = clean(item.ultima_actividad) || new Date().toISOString();
  if (!item.session_id || !item.usuario) return { ok: false, retryable: false, error: "La sesión está incompleta." };
  const lock = LockService.getDocumentLock();
  if (!lock.tryLock(5000)) return { ok: false, retryable: true, error: "El registro de sesiones está ocupado." };
  try {
    const sheet = getPresenceSheet();
    const values = sheet.getDataRange().getDisplayValues();
    const index = values.findIndex((row, rowIndex) => rowIndex > 0 && clean(row[0]) === item.session_id);
    const row = PRESENCE_COLUMNS.map((column) => item[column]);
    if (index > 0) sheet.getRange(index + 1, 1, 1, row.length).setValues([row]);
    else sheet.appendRow(row);
    return { ok: true, version: SERVER_VERSION };
  } finally {
    lock.releaseLock();
  }
}

function removePresence(sessionId) {
  const sheet = getPresenceSheet();
  const values = sheet.getDataRange().getDisplayValues();
  const index = values.findIndex((row, rowIndex) => rowIndex > 0 && clean(row[0]) === clean(sessionId));
  if (index > 0) sheet.deleteRow(index + 1);
  return { ok: true, version: SERVER_VERSION };
}

function getPresenceSheet() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = spreadsheet.getSheetByName(PRESENCE_SHEET_NAME);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(PRESENCE_SHEET_NAME);
    sheet.appendRow(PRESENCE_COLUMNS);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function getStaffSheet() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = spreadsheet.getSheetByName(STAFF_SHEET_NAME);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(STAFF_SHEET_NAME);
    sheet.appendRow(STAFF_COLUMNS);
    sheet.appendRow(["100360", "Administrador GPS", "admin", "ALL", true, "", new Date().toISOString()]);
    sheet.setFrozenRows(1);
  }
  const headers = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), STAFF_COLUMNS.length)).getDisplayValues()[0];
  STAFF_COLUMNS.forEach((column, index) => {
    if (headers[index] !== column) sheet.getRange(1, index + 1).setValue(column);
  });
  return sheet;
}

function staffRowToItem(row) {
  const item = {};
  STAFF_COLUMNS.forEach((column, index) => item[column] = row[index] == null ? "" : row[index]);
  item.legajo = clean(item.legajo);
  item.nombre = clean(item.nombre);
  item.rol = clean(item.rol).toLowerCase();
  item.ambito = clean(item.ambito).toUpperCase() || "CD";
  item.activo = !["0", "false", "no", "inactivo"].includes(clean(item.activo).toLowerCase());
  item.pin_hash = clean(item.pin_hash);
  return item;
}

function publicStaffItem(item) {
  return {
    legajo: item.legajo,
    nombre: item.nombre,
    rol: item.rol,
    ambito: item.ambito,
    activo: item.activo,
    actualizado_en: item.actualizado_en,
  };
}

function readStaff(adminPassword) {
  if (!isAdminPassword(adminPassword)) return { ok: false, retryable: false, error: "Se requiere autorización de administrador." };
  const values = getStaffSheet().getDataRange().getDisplayValues();
  const items = values.slice(1).map(staffRowToItem).filter((item) => item.legajo).map(publicStaffItem);
  return { ok: true, version: SERVER_VERSION, items: items };
}

function getAccessSheet() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = spreadsheet.getSheetByName(ACCESS_SHEET_NAME);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(ACCESS_SHEET_NAME);
    sheet.appendRow(ACCESS_COLUMNS);
    sheet.appendRow(["CD", "", new Date().toISOString()]);
    sheet.appendRow(["BACK", "", new Date().toISOString()]);
    const initialHash = clean(PropertiesService.getScriptProperties().getProperty("GPS_ADMIN_KEY_HASH"));
    sheet.appendRow(["ALL", /^[a-f0-9]{64}$/i.test(initialHash) ? initialHash.toLowerCase() : "", new Date().toISOString()]);
    sheet.setFrozenRows(1);
  }
  const headers = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), ACCESS_COLUMNS.length)).getDisplayValues()[0];
  ACCESS_COLUMNS.forEach((column, index) => {
    if (headers[index] !== column) sheet.getRange(1, index + 1).setValue(column);
  });
  return sheet;
}

function isAdminPassword(value) {
  const hash = clean(value).toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(hash)) return false;
  const values = getAccessSheet().getDataRange().getDisplayValues();
  const row = values.slice(1).find((item) => clean(item[0]).toUpperCase() === "ALL");
  return Boolean(row && clean(row[1]).toLowerCase() === hash);
}

function readAccessConfiguration(adminPassword) {
  if (!isAdminPassword(adminPassword)) return { ok: false, retryable: false, error: "Se requiere autorización de administrador." };
  const values = getAccessSheet().getDataRange().getDisplayValues();
  const configured = { CD: false, BACK: false, ALL: false };
  values.slice(1).forEach((row) => {
    const scope = clean(row[0]).toUpperCase();
    if (scope in configured) configured[scope] = /^[a-f0-9]{64}$/i.test(clean(row[1]));
  });
  return { ok: true, version: SERVER_VERSION, configured: configured };
}

function saveAccessConfiguration(changes, adminPassword) {
  if (!isAdminPassword(adminPassword)) return { ok: false, retryable: false, error: "Se requiere autorización de administrador." };
  if (!changes || typeof changes !== "object") return { ok: false, retryable: false, error: "No hay contraseñas para actualizar." };
  const entries = Object.keys(changes).filter((scope) => ["CD", "BACK", "ALL"].indexOf(scope) >= 0);
  if (!entries.length) return { ok: false, retryable: false, error: "No hay contraseñas para actualizar." };
  for (const scope of entries) {
    if (!/^[a-f0-9]{64}$/i.test(clean(changes[scope]))) return { ok: false, retryable: false, error: `La contraseña de ${scope} no es válida.` };
  }
  const lock = LockService.getDocumentLock();
  if (!lock.tryLock(10000)) return { ok: false, retryable: true, error: "La configuración está ocupada. Reintentá en unos segundos." };
  try {
    const sheet = getAccessSheet();
    const rows = sheet.getDataRange().getDisplayValues();
    entries.forEach((scope) => {
      const rowIndex = rows.findIndex((row, index) => index > 0 && clean(row[0]).toUpperCase() === scope);
      const values = [scope, clean(changes[scope]).toLowerCase(), new Date().toISOString()];
      if (rowIndex > 0) sheet.getRange(rowIndex + 1, 1, 1, values.length).setValues([values]);
      else sheet.appendRow(values);
    });
    SpreadsheetApp.flush();
    return { ok: true, version: SERVER_VERSION };
  } finally {
    lock.releaseLock();
  }
}

function authenticateStaff(employeeId, requestedScope, accessHash) {
  const legajo = clean(employeeId);
  const scope = clean(requestedScope).toUpperCase();
  const hash = clean(accessHash).toLowerCase();
  if (!/^\d{1,12}$/.test(legajo) || !/^[a-f0-9]{64}$/.test(hash)) {
    return { ok: false, retryable: false, error: "Credenciales inválidas." };
  }
  if (["CD", "BACK", "ALL"].indexOf(scope) < 0) return { ok: false, retryable: false, error: "El ámbito no es válido." };
  const values = getStaffSheet().getDataRange().getDisplayValues();
  const item = values.slice(1).map(staffRowToItem).find((candidate) => candidate.legajo === legajo);
  if (!item || !item.activo) return { ok: false, retryable: false, error: "Legajo inexistente o desactivado." };
  if (scope === "ALL" && item.rol !== "admin") return { ok: false, retryable: false, error: "Todo Escobar está reservado para administradores." };
  if (item.rol !== "admin" && item.ambito !== "ALL" && item.ambito !== scope) return { ok: false, retryable: false, error: "El legajo no está habilitado para este ámbito." };
  const accessRows = getAccessSheet().getDataRange().getDisplayValues();
  const access = accessRows.slice(1).find((row) => clean(row[0]).toUpperCase() === scope);
  if (!access || !clean(access[1]) || clean(access[1]).toLowerCase() !== hash) return { ok: false, retryable: false, error: "La contraseña del ámbito es incorrecta o todavía no fue configurada." };
  return { ok: true, version: SERVER_VERSION, account: publicStaffItem(item) };
}

function saveStaff(source, adminPassword) {
  if (!isAdminPassword(adminPassword)) return { ok: false, retryable: false, error: "Se requiere autorización de administrador." };
  const item = staffRowToItem(STAFF_COLUMNS.map((column) => source && source[column] != null ? source[column] : ""));
  if (!/^\d{1,12}$/.test(item.legajo)) return { ok: false, retryable: false, error: "El legajo debe ser numérico." };
  if (!item.nombre) return { ok: false, retryable: false, error: "El nombre es obligatorio." };
  if (STAFF_ROLES.indexOf(item.rol) < 0) return { ok: false, retryable: false, error: "El rol no es válido." };
  if (["CD", "BACK", "ALL"].indexOf(item.ambito) < 0) return { ok: false, retryable: false, error: "El ámbito no es válido." };
  if (item.ambito === "ALL" && item.rol !== "admin") return { ok: false, retryable: false, error: "Todo Escobar está reservado para administradores." };

  const lock = LockService.getDocumentLock();
  if (!lock.tryLock(10000)) return { ok: false, retryable: true, error: "La base de legajos está ocupada. Reintentá en unos segundos." };
  try {
    const sheet = getStaffSheet();
    const values = sheet.getDataRange().getDisplayValues();
    const rowIndex = values.findIndex((row, index) => index > 0 && clean(row[0]) === item.legajo);
    if (rowIndex > 0) item.pin_hash = clean(values[rowIndex][STAFF_COLUMNS.indexOf("pin_hash")]);
    else item.pin_hash = "";
    item.actualizado_en = new Date().toISOString();
    const row = STAFF_COLUMNS.map((column) => item[column]);
    if (rowIndex > 0) sheet.getRange(rowIndex + 1, 1, 1, row.length).setValues([row]);
    else sheet.appendRow(row);
    SpreadsheetApp.flush();
    return { ok: true, version: SERVER_VERSION, item: publicStaffItem(item) };
  } finally {
    lock.releaseLock();
  }
}

function processCommand(payload) {
  const record = normalizeRecord(payload);
  const basicError = validateBasicRecord(record);
  if (basicError) return { ok: false, retryable: false, error: basicError };

  const lock = LockService.getDocumentLock();
  if (!lock.tryLock(15000)) return { ok: false, retryable: true, error: "El registro central está ocupado. Reintenta en unos segundos." };

  try {
    const skuError = validateMovementSkus(record);
    if (skuError) return { ok: false, retryable: false, error: skuError };
    const records = readRecords();
    const duplicate = records.find((item) => clean(item.id_movimiento) === record.id_movimiento && clean(item.actualizado_en) === record.actualizado_en);
    if (duplicate) return { ok: true, duplicate: true, version: SERVER_VERSION };

    if (["MOVE", "OUT"].includes(record.tipo) && !record.id_pallet) {
      const warehouse = reconstructWarehouse(latestActiveRecords(records, record.id_movimiento));
      record.id_pallet = clean(warehouse.stock.get(record.posicion_origen) && warehouse.stock.get(record.posicion_origen).id_pallet);
    }

    const validationError = validateCommand(record, records);
    if (validationError) return { ok: false, retryable: false, error: validationError };

    createDailyBackup();
    getSheet().appendRow(COLUMNS.map((column) => record[column]));
    SpreadsheetApp.flush();
    return { ok: true, version: SERVER_VERSION };
  } finally {
    lock.releaseLock();
  }
}

function validateMovementSkus(record) {
  if (!["IN", "ADJUST"].includes(record.tipo)) return "";
  let contents = [];
  try { contents = JSON.parse(record.contenido_json || "[]"); } catch (error) { return "El contenido de la carga no es válido."; }
  const skus = contents.map((item) => clean(item.sku)).filter(Boolean);
  if (!skus.length && clean(record.sku) && clean(record.sku).toUpperCase() !== "MULTIPRODUCTO") skus.push(clean(record.sku));
  if (!skus.length && record.tipo === "IN") return "El ingreso no contiene SKU.";
  const master = new Map(readSkuMaster().map((item) => [clean(item.sku).toUpperCase(), item]));
  for (const sku of skus) {
    const item = master.get(sku.toUpperCase());
    if (!item) return `El SKU ${sku} no existe en el maestro.`;
    const active = clean(item.active).toLowerCase();
    if (["0", "false", "no", "inactivo"].includes(active)) return `El SKU ${sku} está inactivo en el maestro.`;
  }
  return "";
}

function validateCountSkus(count) {
  let found = {};
  try { found = JSON.parse(count.encontrado_json || "{}"); } catch (error) { return "El resultado físico del conteo no es válido."; }
  const skus = (found.contents || []).map((item) => clean(item.sku)).filter(Boolean);
  if (!skus.length) return "";
  const master = new Map(readSkuMaster().map((item) => [clean(item.sku).toUpperCase(), item]));
  for (const sku of skus) {
    const item = master.get(sku.toUpperCase());
    if (!item) return `El SKU ${sku} no existe en el maestro.`;
    const active = clean(item.active).toLowerCase();
    if (["0", "false", "no", "inactivo"].includes(active)) return `El SKU ${sku} está inactivo en el maestro.`;
  }
  return "";
}

function validateCommand(record, records) {
  const existing = records.some((item) => clean(item.id_movimiento) === record.id_movimiento);
  if (record.estado === "ANULADO") return existing ? "" : "No existe el movimiento que se quiere anular.";

  const effective = latestActiveRecords(records, record.id_movimiento);
  const warehouse = reconstructWarehouse(effective);
  const from = record.posicion_origen;
  const to = record.posicion_destino;

  if (["BLOCK", "UNBLOCK", "ADJUST"].includes(record.tipo) && !isAdminPassword(record.admin_password)) {
    return "Se requiere autorización de administrador.";
  }
  if (record.tipo === "IN") {
    if (!to) return "El ingreso requiere una posición de destino.";
    if (warehouse.blocks.has(to)) return `La posición ${to} está bloqueada.`;
    if (warehouse.stock.has(to)) return `Conflicto: la posición ${to} ya está ocupada.`;
  }
  if (record.tipo === "MOVE") {
    if (!from || !to) return "El movimiento requiere posición de origen y destino.";
    if (!warehouse.stock.has(from)) return `La posición de origen ${from} no tiene stock.`;
    if (warehouse.blocks.has(to)) return `La posición ${to} está bloqueada.`;
    if (warehouse.stock.has(to) && from !== to) return `Conflicto: la posición ${to} ya está ocupada.`;
  }
  if (record.tipo === "OUT" && (!from || !warehouse.stock.has(from))) {
    return `La posición de origen ${from || "indicada"} no tiene stock.`;
  }
  if (record.tipo === "BLOCK") {
    if (!to) return "El bloqueo requiere una posición.";
    if (warehouse.stock.has(to)) return `No se puede bloquear ${to} porque está ocupada.`;
    if (warehouse.blocks.has(to)) return `La posición ${to} ya está bloqueada.`;
  }
  if (record.tipo === "UNBLOCK" && (!from || !warehouse.blocks.has(from))) {
    return `La posición ${from || "indicada"} no está bloqueada.`;
  }
  if (record.tipo === "ADJUST") {
    if (!to || !record.id_conteo) return "El ajuste requiere posición e identificador de conteo.";
    let contents = [];
    try { contents = JSON.parse(record.contenido_json || "[]"); } catch (error) { return "El contenido encontrado no es válido."; }
    if (contents.length && warehouse.blocks.has(to)) return `La posición ${to} está bloqueada.`;
    let previous = {};
    try { previous = JSON.parse(record.contenido_anterior_json || "{}"); } catch (error) { return "La referencia anterior del conteo no es válida."; }
    const current = warehouse.stock.get(to);
    if (Boolean(previous.occupied) !== Boolean(current)) return `El stock de ${to} cambió después del conteo. Realiza un nuevo conteo.`;
    if (previous.occupied) {
      const expectedSkus = (previous.contents || []).map((item) => clean(item.sku).toUpperCase()).filter(Boolean).sort().join("|");
      const currentSkus = stockItemSkus(current).join("|");
      if (expectedSkus && currentSkus && expectedSkus !== currentSkus) return `El contenido de ${to} cambió después del conteo. Realiza un nuevo conteo.`;
    }
  }
  return "";
}

function reconstructWarehouse(records) {
  const stock = new Map(Object.keys(BASELINE_STOCK).map((position) => [position, BASELINE_STOCK[position]]));
  const blocks = new Set();
  records.forEach((record) => {
    const type = clean(record.tipo).toUpperCase();
    const from = normalizePosition(record.posicion_origen);
    const to = normalizePosition(record.posicion_destino);
    if (type === "IN" && to) stock.set(to, { sku: clean(record.sku), id_pallet: clean(record.id_pallet), cantidad: Number(record.cantidad) || 1, contenido_json: record.contenido_json, pallets: record.pallets });
    if (type === "MOVE" && from && to) {
      const item = stock.get(from) || { sku: clean(record.sku), cantidad: Number(record.cantidad) || 1 };
      stock.delete(from);
      stock.set(to, { ...item, sku: item.sku || clean(record.sku), cantidad: Number(record.cantidad) || Number(item.cantidad) || 1 });
    }
    if (type === "OUT" && from) {
      const item = stock.get(from);
      if (item) {
        if (clean(record.unidad_logistica).toUpperCase() === "PALLET") stock.delete(from);
        else {
          const remaining = Number(item.cantidad || 0) - (Number(record.cantidad) || 1);
          if (remaining > 0) stock.set(from, { ...item, cantidad: remaining });
          else stock.delete(from);
        }
      }
    }
    if (type === "BLOCK" && to) blocks.add(to);
    if (type === "UNBLOCK" && from) blocks.delete(from);
    if (type === "ADJUST" && to) {
      let contents = [];
      try { contents = JSON.parse(record.contenido_json || "[]"); } catch (error) {}
      if (contents.length) stock.set(to, { sku: clean(record.sku), cantidad: Number(record.cantidad) || 1, contenido_json: record.contenido_json, pallets: record.pallets });
      else stock.delete(to);
    }
  });
  return { stock: stock, blocks: blocks };
}

function stockItemSkus(item) {
  if (!item) return [];
  try {
    const contents = JSON.parse(item.contenido_json || "[]");
    const skus = contents.map((content) => clean(content.sku).toUpperCase()).filter(Boolean).sort();
    if (skus.length) return skus;
  } catch (error) {}
  return clean(item.sku) ? [clean(item.sku).toUpperCase()] : [];
}

function latestActiveRecords(records, excludedId) {
  const latest = new Map();
  records.forEach((record, index) => {
    const id = clean(record.id_movimiento);
    if (!id || id === excludedId) return;
    if (clean(record.estado).toUpperCase() === "ANULADO") latest.delete(id);
    else latest.set(id, { record: record, index: index });
  });
  return Array.from(latest.values()).sort((a, b) => a.index - b.index).map((item) => item.record);
}

function validateBasicRecord(record) {
  if (!record.id_movimiento) return "Falta el identificador del movimiento.";
  if (!record.actualizado_en) return "Falta la fecha de actualización.";
  if (!["CREADO", "ANULADO"].includes(record.estado)) return "Estado no válido.";
  if (record.estado !== "ANULADO" && !["IN", "MOVE", "OUT", "BLOCK", "UNBLOCK", "ADJUST"].includes(record.tipo)) return "Tipo de movimiento no válido.";
  if (["IN", "MOVE", "OUT"].includes(record.tipo) && !(Number(record.cantidad) > 0)) return "La cantidad debe ser mayor que cero.";
  return "";
}

function normalizeRecord(payload) {
  const record = {};
  COLUMNS.forEach((column) => record[column] = clean(payload && payload[column]));
  record.tipo = record.tipo.toUpperCase();
  record.estado = (record.estado || "CREADO").toUpperCase();
  record.posicion_origen = normalizePosition(record.posicion_origen);
  record.posicion_destino = normalizePosition(record.posicion_destino);
  record.cantidad = Number(record.cantidad) || 0;
  record.delta_ocupacion = Number(record.delta_ocupacion) || 0;
  record.pallets = Number(record.pallets) || 0;
  record.bultos = Number(record.bultos) || record.cantidad || 0;
  record.unidades = Number(record.unidades) || 0;
  record.admin_password = clean(payload && payload.admin_password);
  return record;
}

function readRecords() {
  const values = getSheet().getDataRange().getDisplayValues();
  if (!values.length) return [];
  const headerIndex = values.findIndex((row) => row.some((cell) => normalizeHeader(cell) === "id_movimiento"));
  if (headerIndex < 0) throw new Error(`La cabecera de ${SHEET_NAME} no es válida; no se modificaron datos.`);

  return values.slice(headerIndex + 1).map((row) => {
    let cells = row;
    if (row.slice(1).every((cell) => !clean(cell)) && clean(row[0]).indexOf("\t") >= 0) cells = clean(row[0]).split("\t");
    const item = {};
    COLUMNS.forEach((column, index) => item[column] = cells[index] == null ? "" : cells[index]);
    return item;
  }).filter((item) => clean(item.id_movimiento) && normalizeHeader(item.id_movimiento) !== "id_movimiento");
}

function getSheet() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = spreadsheet.getSheetByName(SHEET_NAME);
  if (!sheet) throw new Error(`No existe la hoja ${SHEET_NAME}.`);
  const values = sheet.getDataRange().getDisplayValues();
  const hasHeader = values.some((row) => row.some((cell) => normalizeHeader(cell) === "id_movimiento"));
  if (!hasHeader) {
    sheet.insertRowsBefore(1, 1);
    sheet.getRange(1, 1, 1, COLUMNS.length).setValues([COLUMNS]);
    sheet.setFrozenRows(1);
    SpreadsheetApp.flush();
  }
  const headers = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), COLUMNS.length)).getDisplayValues()[0];
  COLUMNS.forEach((column, index) => {
    if (headers[index] !== column) sheet.getRange(1, index + 1).setValue(column);
  });
  return sheet;
}

function createDailyBackup() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const timezone = spreadsheet.getSpreadsheetTimeZone() || "America/Argentina/Buenos_Aires";
  const name = `_backup_${Utilities.formatDate(new Date(), timezone, "yyyy-MM-dd")}`;
  if (spreadsheet.getSheetByName(name)) return;

  const source = getSheet();
  const backup = spreadsheet.insertSheet(name);
  const range = source.getDataRange();
  range.copyTo(
    backup.getRange(1, 1, range.getNumRows(), range.getNumColumns()),
    SpreadsheetApp.CopyPasteType.PASTE_VALUES,
    false
  );
  backup.hideSheet();
  PropertiesService.getDocumentProperties().setProperty("last_backup", name);
}

function normalizeHeader(value) {
  return clean(value).replace(/^\uFEFF/, "").toLowerCase();
}

function normalizePosition(value) {
  return clean(value).toUpperCase().replace(/\s+/g, "");
}

function clean(value) {
  return value == null ? "" : String(value).trim();
}

function safeCallback(value) {
  const callback = clean(value);
  return /^[A-Za-z_$][0-9A-Za-z_$\.]*$/.test(callback) ? callback : "callback";
}

function jsonp(callback, payload) {
  return ContentService.createTextOutput(`${callback}(${JSON.stringify(payload)});`).setMimeType(ContentService.MimeType.JAVASCRIPT);
}
