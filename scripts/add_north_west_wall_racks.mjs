import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const locationsPath = path.join(root, "data", "locations.json");
const layoutPath = path.join(root, "data", "layout3d.json");
const locationsPayload = JSON.parse(fs.readFileSync(locationsPath, "utf8"));
const layoutPayload = JSON.parse(fs.readFileSync(layoutPath, "utf8"));
const wallAisles = new Set(["ZO", "ZN"]);

const existingLocations = new Map(
  locationsPayload.locations
    .filter((item) => wallAisles.has(item.aisle))
    .map((item) => [item.id, item])
);

locationsPayload.locations = locationsPayload.locations.filter((item) => !wallAisles.has(item.aisle));
layoutPayload.stacks = layoutPayload.stacks.filter((item) => !wallAisles.has(item.aisle));

if (layoutPayload.geometryVersion !== "perimeter-v2") {
  layoutPayload.stacks.forEach((stack) => {
    if ((!stack.type && Number(stack.side) === 2) || stack.type === "drivein") stack.row -= 3;
  });
  layoutPayload.geometryVersion = "perimeter-v2";
}

function addWallPosition({ aisle, wallPosition, module, row, col, rotation = 0 }) {
  const levels = [];
  for (let level = 0; level <= 4; level += 1) {
    const id = `${aisle}.${wallPosition}.${level}`;
    const previous = existingLocations.get(id);
    const location = previous ? {
      ...previous,
      id,
      aisle,
      side: 0,
      rack: module,
      module,
      position: wallPosition,
      wallPosition,
      level,
      storageType: "wallrack",
    } : {
      id,
      aisle,
      side: 0,
      rack: module,
      module,
      position: wallPosition,
      wallPosition,
      level,
      storageType: "wallrack",
      material: "",
      quantity: 0,
      occupied: false,
    };
    locationsPayload.locations.push(location);
    levels.push({
      id,
      level,
      rack: module,
      occupied: Boolean(location.occupied),
      material: location.material || "",
      quantity: Number(location.quantity || 0),
    });
  }
  layoutPayload.stacks.push({
    key: `${aisle}.${wallPosition}`,
    baseId: `${aisle}.${wallPosition}.0`,
    aisle,
    side: 0,
    rack: module,
    column: module,
    module,
    position: wallPosition,
    wallPosition,
    type: "wallrack",
    row,
    col,
    rotation,
    occupiedLevels: levels.filter((item) => item.occupied).length,
    levels,
  });
}

// Pared oeste: tres bloques de 17, 21 y 15 módulos según el plano completo.
// Las coordenadas ya incluyen el ancho visual de los pasillos selectivos.
const westSegments = [
  { modules: 17, startCol: 6.0 },
  { modules: 21, startCol: 41.0 },
  { modules: 15, startCol: 84.0 },
];
const westPositionPitch = 0.95;
let westModule = 1;
let westPosition = 1;
for (const segment of westSegments) {
  for (let localModule = 0; localModule < segment.modules; localModule += 1) {
    for (let pallet = 0; pallet < 2; pallet += 1) {
      addWallPosition({
        aisle: "ZO",
        wallPosition: westPosition,
        module: westModule,
        row: 4.5,
        col: segment.startCol + (localModule * 2 + pallet) * westPositionPitch,
      });
      westPosition += 1;
    }
    westModule += 1;
  }
}

// Pared norte oblicua: dos bloques de 13 y 15 módulos, fuera de los selectivos.
const northSegments = [
  { modules: 13, from: [112.0, 4.5], to: [118.0, 26.5] },
  { modules: 14, from: [119.0, 29.0], to: [126.8, 55.0] },
];
let northModule = 1;
let northPosition = 1;
for (const segment of northSegments) {
  const positionCount = segment.modules * 2;
  for (let index = 0; index < positionCount; index += 1) {
    const progress = positionCount === 1 ? 0 : index / (positionCount - 1);
    addWallPosition({
      aisle: "ZN",
      wallPosition: northPosition,
      module: northModule + Math.floor(index / 2),
      col: segment.from[0] + (segment.to[0] - segment.from[0]) * progress,
      row: segment.from[1] + (segment.to[1] - segment.from[1]) * progress,
      rotation: 75,
    });
    northPosition += 1;
  }
  northModule += segment.modules;
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
delete layoutPayload.projectedColumnBounds;

fs.writeFileSync(locationsPath, `${JSON.stringify(locationsPayload, null, 2)}\n`);
fs.writeFileSync(layoutPath, `${JSON.stringify(layoutPayload, null, 2)}\n`);
console.log("Paredes agregadas: ZO.1-ZO.106 y ZN.1-ZN.54, niveles 0-4.");
