const STORAGE_KEY = "mini-wms-state-v2";
const SYNC_CONFIG_KEY = "mini-wms-sync-config-v2";
const SYNC_OUTBOX_KEY = "mini-wms-sync-outbox-v1";
const SKU_MASTER_KEY = "mini-wms-sku-master-v1";
const SLOTTING_RULES_KEY = "mini-wms-slotting-rules-v1";
const DEFAULT_SYNC_ENDPOINT = "https://script.google.com/macros/s/AKfycbzR8nRr6BmE1vyPowE76KU1SWG4Sn8HcNAy8i4mJ2l90vqHZQ_EiZK-Yp6pRl9D6eW48w/exec";
const ADMIN_USER = "Usuario";
const ADMIN_PASSWORD_HASH = "6ca6cb535d1f4783a1af2501bf80c6cf3fcdb1e1ff9f3b77499a8939faf139aa";
const SKU_FIELDS = ["sku","description","ean","category","unit","unitsPerCase","casesPerPallet","unitsPerPallet","weightKg","lotControl","expiryControl","minStock","maxStock","preferredLocation","active","dailyConsumption","velocityClass"];
const VELOCITY_CLASSES = ["SUPER_A", "A", "B", "C", "ESTACIONAL"];
const POSITION_3D = {
  halfWidth: 0.38,
  halfLength: 0.456,
  height: 13.4,
  base: 7,
  levelPitch: 85,
};

const state = {
  original: [],
  locations: [],
  layout3d: null,
  movements: [],
  history: [],
  analyticsPeriod: "12",
  waterfallGranularity: "day",
  waterfallWindow: 0,
  scanTarget: null,
  scanStream: null,
  scanFrame: 0,
  scanDetector: null,
  filters: {
    query: "",
    side: "all",
    level: "all",
    status: "all",
    position: "",
    aisle: "",
    locationSide: "all",
    rack: "",
    locationLevel: "all",
    material: "",
    locationStatus: "all",
  },
  view3d: {
    side: "all",
    level: "0",
    rotation: -12,
    tilt: 56,
    scale: 0.35,
    panX: 0,
    panY: 0,
    dragging: false,
    dragMode: "orbit",
    didDrag: false,
    lastPointer: null,
  },
  render3dStacks: [],
  render3dRacks: [],
  projection3d: null,
  syncConfig: { operator: "", endpoint: DEFAULT_SYNC_ENDPOINT, authenticated: false },
  syncOutbox: [],
  syncBusy: false,
  syncPulling: false,
  syncTimer: 0,
  syncError: "",
  centralBlocks: new Map(),
  skuMaster: [],
  slottingRules: [],
  pickingOrders: [],
};

const shadeCache = new Map();
const CODE39 = {
  "0":"nnnwwnwnn","1":"wnnwnnnnw","2":"nnwwnnnnw","3":"wnwwnnnnn","4":"nnnwwnnnw",
  "5":"wnnwwnnnn","6":"nnwwwnnnn","7":"nnnwnnwnw","8":"wnnwnnwnn","9":"nnwwnnwnn",
  A:"wnnnnwnnw",B:"nnwnnwnnw",C:"wnwnnwnnn",D:"nnnnwwnnw",E:"wnnnwwnnn",F:"nnwnwwnnn",
  G:"nnnnnwwnw",H:"wnnnnwwnn",I:"nnwnnwwnn",J:"nnnnwwwnn",K:"wnnnnnnww",L:"nnwnnnnww",
  M:"wnwnnnnwn",N:"nnnnwnnww",O:"wnnnwnnwn",P:"nnwnwnnwn",Q:"nnnnnnwww",R:"wnnnnnwwn",
  S:"nnwnnnwwn",T:"nnnnwnwwn",U:"wwnnnnnnw",V:"nwwnnnnnw",W:"wwwnnnnnn",X:"nwnnwnnnw",
  Y:"wwnnwnnnn",Z:"nwwnwnnnn","-":"nwnnnnwnw",".":"wwnnnnwnn"," ":"nwwnnnwnn","*":"nwnnwnwnn"
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

const fmt = new Intl.NumberFormat("es-AR");
const dateTimeFormatter = new Intl.DateTimeFormat("es-AR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

function formatDateTime(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "" : dateTimeFormatter.format(date);
}

function formatMovementDate(move) {
  return formatDateTime(move.timestamp) || String(move.date || "");
}

async function init() {
  const embedded = window.WMS_EMBEDDED_DATA;
  let payload;

  if (embedded) {
    payload = embedded.locations;
    state.layout3d = embedded.layout3d;
  } else {
    const [response, layoutResponse] = await Promise.all([
      fetch("data/locations.json"),
      fetch("data/layout3d.json"),
    ]);
    payload = await response.json();
    state.layout3d = await layoutResponse.json();
  }
  state.original = payload.locations;

  const saved = loadSavedState();
  const savedLocations = new Map((saved?.locations || []).map((location) => [location.id, location]));
  state.locations = state.original.map((location) => ({ ...structuredClone(location), ...(savedLocations.get(location.id) || {}) }));
  state.movements = saved?.movements || [];
  state.movements.forEach((move, index) => {
    if (!move.id) move.id = `legacy-${movementTimestamp(move) || 0}-${index}`;
  });
  state.locations.forEach((location) => {
    if (!("occupiedSince" in location)) location.occupiedSince = null;
    if (!("blocked" in location)) location.blocked = false;
    if (!("blockReason" in location)) location.blockReason = "";
  });
  state.centralBlocks = new Map(
    state.locations.filter((location) => location.blocked).map((location) => [location.id, location.blockReason])
  );
  state.history = saved?.history || [createSnapshot(new Date().toISOString())];
  state.syncConfig = loadJson(SYNC_CONFIG_KEY, state.syncConfig);
  if (!state.syncConfig.endpoint) state.syncConfig.endpoint = DEFAULT_SYNC_ENDPOINT;
  state.syncOutbox = loadJson(SYNC_OUTBOX_KEY, []);
  state.skuMaster = loadJson(SKU_MASTER_KEY, []);
  state.slottingRules = loadJson(SLOTTING_RULES_KEY, []);
  saveState();

  fillLevelFilter();
  fillLabelRackFilter();
  bindEvents();
  renderAll();
  renderSyncStatus();
  if (!state.syncConfig.authenticated) openSyncSettings();
  flushSyncOutbox();
  await pullCentralMovements();
  await pullSkuMaster();
  await pullSlottingRules();
  state.syncTimer = window.setInterval(pullCentralMovements, 15000);
}

function loadJson(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) || fallback;
  } catch {
    return fallback;
  }
}

function loadSavedState() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
}

function saveState() {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ locations: state.locations, movements: state.movements, history: state.history })
  );
}

function fillLevelFilter() {
  const levels = [...new Set(state.original.map((item) => item.level))].sort((a, b) => a - b);
  const filter = $("#levelFilter");
  levels.forEach((level) => {
    const option = document.createElement("option");
    option.value = String(level);
    option.textContent = `Nivel ${level}`;
    filter.appendChild(option);
  });
}

function bindEvents() {
  $$(".nav-item").forEach((button) => {
    button.addEventListener("click", () => switchView(button.dataset.view));
  });
  $$('[data-sku-section]').forEach((button) => button.addEventListener("click", () => switchSkuSection(button.dataset.skuSection)));

  const locationFilterIds = ["locationPositionFilter", "locationAisleFilter", "locationSideFilter", "locationRackFilter", "locationLevelFilter", "locationMaterialFilter", "locationStatusFilter"];
  locationFilterIds.forEach((id) => $(`#${id}`).addEventListener("input", updateLocationFilters));
  $("#clearLocationFilters").addEventListener("click", clearLocationFilters);

  $("#sideFilter").addEventListener("change", (event) => {
    state.filters.side = event.target.value;
    renderMap();
  });

  $("#levelFilter").addEventListener("change", (event) => {
    state.filters.level = event.target.value;
    renderMap();
  });

  $("#statusFilter").addEventListener("change", (event) => {
    state.filters.status = event.target.value;
    renderMap();
  });

  $("#side3dFilter").addEventListener("change", (event) => {
    state.view3d.side = event.target.value;
    render3dMap();
  });

  $("#level3dFilter").addEventListener("change", (event) => {
    state.view3d.level = event.target.value;
    update3dTransform();
  });

  $("#rotateLeft").addEventListener("click", () => {
    state.view3d.rotation -= 8;
    update3dTransform();
  });

  $("#rotateRight").addEventListener("click", () => {
    state.view3d.rotation += 8;
    update3dTransform();
  });

  $("#tiltUp").addEventListener("click", () => {
    state.view3d.tilt = Math.min(85, state.view3d.tilt + 4);
    update3dTransform();
  });

  $("#tiltDown").addEventListener("click", () => {
    state.view3d.tilt = Math.max(5, state.view3d.tilt - 4);
    update3dTransform();
  });

  $("#reset3dView").addEventListener("click", () => {
    Object.assign(state.view3d, { rotation: -12, tilt: 56, scale: 0.35, panX: 0, panY: 0 });
    update3dTransform();
  });

  bind3dMouseControls();

  $("#quickMove").addEventListener("submit", handleMovement);
  $("#skuForm").addEventListener("submit", saveSku);
  $("#clearSkuForm").addEventListener("click", clearSkuForm);
  $("#skuSearch").addEventListener("input", renderSkuMaster);
  $("#skuImport").addEventListener("change", importSkuFile);
  $("#downloadSkuTemplate").addEventListener("click", downloadSkuTemplate);
  $("#skuTable").addEventListener("click", editSkuFromTable);
  $("#slottingForm").addEventListener("submit", saveSlottingRule);
  $("#slottingTable").addEventListener("click", deleteSlottingRule);
  $("#pickingForm").addEventListener("submit", calculatePickingRoute);
  $("#loadPickingExample").addEventListener("click", loadPickingExample);
  $("#clearPicking").addEventListener("click", clearPickingRoute);
  $("#addPickingLine").addEventListener("click", addPickingLine);
  $("#pickingSku").addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      addPickingLine();
    }
  });
  $("#pickingLines").addEventListener("input", renderPickingDraft);
  $("#pickingDraft").addEventListener("click", removePickingLine);
  $("#pickingImport").addEventListener("change", importPickingFile);
  $("#pickingOrderSelect").addEventListener("change", loadImportedPickingOrder);
  $("#downloadPickingTemplate").addEventListener("click", downloadPickingTemplate);
  $("#registerMovement").addEventListener("submit", handleMovement);
  $("#registerMovement").addEventListener("keydown", handleRegisterEnter);
  $$("[data-move-type]").forEach((button) => {
    button.addEventListener("click", () => setMovementType(button.dataset.moveType));
  });
  ["#registerMaterial", "#registerFrom", "#registerTo", "#registerQuantity"].forEach((selector) => {
    $(selector).addEventListener("input", renderMovementPreview);
  });
  $("#useSuggestedPosition").addEventListener("click", applyPutawaySuggestion);
  $("#closeDetail").addEventListener("click", () => $("#detailPanel").classList.add("hidden"));
  $("#toggleLocationBlock").addEventListener("click", toggleLocationBlock);
  $("#blockLocationForm").addEventListener("submit", saveLocationBlock);
  $("#closeBlockLocation").addEventListener("click", closeBlockLocationDialog);
  $("#cancelBlockLocation").addEventListener("click", closeBlockLocationDialog);
  $("#resetData").addEventListener("click", resetData);
  $("#exportCsv").addEventListener("click", exportMovementsCsv);
  $("#movementsTable").addEventListener("click", handleDeleteMovementClick);
  $("#recentMovementList").addEventListener("click", handleDeleteMovementClick);
  $("#movementsTable").addEventListener("click", handleEditMovementClick);
  $("#recentMovementList").addEventListener("click", handleEditMovementClick);
  $("#editMovementForm").addEventListener("submit", saveEditedMovement);
  $("#closeEditMovement").addEventListener("click", closeEditMovement);
  $("#cancelEditMovement").addEventListener("click", closeEditMovement);
  $$("[data-scan-target]").forEach((button) => button.addEventListener("click", () => startBarcodeCapture(button.dataset.scanTarget)));
  $("#barcodeCapture").addEventListener("change", decodeCapturedBarcode);
  $("#closeScanner").addEventListener("click", closeLiveScanner);
  $("#scannerPhotoFallback").addEventListener("click", openPhotoScanner);
  $("#scannerDialog").addEventListener("close", stopScannerCamera);
  ["#labelSide", "#labelLevel", "#labelRack"].forEach((selector) => $(selector).addEventListener("change", renderLabels));
  $("#printLabels").addEventListener("click", () => window.print());
  $("#analyticsPeriod").addEventListener("change", (event) => {
    state.analyticsPeriod = event.target.value;
    renderAnalytics();
  });
  $("#waterfallGranularity").addEventListener("change", (event) => {
    state.waterfallGranularity = event.target.value;
    state.waterfallWindow = 0;
    renderAnalytics();
  });
  $("#waterfallZoomIn").addEventListener("click", () => changeWaterfallZoom(1));
  $("#waterfallZoomOut").addEventListener("click", () => changeWaterfallZoom(-1));
  $("#waterfallZoomReset").addEventListener("click", () => {
    state.waterfallWindow = 0;
    renderAnalytics();
  });
  $("#occupancyWaterfall").addEventListener("wheel", (event) => {
    event.preventDefault();
    changeWaterfallZoom(event.deltaY < 0 ? 1 : -1);
  }, { passive: false });
  $("#openSyncSettings").addEventListener("click", openSyncSettings);
  $("#closeSyncSettings").addEventListener("click", closeSyncSettings);
  $("#syncSettingsForm").addEventListener("submit", saveSyncSettings);
  $("#retrySync").addEventListener("click", flushSyncOutbox);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) pullCentralMovements();
  });
  $("#syncSettingsDialog").addEventListener("cancel", (event) => {
    if (!state.syncConfig.authenticated) event.preventDefault();
  });
}

function openSyncSettings() {
  $("#operatorName").value = state.syncConfig.operator || "";
  $("#operatorPassword").value = "";
  $("#syncEndpoint").value = state.syncConfig.endpoint || "";
  $("#syncSettingsMessage").textContent = state.syncOutbox.length
    ? `${state.syncOutbox.length} registro(s) pendientes de envío.`
    : state.syncError || "Los movimientos se guardan en este dispositivo y en el registro central.";
  if (!$("#syncSettingsDialog").open) $("#syncSettingsDialog").showModal();
}

async function saveSyncSettings(event) {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const operator = String(data.get("operator") || "").trim();
  const password = String(data.get("password") || "");
  const hash = await sha256(password);
  if (operator.toLowerCase() !== ADMIN_USER.toLowerCase() || hash !== ADMIN_PASSWORD_HASH) {
    $("#syncSettingsMessage").textContent = "Usuario o contraseña incorrectos.";
    $("#syncSettingsMessage").classList.add("error");
    $("#operatorPassword").select();
    return;
  }
  state.syncConfig = {
    operator: ADMIN_USER,
    endpoint: String(data.get("endpoint") || "").trim(),
    authenticated: true,
  };
  localStorage.setItem(SYNC_CONFIG_KEY, JSON.stringify(state.syncConfig));
  $("#syncSettingsMessage").classList.remove("error");
  renderSyncStatus();
  $("#syncSettingsDialog").close();
  flushSyncOutbox();
}

function closeSyncSettings() {
  if (state.syncConfig.authenticated) $("#syncSettingsDialog").close();
}

async function sha256(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function renderSyncStatus() {
  $("#operatorLabel").textContent = state.syncConfig.operator || "Identificar operario";
  const indicator = $("#syncIndicator");
  indicator.className = `sync-indicator ${state.syncOutbox.length ? "pending" : state.syncConfig.endpoint ? "online" : "local"}`;
  $("#openSyncSettings").title = state.syncOutbox.length
    ? `${state.syncOutbox.length} registro(s) pendientes`
    : state.syncError || (state.syncConfig.endpoint ? "Registro central conectado" : "Guardado local; falta configurar el registro central");
}

function queueMovementSync(action, movement) {
  state.syncOutbox.push({
    id_movimiento: movement.id,
    fecha_hora_utc: movement.timestamp || new Date().toISOString(),
    fecha_local: movement.timestamp ? formatDateTime(movement.timestamp) : movement.date || formatDateTime(),
    tipo: movement.type,
    sku: movement.material || "",
    posicion_origen: movement.from || "",
    posicion_destino: movement.to || "",
    cantidad: Number(movement.quantity || 0),
    delta_ocupacion: Number(movement.occupancyDelta || 0),
    permanencia_horas: movement.dwellHours ?? "",
    usuario: state.syncConfig.operator || "Sin identificar",
    estado: action,
    actualizado_en: new Date().toISOString(),
    admin_password: movement.adminPassword || "",
  });
  localStorage.setItem(SYNC_OUTBOX_KEY, JSON.stringify(state.syncOutbox));
  renderSyncStatus();
  flushSyncOutbox();
}

async function flushSyncOutbox() {
  if (state.syncBusy || !state.syncConfig.endpoint || !state.syncOutbox.length) return;
  state.syncBusy = true;
  try {
    while (state.syncOutbox.length) {
      const result = await sendCentralCommand(state.syncOutbox[0]);
      if (!result.ok) {
        if (result.retryable !== false) throw new Error(result.error || "No se pudo confirmar el registro");
        state.syncError = result.error || "El movimiento fue rechazado por el registro central.";
        state.syncOutbox.shift();
        localStorage.setItem(SYNC_OUTBOX_KEY, JSON.stringify(state.syncOutbox));
        renderSyncStatus();
        await pullCentralMovements();
        alert(state.syncError);
        continue;
      }
      state.syncError = "";
      state.syncOutbox.shift();
      localStorage.setItem(SYNC_OUTBOX_KEY, JSON.stringify(state.syncOutbox));
      renderSyncStatus();
    }
    window.setTimeout(pullCentralMovements, 1200);
  } catch (error) {
    console.warn("Registro central pendiente:", error);
    renderSyncStatus();
  } finally {
    state.syncBusy = false;
  }
}

function sendCentralCommand(record) {
  const callbackName = `wmsCommand_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const script = document.createElement("script");
  const separator = state.syncConfig.endpoint.includes("?") ? "&" : "?";
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      delete window[callbackName];
      script.remove();
    };
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error("El servidor no confirmó el movimiento a tiempo."));
    }, 12000);
    window[callbackName] = (payload) => {
      window.clearTimeout(timeout);
      cleanup();
      resolve(payload || { ok: false, error: "Respuesta central inválida" });
    };
    script.onerror = () => {
      window.clearTimeout(timeout);
      cleanup();
      reject(new Error("No se pudo conectar con el registro central."));
    };
    script.src = `${state.syncConfig.endpoint}${separator}action=command&callback=${encodeURIComponent(callbackName)}&payload=${encodeURIComponent(JSON.stringify(record))}&_=${Date.now()}`;
    document.head.appendChild(script);
  });
}

function pullCentralMovements() {
  if (state.syncPulling || !state.syncConfig.endpoint) return Promise.resolve();
  state.syncPulling = true;
  const callbackName = `wmsCentral_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const script = document.createElement("script");
  const separator = state.syncConfig.endpoint.includes("?") ? "&" : "?";

  return new Promise((resolve) => {
    const cleanup = () => {
      delete window[callbackName];
      script.remove();
      state.syncPulling = false;
      resolve();
    };
    const timeout = window.setTimeout(cleanup, 10000);

    window[callbackName] = (payload) => {
      window.clearTimeout(timeout);
      try {
        if (!payload?.ok || !Array.isArray(payload.records)) throw new Error(payload?.error || "Respuesta inválida");
        applyCentralMovements(payload.records);
      } catch (error) {
        console.warn("No se pudo aplicar el historial central:", error);
      }
      cleanup();
    };
    script.onerror = () => {
      window.clearTimeout(timeout);
      cleanup();
    };
    script.src = `${state.syncConfig.endpoint}${separator}action=list&callback=${encodeURIComponent(callbackName)}&_=${Date.now()}`;
    document.head.appendChild(script);
  });
}

function applyCentralMovements(records) {
  const current = new Map();
  const blocks = new Map();
  records.forEach((record) => {
    const id = String(record.id_movimiento || "").trim();
    const status = String(record.estado || "CREADO").toUpperCase();
    if (!id) return;
    if (status === "ANULADO") {
      current.delete(id);
      return;
    }
    const type = String(record.tipo || "").toUpperCase();
    if (type === "BLOCK") {
      const position = normalizePosition(record.posicion_destino);
      if (position) blocks.set(position, String(record.sku || "Sin motivo informado"));
      return;
    }
    if (type === "UNBLOCK") {
      const position = normalizePosition(record.posicion_origen);
      if (position) blocks.delete(position);
      return;
    }
    if (!["IN", "MOVE", "OUT"].includes(type)) return;
    current.set(id, {
      id,
      timestamp: String(record.fecha_hora_utc || ""),
      date: String(record.fecha_local || ""),
      type,
      material: String(record.sku || ""),
      from: normalizePosition(record.posicion_origen),
      to: normalizePosition(record.posicion_destino),
      quantity: Number(record.cantidad || 0),
      occupancyDelta: Number(record.delta_ocupacion || 0),
      dwellHours: record.permanencia_horas === "" ? null : Number(record.permanencia_horas),
    });
  });

  const centralMovements = [...current.values()].sort((a, b) => movementTimestamp(b) - movementTimestamp(a));
  const blocksChanged = JSON.stringify([...blocks]) !== JSON.stringify([...state.centralBlocks]);
  if (!blocksChanged && JSON.stringify(centralMovements) === JSON.stringify(state.movements)) return;
  state.centralBlocks = blocks;
  rebuildInventoryFromMovements(centralMovements);
}

function bind3dMouseControls() {
  const shell = $(".map3d-shell");
  if (!shell) return;

  let frame = 0;
  const scheduleTransform = () => {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      update3dTransform();
    });
  };

  shell.addEventListener("wheel", (event) => {
    event.preventDefault();
    const nextScale = state.view3d.scale * (event.deltaY > 0 ? 0.92 : 1.08);
    state.view3d.scale = clamp(nextScale, 0.35, 1.8);
    scheduleTransform();
  });

  shell.addEventListener("pointerdown", (event) => {
    state.view3d.dragging = true;
    state.view3d.didDrag = false;
    state.view3d.dragMode = event.button === 2 ? "pan" : "orbit";
    state.view3d.lastPointer = { x: event.clientX, y: event.clientY };
    shell.setPointerCapture(event.pointerId);
    shell.classList.add("dragging");
  });

  shell.addEventListener("pointermove", (event) => {
    if (!state.view3d.dragging || !state.view3d.lastPointer) return;
    const dx = event.clientX - state.view3d.lastPointer.x;
    const dy = event.clientY - state.view3d.lastPointer.y;
    if (Math.abs(dx) + Math.abs(dy) > 2) state.view3d.didDrag = true;
    if (state.view3d.dragMode === "pan") {
      state.view3d.panX += dx;
      state.view3d.panY += dy;
    } else {
      state.view3d.rotation -= dx * 0.18;
      state.view3d.tilt = clamp(state.view3d.tilt + dy * 0.15, 5, 85);
    }
    state.view3d.lastPointer = { x: event.clientX, y: event.clientY };
    scheduleTransform();
  });

  shell.addEventListener("pointerup", (event) => end3dDrag(shell, event.pointerId));
  shell.addEventListener("pointercancel", (event) => end3dDrag(shell, event.pointerId));
  shell.addEventListener("contextmenu", (event) => event.preventDefault());

  shell.addEventListener("click", (event) => {
    if (state.view3d.didDrag || event.button !== 0) {
      state.view3d.didDrag = false;
      return;
    }
    const locationId = pick3dLocation(event.clientX, event.clientY);
    const location = findLocation(locationId);
    if (location) openDetail(location);
  });

  window.addEventListener("resize", scheduleTransform);
}

function end3dDrag(shell, pointerId) {
  state.view3d.dragging = false;
  state.view3d.lastPointer = null;
  shell.releasePointerCapture?.(pointerId);
  shell.classList.remove("dragging");
  requestAnimationFrame(update3dTransform);
}

function switchView(view) {
  $$(".nav-item").forEach((button) => button.classList.toggle("active", button.dataset.view === view));
  $$(".view").forEach((section) => section.classList.toggle("active", section.id === view));
  if (window.matchMedia("(max-width: 640px)").matches) {
    $(`.nav-item[data-view="${view}"]`)?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }
  if (view === "map3d") requestAnimationFrame(update3dTransform);
  if (view === "analytics") requestAnimationFrame(renderAnalytics);
  if (view === "register") requestAnimationFrame(() => focusRegisterField());
  if (view === "labels") requestAnimationFrame(renderLabels);
}

function renderAll() {
  renderKpis();
  renderSideBars();
  renderMap();
  render3dMap();
  renderLocationsTable();
  renderMovements();
  renderAnalytics();
  renderRegistration();
  renderSkuMaster();
  renderSlottingRules();
  renderSkuAlerts();
}

function switchSkuSection(section) {
  $$('[data-sku-section]').forEach((button) => button.classList.toggle("active", button.dataset.skuSection === section));
  $$('[data-sku-panel]').forEach((panel) => {
    const active = panel.dataset.skuPanel === section;
    panel.hidden = !active;
    panel.classList.toggle("active", active);
  });
}

function normalizeSku(source) {
  const item = {};
  SKU_FIELDS.forEach((field) => item[field] = source[field] ?? "");
  item.sku = String(item.sku).trim();
  item.description = String(item.description).trim();
  item.ean = String(item.ean).trim();
  item.unit = String(item.unit || "UN").trim().toUpperCase();
  item.velocityClass = String(item.velocityClass || "").trim().toUpperCase();
  ["unitsPerCase","casesPerPallet","unitsPerPallet","weightKg","minStock","maxStock","dailyConsumption"].forEach((field) => item[field] = Number(item[field] || 0));
  ["lotControl","expiryControl","active"].forEach((field) => item[field] = item[field] === true || ["1","true","si","sí","yes"].includes(String(item[field]).toLowerCase()));
  if (!item.unitsPerPallet && item.unitsPerCase && item.casesPerPallet) item.unitsPerPallet = item.unitsPerCase * item.casesPerPallet;
  return item;
}

function formatVelocityClass(value) {
  return ({ SUPER_A: "Súper A", A: "A", B: "B", C: "C", ESTACIONAL: "Estacional" })[value] || "Sin clasificar";
}

function stockBySku() {
  return state.locations.reduce((totals, location) => {
    if (location.occupied && location.material) totals[location.material] = (totals[location.material] || 0) + Number(location.quantity || 0);
    return totals;
  }, {});
}

async function saveSku(event) {
  event.preventDefault();
  const raw = Object.fromEntries(new FormData(event.currentTarget));
  raw.lotControl = event.currentTarget.elements.lotControl.checked;
  raw.expiryControl = event.currentTarget.elements.expiryControl.checked;
  raw.active = event.currentTarget.elements.active.checked;
  const item = normalizeSku(raw);
  if (!item.sku || !item.description) return setSkuMessage("SKU y descripción son obligatorios.", true);
  upsertSkuLocal(item);
  renderSkuMaster();
  try {
    const result = await centralRequest("sku_save", { item, admin_password: ADMIN_PASSWORD_HASH });
    if (!result.ok) throw new Error(result.error || "No se pudo guardar centralmente");
    setSkuMessage(`SKU ${item.sku} guardado.`);
    clearSkuForm(false);
  } catch (error) {
    setSkuMessage(`Guardado en este dispositivo; no se pudo sincronizar: ${error.message}`, true);
  }
}

function upsertSkuLocal(item) {
  const index = state.skuMaster.findIndex((current) => current.sku.toLowerCase() === item.sku.toLowerCase());
  if (index >= 0) state.skuMaster[index] = item;
  else state.skuMaster.push(item);
  localStorage.setItem(SKU_MASTER_KEY, JSON.stringify(state.skuMaster));
}

function clearSkuForm(clearMessage = true) {
  $("#skuForm").reset();
  $("#skuForm").elements.active.checked = true;
  if (clearMessage) setSkuMessage("");
}

function setSkuMessage(text, error = false) {
  $("#skuMessage").textContent = text;
  $("#skuMessage").style.color = error ? "var(--danger)" : "var(--available-text)";
}

function renderSkuMaster() {
  const query = String($("#skuSearch")?.value || "").trim().toLowerCase();
  const items = state.skuMaster.filter((item) => !query || [item.sku,item.description,item.ean,item.category].some((value) => String(value || "").toLowerCase().includes(query)));
  const currentStock = stockBySku();
  $("#skuCount").textContent = `${fmt.format(state.skuMaster.length)} SKU`;
  const body = $("#skuTable");
  body.replaceChildren();
  items.sort((a,b) => a.sku.localeCompare(b.sku)).forEach((item) => {
    const row = document.createElement("tr");
    row.dataset.sku = item.sku;
    const quantity = Number(currentStock[item.sku] || 0);
    const coverage = item.dailyConsumption > 0 ? quantity / item.dailyConsumption : null;
    const stockStatus = quantity <= 0 ? "Sin stock" : item.minStock > 0 && quantity < item.minStock ? "Reponer" : item.maxStock > 0 && quantity > item.maxStock ? "Exceso" : "Normal";
    row.dataset.stockStatus = stockStatus.toLowerCase().replace(" ", "-");
    [item.sku,item.description,formatVelocityClass(item.velocityClass),quantity,item.minStock || "—",item.maxStock || "—",item.dailyConsumption || "—",coverage === null ? "—" : coverage.toLocaleString("es-AR", { maximumFractionDigits: 1 }),stockStatus].forEach((value) => {
      const cell = document.createElement("td"); cell.textContent = value; row.appendChild(cell);
    });
    body.appendChild(row);
  });
}

function editSkuFromTable(event) {
  const row = event.target.closest("tr[data-sku]");
  if (!row) return;
  const item = state.skuMaster.find((sku) => sku.sku === row.dataset.sku);
  if (!item) return;
  SKU_FIELDS.forEach((field) => {
    const control = $("#skuForm").elements[field];
    if (!control) return;
    if (control.type === "checkbox") control.checked = Boolean(item[field]);
    else control.value = item[field] ?? "";
  });
  $("#skuForm").scrollIntoView({ behavior: "smooth", block: "start" });
}

async function importSkuFile(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const rows = parseDelimited(await file.text());
    const items = rows.map(normalizeSku).filter((item) => item.sku && item.description);
    if (!items.length) throw new Error("El archivo no contiene filas válidas.");
    items.forEach(upsertSkuLocal);
    renderSkuMaster();
    const result = await centralRequest("sku_bulk", { items, admin_password: ADMIN_PASSWORD_HASH });
    if (!result.ok) throw new Error(result.error || "No se pudo importar centralmente");
    setSkuMessage(`${items.length} SKU importados.`);
  } catch (error) {
    setSkuMessage(error.message, true);
  } finally {
    event.target.value = "";
  }
}

function parseDelimited(text) {
  const lines = String(text).replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return [];
  const delimiter = lines[0].includes("\t") ? "\t" : lines[0].includes(";") ? ";" : ",";
  const headers = lines.shift().split(delimiter).map((value) => value.trim());
  return lines.map((line) => Object.fromEntries(headers.map((header, index) => [header, (line.split(delimiter)[index] || "").trim()])));
}

function downloadSkuTemplate() {
  const sample = ["SKU-DEMO","Descripción","7790000000000","Categoría","UN",12,50,600,0.5,false,false,10,1000,"A2.01.0",true,25,"SUPER_A"];
  const csv = [SKU_FIELDS, sample].map((row) => row.join(";")).join("\n");
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }));
  link.download = "plantilla_maestro_sku.csv";
  link.click();
  URL.revokeObjectURL(link.href);
}

function centralRequest(action, payload = {}) {
  const callbackName = `wmsData_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const script = document.createElement("script");
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => cleanup(reject, new Error("El servidor no respondió.")), 12000);
    const cleanup = (done, value) => { clearTimeout(timeout); delete window[callbackName]; script.remove(); done(value); };
    window[callbackName] = (value) => cleanup(resolve, value);
    script.onerror = () => cleanup(reject, new Error("No se pudo conectar con el registro central."));
    script.src = `${state.syncConfig.endpoint}?action=${encodeURIComponent(action)}&callback=${callbackName}&payload=${encodeURIComponent(JSON.stringify(payload))}&_=${Date.now()}`;
    document.head.appendChild(script);
  });
}

async function pullSkuMaster() {
  try {
    const result = await centralRequest("sku_list");
    if (result.ok && Array.isArray(result.items)) {
      state.skuMaster = result.items.map(normalizeSku);
      localStorage.setItem(SKU_MASTER_KEY, JSON.stringify(state.skuMaster));
      renderSkuMaster();
      renderMovementPreview();
    }
  } catch (error) {
    console.warn("Maestro SKU central no disponible:", error);
  }
}

function normalizeSlottingRule(source) {
  return {
    id: String(source.id || (crypto.randomUUID ? crypto.randomUUID() : `zone-${Date.now()}`)),
    velocityClass: String(source.velocityClass || "").toUpperCase(),
    aisle: String(source.aisle || "ALL").trim().toUpperCase(),
    side: String(source.side || "all"),
    rackFrom: Number(source.rackFrom || 0),
    rackTo: Number(source.rackTo || 99),
    moduleFrom: Number(source.moduleFrom || 0),
    moduleTo: Number(source.moduleTo || 999),
    level: String(source.level ?? "all"),
  };
}

function locationMatchesRule(location, rule) {
  return (rule.aisle === "ALL" || location.aisle === rule.aisle)
    && (rule.side === "all" || String(location.side) === rule.side)
    && Number(location.rack) >= rule.rackFrom && Number(location.rack) <= rule.rackTo
    && Number(location.module) >= rule.moduleFrom && Number(location.module) <= rule.moduleTo
    && (rule.level === "all" || String(location.level) === rule.level);
}

async function saveSlottingRule(event) {
  event.preventDefault();
  const rule = normalizeSlottingRule(Object.fromEntries(new FormData(event.currentTarget)));
  if (!VELOCITY_CLASSES.includes(rule.velocityClass)) return;
  state.slottingRules.push(rule);
  localStorage.setItem(SLOTTING_RULES_KEY, JSON.stringify(state.slottingRules));
  renderSlottingRules();
  renderSkuAlerts();
  event.currentTarget.reset();
  try {
    const result = await centralRequest("slotting_save", { rule, admin_password: ADMIN_PASSWORD_HASH });
    if (!result.ok) throw new Error(result.error || "No se pudo guardar la zona.");
  } catch (error) {
    alert(`La zona quedó guardada sólo en este dispositivo: ${error.message}`);
  }
}

async function deleteSlottingRule(event) {
  const button = event.target.closest("button[data-rule-id]");
  if (!button || !confirm("¿Eliminar esta delimitación de posiciones?")) return;
  const id = button.dataset.ruleId;
  state.slottingRules = state.slottingRules.filter((rule) => rule.id !== id);
  localStorage.setItem(SLOTTING_RULES_KEY, JSON.stringify(state.slottingRules));
  renderSlottingRules();
  renderSkuAlerts();
  const result = await centralRequest("slotting_delete", { id, admin_password: ADMIN_PASSWORD_HASH }).catch(() => null);
  if (!result?.ok) alert("La zona se eliminó localmente, pero no pudo sincronizarse.");
}

function renderSlottingRules() {
  const body = $("#slottingTable");
  if (!body) return;
  body.innerHTML = state.slottingRules.map((rule) => `
    <tr>
      <td>${formatVelocityClass(rule.velocityClass)}</td>
      <td>${rule.aisle === "ALL" ? "Todos" : rule.aisle}</td>
      <td>${rule.side === "all" ? "Ambos" : rule.side}</td>
      <td>${rule.rackFrom}-${rule.rackTo}</td>
      <td>${rule.moduleFrom}-${rule.moduleTo}</td>
      <td>${rule.level === "all" ? "Todos" : rule.level}</td>
      <td><button type="button" class="icon-action danger" data-rule-id="${rule.id}" title="Eliminar zona">×</button></td>
    </tr>`).join("");
}

function renderSkuAlerts() {
  const container = $("#skuAlerts");
  if (!container) return;
  const stocks = stockBySku();
  const alerts = [];
  const missingZones = new Set();
  state.skuMaster.filter((item) => item.active).forEach((item) => {
    const quantity = Number(stocks[item.sku] || 0);
    if (item.minStock > 0 && quantity < item.minStock) alerts.push({ type: "stock", level: "critical", title: `${item.sku} por debajo del mínimo`, detail: `${fmt.format(quantity)} u. actuales · mínimo ${fmt.format(item.minStock)}` });
    if (item.maxStock > 0 && quantity > item.maxStock) alerts.push({ type: "stock", level: "warning", title: `${item.sku} supera el máximo`, detail: `${fmt.format(quantity)} u. actuales · máximo ${fmt.format(item.maxStock)}` });
    if (item.velocityClass && !state.slottingRules.some((rule) => rule.velocityClass === item.velocityClass)) missingZones.add(item.velocityClass);
  });
  missingZones.forEach((velocityClass) => alerts.push({ type: "config", level: "warning", title: `${formatVelocityClass(velocityClass)} sin zona definida`, detail: "Los SKU de esta clase todavía no pueden validarse por ubicación." }));
  state.locations.filter((location) => location.occupied && location.material).forEach((location) => {
    const item = state.skuMaster.find((sku) => sku.sku === location.material);
    if (!item?.velocityClass) return;
    const rules = state.slottingRules.filter((rule) => rule.velocityClass === item.velocityClass);
    if (rules.length && !rules.some((rule) => locationMatchesRule(location, rule))) alerts.push({ type: "slotting", level: "critical", title: `${item.sku} fuera de zona ${formatVelocityClass(item.velocityClass)}`, detail: `Ubicado en ${location.id}.` });
  });
  $("#skuAlertCount").textContent = `${alerts.length} alerta${alerts.length === 1 ? "" : "s"}`;
  $("#skuAlertTabCount").textContent = String(alerts.length);
  container.innerHTML = alerts.length ? alerts.map((alert) => `<article class="sku-alert ${alert.level}"><strong>${alert.title}</strong><span>${alert.detail}</span></article>`).join("") : `<p class="empty-state">Sin desvíos de stock ni ubicación.</p>`;
}

async function pullSlottingRules() {
  try {
    const result = await centralRequest("slotting_list");
    if (result.ok && Array.isArray(result.items)) {
      state.slottingRules = result.items.map(normalizeSlottingRule);
      localStorage.setItem(SLOTTING_RULES_KEY, JSON.stringify(state.slottingRules));
      renderSlottingRules();
      renderSkuAlerts();
      renderMovementPreview();
    }
  } catch (error) {
    console.warn("Zonificación central no disponible:", error);
  }
}

function fillLabelRackFilter() {
  const filter = $("#labelRack");
  for (let rack = 1; rack <= 26; rack += 1) {
    const option = document.createElement("option");
    option.value = String(rack);
    option.textContent = `Rack ${String(rack).padStart(2, "0")}`;
    if (rack === 1) option.selected = true;
    filter.appendChild(option);
  }
}

function filteredLocations() {
  return state.locations.filter((item) => {
    if (state.filters.position && !item.id.toLowerCase().includes(state.filters.position)) return false;
    if (state.filters.aisle && item.aisle.toLowerCase() !== state.filters.aisle) return false;
    if (state.filters.locationSide !== "all" && String(item.side) !== state.filters.locationSide) return false;
    if (state.filters.rack && String(item.rack) !== state.filters.rack) return false;
    if (state.filters.locationLevel !== "all" && String(item.level) !== state.filters.locationLevel) return false;
    if (state.filters.material && !String(item.material || "").toLowerCase().includes(state.filters.material)) return false;
    if (state.filters.locationStatus === "available" && (item.occupied || item.blocked)) return false;
    if (state.filters.locationStatus === "occupied" && !item.occupied) return false;
    if (state.filters.locationStatus === "blocked" && !item.blocked) return false;
    return true;
  });
}

function updateLocationFilters() {
  state.filters.position = $("#locationPositionFilter").value.trim().toLowerCase();
  state.filters.aisle = $("#locationAisleFilter").value.trim().toLowerCase();
  state.filters.locationSide = $("#locationSideFilter").value;
  state.filters.rack = $("#locationRackFilter").value;
  state.filters.locationLevel = $("#locationLevelFilter").value;
  state.filters.material = $("#locationMaterialFilter").value.trim().toLowerCase();
  state.filters.locationStatus = $("#locationStatusFilter").value;
  renderLocationsTable();
}

function clearLocationFilters() {
  ["#locationPositionFilter", "#locationAisleFilter", "#locationRackFilter", "#locationMaterialFilter"].forEach((selector) => { $(selector).value = ""; });
  ["#locationSideFilter", "#locationLevelFilter", "#locationStatusFilter"].forEach((selector) => { $(selector).value = "all"; });
  updateLocationFilters();
}

function mapLocations() {
  return filteredLocations().filter((item) => {
    if (state.filters.side !== "all" && String(item.side) !== state.filters.side) return false;
    if (state.filters.level !== "all" && String(item.level) !== state.filters.level) return false;
    if (state.filters.status === "available" && item.occupied) return false;
    if (state.filters.status === "occupied" && !item.occupied) return false;
    if (state.filters.status === "blocked" && !item.blocked) return false;
    if (state.filters.status === "available" && item.blocked) return false;
    return true;
  });
}

function renderKpis() {
  const total = state.locations.length;
  const occupied = state.locations.filter((item) => item.occupied).length;
  const available = state.locations.filter((item) => !item.occupied && !item.blocked).length;
  const rate = (occupied / total) * 100;
  $("#kpiTotal").textContent = fmt.format(total);
  $("#kpiOccupied").textContent = fmt.format(occupied);
  $("#kpiAvailable").textContent = fmt.format(available);
  $("#kpiRate").textContent = formatRate(rate);
  $("#lastUpdate").textContent = `Actualizado ${formatDateTime()}`;
}

function renderSideBars() {
  const sides = groupBy(state.locations, (item) => item.side);
  $("#sideBars").innerHTML = Object.entries(sides)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([side, items]) => {
      const occupied = items.filter((item) => item.occupied).length;
      const rate = (occupied / items.length) * 100;
      return `
        <div class="bar-row">
          <strong>Lado ${side}</strong>
          <div class="bar-track"><div class="bar-fill" style="width:${rate}%"></div></div>
          <span>${formatRate(rate)}</span>
        </div>
      `;
    })
    .join("");
}

function renderMap() {
  const items = mapLocations();
  const bySideRack = groupBy(items, (item) => `${item.side}-${item.rack}`);
  const sides = [...new Set(items.map((item) => item.side))].sort((a, b) => a - b);

  $("#warehouseMap").innerHTML = sides
    .map((side) => {
      const racks = [...new Set(items.filter((item) => item.side === side).map((item) => item.rack))].sort(
        (a, b) => a - b
      );
      return `
        <section class="side-section">
          <h2>Lado ${side} ${side === 1 ? "(24 racks dobles)" : "(26 racks dobles)"}</h2>
          <div class="rack-grid">
            ${racks.map((rack) => rackCard(side, rack, bySideRack[`${side}-${rack}`] || [])).join("")}
          </div>
        </section>
      `;
    })
    .join("");

  $$(".rack-card").forEach((card) => {
    card.addEventListener("click", () => {
      openRackDetail(Number(card.dataset.side), Number(card.dataset.rack));
    });
  });
}

function loadPickingExample() {
  const bySku = groupBy(state.locations.filter((item) => item.occupied && !item.blocked && item.material), (item) => item.material);
  $("#pickingLines").value = Object.entries(bySku).slice(0, 6).map(([sku, items]) => {
    const available = items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
    return `${sku}, ${Math.min(available, 2)}`;
  }).join("\n");
  renderPickingDraft();
}

function addPickingLine() {
  const sku = $("#pickingSku").value.trim();
  const quantity = Number($("#pickingQuantity").value);
  if (!sku || !(quantity > 0)) {
    $("#pickingMessage").textContent = "Ingresá un SKU y una cantidad válida.";
    return;
  }
  const requests = parsePickingLines($("#pickingLines").value);
  const existing = requests.find((item) => item.sku.toLowerCase() === sku.toLowerCase());
  if (existing) existing.quantity += quantity;
  else requests.push({ sku, quantity });
  $("#pickingLines").value = serializePickingLines(requests);
  $("#pickingSku").value = "";
  $("#pickingQuantity").value = "1";
  $("#pickingMessage").textContent = "";
  renderPickingDraft();
  $("#pickingSku").focus();
}

function removePickingLine(event) {
  const button = event.target.closest("[data-remove-picking]");
  if (!button) return;
  const requests = parsePickingLines($("#pickingLines").value)
    .filter((item) => item.sku.toLowerCase() !== button.dataset.removePicking.toLowerCase());
  $("#pickingLines").value = serializePickingLines(requests);
  renderPickingDraft();
}

function serializePickingLines(requests) {
  return requests.map((item) => `${item.sku}, ${item.quantity}`).join("\n");
}

async function importPickingFile(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const rows = parseDelimited(await file.text());
    const normalized = rows.map((row) => ({
      trip: pickingColumn(row, ["numero de viaje", "nro de viaje", "viaje"]),
      delivery: pickingColumn(row, ["numero de entrega", "nro de entrega", "entrega"]),
      sku: pickingColumn(row, ["sku", "material", "codigo de producto"]),
      quantity: Number(String(pickingColumn(row, ["cantidad", "qty", "unidades"])).replace(",", ".")),
    })).filter((row) => row.trip && row.delivery && row.sku && row.quantity > 0);
    if (!normalized.length) throw new Error("No se encontraron filas válidas. Revisá los encabezados de la plantilla.");

    const groups = new Map();
    normalized.forEach((row) => {
      const key = `${row.trip}||${row.delivery}`;
      if (!groups.has(key)) groups.set(key, { trip: row.trip, delivery: row.delivery, lines: [] });
      groups.get(key).lines.push({ sku: row.sku, quantity: row.quantity });
    });
    state.pickingOrders = [...groups.values()].map((order) => ({
      ...order,
      lines: parsePickingLines(serializePickingLines(order.lines)),
    }));
    renderPickingOrderSelector(file.name, normalized.length);
    loadImportedPickingOrder();
    $("#pickingMessage").textContent = `${state.pickingOrders.length} entregas importadas correctamente.`;
  } catch (error) {
    $("#pickingMessage").textContent = error.message;
  } finally {
    event.target.value = "";
  }
}

function pickingColumn(row, aliases) {
  const entries = Object.entries(row);
  const match = entries.find(([header]) => aliases.includes(normalizePickingHeader(header)));
  return String(match?.[1] || "").trim();
}

function normalizePickingHeader(value) {
  return String(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
}

function renderPickingOrderSelector(fileName, rowCount) {
  const select = $("#pickingOrderSelect");
  select.innerHTML = state.pickingOrders.map((order, index) =>
    `<option value="${index}">Viaje ${escapeHtml(order.trip)} · Entrega ${escapeHtml(order.delivery)} · ${order.lines.length} SKU</option>`
  ).join("");
  $("#pickingImportSummary").textContent = `${fileName} · ${rowCount} líneas · ${state.pickingOrders.length} entregas`;
  $("#pickingImportPanel").classList.remove("hidden");
}

function loadImportedPickingOrder() {
  const order = state.pickingOrders[Number($("#pickingOrderSelect").value) || 0];
  if (!order) return;
  $("#pickingOrderRef").value = `V${order.trip}-E${order.delivery}`;
  $("#pickingLines").value = serializePickingLines(order.lines);
  clearPickingResults();
  renderPickingDraft();
}

function clearPickingResults() {
  $("#pickingRoute").innerHTML = '<li class="picking-route-empty">Agregá productos y generá la ruta para comenzar.</li>';
  $("#pickingShortages").classList.add("hidden");
  $("#pickingSummary").textContent = "Sin calcular";
  $("#pickingUnits").textContent = "0";
  $("#pickingStops").textContent = "0";
  $("#pickingMissing").textContent = "0";
}

function downloadPickingTemplate() {
  const csv = [
    ["Numero de viaje", "Numero de entrega", "SKU", "Cantidad"],
    ["V001", "E001", "100360", 12],
    ["V001", "E001", "5555555", 4],
    ["V001", "E002", "100360", 3],
  ].map((row) => row.join(";")).join("\n");
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }));
  link.download = "plantilla_pedidos.csv";
  link.click();
  URL.revokeObjectURL(link.href);
}

function renderPickingDraft() {
  const requests = parsePickingLines($("#pickingLines").value);
  const container = $("#pickingDraft");
  container.replaceChildren();
  $("#pickingLineCount").textContent = `${requests.length} SKU`;
  if (!requests.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "Todavía no agregaste productos.";
    container.appendChild(empty);
    return;
  }
  requests.forEach((request) => {
    const stock = state.locations
      .filter((item) => item.occupied && !item.blocked && String(item.material).toLowerCase() === request.sku.toLowerCase())
      .reduce((sum, item) => sum + Number(item.quantity || 0), 0);
    const master = state.skuMaster.find((item) => item.sku.toLowerCase() === request.sku.toLowerCase());
    const row = document.createElement("div");
    row.className = `picking-draft-row${stock < request.quantity ? " has-shortage" : ""}`;
    row.innerHTML = `<div><strong></strong><small></small></div><span></span><button type="button" aria-label="Eliminar SKU">×</button>`;
    row.querySelector("strong").textContent = request.sku;
    row.querySelector("small").textContent = master?.description || "Sin descripción";
    row.querySelector("span").textContent = `${fmt.format(request.quantity)} u. · Stock ${fmt.format(stock)}`;
    row.querySelector("button").dataset.removePicking = request.sku;
    container.appendChild(row);
  });
}

function clearPickingRoute() {
  $("#pickingLines").value = "";
  clearPickingResults();
  $("#pickingMessage").textContent = "";
  renderPickingDraft();
}

function calculatePickingRoute(event) {
  event.preventDefault();
  const requests = parsePickingLines($("#pickingLines").value);
  if (!requests.length) {
    $("#pickingMessage").textContent = "Ingresá al menos un SKU con una cantidad válida.";
    return;
  }

  const allocations = [];
  const shortages = [];
  requests.forEach(({ sku, quantity }) => {
    let pending = quantity;
    const positions = state.locations
      .filter((item) => item.occupied && !item.blocked && String(item.material).toLowerCase() === sku.toLowerCase())
      .sort((a, b) => pickingAge(a) - pickingAge(b) || a.id.localeCompare(b.id));
    positions.forEach((location) => {
      if (pending <= 0) return;
      const pick = Math.min(pending, Number(location.quantity || 0));
      if (pick > 0) allocations.push({ sku, quantity: pick, location, point: pickingPoint(location) });
      pending -= pick;
    });
    if (pending > 0) shortages.push({ sku, requested: quantity, missing: pending });
  });

  const route = optimizePickingRoute(allocations);
  renderPickingRoute(route, shortages, requests);
}

function parsePickingLines(value) {
  const combined = new Map();
  String(value).split(/\r?\n/).forEach((line) => {
    const parts = line.trim().split(/[;,\t]|\s{2,}/).map((part) => part.trim()).filter(Boolean);
    if (parts.length < 2) return;
    const quantity = Number(String(parts.pop()).replace(",", "."));
    const sku = parts.join(" ").trim();
    if (!sku || !(quantity > 0)) return;
    combined.set(sku, (combined.get(sku) || 0) + quantity);
  });
  return [...combined].map(([sku, quantity]) => ({ sku, quantity }));
}

function pickingAge(location) {
  const value = new Date(location.occupiedSince || 0).getTime();
  return Number.isFinite(value) ? value : 0;
}

function pickingPoint(location) {
  const key = location.id.split(".").slice(0, -1).join(".");
  const stack = state.layout3d?.stacks?.find((item) => item.key === key);
  return stack ? { x: Number(stack.col), y: Number(stack.row) } : { x: Number(location.module), y: Number(location.side) * 100 + Number(location.rack) };
}

function optimizePickingRoute(allocations) {
  const pending = [...allocations];
  const route = [];
  const bounds = state.layout3d?.bounds;
  let current = { x: Number(bounds?.minCol || 0), y: Number(bounds?.maxRow || 0) };
  while (pending.length) {
    pending.sort((a, b) => pickingDistance(current, a.point) - pickingDistance(current, b.point));
    const next = pending.shift();
    next.distance = pickingDistance(current, next.point);
    route.push(next);
    current = next.point;
  }
  return route;
}

function pickingDistance(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function renderPickingRoute(route, shortages, requests) {
  const list = $("#pickingRoute");
  list.replaceChildren();
  let cumulative = 0;
  route.forEach((stop, index) => {
    cumulative += stop.distance;
    const item = document.createElement("li");
    const step = document.createElement("span");
    const location = document.createElement("div");
    const locationId = document.createElement("strong");
    const locationDetail = document.createElement("small");
    const quantity = document.createElement("div");
    const quantityValue = document.createElement("strong");
    const sku = document.createElement("small");
    step.className = "pick-step";
    quantity.className = "pick-quantity";
    step.textContent = index + 1;
    locationId.textContent = stop.location.id;
    locationDetail.textContent = `Pasillo ${stop.location.aisle} · Rack ${String(stop.location.rack).padStart(2, "0")} · Módulo ${stop.location.module} · Nivel ${stop.location.level}`;
    quantityValue.textContent = fmt.format(stop.quantity);
    sku.textContent = stop.sku;
    location.append(locationId, locationDetail);
    quantity.append(quantityValue, sku);
    item.append(step, location, quantity);
    list.appendChild(item);
  });

  const requestedUnits = requests.reduce((sum, item) => sum + item.quantity, 0);
  const assignedUnits = route.reduce((sum, item) => sum + item.quantity, 0);
  $("#pickingSummary").textContent = `${route.length} paradas · ${fmt.format(assignedUnits)}/${fmt.format(requestedUnits)} unidades · ${fmt.format(cumulative)} tramos`;
  $("#pickingUnits").textContent = fmt.format(assignedUnits);
  $("#pickingStops").textContent = fmt.format(route.length);
  $("#pickingMissing").textContent = fmt.format(shortages.reduce((sum, item) => sum + item.missing, 0));
  $("#pickingMessage").textContent = route.length ? "Ruta calculada con posiciones disponibles y no bloqueadas." : "No hay stock disponible para el pedido.";

  const shortageBox = $("#pickingShortages");
  shortageBox.replaceChildren();
  if (shortages.length) {
    const title = document.createElement("strong");
    title.textContent = "Faltantes";
    shortageBox.appendChild(title);
    shortages.forEach((item) => {
      const row = document.createElement("span");
      row.textContent = `${item.sku}: faltan ${fmt.format(item.missing)} de ${fmt.format(item.requested)}`;
      shortageBox.appendChild(row);
    });
    shortageBox.classList.remove("hidden");
  } else {
    shortageBox.classList.add("hidden");
  }
}

function rackCard(side, rack, items) {
  const rackItems = state.locations.filter((item) => item.storageType !== "drivein" && item.side === side && item.rack === rack);
  const total = rackItems.length;
  const occupied = rackItems.filter((item) => item.occupied).length;
  const blocked = rackItems.filter((item) => item.blocked).length;
  const levels = [0, 1, 2, 3, 4].map((level) => {
    const levelItems = rackItems.filter((item) => item.level === level);
    const used = levelItems.some((item) => item.occupied);
    const levelBlocked = levelItems.some((item) => item.blocked);
    const status = levelBlocked ? "blocked" : used ? "used" : "";
    const detail = levelBlocked ? "con posiciones bloqueadas" : used ? "con ocupación" : "libre";
    return `<i class="${status}" title="Nivel ${level}: ${detail}"></i>`;
  });

  return `
    <button class="rack-card ${blocked ? "has-blocked" : ""}" data-side="${side}" data-rack="${rack}">
      <strong>Rack ${String(rack).padStart(2, "0")}</strong>
      <span>${occupied}/${total} posiciones ocupadas</span>
      ${blocked ? `<span class="rack-blocked-count">${blocked} bloqueada${blocked === 1 ? "" : "s"}</span>` : ""}
      <div class="mini-levels">${levels.join("")}</div>
    </button>
  `;
}

function render3dMap() {
  const canvas = $("#floor3d");
  if (!canvas || !state.layout3d) return;

  const query = state.filters.query;
  const locationsById = new Map(state.locations.map((item) => [item.id, item]));
  state.render3dStacks = state.layout3d.stacks
    .filter((stack) => state.view3d.side === "all" || String(stack.side) === state.view3d.side)
    .filter((stack) => !query || [stack.baseId, stack.aisle, stack.side, stack.rack, stack.module].join(" ").toLowerCase().includes(query))
    .map((stack) => {
      const levels = [0, 1, 2, 3, 4].map((level) => {
        const location = locationsById.get(stack.type === "drivein" ? `DI.${String(stack.column).padStart(2, "0")}.${level}.${String(stack.depth).padStart(2, "0")}` : `${stack.key}.${level}`);
        return { occupied: Boolean(location?.occupied), blocked: Boolean(location?.blocked) };
      });
      const firstRelevant = levels.findIndex((level) => level.blocked || level.occupied);
      const detailId = stack.type === "drivein"
        ? `DI.${String(stack.column).padStart(2, "0")}.${Math.max(firstRelevant, 0)}.${String(stack.depth).padStart(2, "0")}`
        : firstRelevant >= 0 ? `${stack.key}.${firstRelevant}` : stack.baseId;
      return { ...stack, levels, detailId };
    });
  state.render3dRacks = Object.values(groupBy(state.render3dStacks.filter((stack) => stack.type !== "drivein"), (stack) => `${stack.side}-${stack.rack}`)).map((items) => ({
    minCol: Math.min(...items.map((item) => item.col)),
    maxCol: Math.max(...items.map((item) => item.col)),
    minRow: Math.min(...items.map((item) => item.row)),
    maxRow: Math.max(...items.map((item) => item.row)),
  }));
  update3dTransform();
}

function update3dTransform() {
  draw3dMap();
}

function project3d(col, row, z, width, height, preserveSpacing = false) {
  const bounds = state.layout3d.bounds;
  const projection = state.projection3d;
  const expandedCol = preserveSpacing ? col : expandAisleSpacing(col, bounds.minCol);
  const x = (expandedCol - projection.expandedCenter) * 11;
  const y = (row - (bounds.minRow + bounds.maxRow) / 2) * 11;
  const rx = x * projection.cosAngle - y * projection.sinAngle;
  const ry = x * projection.sinAngle + y * projection.cosAngle;
  return {
    x: width / 2 + state.view3d.panX + rx * projection.scale,
    y: height / 2 + state.view3d.panY + (ry * projection.sinTilt - z * projection.cosTilt) * projection.scale,
    depth: ry,
  };
}

function prepare3dProjection() {
  const bounds = state.layout3d.bounds;
  const angle = (state.view3d.rotation * Math.PI) / 180;
  const tilt = (state.view3d.tilt * Math.PI) / 180;
  state.projection3d = {
    cosAngle: Math.cos(angle),
    sinAngle: Math.sin(angle),
    cosTilt: Math.cos(tilt),
    sinTilt: Math.sin(tilt),
    scale: state.view3d.scale,
    expandedCenter:
      (expandAisleSpacing(bounds.minCol, bounds.minCol) + expandAisleSpacing(bounds.maxCol, bounds.minCol)) / 2,
  };
}

function expandAisleSpacing(col, minCol) {
  const selectiveStart = Math.max(4, minCol);
  if (col < selectiveStart) return col;
  const aisleIndex = Math.floor((col - selectiveStart + 0.5) / 3);
  return col + aisleIndex * 3;
}

function draw3dMap() {
  const canvas = $("#floor3d");
  const shell = $(".map3d-shell");
  if (!canvas || !shell || !state.layout3d) return;
  const rect = shell.getBoundingClientRect();
  const dpr = state.view3d.dragging ? 1 : Math.min(window.devicePixelRatio || 1, 1.5);
  const width = Math.max(1, Math.round(rect.width));
  const height = Math.max(1, Math.round(rect.height));
  prepare3dProjection();
  if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
  }
  const ctx = canvas.getContext("2d", { alpha: false });
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = "#e8eef2";
  ctx.fillRect(0, 0, width, height);

  const bounds = state.layout3d.bounds;
  draw3dQuad(ctx, bounds.minCol - 2, bounds.minRow - 2, bounds.maxCol + 2, bounds.maxRow + 2, 0, "#f5f7f8", width, height);
  draw3dQuad(ctx, bounds.minCol - 2, 28.5, bounds.maxCol + 2, 33.5, 0.5, "#cfd8df", width, height);
  const driveInStacks = state.render3dStacks.filter((stack) => stack.type === "drivein");
  if (driveInStacks.length) {
    draw3dQuad(
      ctx,
      Math.min(...driveInStacks.map((stack) => stack.col)) - 0.7,
      Math.min(...driveInStacks.map((stack) => stack.row)) - 0.7,
      Math.max(...driveInStacks.map((stack) => stack.col)) + 0.7,
      Math.max(...driveInStacks.map((stack) => stack.row)) + 0.7,
      0.8,
      "#dce8ed",
      width,
      height,
      true
    );
  }

  const levelColors = ["#3f936b", "#49a176", "#55ae82", "#61ba8e", "#70c79c"];
  const orderedStacks = [...state.render3dStacks].sort((a, b) => stackDepth3d(a) - stackDepth3d(b));
  const visibleLevels = state.view3d.level === "all" ? [0, 1, 2, 3, 4] : [Number(state.view3d.level)];
  for (const level of visibleLevels) {
    for (const stack of orderedStacks) {
      const columnBand = Math.floor((stack.row - bounds.minRow) / 2) % 2;
      const freeColor = shadeColor(levelColors[level], columnBand ? -7 : 0);
      const status = stack.levels[level];
      const color = status.blocked ? "#d43f3f" : status.occupied ? "#d47a22" : freeColor;
      draw3dRackLevel(ctx, stack, level, color, width, height, state.view3d.dragging);
    }
  }
  draw3dGuides(ctx, width, height);
}

function draw3dQuad(ctx, minCol, minRow, maxCol, maxRow, z, color, width, height, preserveSpacing = false) {
  const points = [
    project3d(minCol, minRow, z, width, height, preserveSpacing), project3d(maxCol, minRow, z, width, height, preserveSpacing),
    project3d(maxCol, maxRow, z, width, height, preserveSpacing), project3d(minCol, maxRow, z, width, height, preserveSpacing),
  ];
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  points.slice(1).forEach((point) => ctx.lineTo(point.x, point.y));
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = "#9aa8b1";
  ctx.lineWidth = 0.6;
  ctx.stroke();
}

function draw3dRackLevel(ctx, stack, level, color, width, height, simplified = false) {
  const bottom = POSITION_3D.base + level * POSITION_3D.levelPitch;
  const top = bottom + POSITION_3D.height;
  const halfWidth = POSITION_3D.halfWidth;
  const halfLength = POSITION_3D.halfLength;
  const preserveSpacing = stack.type === "drivein";
  const base = [
    project3d(stack.col - halfWidth, stack.row - halfLength, bottom, width, height, preserveSpacing),
    project3d(stack.col + halfWidth, stack.row - halfLength, bottom, width, height, preserveSpacing),
    project3d(stack.col + halfWidth, stack.row + halfLength, bottom, width, height, preserveSpacing),
    project3d(stack.col - halfWidth, stack.row + halfLength, bottom, width, height, preserveSpacing),
  ];
  const cap = [
    project3d(stack.col - halfWidth, stack.row - halfLength, top, width, height, preserveSpacing),
    project3d(stack.col + halfWidth, stack.row - halfLength, top, width, height, preserveSpacing),
    project3d(stack.col + halfWidth, stack.row + halfLength, top, width, height, preserveSpacing),
    project3d(stack.col - halfWidth, stack.row + halfLength, top, width, height, preserveSpacing),
  ];
  const center = project3d(stack.col, stack.row, top, width, height, preserveSpacing);
  if (center.x < -30 || center.x > width + 30 || center.y < -30 || center.y > height + 30) return;
  if (simplified) {
    drawCanvasFace(ctx, cap, color);
    return;
  }
  const sides = [
    { points: [base[0], base[1], cap[1], cap[0]], color: shadeColor(color, -30) },
    { points: [base[1], base[2], cap[2], cap[1]], color: shadeColor(color, -42) },
    { points: [base[2], base[3], cap[3], cap[2]], color: shadeColor(color, -22) },
    { points: [base[3], base[0], cap[0], cap[3]], color: shadeColor(color, -36) },
  ];
  const rowFace = state.projection3d.cosAngle >= 0 ? sides[2] : sides[0];
  const colFace = state.projection3d.sinAngle >= 0 ? sides[1] : sides[3];
  drawCanvasFace(ctx, rowFace.points, rowFace.color);
  drawCanvasFace(ctx, colFace.points, colFace.color);
  drawCanvasFace(ctx, cap, color, true);
}

function stackDepth3d(stack) {
  const bounds = state.layout3d.bounds;
  const projectedCol = stack.type === "drivein" ? stack.col : expandAisleSpacing(stack.col, bounds.minCol);
  const x = (projectedCol - expandAisleSpacing(bounds.minCol, bounds.minCol)) * 11;
  const y = (stack.row - bounds.minRow) * 11;
  const angle = (state.view3d.rotation * Math.PI) / 180;
  return x * Math.sin(angle) + y * Math.cos(angle);
}

function drawRackFrames(ctx, width, height) {
  const top = POSITION_3D.base + 4 * POSITION_3D.levelPitch + POSITION_3D.height + 6;
  ctx.save();
  ctx.strokeStyle = "rgba(67, 82, 91, 0.48)";
  ctx.lineWidth = 1;
  for (const rack of state.render3dRacks) {
    const corners = [
      [rack.minCol - 0.5, rack.minRow - 0.5],
      [rack.maxCol + 0.5, rack.minRow - 0.5],
      [rack.maxCol + 0.5, rack.maxRow + 0.5],
      [rack.minCol - 0.5, rack.maxRow + 0.5],
    ];
    for (const [col, row] of corners) {
      const base = project3d(col, row, 0, width, height);
      const cap = project3d(col, row, top, width, height);
      ctx.beginPath();
      ctx.moveTo(base.x, base.y);
      ctx.lineTo(cap.x, cap.y);
      ctx.stroke();
    }
    for (let level = 0; level < 5; level += 1) {
      const z = 20 + level * POSITION_3D.levelPitch;
      const points = corners.map(([col, row]) => project3d(col, row, z, width, height));
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      points.slice(1).forEach((point) => ctx.lineTo(point.x, point.y));
      ctx.closePath();
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawCanvasFace(ctx, points, color, outline = false) {
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  points.slice(1).forEach((point) => ctx.lineTo(point.x, point.y));
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  if (outline) {
    ctx.strokeStyle = "#263a33";
    ctx.lineWidth = 0.7;
    ctx.stroke();
  }
}

function shadeColor(hex, amount) {
  const cacheKey = `${hex}:${amount}`;
  if (shadeCache.has(cacheKey)) return shadeCache.get(cacheKey);
  const isHex = hex.startsWith("#");
  const rgbMatch = isHex ? null : hex.match(/\d+/g);
  const value = isHex ? Number.parseInt(hex.slice(1), 16) : 0;
  const baseR = rgbMatch ? Number(rgbMatch[0]) : value >> 16;
  const baseG = rgbMatch ? Number(rgbMatch[1]) : (value >> 8) & 255;
  const baseB = rgbMatch ? Number(rgbMatch[2]) : value & 255;
  const r = clamp(baseR + amount, 0, 255);
  const g = clamp(baseG + amount, 0, 255);
  const b = clamp(baseB + amount, 0, 255);
  const result = `rgb(${r}, ${g}, ${b})`;
  shadeCache.set(cacheKey, result);
  return result;
}

function draw3dGuides(ctx, width, height) {
  const bounds = state.layout3d.bounds;
  ctx.save();
  ctx.font = "700 12px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const visibleLevels = state.view3d.level === "all" ? [0, 1, 2, 3, 4] : [Number(state.view3d.level)];
  for (const level of visibleLevels) {
    const point = project3d(bounds.minCol - 3.2, (bounds.minRow + bounds.maxRow) / 2, 20 + level * POSITION_3D.levelPitch, width, height);
    drawGuideLabel(ctx, `N${level}`, point.x, point.y);
  }

  const driveInStacks = state.render3dStacks.filter((stack) => stack.type === "drivein");
  if (driveInStacks.length) {
    const point = project3d(
      driveInStacks.reduce((sum, stack) => sum + stack.col, 0) / driveInStacks.length,
      Math.max(...driveInStacks.map((stack) => stack.row)) + 2.2,
      2,
      width,
      height,
      true
    );
    drawGuideLabel(ctx, "DRIVE-IN", point.x, point.y);
  }

  [
    { start: 8, count: 10, side: 1 },
    { start: 34, count: 12, side: 2 },
  ].forEach((section) => {
    for (let column = 0; column <= section.count; column += 1) {
      const row = section.start + column * 2;
      const start = project3d(bounds.minCol - 0.8, row, 1, width, height);
      const end = project3d(bounds.maxCol + 0.8, row, 1, width, height);
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
      ctx.strokeStyle = "rgba(53, 72, 82, 0.42)";
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }
  });
  ctx.restore();
}

function drawGuideLabel(ctx, label, x, y) {
  const width = ctx.measureText(label).width + 8;
  ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
  ctx.fillRect(x - width / 2, y - 9, width, 18);
  ctx.strokeStyle = "#70808a";
  ctx.lineWidth = 1;
  ctx.strokeRect(x - width / 2, y - 9, width, 18);
  ctx.fillStyle = "#263945";
  ctx.fillText(label, x, y + 0.5);
}

function pick3dLocation(clientX, clientY) {
  const canvas = $("#floor3d");
  if (!canvas) return null;
  const rect = canvas.getBoundingClientRect();
  let nearest = null;
  let bestDistance = 12;
  for (const stack of state.render3dStacks) {
    const point = project3d(stack.col, stack.row, 38, rect.width, rect.height, stack.type === "drivein");
    const distance = Math.hypot(clientX - rect.left - point.x, clientY - rect.top - point.y);
    if (distance < bestDistance) {
      bestDistance = distance;
      nearest = stack.detailId;
    }
  }
  return nearest;
}

function renderLocationsTable() {
  const rows = filteredLocations().slice(0, 600);
  $("#rowCount").textContent = `${fmt.format(filteredLocations().length)} resultados`;
  $("#locationsTable").innerHTML = rows.map(locationRow).join("");
  $$("#locationsTable tr").forEach((row) => {
    row.addEventListener("click", () => openDetail(findLocation(row.dataset.id)));
  });
}

function locationRow(item) {
  const status = item.blocked ? "Bloqueada" : item.occupied ? "Ocupada" : "Libre";
  const statusClass = item.blocked ? "blocked" : item.occupied ? "occupied" : "available";
  return `
    <tr data-id="${item.id}">
      <td>${item.id}</td>
      <td>${item.aisle}</td>
      <td>${item.side}</td>
      <td>${item.rack}</td>
      <td>${item.module}</td>
      <td>${item.level}</td>
      <td>${item.material || ""}</td>
      <td>${item.quantity || ""}</td>
      <td><span class="pill ${statusClass}" title="${item.blockReason || ""}">${status}</span></td>
    </tr>
  `;
}

function renderMovements() {
  $("#movementsTable").innerHTML =
    state.movements
      .map(
        (move) => `
          <tr>
            <td>${formatMovementDate(move)}</td>
            <td>${move.type}</td>
            <td>${move.material}</td>
            <td>${move.from || ""}</td>
            <td>${move.to || ""}</td>
            <td>${move.quantity}</td>
            <td class="movement-actions"><button type="button" class="edit-movement" data-edit-movement="${move.id}">Editar</button><button type="button" class="delete-movement" data-delete-movement="${move.id}">Eliminar</button></td>
          </tr>
        `
      )
      .join("") || `<tr><td colspan="7">Sin movimientos cargados.</td></tr>`;
}

function handleDeleteMovementClick(event) {
  const button = event.target.closest("[data-delete-movement]");
  if (!button) return;
  const movement = state.movements.find((item) => item.id === button.dataset.deleteMovement);
  if (!movement) return;
  const confirmed = confirm(
    `¿Estás seguro de eliminar este movimiento?\n\n${formatMovementDate(movement)} · ${movement.material || "Sin material"} · ${movement.quantity} unidades\n\nEl inventario se recalculará automáticamente.`
  );
  if (!confirmed) return;
  try {
    rebuildInventoryFromMovements(state.movements.filter((item) => item.id !== movement.id));
    queueMovementSync("ANULADO", movement);
  } catch (error) {
    alert(`No se puede eliminar el movimiento: ${error.message}`);
  }
}

function handleEditMovementClick(event) {
  const button = event.target.closest("[data-edit-movement]");
  if (!button) return;
  const movement = state.movements.find((item) => item.id === button.dataset.editMovement);
  if (!movement) return;
  const form = $("#editMovementForm");
  form.dataset.movementId = movement.id;
  form.querySelector('[name="type"]').value = movement.type;
  form.querySelector('[name="material"]').value = movement.material || "";
  form.querySelector('[name="from"]').value = movement.from || "";
  form.querySelector('[name="to"]').value = movement.to || "";
  form.querySelector('[name="quantity"]').value = movement.quantity;
  $("#editMovementMessage").textContent = "";
  $("#editMovementDialog").showModal();
}

function closeEditMovement() {
  $("#editMovementDialog").close();
}

function saveEditedMovement(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form));
  const movement = state.movements.find((item) => item.id === form.dataset.movementId);
  if (!movement) return;
  const quantity = Number(data.quantity || 0);
  const type = data.type;
  const material = String(data.material || "").trim();
  const from = normalizePosition(data.from);
  const to = normalizePosition(data.to);
  if (quantity <= 0) {
    $("#editMovementMessage").textContent = "La cantidad debe ser mayor a cero.";
    return;
  }
  if (type === "IN" && !material) {
    $("#editMovementMessage").textContent = "El ingreso requiere un SKU o material.";
    return;
  }
  if (!confirm("¿Guardar los cambios y recalcular el inventario?")) return;
  const updated = { ...movement, type, material, from, to, quantity };
  const nextMovements = state.movements.map((item) => item.id === movement.id ? updated : item);
  try {
    rebuildInventoryFromMovements(nextMovements);
    queueMovementSync("MODIFICADO", updated);
    closeEditMovement();
  } catch (error) {
    $("#editMovementMessage").textContent = `No se puede aplicar el cambio: ${error.message}`;
  }
}

function rebuildInventoryFromMovements(nextMovements) {
  const previousLocations = state.locations;
  const previousHistory = state.history;
  const previousMovements = state.movements;
  const blocks = state.centralBlocks;
  state.locations = structuredClone(state.original);
  state.locations.forEach((location) => {
    location.occupiedSince = null;
    location.blocked = blocks.has(location.id);
    location.blockReason = blocks.get(location.id) || "";
  });
  const ordered = [...nextMovements].sort((a, b) => movementTimestamp(a) - movementTimestamp(b));
  const firstTimestamp = ordered[0]?.timestamp || new Date().toISOString();
  state.history = [createSnapshot(new Date(Date.parse(firstTimestamp) - 1).toISOString())];
  try {
    for (const movement of ordered) {
      const timestamp = movement.timestamp || new Date(movementTimestamp(movement)).toISOString();
      if (movement.type === "IN") registerIn(movement.material, movement.to, Number(movement.quantity), timestamp);
      if (movement.type === "OUT") registerOut(movement.material, movement.from, Number(movement.quantity));
      if (movement.type === "MOVE") registerMove(movement.from, movement.to, Number(movement.quantity), timestamp);
      state.history.push({ ...createSnapshot(timestamp), movementId: movement.id });
    }
    state.movements = nextMovements;
    saveState();
    renderAll();
  } catch (error) {
    state.locations = previousLocations;
    state.history = previousHistory;
    state.movements = previousMovements;
    throw error;
  }
}

function setMovementType(type) {
  const form = $("#registerMovement");
  form.dataset.operation = type;
  $$("[data-move-type]").forEach((button) => button.classList.toggle("active", button.dataset.moveType === type));
  $("#registerMaterialGroup").hidden = type !== "IN";
  $("#registerFromGroup").hidden = type === "IN";
  $("#registerToGroup").hidden = type === "OUT";
  $("#registerMaterial").required = type === "IN";
  $("#registerFrom").required = type !== "IN";
  $("#registerTo").required = type !== "OUT";
  $("#registerSubmit").textContent = `Registrar ${{ IN: "ingreso", MOVE: "traslado", OUT: "egreso" }[type]}`;
  $("#registerMessage").textContent = "";
  renderMovementPreview();
  focusRegisterField();
}

function handleRegisterEnter(event) {
  if (event.key !== "Enter" || event.target.tagName !== "INPUT") return;
  const type = $("#registerMovement").dataset.operation;
  const nextByField = {
    registerMaterial: "registerTo",
    registerFrom: type === "MOVE" ? "registerTo" : "registerQuantity",
    registerTo: "registerQuantity",
  };
  const nextId = nextByField[event.target.id];
  if (!nextId) return;
  event.preventDefault();
  const next = $(`#${nextId}`);
  next.focus();
  next.select();
}

function focusRegisterField() {
  const type = $("#registerMovement").dataset.operation;
  const target = type === "IN" ? $("#registerMaterial") : $("#registerFrom");
  target.focus({ preventScroll: true });
  target.select();
}

function renderMovementPreview() {
  const form = $("#registerMovement");
  const data = Object.fromEntries(new FormData(form));
  data.type = form.dataset.operation;
  const from = findLocation(normalizePosition(data.from));
  const to = findLocation(normalizePosition(data.to));
  $("#registerFromInfo").textContent = positionInfo(from, data.from, "origen");
  $("#registerToInfo").textContent = positionInfo(to, data.to, "destino");
  $("#registerFromInfo").classList.toggle("error", Boolean(data.from) && (!from || !from.occupied));
  $("#registerToInfo").classList.toggle("error", Boolean(data.to) && (!to || to.occupied || to.blocked));
  renderPutawaySuggestion(data.type, data.material, data.to);

  const typeLabel = { IN: "Ingreso", MOVE: "Traslado", OUT: "Egreso" }[data.type];
  const route = data.type === "IN" ? `a ${data.to || "—"}` : data.type === "OUT" ? `desde ${data.from || "—"}` : `${data.from || "—"} → ${data.to || "—"}`;
  const material = data.type === "IN" ? data.material || "Sin SKU" : from?.material || "Sin material";
  $("#movementSummary").innerHTML = `<span>${typeLabel}</span><strong>${material}</strong><small>${route} · ${Number(data.quantity || 0)} unidades</small>`;
}

function positionInfo(location, rawValue, role) {
  if (!rawValue) return "";
  if (!location) {
    const normalized = normalizePosition(rawValue);
    const suggestions = suggestLocations(normalized);
    return suggestions.length ? `${normalized} no existe · Cercanas: ${suggestions.join(" / ")}` : `La posición ${normalized} no existe`;
  }
  if (location.blocked && role === "destino") return `Bloqueada · ${location.blockReason}`;
  if (role === "origen") return location.occupied ? `${location.material} · ${fmt.format(location.quantity)} unidades${location.blocked ? " · Bloqueada" : ""}` : "Posición libre";
  return location.occupied ? `Ocupada por ${location.material}` : `Disponible · Lado ${location.side}, rack ${location.rack}, nivel ${location.level}`;
}

function renderRegistration() {
  const today = new Date().toDateString();
  const todayMoves = state.movements.filter((move) => new Date(movementTimestamp(move)).toDateString() === today);
  $("#todayMoves").textContent = fmt.format(todayMoves.length);
  $("#todayIn").textContent = fmt.format(sumMovementQuantity(todayMoves.filter((move) => move.type === "IN")));
  $("#todayOut").textContent = fmt.format(sumMovementQuantity(todayMoves.filter((move) => move.type === "OUT")));
  $("#registerClock").textContent = formatDateTime();
  $("#lastMovementTime").textContent = state.movements[0] ? formatMovementDate(state.movements[0]) : "Sin actividad";
  $("#recentMovementList").innerHTML = state.movements.length
    ? state.movements.slice(0, 8).map((move) => `
      <div class="recent-movement">
        <span class="movement-type ${move.type.toLowerCase()}">${{ IN: "IN", MOVE: "TR", OUT: "OUT" }[move.type]}</span>
        <div><strong>${move.material || "Sin material"}</strong><small>${move.from || "Entrada"} → ${move.to || "Salida"}</small></div>
        <div class="recent-quantity"><strong>${fmt.format(move.quantity)}</strong><small>${formatMovementDate(move)}</small></div>
        <div class="recent-actions"><button type="button" class="edit-movement icon-edit" data-edit-movement="${move.id}" aria-label="Editar movimiento" title="Editar">E</button><button type="button" class="delete-movement icon-delete" data-delete-movement="${move.id}" aria-label="Eliminar movimiento" title="Eliminar">×</button></div>
      </div>
    `).join("")
    : `<p class="empty-state">Todavía no hay movimientos registrados.</p>`;
  renderMovementPreview();
}

async function startBarcodeCapture(targetId) {
  state.scanTarget = targetId;
  const status = $("#scanStatus");
  status.textContent = "Abriendo lector…";
  status.classList.remove("hidden", "error");
  try {
    if (!("BarcodeDetector" in window) || !navigator.mediaDevices?.getUserMedia) {
      openPhotoScanner();
      return;
    }
    const supported = await BarcodeDetector.getSupportedFormats();
    const formats = ["code_39", "code_128", "ean_13", "ean_8", "upc_a", "upc_e", "qr_code"]
      .filter((format) => supported.includes(format));
    if (!formats.length) {
      openPhotoScanner();
      return;
    }

    state.scanDetector = new BarcodeDetector({ formats });
    state.scanStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });
    const dialog = $("#scannerDialog");
    const video = $("#scannerVideo");
    $("#scannerTitle").textContent = targetId === "registerMaterial" ? "Escanear SKU" : "Escanear posición";
    $("#scannerMessage").textContent = "Buscando código…";
    video.srcObject = state.scanStream;
    dialog.showModal();
    await video.play();
    status.classList.add("hidden");
    scanVideoFrame();
  } catch (error) {
    stopScannerCamera();
    status.textContent = error.name === "NotAllowedError"
      ? "No se habilitó la cámara. Podés usar una foto o un lector USB/Bluetooth."
      : "No se pudo abrir la cámara. Probá con una foto.";
    status.classList.add("error");
    openPhotoScanner();
  }
}

async function scanVideoFrame() {
  const video = $("#scannerVideo");
  if (!state.scanStream || !state.scanDetector) return;
  try {
    if (video.readyState >= 2) {
      const codes = await state.scanDetector.detect(video);
      if (codes.length) {
        applyScannedValue(codes[0].rawValue);
        closeLiveScanner();
        return;
      }
    }
  } catch {
    $("#scannerMessage").textContent = "Ajustando enfoque…";
  }
  state.scanFrame = requestAnimationFrame(scanVideoFrame);
}

function openPhotoScanner() {
  closeLiveScanner();
  $("#barcodeCapture").value = "";
  $("#barcodeCapture").click();
}

function closeLiveScanner() {
  stopScannerCamera();
  const dialog = $("#scannerDialog");
  if (dialog.open) dialog.close();
}

function stopScannerCamera() {
  if (state.scanFrame) cancelAnimationFrame(state.scanFrame);
  state.scanFrame = 0;
  state.scanStream?.getTracks().forEach((track) => track.stop());
  state.scanStream = null;
  state.scanDetector = null;
  $("#scannerVideo").srcObject = null;
}

function applyScannedValue(rawValue) {
  const isPosition = state.scanTarget !== "registerMaterial";
  const value = isPosition ? normalizePosition(rawValue) : String(rawValue || "").trim();
  const target = $(`#${state.scanTarget}`);
  if (!target || !value) return;
  target.value = value;
  target.dispatchEvent(new Event("input", { bubbles: true }));
  const status = $("#scanStatus");
  status.textContent = `Leído: ${value}`;
  status.classList.remove("hidden", "error");
  setTimeout(hideScanStatus, 1800);
  advanceAfterScan(target);
}

function advanceAfterScan(target) {
  const type = $("#registerMovement").dataset.operation;
  const nextByField = {
    registerMaterial: "registerTo",
    registerFrom: type === "MOVE" ? "registerTo" : "registerQuantity",
    registerTo: "registerQuantity",
  };
  const next = $(`#${nextByField[target.id]}`);
  (next || target).focus();
  (next || target).select();
}

async function decodeCapturedBarcode(event) {
  const file = event.target.files?.[0];
  if (!file) {
    hideScanStatus();
    return;
  }
  const status = $("#scanStatus");
  try {
    if (!("BarcodeDetector" in window)) throw new Error("Este navegador no admite lectura automática. Usá Chrome en Android o un lector Bluetooth/USB.");
    const supported = await BarcodeDetector.getSupportedFormats();
    const formats = ["code_39", "code_128", "qr_code"].filter((format) => supported.includes(format));
    if (!formats.length) throw new Error("El navegador no admite códigos Code 39 ni Code 128.");
    status.textContent = "Leyendo código…";
    const bitmap = await createImageBitmap(file);
    const detector = new BarcodeDetector({ formats });
    const codes = await detector.detect(bitmap);
    bitmap.close?.();
    if (!codes.length) throw new Error("No se detectó un código. Acercá la cámara, evitá reflejos y volvé a intentar.");
    applyScannedValue(codes[0].rawValue);
  } catch (error) {
    status.textContent = error.message;
    status.classList.add("error");
  }
}

function hideScanStatus() {
  $("#scanStatus").classList.add("hidden");
}

function renderLabels() {
  const sheet = $("#labelSheet");
  if (!sheet) return;
  const side = $("#labelSide").value;
  const level = $("#labelLevel").value;
  const rack = $("#labelRack").value;
  const locations = state.locations
    .filter((item) => side === "all" || String(item.side) === side)
    .filter((item) => level === "all" || String(item.level) === level)
    .filter((item) => rack === "all" || String(item.rack) === rack);
  $("#labelCount").textContent = `${fmt.format(locations.length)} etiquetas`;
  sheet.innerHTML = locations.map((location) => `
    <article class="location-label">
      <div class="label-heading"><strong>${location.id}</strong><span>Lado ${location.side} · Rack ${String(location.rack).padStart(2, "0")}</span></div>
      <div class="barcode39" aria-label="Código de barras ${location.id}">${code39Bars(location.id)}</div>
      <div class="label-meta"><span>Pasillo ${location.aisle}</span><span>Posición ${String(location.module).padStart(2, "0")}</span><span>Nivel ${location.level}</span></div>
    </article>
  `).join("");
}

function code39Bars(value) {
  const encoded = `*${String(value).toUpperCase()}*`;
  return [...encoded].map((character) => {
    const pattern = CODE39[character];
    if (!pattern) return "";
    const elements = [...pattern].map((width, index) => `<i class="${index % 2 === 0 ? "bar" : "gap"}" style="--unit:${width === "w" ? 3 : 1}"></i>`).join("");
    return `${elements}<i class="gap" style="--unit:1"></i>`;
  }).join("");
}

function renderAnalytics() {
  const section = $("#analytics");
  if (!section) return;
  const now = Date.now();
  const periodMonths = state.analyticsPeriod === "all" ? null : Number(state.analyticsPeriod);
  const cutoffDate = new Date();
  if (periodMonths) cutoffDate.setMonth(cutoffDate.getMonth() - periodMonths + 1, 1);
  cutoffDate.setHours(0, 0, 0, 0);
  const cutoff = periodMonths ? cutoffDate.getTime() : 0;
  const movements = state.movements.filter((move) => movementTimestamp(move) >= cutoff);
  const history = state.history
    .filter((snapshot) => Date.parse(snapshot.timestamp) >= cutoff)
    .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
  const total = state.locations.length;
  const occupied = state.locations.filter((item) => item.occupied).length;
  const chartHistory = monthlyOccupancyHistory(history, occupied);
  const occupancyRate = total ? (occupied / total) * 100 : 0;
  const firstOccupied = chartHistory[0]?.occupied ?? occupied;
  const changePoints = ((occupied - firstOccupied) / total) * 100;
  const averageOccupied = chartHistory.length
    ? chartHistory.reduce((sum, item) => sum + item.occupied, 0) / chartHistory.length
    : occupied;
  const averageRate = total ? (averageOccupied / total) * 100 : 0;
  const peakRate = total && chartHistory.length ? (Math.max(...chartHistory.map((item) => item.occupied)) / total) * 100 : occupancyRate;
  const observedDays = Math.max(1, Math.min(periodMonths ? periodMonths * 30.44 : Infinity, historySpanDays(history)));
  const inMoves = movements.filter((move) => move.type === "IN");
  const outMoves = movements.filter((move) => move.type === "OUT");
  const transferMoves = movements.filter((move) => move.type === "MOVE");
  const inQty = sumMovementQuantity(inMoves);
  const outQty = sumMovementQuantity(outMoves);
  const transferQty = sumMovementQuantity(transferMoves);
  const averageQty = chartHistory.length
    ? chartHistory.reduce((sum, item) => sum + Number(item.quantity || 0), 0) / chartHistory.length
    : state.locations.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  const turnover = averageQty > 0 ? outQty / averageQty : 0;
  const dwellSamples = movements.map((move) => Number(move.dwellHours)).filter((hours) => Number.isFinite(hours) && hours >= 0);
  const averageDwell = dwellSamples.length ? dwellSamples.reduce((sum, hours) => sum + hours, 0) / dwellSamples.length : null;
  const stagnant = state.locations.filter((item) => item.occupiedSince && now - Date.parse(item.occupiedSince) >= 30 * 86400000).length;
  const fullFlow = occupancyFlow(movements, occupied, state.waterfallGranularity);
  const flowWindow = state.waterfallWindow || fullFlow.length;
  const dailyFlow = fullFlow.slice(-flowWindow);

  $("#analyticsOccupancy").textContent = formatRate(occupancyRate);
  $("#analyticsChange").textContent = `${changePoints >= 0 ? "+" : ""}${changePoints.toFixed(2)} pp en el período`;
  $("#analyticsAverage").textContent = formatRate(averageRate);
  $("#analyticsPeak").textContent = `Máximo ${formatRate(peakRate)}`;
  $("#analyticsMovesDay").textContent = (movements.length / observedDays).toFixed(1);
  $("#analyticsMovesTotal").textContent = `${fmt.format(movements.length)} movimientos`;
  $("#analyticsTurnover").textContent = `${turnover.toFixed(2)}x`;
  $("#analyticsDwell").textContent = averageDwell === null ? "Sin datos" : formatDuration(averageDwell);
  $("#analyticsDwellSamples").textContent = `${dwellSamples.length} salidas medibles`;
  $("#analyticsStagnant").textContent = fmt.format(stagnant);
  $("#analyticsCoverage").textContent = coverageText(chartHistory);
  $("#analyticsRange").textContent = chartHistory.length > 1 ? `${chartHistory.length} meses` : "Mes actual";
  $("#waterfallRange").textContent = dailyFlow.length
    ? `${dailyFlow.length} ${state.waterfallGranularity === "hour" ? "franjas horarias" : "fechas"}`
    : "Sin variaciones";

  $("#flowMetrics").innerHTML = [
    ["Ingresos", inMoves.length, inQty, "flow-in"],
    ["Egresos", outMoves.length, outQty, "flow-out"],
    ["Traslados", transferMoves.length, transferQty, "flow-move"],
  ].map(([label, count, quantity, cssClass]) => `
    <div class="flow-row ${cssClass}"><span>${label}</span><strong>${fmt.format(count)}</strong><small>${fmt.format(quantity)} unidades</small></div>
  `).join("");

  renderAnalyticsSides();
  renderTopMaterials();
  if (section.classList.contains("active")) {
    drawOccupancyChart(chartHistory, total);
    drawOccupancyWaterfall(dailyFlow, occupied);
  }
}

function occupancyFlow(movements, currentOccupied, granularity) {
  const buckets = new Map();
  movements.forEach((move) => {
    const delta = Number(move.occupancyDelta || 0);
    if (!delta) return;
    const date = new Date(movementTimestamp(move));
    if (Number.isNaN(date.getTime())) return;
    const dayKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    const key = granularity === "hour" ? `${dayKey}-${String(date.getHours()).padStart(2, "0")}` : dayKey;
    const bucketDate = granularity === "hour"
      ? new Date(date.getFullYear(), date.getMonth(), date.getDate(), date.getHours())
      : new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const item = buckets.get(key) || { key, timestamp: bucketDate.getTime(), occupied: 0, vacated: 0 };
    if (delta > 0) item.occupied += delta;
    if (delta < 0) item.vacated += Math.abs(delta);
    buckets.set(key, item);
  });
  const days = [...buckets.values()].sort((a, b) => a.timestamp - b.timestamp);
  let running = currentOccupied - days.reduce((sum, day) => sum + day.occupied - day.vacated, 0);
  return days.map((day) => {
    const start = running;
    running += day.occupied - day.vacated;
    return { ...day, start, end: running, net: running - start };
  });
}

function changeWaterfallZoom(direction) {
  const occupied = state.locations.filter((item) => item.occupied).length;
  const periodMonths = state.analyticsPeriod === "all" ? null : Number(state.analyticsPeriod);
  const cutoffDate = new Date();
  if (periodMonths) cutoffDate.setMonth(cutoffDate.getMonth() - periodMonths + 1, 1);
  cutoffDate.setHours(0, 0, 0, 0);
  const movements = state.movements.filter((move) => movementTimestamp(move) >= (periodMonths ? cutoffDate.getTime() : 0));
  const length = occupancyFlow(movements, occupied, state.waterfallGranularity).length;
  if (!length) return;
  const current = state.waterfallWindow || length;
  state.waterfallWindow = direction > 0
    ? Math.max(3, Math.ceil(current * 0.65))
    : Math.min(length, Math.ceil(current * 1.5));
  if (state.waterfallWindow >= length) state.waterfallWindow = 0;
  renderAnalytics();
}

function monthlyOccupancyHistory(history, currentOccupied) {
  const byMonth = new Map();
  history.forEach((snapshot) => {
    const date = new Date(snapshot.timestamp);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    byMonth.set(key, snapshot);
  });
  const now = new Date();
  const currentKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  byMonth.set(currentKey, { timestamp: now.toISOString(), occupied: currentOccupied, quantity: state.locations.reduce((sum, item) => sum + Number(item.quantity || 0), 0) });
  return [...byMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, snapshot]) => ({ ...snapshot, month }));
}

function movementTimestamp(move) {
  if (move.timestamp) return Date.parse(move.timestamp);
  const match = String(move.date || "").match(/(\d{1,2})\/(\d{1,2})\/(\d{4}),?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!match) return 0;
  return new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]), Number(match[4]), Number(match[5]), Number(match[6] || 0)).getTime();
}

function historySpanDays(history) {
  if (history.length < 2) return 1;
  return Math.max(1, (Date.parse(history.at(-1).timestamp) - Date.parse(history[0].timestamp)) / 86400000);
}

function sumMovementQuantity(movements) {
  return movements.reduce((sum, move) => sum + Number(move.quantity || 0), 0);
}

function formatDuration(hours) {
  if (hours < 24) return `${hours.toFixed(1)} h`;
  return `${(hours / 24).toFixed(1)} días`;
}

function coverageText(history) {
  if (!history.length) return "Sin historial";
  const start = new Date(history[0].timestamp).toLocaleDateString("es-AR");
  return history.length === 1 ? `Historial iniciado ${start}` : `Datos desde ${start}`;
}

function renderAnalyticsSides() {
  const sides = groupBy(state.locations, (item) => item.side);
  $("#analyticsSides").innerHTML = Object.entries(sides).map(([side, items]) => {
    const used = items.filter((item) => item.occupied).length;
    const rate = (used / items.length) * 100;
    return `<div class="bar-row"><strong>Lado ${side}</strong><div class="bar-track"><div class="bar-fill" style="width:${rate}%"></div></div><span>${formatRate(rate)}</span></div>`;
  }).join("");
}

function renderTopMaterials() {
  const byMaterial = groupBy(state.locations.filter((item) => item.material), (item) => item.material);
  const ranking = Object.entries(byMaterial)
    .map(([material, items]) => ({ material, quantity: items.reduce((sum, item) => sum + Number(item.quantity || 0), 0), positions: items.length }))
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 6);
  $("#topMaterials").innerHTML = ranking.length
    ? ranking.map((item, index) => `<div><span>${index + 1}</span><strong>${item.material}</strong><small>${fmt.format(item.quantity)} u. · ${item.positions} pos.</small></div>`).join("")
    : `<p class="empty-state">Sin materiales con stock.</p>`;
}

function drawOccupancyChart(history, total) {
  const canvas = $("#occupancyChart");
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const width = rect.width;
  const height = rect.height;
  const padding = { top: 20, right: 18, bottom: 30, left: 48 };
  const plotW = width - padding.left - padding.right;
  const plotH = height - padding.top - padding.bottom;
  ctx.clearRect(0, 0, width, height);
  ctx.font = "12px Arial";
  ctx.fillStyle = "#657482";
  ctx.strokeStyle = "#d6dee4";
  ctx.lineWidth = 1;
  const rates = history.map((item) => (item.occupied / total) * 100);
  const highestRate = Math.max(occupancyRateFloor(rates), ...rates);
  const yMax = Math.min(100, Math.max(1, Math.ceil(highestRate * 1.25 * 10) / 10));
  [0, 0.25, 0.5, 0.75, 1].forEach((step) => {
    const rate = yMax * step;
    const y = padding.top + plotH - step * plotH;
    ctx.beginPath(); ctx.moveTo(padding.left, y); ctx.lineTo(width - padding.right, y); ctx.stroke();
    ctx.fillText(`${rate < 1 ? rate.toFixed(2) : rate.toFixed(1)}%`, 8, y + 4);
  });
  const points = history.map((item, index) => ({
    x: padding.left + (history.length === 1 ? plotW : (index / (history.length - 1)) * plotW),
    y: padding.top + plotH - (((item.occupied / total) * 100 / yMax) * plotH),
    item,
  }));
  if (points.length === 1) points.unshift({ x: padding.left, y: points[0].y });
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  points.slice(1).forEach((point) => ctx.lineTo(point.x, point.y));
  ctx.strokeStyle = "#197a9b";
  ctx.lineWidth = 2.5;
  ctx.stroke();
  ctx.lineTo(points.at(-1).x, padding.top + plotH);
  ctx.lineTo(points[0].x, padding.top + plotH);
  ctx.closePath();
  ctx.fillStyle = "rgba(25, 122, 155, 0.12)";
  ctx.fill();
  ctx.fillStyle = "#657482";
  ctx.textAlign = "center";
  const labelEvery = Math.max(1, Math.ceil(history.length / 6));
  points.forEach((point, index) => {
    if (index % labelEvery !== 0 && index !== points.length - 1) return;
    const date = new Date(point.item?.timestamp || history[Math.min(index, history.length - 1)].timestamp);
    ctx.fillText(date.toLocaleDateString("es-AR", { month: "short", year: "2-digit" }), point.x, height - 8);
  });
  ctx.textAlign = "start";
  const last = points.at(-1);
  ctx.beginPath(); ctx.arc(last.x, last.y, 4, 0, Math.PI * 2); ctx.fillStyle = "#197a9b"; ctx.fill();
}

function occupancyRateFloor(rates) {
  return rates.length ? Math.max(...rates) : 0;
}

function drawOccupancyWaterfall(days, currentOccupied) {
  const canvas = $("#occupancyWaterfall");
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const width = rect.width;
  const height = rect.height;
  const padding = { top: 34, right: 20, bottom: 44, left: 54 };
  const plotW = width - padding.left - padding.right;
  const plotH = height - padding.top - padding.bottom;
  ctx.clearRect(0, 0, width, height);
  ctx.font = "12px Arial";

  const values = days.flatMap((day) => [day.start, day.end]);
  values.push(currentOccupied, 0);
  let minValue = Math.min(...values);
  let maxValue = Math.max(...values);
  const rangePad = Math.max(1, (maxValue - minValue) * 0.18);
  minValue = Math.max(0, Math.floor(minValue - rangePad));
  maxValue = Math.ceil(maxValue + rangePad);
  if (maxValue === minValue) maxValue = minValue + 1;
  const y = (value) => padding.top + ((maxValue - value) / (maxValue - minValue)) * plotH;

  ctx.strokeStyle = "#d6dee4";
  ctx.fillStyle = "#657482";
  ctx.textAlign = "right";
  for (let step = 0; step <= 4; step += 1) {
    const value = minValue + ((maxValue - minValue) * step) / 4;
    const lineY = y(value);
    ctx.beginPath(); ctx.moveTo(padding.left, lineY); ctx.lineTo(width - padding.right, lineY); ctx.stroke();
    ctx.fillText(fmt.format(Math.round(value)), padding.left - 8, lineY + 4);
  }

  const initialOccupied = days[0]?.start ?? currentOccupied;
  const items = [
    { key: "INITIAL", start: minValue, end: initialOccupied, net: 0, total: true, initial: true },
    ...days,
    { key: "TOTAL", start: minValue, end: currentOccupied, net: 0, total: true },
  ];
  const slot = plotW / Math.max(1, items.length);
  const barWidth = Math.max(3, Math.min(42, slot * 0.58));
  const labelEvery = Math.max(1, Math.ceil(days.length / 12));
  ctx.textAlign = "center";
  items.forEach((item, index) => {
    const centerX = padding.left + slot * index + slot / 2;
    const topY = y(Math.max(item.start, item.end));
    const bottomY = y(Math.min(item.start, item.end));
    const visibleHeight = Math.max(4, bottomY - topY);
    if (index > 0 && !item.total) {
      const previousX = padding.left + slot * (index - 1) + slot / 2 + barWidth / 2;
      ctx.beginPath(); ctx.moveTo(previousX, y(item.start)); ctx.lineTo(centerX - barWidth / 2, y(item.start));
      ctx.strokeStyle = "#8b98a2"; ctx.setLineDash([3, 3]); ctx.stroke(); ctx.setLineDash([]);
    }
    ctx.fillStyle = item.total ? "#246a8d" : item.net > 0 ? "#23835b" : item.net < 0 ? "#c84a4a" : "#8b98a2";
    ctx.fillRect(centerX - barWidth / 2, item.total ? y(item.end) : topY, barWidth, item.total ? y(minValue) - y(item.end) : visibleHeight);
    ctx.fillStyle = "#263945";
    ctx.font = "700 11px Arial";
    if (item.total || days.length <= 20) {
      const valueLabel = item.total ? fmt.format(item.end) : `+${item.occupied || 0} / -${item.vacated || 0}`;
      ctx.fillText(valueLabel, centerX, Math.max(13, (item.total ? y(item.end) : topY) - 7));
    }
    ctx.fillStyle = "#657482";
    ctx.font = "11px Arial";
    const label = item.initial
      ? "Saldo inicial"
      : item.total
        ? "Total actual"
        : state.waterfallGranularity === "hour"
          ? new Date(item.timestamp).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false })
          : new Date(item.timestamp).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" });
    if (item.total || index % labelEvery === 0) {
      ctx.save(); ctx.translate(centerX, height - 10); ctx.rotate(items.length > 12 ? -0.55 : 0); ctx.fillText(label, 0, 0); ctx.restore();
    }
  });

  if (!days.length) {
    ctx.fillStyle = "#657482";
    ctx.font = "13px Arial";
    ctx.textAlign = "center";
    ctx.fillText("No hubo cambios de ocupación en el período seleccionado.", padding.left + plotW / 2, padding.top + plotH / 2);
  }
}

function handleMovement(event) {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.currentTarget));
  const type = event.currentTarget.id === "registerMovement" ? event.currentTarget.dataset.operation : data.type;
  const quantity = Number(data.quantity || 0);
  const material = String(data.material || "").trim();
  const from = normalizePosition(data.from);
  const to = normalizePosition(data.to);
  const timestamp = new Date().toISOString();
  const movementId = crypto.randomUUID ? crypto.randomUUID() : `move-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const occupiedBefore = state.locations.filter((item) => item.occupied).length;
  const originBefore = findLocation(from);
  const dwellHours = originBefore?.occupiedSince
    ? Math.max(0, (Date.parse(timestamp) - Date.parse(originBefore.occupiedSince)) / 3600000)
    : null;

  try {
    if (quantity <= 0) throw new Error("La cantidad debe ser mayor a cero.");
    if (type === "IN" && !material) throw new Error("Indicá el SKU o material.");
    if (type === "IN") registerIn(material, to, quantity, timestamp);
    if (type === "OUT") registerOut(material, from, quantity);
    if (type === "MOVE") registerMove(from, to, quantity, timestamp);

    const occupiedAfter = state.locations.filter((item) => item.occupied).length;

    const movement = {
      id: movementId,
      date: formatDateTime(timestamp),
      timestamp,
      type,
      material: material || findLocation(to)?.material || findLocation(from)?.material || "",
      from,
      to,
      quantity,
      occupancyDelta: occupiedAfter - occupiedBefore,
      dwellHours: type === "IN" ? null : dwellHours,
    };
    state.movements.unshift(movement);
    state.history.push({ ...createSnapshot(timestamp), movementId });
    saveState();
    queueMovementSync("CREADO", movement);
    renderAll();
    event.currentTarget.reset();
    event.currentTarget.quantity.value = 1;
    if (event.currentTarget.id === "registerMovement") setMovementType(type);
    setFormMessage(event.currentTarget, "Movimiento registrado.");
  } catch (error) {
    setFormMessage(event.currentTarget, error.message, true);
  }
}

function registerIn(material, to, quantity, timestamp) {
  if (!to) throw new Error("Indicá una posición destino.");
  const destination = requiredLocation(to);
  if (destination.blocked) throw new Error(`La posición destino está bloqueada: ${destination.blockReason || "sin motivo informado"}.`);
  if (destination.occupied) throw new Error("La posición destino ya está ocupada.");
  validateDriveInPutaway(destination, material);
  destination.material = material;
  destination.quantity = quantity;
  destination.occupied = true;
  destination.occupiedSince = timestamp;
}

function registerOut(material, from, quantity) {
  if (!from) throw new Error("Indicá una posición origen.");
  const origin = requiredLocation(from);
  if (!origin.occupied) throw new Error("La posición origen está libre.");
  validateDriveInRetrieval(origin);
  if (material && origin.material !== material) throw new Error("El material no coincide con la posición origen.");
  if (quantity > origin.quantity) throw new Error("La cantidad supera el stock disponible.");
  origin.quantity -= quantity;
  if (origin.quantity <= 0) {
    origin.material = "";
    origin.quantity = 0;
    origin.occupied = false;
    origin.occupiedSince = null;
  }
}

function registerMove(from, to, quantity, timestamp) {
  if (!from || !to) throw new Error("Indicá origen y destino.");
  const origin = requiredLocation(from);
  const destination = requiredLocation(to);
  if (destination.blocked) throw new Error(`La posición destino está bloqueada: ${destination.blockReason || "sin motivo informado"}.`);
  if (!origin.occupied) throw new Error("La posición origen está libre.");
  if (destination.occupied) throw new Error("La posición destino ya está ocupada.");
  if (quantity > origin.quantity) throw new Error("La cantidad supera el stock disponible.");
  validateDriveInRetrieval(origin);
  validateDriveInPutaway(destination, origin.material);
  destination.material = origin.material;
  destination.quantity = quantity;
  destination.occupied = true;
  destination.occupiedSince = timestamp;
  origin.quantity -= quantity;
  if (origin.quantity <= 0) {
    origin.material = "";
    origin.quantity = 0;
    origin.occupied = false;
    origin.occupiedSince = null;
  }
}

function driveInLane(location) {
  return state.locations.filter((item) => item.storageType === "drivein" && item.rack === location.rack && item.level === location.level);
}

function validateDriveInPutaway(destination, material) {
  if (destination.storageType !== "drivein") return;
  const lane = driveInLane(destination);
  const mixed = lane.find((item) => item.occupied && item.material && item.material !== material);
  if (mixed) throw new Error(`La calle Drive-In ${String(destination.rack).padStart(2, "0")} nivel ${destination.level} contiene el SKU ${mixed.material}.`);
  const expected = lane.filter((item) => !item.occupied && !item.blocked).sort((a, b) => b.depth - a.depth)[0];
  if (!expected || expected.id !== destination.id) throw new Error(`Para respetar LIFO, el ingreso debe realizarse en ${expected?.id || "otra calle disponible"}.`);
}

function validateDriveInRetrieval(origin) {
  if (origin.storageType !== "drivein") return;
  const expected = driveInLane(origin).filter((item) => item.occupied).sort((a, b) => a.depth - b.depth)[0];
  if (expected && expected.id !== origin.id) throw new Error(`Para respetar LIFO, primero debe retirarse ${expected.id}.`);
}

function isEligibleDriveInPutaway(location, material) {
  if (location.storageType !== "drivein") return true;
  const lane = driveInLane(location);
  if (lane.some((item) => item.occupied && item.material && item.material !== material)) return false;
  const expected = lane.filter((item) => !item.occupied && !item.blocked).sort((a, b) => b.depth - a.depth)[0];
  return expected?.id === location.id;
}

function createSnapshot(timestamp) {
  return {
    timestamp,
    occupied: state.locations.filter((item) => item.occupied).length,
    quantity: state.locations.reduce((sum, item) => sum + Number(item.quantity || 0), 0),
  };
}

function findLocation(id) {
  return state.locations.find((item) => item.id.toUpperCase() === String(id || "").toUpperCase());
}

function requiredLocation(id) {
  const location = findLocation(id);
  if (!location) {
    const suggestions = suggestLocations(id);
    const hint = suggestions.length ? ` Posiciones cercanas: ${suggestions.join(" o ")}.` : "";
    throw new Error(`No existe la posición ${id}.${hint}`);
  }
  return location;
}

function normalizePosition(value) {
  const normalized = String(value || "").trim().toUpperCase().replaceAll(" ", "");
  const driveInMatch = normalized.match(/^DI\.(\d{1,2})\.([0-4])\.(\d{1,2})$/);
  if (driveInMatch) return `DI.${driveInMatch[1].padStart(2, "0")}.${driveInMatch[2]}.${driveInMatch[3].padStart(2, "0")}`;
  const match = normalized.match(/^([A-Z]+)([12])\.(\d{1,2})\.([0-4])$/);
  return match ? `${match[1]}${match[2]}.${match[3].padStart(2, "0")}.${match[4]}` : normalized;
}

function suggestLocations(id) {
  const driveInMatch = String(id || "").match(/^DI\.(\d{2})\.([0-4])\.(\d{2})$/);
  if (driveInMatch) {
    const [, column, level, depth] = driveInMatch;
    return state.locations
      .filter((item) => item.storageType === "drivein" && String(item.level) === level)
      .sort((a, b) => (Math.abs(a.rack - Number(column)) + Math.abs(a.depth - Number(depth))) - (Math.abs(b.rack - Number(column)) + Math.abs(b.depth - Number(depth))))
      .slice(0, 3)
      .map((item) => item.id);
  }
  const match = String(id || "").match(/^([A-Z]+)([12])\.(\d{2})\.([0-4])$/);
  if (!match) return [];
  const [, aisle, side, moduleText, level] = match;
  const module = Number(moduleText);
  const sameAisle = state.locations
    .filter((item) => item.aisle === aisle && String(item.side) === side && String(item.level) === level)
    .sort((a, b) => Math.abs(a.module - module) - Math.abs(b.module - module));
  const sameModule = state.locations
    .filter((item) => item.module === module && String(item.side) === side && String(item.level) === level)
    .sort((a, b) => Math.abs(aisleNumber(a.aisle) - aisleNumber(aisle)) - Math.abs(aisleNumber(b.aisle) - aisleNumber(aisle)));
  return [...new Set([...sameAisle.slice(0, 1), ...sameModule.slice(0, 1)].map((item) => item.id))].slice(0, 2);
}

function aisleNumber(aisle) {
  return [...aisle].reduce((value, character) => value * 26 + character.charCodeAt(0) - 64, 0);
}

function setFormMessage(form, text, isError = false) {
  const message = form.id === "registerMovement" ? $("#registerMessage") : $("#formMessage");
  message.textContent = text;
  message.style.color = isError ? "var(--danger)" : "var(--available-text)";
}

function openDetail(item) {
  if (!item) return;
  $("#detailPanel").dataset.locationId = item.id;
  $("#detailTitle").textContent = item.id;
  renderDetailFields([
    ["Sector", item.storageType === "drivein" ? "Drive-In" : item.aisle],
    [item.storageType === "drivein" ? "Acceso" : "Lado", item.storageType === "drivein" ? "Único" : item.side],
    [item.storageType === "drivein" ? "Columna" : "Rack", item.rack],
    [item.storageType === "drivein" ? "Profundidad" : "Módulo", item.depth || item.module],
    ["Nivel", item.level],
    ["Material", item.material || "Sin stock"],
    ["Cantidad", item.quantity || 0],
    ["Estado", item.blocked ? "Bloqueada" : item.occupied ? "Ocupada" : "Libre"],
    ["Motivo de bloqueo", item.blockReason || "—"],
  ]);
  const action = $("#toggleLocationBlock");
  action.hidden = false;
  action.textContent = item.blocked ? "Desbloquear posición" : "Bloquear posición";
  action.classList.toggle("unblock", item.blocked);
  $("#detailPanel").classList.remove("hidden");
}

function recommendPutawayLocation(sku) {
  const item = state.skuMaster.find((candidate) => candidate.sku.toLowerCase() === String(sku || "").trim().toLowerCase());
  if (!item) return { location: null, reason: "El SKU no está registrado en el maestro." };
  const available = state.locations.filter((location) => !location.occupied && !location.blocked && isEligibleDriveInPutaway(location, item.sku));
  const preferred = available.find((location) => location.id === normalizePosition(item.preferredLocation));
  if (preferred) return { location: preferred, reason: "Ubicación preferida del maestro SKU." };

  const rules = state.slottingRules.filter((rule) => rule.velocityClass === item.velocityClass);
  const zoned = rules.length ? available.filter((location) => rules.some((rule) => locationMatchesRule(location, rule))) : available;
  const fastMover = item.velocityClass === "SUPER_A" || item.velocityClass === "A";
  const sorted = zoned.sort((a, b) => {
    const levelA = fastMover ? (Number(a.level) === 0 ? 0 : 100000 + Number(a.level) * 1000) : Number(a.level) * 20;
    const levelB = fastMover ? (Number(b.level) === 0 ? 0 : 100000 + Number(b.level) * 1000) : Number(b.level) * 20;
    const distanceA = aisleNumber(a.aisle) * 10000 + Number(a.rack) * 100 + Number(a.module);
    const distanceB = aisleNumber(b.aisle) * 10000 + Number(b.rack) * 100 + Number(b.module);
    return levelA + distanceA - levelB - distanceB;
  });
  if (!sorted.length) return { location: null, reason: `No hay posiciones libres en la zona ${formatVelocityClass(item.velocityClass)}.` };
  const levelReason = fastMover && Number(sorted[0].level) === 0 ? " y nivel 0 para picking" : "";
  const zoneReason = rules.length ? `zona ${formatVelocityClass(item.velocityClass)}` : "sin zona configurada";
  return { location: sorted[0], reason: `Primera posición libre en ${zoneReason}${levelReason}.` };
}

function renderPutawaySuggestion(type, sku, selectedPosition) {
  const panel = $("#putawaySuggestion");
  if (type !== "IN" || !String(sku || "").trim() || String(selectedPosition || "").trim()) {
    panel.classList.add("hidden");
    panel.dataset.position = "";
    return;
  }
  const recommendation = recommendPutawayLocation(sku);
  panel.classList.remove("hidden");
  panel.dataset.position = recommendation.location?.id || "";
  $("#suggestedPosition").textContent = recommendation.location?.id || "Sin sugerencia";
  $("#suggestionReason").textContent = recommendation.reason;
  $("#useSuggestedPosition").disabled = !recommendation.location;
}

function applyPutawaySuggestion() {
  const position = $("#putawaySuggestion").dataset.position;
  if (!position) return;
  $("#registerTo").value = position;
  $("#registerTo").dispatchEvent(new Event("input", { bubbles: true }));
  $("#registerQuantity").focus();
  $("#registerQuantity").select();
}

function openRackDetail(side, rack) {
  const items = state.locations.filter((item) => item.side === side && item.rack === rack);
  if (!items.length) return;
  const occupiedItems = items.filter((item) => item.occupied);
  const blockedItems = items.filter((item) => item.blocked);
  const available = items.filter((item) => !item.occupied && !item.blocked).length;
  const usableCapacity = items.length - blockedItems.length;
  const units = occupiedItems.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  const skus = [...new Set(occupiedItems.map((item) => item.material).filter(Boolean))];
  const levelSummary = [0, 1, 2, 3, 4].map((level) => {
    const levelItems = items.filter((item) => item.level === level);
    const occupied = levelItems.filter((item) => item.occupied).length;
    const blocked = levelItems.filter((item) => item.blocked).length;
    return `N${level}: ${occupied}/${levelItems.length}${blocked ? `, ${blocked} bloq.` : ""}`;
  }).join(" · ");
  const skuSummary = skus.length ? skus.slice(0, 8).join(", ") + (skus.length > 8 ? ` +${skus.length - 8}` : "") : "Sin stock";

  $("#detailPanel").dataset.locationId = "";
  $("#detailTitle").textContent = `Rack ${String(rack).padStart(2, "0")} · Lado ${side}`;
  renderDetailFields([
    ["Posiciones", items.length],
    ["Ocupadas", occupiedItems.length],
    ["Bloqueadas", blockedItems.length],
    ["Disponibles", available],
    ["Ocupación útil", usableCapacity ? formatRate((occupiedItems.length / usableCapacity) * 100) : "Sin capacidad"],
    ["Unidades", fmt.format(units)],
    ["SKU distintos", skus.length],
    ["Materiales", skuSummary],
    ["Por nivel", levelSummary],
  ]);
  $("#toggleLocationBlock").hidden = true;
  $("#detailPanel").classList.remove("hidden");
}

function renderDetailFields(rows) {
  const fields = $("#detailFields");
  fields.replaceChildren();
  rows.forEach(([label, value]) => {
    const term = document.createElement("dt");
    const detail = document.createElement("dd");
    term.textContent = label;
    detail.textContent = String(value);
    fields.append(term, detail);
  });
}

async function toggleLocationBlock() {
  const item = findLocation($("#detailPanel").dataset.locationId);
  if (!item) return;
  if (item.blocked) {
    const adminPassword = await authenticateAdmin();
    if (!adminPassword) return;
    if (!confirm(`¿Desbloquear la posición ${item.id}?`)) return;
    state.centralBlocks.delete(item.id);
    item.blocked = false;
    item.blockReason = "";
    queueLocationBlockSync("UNBLOCK", item.id, "", adminPassword);
    saveState();
    renderAll();
    openDetail(item);
    return;
  }
  $("#blockLocationForm").dataset.locationId = item.id;
  $("#blockLocationId").textContent = item.id;
  $("#blockReasonPreset").value = "Rotura de rack";
  $("#blockReasonDetail").value = "";
  $("#blockLocationDialog").showModal();
}

async function saveLocationBlock(event) {
  event.preventDefault();
  const item = findLocation(event.currentTarget.dataset.locationId);
  if (!item) return;
  const adminPassword = await authenticateAdmin();
  if (!adminPassword) return;
  const preset = $("#blockReasonPreset").value;
  const detail = $("#blockReasonDetail").value.trim();
  item.blocked = true;
  item.blockReason = detail ? `${preset}: ${detail}` : preset;
  state.centralBlocks.set(item.id, item.blockReason);
  queueLocationBlockSync("BLOCK", item.id, item.blockReason, adminPassword);
  saveState();
  closeBlockLocationDialog();
  renderAll();
  openDetail(item);
}

async function authenticateAdmin() {
  if (state.syncConfig.authenticated && state.syncConfig.operator === ADMIN_USER) return ADMIN_PASSWORD_HASH;
  const password = prompt("Contraseña de administrador");
  if (password === null) return false;
  const hash = await sha256(password);
  if (hash === ADMIN_PASSWORD_HASH) return hash;
  alert("Contraseña de administrador incorrecta.");
  return false;
}

function queueLocationBlockSync(type, position, reason, adminPassword) {
  const timestamp = new Date();
  queueMovementSync("CREADO", {
    id: crypto.randomUUID ? crypto.randomUUID() : `block-${timestamp.getTime()}-${Math.random()}`,
    timestamp: timestamp.toISOString(),
    date: formatDateTime(timestamp),
    type,
    material: reason,
    from: type === "UNBLOCK" ? position : "",
    to: type === "BLOCK" ? position : "",
    quantity: 0,
    occupancyDelta: 0,
    dwellHours: null,
    adminPassword,
  });
}

function closeBlockLocationDialog() {
  $("#blockLocationDialog").close();
}

function resetData() {
  if (!confirm("Se perderán los movimientos cargados en este navegador. ¿Restaurar datos del Excel?")) return;
  state.locations = structuredClone(state.original);
  state.locations.forEach((location) => {
    location.occupiedSince = null;
    location.blocked = false;
    location.blockReason = "";
  });
  state.centralBlocks = new Map();
  state.movements = [];
  state.history = [createSnapshot(new Date().toISOString())];
  saveState();
  renderAll();
}

function exportMovementsCsv() {
  const header = ["Fecha", "Tipo", "Material", "Desde", "Hasta", "Cantidad"];
  const rows = state.movements.map((move) => [formatMovementDate(move), move.type, move.material, move.from, move.to, move.quantity]);
  const csv = [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "movimientos-wms.csv";
  link.click();
  URL.revokeObjectURL(url);
}

function csvCell(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function groupBy(items, keyFn) {
  return items.reduce((acc, item) => {
    const key = keyFn(item);
    acc[key] ||= [];
    acc[key].push(item);
    return acc;
  }, {});
}

function formatRate(rate) {
  return `${rate < 1 && rate > 0 ? rate.toFixed(2) : rate.toFixed(1)}%`;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

init();
