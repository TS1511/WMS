const SERVER_VERSION = 36;
const SHEET_NAME = "Hoja 1";
const SKU_SHEET_NAME = "Maestro SKU";
const SLOTTING_SHEET_NAME = "Zonas SKU";
const COUNT_SHEET_NAME = "Conteos Inventario";
const PRESENCE_SHEET_NAME = "Sesiones Activas";
const STAFF_SHEET_NAME = "Legajos";
const ACCESS_SHEET_NAME = "Claves de Acceso";
const WAREHOUSE_SHEET_NAME = "Almacenes";
const POSITION_SHEET_NAME = "Posiciones";
const AUDIT_SHEET_NAME = "Auditoria Maestros";
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
  "almacen_id",
];
const SKU_COLUMNS = ["sku","description","ean","category","unit","unitsPerCase","casesPerPallet","unitsPerPallet","weightKg","lotControl","expiryControl","minStock","maxStock","preferredLocation","active","dailyConsumption","velocityClass","positionsRequired","minDays","maxDays","productGroup"];
const SLOTTING_COLUMNS = ["id","velocityClass","aisle","side","rackFrom","rackTo","moduleFrom","moduleTo","level","scope","almacen_id"];
const COUNT_COLUMNS = ["id_conteo","fecha_hora_utc","fecha_local","posicion","esperado_json","encontrado_json","resultado","estado","observacion","usuario","ajuste_id","ajustado_por","ajustado_en","inventario_id","alcance","responsable","almacen_id"];
const PRESENCE_COLUMNS = ["session_id","usuario","nombre_puesto","rol","ambito","ultima_actividad","almacen_id"];
const STAFF_COLUMNS = ["legajo","nombre","rol","ambito","activo","pin_hash","actualizado_en"];
const ACCESS_COLUMNS = ["ambito","clave_hash","actualizado_en"];
const WAREHOUSE_COLUMNS = ["almacen_id","codigo","nombre","activo","modelo_3d","ambito_acceso","creado_en","actualizado_en"];
const POSITION_COLUMNS = ["posicion_id","almacen_id","codigo","pasillo","modulo","nivel","lado","rack","tipo_ubicacion","sector","estado","es_base","actualizado_en"];
const AUDIT_COLUMNS = ["fecha_hora_utc","usuario","entidad","operacion","almacen_id","codigo","valor_anterior_json","valor_nuevo_json"];
const DEFAULT_WAREHOUSES = [
  ["ESCOBAR_CD", "ESC-CD", "CD Escobar", true, true, "CD"],
  ["ESCOBAR_BACK", "ESC-BACK", "Back Salón Escobar", true, false, "SALON"],
];
const WAREHOUSE_GROUPS = ["DEPOSITO", "SALON", "CD", "DEPOSITO_NON_FOOD"];
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

const BASELINE_STOCK = {};

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
    if (action === "warehouses_list") return jsonp(callback, readWarehouses());
    if (action === "warehouse_save") return jsonp(callback, saveWarehouse(payload.item, payload.admin_password, payload.actor));
    if (action === "warehouse_toggle") return jsonp(callback, toggleWarehouse(payload.almacen_id, payload.activo, payload.admin_password, payload.actor));
    if (action === "warehouse_delete") return jsonp(callback, deleteWarehouse(payload.almacen_id, payload.admin_password, payload.actor));
    if (action === "positions_list") return jsonp(callback, readPositions(payload.almacen_id));
    if (action === "position_save") return jsonp(callback, savePosition(payload.item, payload.admin_password, payload.actor));
    if (action === "positions_bulk") return jsonp(callback, savePositionsBulk(payload.items, payload.admin_password, false, payload.actor));
    if (action === "positions_action") return jsonp(callback, updatePositions(payload.almacen_id, payload.codigos, payload.operation, payload.admin_password, payload.actor));
    if (action === "sku_save") return jsonp(callback, saveSkuItems([payload.item], payload.admin_password));
    if (action === "sku_bulk") return jsonp(callback, saveSkuItems(payload.items, payload.admin_password));
    if (action === "sku_clear") return jsonp(callback, clearSkuMaster(payload.admin_password));
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

function getWarehouseSheet() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = spreadsheet.getSheetByName(WAREHOUSE_SHEET_NAME);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(WAREHOUSE_SHEET_NAME);
    sheet.appendRow(WAREHOUSE_COLUMNS);
    const now = new Date().toISOString();
    sheet.getRange(2, 1, DEFAULT_WAREHOUSES.length, WAREHOUSE_COLUMNS.length).setValues(
      DEFAULT_WAREHOUSES.map((item) => [item[0], item[1], item[2], item[3], item[4], item[5], now, now])
    );
    sheet.setFrozenRows(1);
  }
  ensureHeaders(sheet, WAREHOUSE_COLUMNS);
  return sheet;
}

function getPositionSheet() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = spreadsheet.getSheetByName(POSITION_SHEET_NAME);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(POSITION_SHEET_NAME);
    sheet.appendRow(POSITION_COLUMNS);
    sheet.setFrozenRows(1);
  }
  ensureHeaders(sheet, POSITION_COLUMNS);
  return sheet;
}

function getAuditSheet() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = spreadsheet.getSheetByName(AUDIT_SHEET_NAME);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(AUDIT_SHEET_NAME);
    sheet.appendRow(AUDIT_COLUMNS);
    sheet.setFrozenRows(1);
  }
  ensureHeaders(sheet, AUDIT_COLUMNS);
  return sheet;
}

function appendMasterAudit(entries, actor) {
  if (!Array.isArray(entries) || !entries.length) return;
  const now = new Date().toISOString();
  const user = clean(actor) || "SIN_IDENTIFICAR";
  const rows = entries.map((entry) => [
    now,
    user,
    clean(entry.entidad),
    clean(entry.operacion),
    clean(entry.almacen_id),
    clean(entry.codigo),
    JSON.stringify(entry.anterior || {}),
    JSON.stringify(entry.nuevo || {}),
  ]);
  const sheet = getAuditSheet();
  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, AUDIT_COLUMNS.length).setValues(rows);
}

function ensureHeaders(sheet, columns) {
  const headers = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), columns.length)).getDisplayValues()[0];
  columns.forEach((column, index) => {
    if (headers[index] !== column) sheet.getRange(1, index + 1).setValue(column);
  });
}

function rowToObject(columns, row) {
  const item = {};
  columns.forEach((column, index) => item[column] = row[index] == null ? "" : row[index]);
  return item;
}

function readWarehouses() {
  const rows = getWarehouseSheet().getDataRange().getDisplayValues();
  const items = rows.slice(1).filter((row) => clean(row[0])).map((row) => {
    const item = rowToObject(WAREHOUSE_COLUMNS, row);
    item.activo = !["0", "false", "no", "inactivo"].includes(clean(item.activo).toLowerCase());
    item.modelo_3d = !["0", "false", "no"].includes(clean(item.modelo_3d).toLowerCase());
    item.ambito_acceso = normalizeWarehouseGroup(item.ambito_acceso, item.nombre);
    return item;
  });
  return { ok: true, version: SERVER_VERSION, items: items };
}

function normalizeWarehouseGroup(value, warehouseName) {
  const group = clean(value).toUpperCase();
  if (WAREHOUSE_GROUPS.indexOf(group) >= 0) return group;
  if (group === "BACK") return "SALON";
  const name = clean(warehouseName).toUpperCase();
  if (name.indexOf("SALON") >= 0 || name.indexOf("BACK") >= 0) return "SALON";
  return group === "CD" ? "CD" : "DEPOSITO";
}

function warehouseScopeValue(item) {
  const id = clean(item && item.almacen_id).toUpperCase();
  if (id === "ESCOBAR_CD") return "CD";
  if (id === "ESCOBAR_BACK") return "BACK";
  return id;
}

function accessScopeValues(includeAll) {
  const seen = {};
  const values = readWarehouses().items
    .filter((item) => item.activo)
    .map(warehouseScopeValue)
    .filter((scope) => scope && !seen[scope] && (seen[scope] = true));
  if (includeAll !== false) values.push("ALL");
  return values;
}

function isKnownAccessScope(scope) {
  return accessScopeValues(true).indexOf(clean(scope).toUpperCase()) >= 0;
}

function saveWarehouse(source, adminPassword, actor) {
  if (!isAdminPassword(adminPassword)) return { ok: false, retryable: false, error: "Se requiere autorización de administrador." };
  const item = rowToObject(WAREHOUSE_COLUMNS, WAREHOUSE_COLUMNS.map((column) => source && source[column] != null ? source[column] : ""));
  item.almacen_id = clean(item.almacen_id) || Utilities.getUuid();
  item.codigo = clean(item.codigo).toUpperCase();
  item.nombre = clean(item.nombre);
  item.activo = source && source.activo !== false;
  item.modelo_3d = Boolean(source && source.modelo_3d);
  item.ambito_acceso = normalizeWarehouseGroup(item.ambito_acceso, item.nombre);
  if (!item.codigo || !item.nombre) return { ok: false, retryable: false, error: "Código y nombre del almacén son obligatorios." };
  if (WAREHOUSE_GROUPS.indexOf(item.ambito_acceso) < 0) return { ok: false, retryable: false, error: "El grupo operativo no es válido." };
  const lock = LockService.getDocumentLock();
  if (!lock.tryLock(10000)) return { ok: false, retryable: true, error: "La administración de almacenes está ocupada." };
  try {
    const sheet = getWarehouseSheet();
    const rows = sheet.getDataRange().getDisplayValues();
    const duplicate = rows.findIndex((row, index) => index > 0 && clean(row[1]).toUpperCase() === item.codigo && clean(row[0]) !== item.almacen_id);
    if (duplicate > 0) return { ok: false, retryable: false, error: `Ya existe un almacén con el código ${item.codigo}.` };
    const rowIndex = rows.findIndex((row, index) => index > 0 && clean(row[0]) === item.almacen_id);
    const previous = rowIndex > 0 ? rowToObject(WAREHOUSE_COLUMNS, rows[rowIndex]) : {};
    const now = new Date().toISOString();
    item.creado_en = rowIndex > 0 ? rows[rowIndex][WAREHOUSE_COLUMNS.indexOf("creado_en")] : now;
    item.actualizado_en = now;
    const values = WAREHOUSE_COLUMNS.map((column) => item[column]);
    if (rowIndex > 0) sheet.getRange(rowIndex + 1, 1, 1, values.length).setValues([values]);
    else sheet.appendRow(values);
    appendMasterAudit([{ entidad: "ALMACEN", operacion: rowIndex > 0 ? "MODIFICAR" : "CREAR", almacen_id: item.almacen_id, codigo: item.codigo, anterior: previous, nuevo: item }], actor);
    SpreadsheetApp.flush();
    return { ok: true, version: SERVER_VERSION, item: item };
  } finally { lock.releaseLock(); }
}

function toggleWarehouse(warehouseId, active, adminPassword, actor) {
  if (!isAdminPassword(adminPassword)) return { ok: false, retryable: false, error: "Se requiere autorización de administrador." };
  const sheet = getWarehouseSheet();
  const rows = sheet.getDataRange().getDisplayValues();
  const rowIndex = rows.findIndex((row, index) => index > 0 && clean(row[0]) === clean(warehouseId));
  if (rowIndex < 1) return { ok: false, retryable: false, error: "No existe el almacén indicado." };
  const previous = rowToObject(WAREHOUSE_COLUMNS, rows[rowIndex]);
  sheet.getRange(rowIndex + 1, WAREHOUSE_COLUMNS.indexOf("activo") + 1).setValue(Boolean(active));
  sheet.getRange(rowIndex + 1, WAREHOUSE_COLUMNS.indexOf("actualizado_en") + 1).setValue(new Date().toISOString());
  appendMasterAudit([{ entidad: "ALMACEN", operacion: active ? "ACTIVAR" : "DESACTIVAR", almacen_id: warehouseId, codigo: previous.codigo, anterior: previous, nuevo: { ...previous, activo: Boolean(active) } }], actor);
  return { ok: true, version: SERVER_VERSION };
}

function deleteWarehouse(warehouseId, adminPassword, actor) {
  if (!isAdminPassword(adminPassword)) return { ok: false, retryable: false, error: "Se requiere autorización de administrador." };
  const id = clean(warehouseId);
  if (["ESCOBAR_CD", "ESCOBAR_BACK"].indexOf(id) >= 0) return { ok: false, retryable: false, error: "Los almacenes iniciales no se pueden eliminar. Podés desactivarlos." };
  const lock = LockService.getDocumentLock();
  if (!lock.tryLock(10000)) return { ok: false, retryable: true, error: "La administración de almacenes está ocupada." };
  try {
    const sheet = getWarehouseSheet();
    const rows = sheet.getDataRange().getDisplayValues();
    const rowIndex = rows.findIndex((row, index) => index > 0 && clean(row[0]) === id);
    if (rowIndex < 1) return { ok: false, retryable: false, error: "No existe el almacén indicado." };
    const previous = rowToObject(WAREHOUSE_COLUMNS, rows[rowIndex]);
    const scope = warehouseScopeValue(previous);
    const references = [];
    if (sheetHasValue(getPositionSheet(), POSITION_COLUMNS, "almacen_id", id)) references.push("posiciones");
    if (readRecords().some((record) => movementWarehouse(record) === id)) references.push("movimientos");
    if (sheetHasValue(getCountSheet(), COUNT_COLUMNS, "almacen_id", id)) references.push("conteos");
    if (sheetHasValue(getSlottingSheet(), SLOTTING_COLUMNS, "almacen_id", id)) references.push("zonas");
    if (sheetHasValue(getStaffSheet(), STAFF_COLUMNS, "ambito", scope)) references.push("legajos");
    if (references.length) return { ok: false, retryable: false, error: `No se puede eliminar porque tiene ${references.join(", ")} asociados. Desactivalo o eliminá primero esas referencias.` };
    sheet.deleteRow(rowIndex + 1);
    const accessSheet = getAccessSheet();
    const accessRows = accessSheet.getDataRange().getDisplayValues();
    const accessRowIndex = accessRows.findIndex((row, index) => index > 0 && clean(row[0]).toUpperCase() === scope);
    if (accessRowIndex > 0) accessSheet.deleteRow(accessRowIndex + 1);
    appendMasterAudit([{ entidad: "ALMACEN", operacion: "ELIMINAR", almacen_id: id, codigo: previous.codigo, anterior: previous, nuevo: {} }], actor);
    SpreadsheetApp.flush();
    return { ok: true, version: SERVER_VERSION };
  } finally { lock.releaseLock(); }
}

function sheetHasValue(sheet, columns, column, expected) {
  const columnIndex = columns.indexOf(column);
  if (columnIndex < 0 || sheet.getLastRow() < 2) return false;
  return sheet.getRange(2, columnIndex + 1, sheet.getLastRow() - 1, 1).getDisplayValues().some((row) => clean(row[0]).toUpperCase() === clean(expected).toUpperCase());
}

function readPositions(warehouseId) {
  const id = clean(warehouseId);
  const rows = getPositionSheet().getDataRange().getDisplayValues();
  const items = rows.slice(1)
    .map((row) => rowToObject(POSITION_COLUMNS, row))
    .filter((item) => clean(item.almacen_id) === id && clean(item.codigo));
  return { ok: true, version: SERVER_VERSION, items: items };
}

function normalizeManagedPosition(source) {
  const item = {};
  POSITION_COLUMNS.forEach((column) => item[column] = source && source[column] != null ? source[column] : "");
  item.posicion_id = clean(item.posicion_id) || Utilities.getUuid();
  item.almacen_id = clean(item.almacen_id);
  item.codigo = clean(item.codigo);
  item.pasillo = clean(item.pasillo);
  item.modulo = clean(item.modulo);
  item.nivel = clean(item.nivel);
  item.lado = clean(item.lado);
  item.rack = clean(item.rack);
  item.tipo_ubicacion = clean(item.tipo_ubicacion).toUpperCase();
  item.sector = clean(item.sector);
  item.estado = clean(item.estado).toUpperCase() || "ACTIVA";
  item.es_base = Boolean(source && (source.es_base === true || String(source.es_base).toLowerCase() === "true"));
  item.actualizado_en = new Date().toISOString();
  return item;
}

function validateManagedPosition(item) {
  if (!item.almacen_id || !item.codigo) return "Almacén y código de posición son obligatorios.";
  if (!["ACTIVA", "INACTIVA"].includes(item.estado)) return "El estado de la posición no es válido.";
  const warehouses = readWarehouses().items;
  if (!warehouses.some((warehouse) => warehouse.almacen_id === item.almacen_id)) return "El almacén indicado no existe.";
  return "";
}

function savePosition(source, adminPassword, actor) {
  return savePositionsBulk([source], adminPassword, true, actor);
}

function savePositionsBulk(items, adminPassword, allowUpdate, actor) {
  if (!isAdminPassword(adminPassword)) return { ok: false, retryable: false, error: "Se requiere autorización de administrador." };
  if (!Array.isArray(items) || !items.length) return { ok: false, retryable: false, error: "No hay posiciones para guardar." };
  const normalized = items.map(normalizeManagedPosition);
  const errors = normalized.map((item, index) => ({ index: index, codigo: item.codigo, error: validateManagedPosition(item) })).filter((item) => item.error);
  if (errors.length) return { ok: false, retryable: false, error: errors[0].error, errors: errors };
  const inputKeys = new Set();
  for (const item of normalized) {
    const key = `${item.almacen_id}|${item.codigo.toUpperCase()}`;
    if (inputKeys.has(key)) return { ok: false, retryable: false, error: `La posición ${item.codigo} está duplicada en el lote.` };
    inputKeys.add(key);
  }
  const lock = LockService.getDocumentLock();
  if (!lock.tryLock(15000)) return { ok: false, retryable: true, error: "El maestro de posiciones está ocupado." };
  try {
    const sheet = getPositionSheet();
    const rows = sheet.getDataRange().getDisplayValues();
    const indexes = new Map();
    rows.slice(1).forEach((row, index) => indexes.set(`${clean(row[1])}|${clean(row[2]).toUpperCase()}`, index + 2));
    const existing = normalized.find((item) => indexes.has(`${item.almacen_id}|${item.codigo.toUpperCase()}`));
    if (existing && !allowUpdate) {
      return { ok: false, retryable: false, error: `La posición ${existing.codigo} ya existe; la importación no sobrescribe posiciones.` };
    }
    const appended = [];
    const audit = [];
    normalized.forEach((item) => {
      const key = `${item.almacen_id}|${item.codigo.toUpperCase()}`;
      const rowIndex = indexes.get(key);
      const values = POSITION_COLUMNS.map((column) => item[column]);
      const previous = rowIndex ? rowToObject(POSITION_COLUMNS, rows[rowIndex - 1]) : {};
      if (rowIndex) sheet.getRange(rowIndex, 1, 1, values.length).setValues([values]);
      else appended.push(values);
      audit.push({ entidad: "POSICION", operacion: rowIndex ? "MODIFICAR" : "CREAR", almacen_id: item.almacen_id, codigo: item.codigo, anterior: previous, nuevo: item });
    });
    if (appended.length) sheet.getRange(sheet.getLastRow() + 1, 1, appended.length, POSITION_COLUMNS.length).setValues(appended);
    appendMasterAudit(audit, actor);
    SpreadsheetApp.flush();
    return { ok: true, version: SERVER_VERSION, saved: normalized.length };
  } finally { lock.releaseLock(); }
}

function updatePositions(warehouseId, codes, operation, adminPassword, actor) {
  if (!isAdminPassword(adminPassword)) return { ok: false, retryable: false, error: "Se requiere autorización de administrador." };
  const id = clean(warehouseId);
  const selected = new Set((Array.isArray(codes) ? codes : []).map((code) => clean(code).toUpperCase()).filter(Boolean));
  const action = clean(operation).toUpperCase();
  if (!id || !selected.size || !["ACTIVATE", "DEACTIVATE", "DELETE"].includes(action)) return { ok: false, retryable: false, error: "La operación masiva está incompleta." };
  const records = readRecords();
  const warehouseState = reconstructWarehouse(latestActiveRecords(records.filter((record) => movementWarehouse(record) === id), ""), id);
  const sheet = getPositionSheet();
  const rows = sheet.getDataRange().getDisplayValues();
  const results = [];
  const audit = [];
  for (let index = rows.length - 1; index >= 1; index -= 1) {
    const item = rowToObject(POSITION_COLUMNS, rows[index]);
    if (clean(item.almacen_id) !== id || !selected.has(clean(item.codigo).toUpperCase())) continue;
    const used = records.some((record) => movementWarehouse(record) === id && [record.posicion_origen, record.posicion_destino].some((value) => clean(value).toUpperCase() === clean(item.codigo).toUpperCase()));
    if (action === "DEACTIVATE" && warehouseState.stock.has(normalizePosition(item.codigo))) {
      results.push({ codigo: item.codigo, ok: false, error: "La posición está ocupada." });
      continue;
    }
    if (action === "DELETE" && (used || String(item.es_base).toLowerCase() === "true")) {
      results.push({ codigo: item.codigo, ok: false, error: used ? "Tiene movimientos históricos." : "Es una posición base de Escobar; sólo puede desactivarse." });
      continue;
    }
    if (action === "DELETE") sheet.deleteRow(index + 1);
    else sheet.getRange(index + 1, POSITION_COLUMNS.indexOf("estado") + 1).setValue(action === "ACTIVATE" ? "ACTIVA" : "INACTIVA");
    audit.push({ entidad: "POSICION", operacion: action, almacen_id: id, codigo: item.codigo, anterior: item, nuevo: action === "DELETE" ? {} : { ...item, estado: action === "ACTIVATE" ? "ACTIVA" : "INACTIVA" } });
    results.push({ codigo: item.codigo, ok: true });
  }
  appendMasterAudit(audit, actor);
  return { ok: true, version: SERVER_VERSION, results: results };
}

function movementWarehouse(record) {
  const explicit = clean(record && record.almacen_id);
  if (explicit) return explicit;
  const position = clean(record && (record.posicion_destino || record.posicion_origen)).toUpperCase();
  return /^[A-R]\.\d{2}\.[0-4]$/.test(position) ? "ESCOBAR_BACK" : "ESCOBAR_CD";
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

function clearSkuMaster(adminPassword) {
  if (!isAdminPassword(adminPassword)) return { ok: false, retryable: false, error: "Se requiere autorización de administrador." };
  const lock = LockService.getDocumentLock();
  if (!lock.tryLock(15000)) return { ok: false, retryable: true, error: "El maestro está ocupado. Reintenta en unos segundos." };
  try {
    const sheet = getSkuSheet();
    const dataRows = Math.max(0, sheet.getLastRow() - 1);
    if (dataRows) sheet.getRange(2, 1, dataRows, SKU_COLUMNS.length).clearContent();
    SpreadsheetApp.flush();
    return { ok: true, version: SERVER_VERSION, deleted: dataRows };
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
  item.almacen_id = clean(item.almacen_id);
  if (!clean(item.id) || !clean(item.velocityClass) || !item.almacen_id) return { ok: false, retryable: false, error: "La regla de zona está incompleta." };
  if (!readWarehouses().items.some((warehouse) => warehouse.almacen_id === item.almacen_id)) return { ok: false, retryable: false, error: "El almacén de la zona no existe." };
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
  item.almacen_id = clean(item.almacen_id) || "ESCOBAR_CD";
  item.posicion = normalizePositionForWarehouse(item.posicion, item.almacen_id);
  item.estado = clean(item.estado).toUpperCase();
  item.resultado = clean(item.resultado).toUpperCase();
  if (!item.id_conteo || !item.posicion || !clean(item.fecha_hora_utc) || !clean(item.usuario)) {
    return { ok: false, retryable: false, error: "El conteo está incompleto." };
  }
  if (!clean(item.inventario_id)) return { ok: false, retryable: false, error: "El conteo no está asociado a un inventario." };
  const warehouseError = validateWarehouseStatus(item.almacen_id);
  if (warehouseError) return { ok: false, retryable: false, error: warehouseError };
  const positionError = validateRecordPositions({ almacen_id: item.almacen_id, posicion_origen: item.posicion, posicion_destino: "" });
  if (positionError) return { ok: false, retryable: false, error: positionError };
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
    movement.almacen_id = clean(count.almacen_id) || movement.almacen_id || "ESCOBAR_CD";
    const basicError = validateBasicRecord(movement);
    if (basicError) return { ok: false, retryable: false, error: basicError };
    const records = readRecords().filter((record) => movementWarehouse(record) === movement.almacen_id);
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
  item.almacen_id = clean(item.almacen_id);
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
  const configured = {};
  accessScopeValues(true).forEach((scope) => configured[scope] = false);
  values.slice(1).forEach((row) => {
    const scope = clean(row[0]).toUpperCase();
    if (scope in configured) configured[scope] = /^[a-f0-9]{64}$/i.test(clean(row[1]));
  });
  return { ok: true, version: SERVER_VERSION, configured: configured };
}

function saveAccessConfiguration(changes, adminPassword) {
  if (!isAdminPassword(adminPassword)) return { ok: false, retryable: false, error: "Se requiere autorización de administrador." };
  if (!changes || typeof changes !== "object") return { ok: false, retryable: false, error: "No hay contraseñas para actualizar." };
  const validScopes = accessScopeValues(true);
  const entries = Object.keys(changes).map((scope) => clean(scope).toUpperCase()).filter((scope) => validScopes.indexOf(scope) >= 0);
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
    return { ok: false, retryable: false, code: "INVALID_CREDENTIAL_FORMAT", error: "El legajo o la contraseña no tienen un formato válido." };
  }
  if (!isKnownAccessScope(scope)) return { ok: false, retryable: false, code: "SCOPE_UNKNOWN", error: "El almacén o ámbito no es válido." };
  const values = getStaffSheet().getDataRange().getDisplayValues();
  const item = values.slice(1).map(staffRowToItem).find((candidate) => candidate.legajo === legajo);
  if (!item || !item.activo) return { ok: false, retryable: false, code: "STAFF_NOT_FOUND_OR_INACTIVE", error: "Legajo inexistente o desactivado." };
  if (scope === "ALL" && item.rol !== "admin") return { ok: false, retryable: false, code: "SCOPE_FORBIDDEN", error: "El legajo no está habilitado para este ámbito." };
  if (item.rol !== "admin" && item.ambito !== "ALL" && item.ambito !== scope) return { ok: false, retryable: false, code: "SCOPE_FORBIDDEN", error: "El legajo no está habilitado para este ámbito." };
  const accessRows = getAccessSheet().getDataRange().getDisplayValues();
  const access = accessRows.slice(1).find((row) => clean(row[0]).toUpperCase() === scope);
  if (!access || !clean(access[1])) return { ok: false, retryable: false, code: "SCOPE_KEY_NOT_CONFIGURED", error: "La clave del ámbito todavía no fue configurada." };
  if (clean(access[1]).toLowerCase() !== hash) return { ok: false, retryable: false, code: "SCOPE_PASSWORD_INVALID", error: "La contraseña del ámbito es incorrecta." };
  return { ok: true, version: SERVER_VERSION, account: publicStaffItem(item) };
}

function saveStaff(source, adminPassword) {
  if (!isAdminPassword(adminPassword)) return { ok: false, retryable: false, error: "Se requiere autorización de administrador." };
  const item = staffRowToItem(STAFF_COLUMNS.map((column) => source && source[column] != null ? source[column] : ""));
  if (!/^\d{1,12}$/.test(item.legajo)) return { ok: false, retryable: false, error: "El legajo debe ser numérico." };
  if (!item.nombre) return { ok: false, retryable: false, error: "El nombre es obligatorio." };
  if (STAFF_ROLES.indexOf(item.rol) < 0) return { ok: false, retryable: false, error: "El rol no es válido." };
  if (!isKnownAccessScope(item.ambito)) return { ok: false, retryable: false, error: "El almacén o ámbito no es válido." };
  if (item.ambito === "ALL" && item.rol !== "admin") return { ok: false, retryable: false, error: "Todos los almacenes está reservado para administradores." };

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
  const warehouseError = validateWarehouseStatus(record.almacen_id);
  if (warehouseError) return { ok: false, retryable: false, error: warehouseError };

  const lock = LockService.getDocumentLock();
  if (!lock.tryLock(15000)) return { ok: false, retryable: true, error: "El registro central está ocupado. Reintenta en unos segundos." };

  try {
    const positionError = validateRecordPositions(record);
    if (positionError) return { ok: false, retryable: false, error: positionError };
    const skuError = validateMovementSkus(record);
    if (skuError) return { ok: false, retryable: false, error: skuError };
    const records = readRecords();
    const warehouseRecords = records.filter((item) => movementWarehouse(item) === record.almacen_id);
    const duplicate = records.find((item) => clean(item.id_movimiento) === record.id_movimiento && clean(item.actualizado_en) === record.actualizado_en);
    if (duplicate) return { ok: true, duplicate: true, version: SERVER_VERSION };

    if (["MOVE", "OUT"].includes(record.tipo) && !record.id_pallet) {
      const warehouse = reconstructWarehouse(latestActiveRecords(warehouseRecords, record.id_movimiento), record.almacen_id);
      record.id_pallet = clean(warehouse.stock.get(record.posicion_origen) && warehouse.stock.get(record.posicion_origen).id_pallet);
    }

    const validationError = validateCommand(record, warehouseRecords);
    if (validationError) return { ok: false, retryable: false, error: validationError };

    createDailyBackup();
    getSheet().appendRow(COLUMNS.map((column) => record[column]));
    SpreadsheetApp.flush();
    return { ok: true, version: SERVER_VERSION };
  } finally {
    lock.releaseLock();
  }
}

function validateWarehouseStatus(warehouseId) {
  const warehouse = readWarehouses().items.find((item) => item.almacen_id === clean(warehouseId));
  if (!warehouse) return "El almacén indicado no existe.";
  if (!warehouse.activo) return `El almacén ${warehouse.nombre || warehouse.codigo} está inactivo.`;
  return "";
}

function validateRecordPositions(record) {
  const warehouseId = clean(record.almacen_id);
  const isEmbeddedEscobar = warehouseId === "ESCOBAR_CD" || warehouseId === "ESCOBAR_BACK";
  const positions = new Map(readPositions(warehouseId).items.map((item) => [clean(item.codigo).toUpperCase(), item]));
  const referenced = [record.posicion_origen, record.posicion_destino].map(clean).filter(Boolean);
  for (const code of referenced) {
    const item = positions.get(code.toUpperCase());
    if (item && clean(item.estado).toUpperCase() === "INACTIVA") return `La posición ${code} está inactiva.`;
    if (!item && !isEmbeddedEscobar) return `La posición ${code} no existe en el almacén seleccionado.`;
  }
  return "";
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
  const warehouse = reconstructWarehouse(effective, record.almacen_id);
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

function reconstructWarehouse(records, warehouseId) {
  const stock = new Map(clean(warehouseId) === "ESCOBAR_CD" ? Object.keys(BASELINE_STOCK).map((position) => [position, BASELINE_STOCK[position]]) : []);
  const blocks = new Set();
  records.forEach((record) => {
    const type = clean(record.tipo).toUpperCase();
    const from = normalizePositionForWarehouse(record.posicion_origen, warehouseId);
    const to = normalizePositionForWarehouse(record.posicion_destino, warehouseId);
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
  if (!record.almacen_id) return "Falta identificar el almacén del movimiento.";
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
  record.almacen_id = clean(record.almacen_id) || "ESCOBAR_CD";
  record.posicion_origen = normalizePositionForWarehouse(record.posicion_origen, record.almacen_id);
  record.posicion_destino = normalizePositionForWarehouse(record.posicion_destino, record.almacen_id);
  record.cantidad = Number(record.cantidad) || 0;
  record.delta_ocupacion = Number(record.delta_ocupacion) || 0;
  record.pallets = Number(record.pallets) || 0;
  record.bultos = Number(record.bultos) || record.cantidad || 0;
  record.unidades = Number(record.unidades) || 0;
  record.admin_password = clean(payload && payload.admin_password);
  return record;
}

function normalizePositionForWarehouse(value, warehouseId) {
  const position = clean(value);
  if (!["ESCOBAR_CD", "ESCOBAR_BACK"].includes(clean(warehouseId))) return position;
  return normalizePosition(position);
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
