import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const locationsPath = path.join(root, "data", "locations.json");
const layoutPath = path.join(root, "data", "layout3d.json");
const locationsPayload = JSON.parse(fs.readFileSync(locationsPath, "utf8"));
const layoutPayload = JSON.parse(fs.readFileSync(layoutPath, "utf8"));
const aisles = "ABCDEFGHIJKLMNOPQR".split("");
const rackCount = 17;
const positionsPerFace = 22;
const levels = 5;
// Anchor the last face exactly as surveyed: R.01.0 = X -75 / Y 20.
const backstoreStartRow = 20;
const backstoreAnchorCol = -75;

locationsPayload.locations = locationsPayload.locations.filter((item) => item.storageType !== "backstore");
layoutPayload.stacks = layoutPayload.stacks.filter((item) => item.type !== "backstore");

for (let rack = 1; rack <= rackCount; rack += 1) {
  const faces = [
    { aisle: aisles[rack - 1], parity: 0, colOffset: 0 },
    { aisle: aisles[rack], parity: 1, colOffset: 1.05 },
  ];

  faces.forEach((face) => {
    for (let slot = 0; slot < positionsPerFace; slot += 1) {
      const position = slot * 2 + (face.parity ? 1 : 2);
      const positionCode = String(position).padStart(2, "0");
      const key = `${face.aisle}.${positionCode}`;
      const stackLevels = [];

      for (let level = 0; level < levels; level += 1) {
        const id = `${key}.${level}`;
        const location = {
          id,
          aisle: face.aisle,
          side: 0,
          rack,
          module: position,
          position,
          level,
          material: "",
          quantity: 0,
          occupied: false,
          storageType: "backstore",
          sector: "BACK",
        };
        locationsPayload.locations.push(location);
        stackLevels.push({ id, level, rack, occupied: false, material: "", quantity: 0 });
      }

      layoutPayload.stacks.push({
        key,
        baseId: `${key}.0`,
        aisle: face.aisle,
        side: 0,
        rack,
        module: position,
        position,
        type: "backstore",
        row: backstoreStartRow + slot * 1.1,
        col: backstoreAnchorCol - (rackCount - rack) * 5 + (face.colOffset - 1.05),
        occupiedLevels: 0,
        levels: stackLevels,
      });
    }
  });
}

const locations = locationsPayload.locations;
const countBy = (key) => locations.reduce((result, item) => {
  const value = String(item[key]);
  result[value] = (result[value] || 0) + 1;
  return result;
}, {});

locationsPayload.source = {
  ...locationsPayload.source,
  backstoreZone: "Back salón Escobar: 17 racks dobles, 11 módulos y 22 posiciones por frente",
  backstoreCodeFormat: "PASILLO.POSICION.NIVEL",
};
locationsPayload.summary = {
  ...locationsPayload.summary,
  totalLocations: locations.length,
  occupiedLocations: locations.filter((item) => item.occupied).length,
  availableLocations: locations.filter((item) => !item.occupied).length,
  totalQuantity: locations.reduce((sum, item) => sum + Number(item.quantity || 0), 0),
  sides: countBy("side"),
  levels: countBy("level"),
  aisles: countBy("aisle"),
  backstoreLocations: locations.filter((item) => item.storageType === "backstore").length,
};
const layoutRows = layoutPayload.stacks.map((item) => item.row);
const layoutCols = layoutPayload.stacks.map((item) => item.col);
layoutPayload.bounds = {
  minRow: Math.floor(Math.min(...layoutRows) - 1),
  maxRow: Math.ceil(Math.max(...layoutRows) + 1),
  minCol: Math.floor(Math.min(...layoutCols) - 1),
  maxCol: Math.ceil(Math.max(...layoutCols) + 1),
};
layoutPayload.source = { ...layoutPayload.source, backstoreZone: "Back salón Escobar" };
layoutPayload.geometryVersion = "backstore-v4-r01-anchor";

fs.writeFileSync(locationsPath, `${JSON.stringify(locationsPayload, null, 2)}\n`);
fs.writeFileSync(layoutPath, `${JSON.stringify(layoutPayload, null, 2)}\n`);
console.log(`Back salón Escobar agregado: ${locationsPayload.summary.backstoreLocations} posiciones.`);
