const SERVER_VERSION = 20;
const SHEET_NAME = "Hoja 1";
const SKU_SHEET_NAME = "Maestro SKU";
const SLOTTING_SHEET_NAME = "Zonas SKU";
const ADMIN_PASSWORD_HASH = "6ca6cb535d1f4783a1af2501bf80c6cf3fcdb1e1ff9f3b77499a8939faf139aa";
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
];
const SKU_COLUMNS = ["sku","description","ean","category","unit","unitsPerCase","casesPerPallet","unitsPerPallet","weightKg","lotControl","expiryControl","minStock","maxStock","preferredLocation","active","dailyConsumption","velocityClass","positionsRequired"];
const SLOTTING_COLUMNS = ["id","velocityClass","aisle","side","rackFrom","rackTo","moduleFrom","moduleTo","level"];

const BASELINE_STOCK = {
  "A2.02.0": { sku: "5555555", cantidad: 1 },
  "C1.12.3": { sku: "333333", cantidad: 1 },
  "D2.02.0": { sku: "123123", cantidad: 1 },
  "H1.20.2": { sku: "22222", cantidad: 1 },
};

function doGet(event) {
  const callback = safeCallback(event && event.parameter && event.parameter.callback);
  try {
    const action = clean(event && event.parameter && event.parameter.action) || "list";
    if (action === "list") return jsonp(callback, { ok: true, version: SERVER_VERSION, records: readRecords() });
    if (action === "sku_list") return jsonp(callback, { ok: true, version: SERVER_VERSION, items: readSkuMaster() });
    if (action === "slotting_list") return jsonp(callback, { ok: true, version: SERVER_VERSION, items: readSlottingRules() });
    const payload = JSON.parse(clean(event.parameter.payload) || "{}");
    if (action === "sku_save") return jsonp(callback, saveSkuItems([payload.item], payload.admin_password));
    if (action === "sku_bulk") return jsonp(callback, saveSkuItems(payload.items, payload.admin_password));
    if (action === "slotting_save") return jsonp(callback, saveSlottingRule(payload.rule, payload.admin_password));
    if (action === "slotting_delete") return jsonp(callback, deleteSlottingRule(payload.id, payload.admin_password));
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
  if (clean(adminPassword) !== ADMIN_PASSWORD_HASH) return { ok: false, retryable: false, error: "Se requiere autorización de administrador." };
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
  if (clean(adminPassword) !== ADMIN_PASSWORD_HASH) return { ok: false, retryable: false, error: "Se requiere autorización de administrador." };
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
  if (clean(adminPassword) !== ADMIN_PASSWORD_HASH) return { ok: false, retryable: false, error: "Se requiere autorización de administrador." };
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
  return sheet;
}

function processCommand(payload) {
  const record = normalizeRecord(payload);
  const basicError = validateBasicRecord(record);
  if (basicError) return { ok: false, retryable: false, error: basicError };

  const lock = LockService.getDocumentLock();
  if (!lock.tryLock(15000)) return { ok: false, retryable: true, error: "El registro central está ocupado. Reintenta en unos segundos." };

  try {
    const records = readRecords();
    const duplicate = records.find((item) => clean(item.id_movimiento) === record.id_movimiento && clean(item.actualizado_en) === record.actualizado_en);
    if (duplicate) return { ok: true, duplicate: true, version: SERVER_VERSION };

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

function validateCommand(record, records) {
  const existing = records.some((item) => clean(item.id_movimiento) === record.id_movimiento);
  if (record.estado === "ANULADO") return existing ? "" : "No existe el movimiento que se quiere anular.";

  const effective = latestActiveRecords(records, record.id_movimiento);
  const warehouse = reconstructWarehouse(effective);
  const from = record.posicion_origen;
  const to = record.posicion_destino;

  if ((record.tipo === "BLOCK" || record.tipo === "UNBLOCK") && record.admin_password !== ADMIN_PASSWORD_HASH) {
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
  return "";
}

function reconstructWarehouse(records) {
  const stock = new Map(Object.keys(BASELINE_STOCK).map((position) => [position, BASELINE_STOCK[position]]));
  const blocks = new Set();
  records.forEach((record) => {
    const type = clean(record.tipo).toUpperCase();
    const from = normalizePosition(record.posicion_origen);
    const to = normalizePosition(record.posicion_destino);
    if (type === "IN" && to) stock.set(to, { sku: clean(record.sku), cantidad: Number(record.cantidad) || 1 });
    if (type === "MOVE" && from && to) {
      const item = stock.get(from) || { sku: clean(record.sku), cantidad: Number(record.cantidad) || 1 };
      const quantity = Number(record.cantidad) || 1;
      const remaining = Number(item.cantidad || 0) - quantity;
      if (remaining > 0) stock.set(from, { sku: item.sku, cantidad: remaining });
      else stock.delete(from);
      stock.set(to, { sku: item.sku || clean(record.sku), cantidad: quantity });
    }
    if (type === "OUT" && from) {
      const item = stock.get(from);
      if (item) {
        const remaining = Number(item.cantidad || 0) - (Number(record.cantidad) || 1);
        if (remaining > 0) stock.set(from, { sku: item.sku, cantidad: remaining });
        else stock.delete(from);
      }
    }
    if (type === "BLOCK" && to) blocks.add(to);
    if (type === "UNBLOCK" && from) blocks.delete(from);
  });
  return { stock: stock, blocks: blocks };
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
  if (record.estado !== "ANULADO" && !["IN", "MOVE", "OUT", "BLOCK", "UNBLOCK"].includes(record.tipo)) return "Tipo de movimiento no válido.";
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
