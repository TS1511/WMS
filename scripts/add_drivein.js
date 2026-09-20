const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const locationsPath = path.join(root, "data", "locations.json");
const layoutPath = path.join(root, "data", "layout3d.json");
const locationsPayload = JSON.parse(fs.readFileSync(locationsPath, "utf8"));
const layoutPayload = JSON.parse(fs.readFileSync(layoutPath, "utf8"));

locationsPayload.locations = locationsPayload.locations.filter((item) => !["drivein", "wallrack"].includes(item.storageType));
layoutPayload.stacks = layoutPayload.stacks.filter((item) => !["drivein", "wallrack"].includes(item.type));

for (let column = 1; column <= 38; column += 1) {
  for (let depth = 1; depth <= 5; depth += 1) {
    const columnCode = String(column).padStart(2, "0");
    const depthCode = String(depth).padStart(2, "0");
    const levels = [];
    for (let level = 0; level <= 4; level += 1) {
      const id = `DI.${columnCode}.${level}.${depthCode}`;
      const location = {
        id,
        aisle: "DI",
        side: 2,
        rack: column,
        module: depth,
        level,
        depth,
        storageType: "drivein",
        material: "",
        quantity: 0,
        occupied: false,
      };
      locationsPayload.locations.push(location);
      levels.push({ id, level, rack: column, occupied: false, material: "", quantity: 0 });
    }
    layoutPayload.stacks.push({
      key: `DI.${columnCode}.${depthCode}`,
      baseId: `DI.${columnCode}.0.${depthCode}`,
      aisle: "DI",
      side: 2,
      rack: column,
      column,
      module: depth,
      depth,
      type: "drivein",
      row: 55 + (depth - 1) * 0.95,
      col: -54.3 + (column - 1) * 1.1,
      occupiedLevels: 0,
      levels,
    });
  }
}

for (let module = 1; module <= 12; module += 1) {
  for (let position = 1; position <= 2; position += 1) {
    const moduleCode = String(module).padStart(2, "0");
    const positionCode = String(position).padStart(2, "0");
    const levels = [];
    for (let level = 0; level <= 4; level += 1) {
      const id = `E.${moduleCode}.${level}.${positionCode}`;
      locationsPayload.locations.push({
        id,
        aisle: "E",
        side: 2,
        rack: module,
        module,
        position,
        level,
        storageType: "wallrack",
        material: "",
        quantity: 0,
        occupied: false,
      });
      levels.push({ id, level, rack: module, occupied: false, material: "", quantity: 0 });
    }
    layoutPayload.stacks.push({
      key: `E.${moduleCode}.${positionCode}`,
      baseId: `E.${moduleCode}.0.${positionCode}`,
      aisle: "E",
      side: 2,
      rack: module,
      column: module,
      module,
      position,
      type: "wallrack",
      row: 59.5,
      col: -12.6 + ((module - 1) * 2 + (position - 1)) * 1.07,
      occupiedLevels: 0,
      levels,
    });
  }
}

const locations = locationsPayload.locations;
locationsPayload.summary.totalLocations = locations.length;
locationsPayload.summary.occupiedLocations = locations.filter((item) => item.occupied).length;
locationsPayload.summary.availableLocations = locations.length - locationsPayload.summary.occupiedLocations;
locationsPayload.summary.totalQuantity = locations.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
locationsPayload.summary.sides = locations.reduce((result, item) => {
  result[item.side] = (result[item.side] || 0) + 1;
  return result;
}, {});
locationsPayload.summary.levels = locations.reduce((result, item) => {
  result[item.level] = (result[item.level] || 0) + 1;
  return result;
}, {});
locationsPayload.summary.aisles = locations.reduce((result, item) => {
  result[item.aisle] = (result[item.aisle] || 0) + 1;
  return result;
}, {});

layoutPayload.bounds = {
  minRow: Math.min(...layoutPayload.stacks.map((item) => item.row)),
  maxRow: Math.max(...layoutPayload.stacks.map((item) => item.row)),
  minCol: Math.min(...layoutPayload.stacks.map((item) => item.col)),
  maxCol: Math.max(...layoutPayload.stacks.map((item) => item.col)),
};

fs.writeFileSync(locationsPath, JSON.stringify(locationsPayload, null, 2) + "\n");
fs.writeFileSync(layoutPath, JSON.stringify(layoutPayload, null, 2) + "\n");
console.log("Drive-In agregado: 38 columnas x 5 niveles x 5 profundidades = 950 posiciones.");
console.log("Rack Este agregado: 12 módulos x 2 posiciones x 5 niveles = 120 posiciones.");
