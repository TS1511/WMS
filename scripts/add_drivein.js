const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const locationsPath = path.join(root, "data", "locations.json");
const layoutPath = path.join(root, "data", "layout3d.json");
const locationsPayload = JSON.parse(fs.readFileSync(locationsPath, "utf8"));
const layoutPayload = JSON.parse(fs.readFileSync(layoutPath, "utf8"));

locationsPayload.locations = locationsPayload.locations.filter((item) => item.storageType !== "drivein");
layoutPayload.stacks = layoutPayload.stacks.filter((item) => item.type !== "drivein");

for (let column = 1; column <= 25; column += 1) {
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
      row: 76 + (depth - 1) * 0.95,
      col: 4 + (column - 1) * 1.1,
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
console.log("Drive-In agregado: 25 columnas x 5 niveles x 5 profundidades = 625 posiciones.");
