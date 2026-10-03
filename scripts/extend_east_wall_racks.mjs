import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const locationsPath = path.join(root, "data", "locations.json");
const layoutPath = path.join(root, "data", "layout3d.json");
const locationsPayload = JSON.parse(fs.readFileSync(locationsPath, "utf8"));
const layoutPayload = JSON.parse(fs.readFileSync(layoutPath, "utf8"));
const existingWallLocations = new Map(
  locationsPayload.locations
    .filter((item) => item.storageType === "wallrack" && item.aisle === "ZE")
    .map((item) => {
      const wallPosition = Number(item.wallPosition || ((Number(item.module) - 1) * 2 + Number(item.position)));
      return [`ZE.${wallPosition}.${item.level}`, item];
    })
);

const segments = [
  { firstModule: 1, lastModule: 14, startCol: -2.3 },
  { firstModule: 15, lastModule: 43, startCol: 25 },
  { firstModule: 44, lastModule: 66, startCol: 80 },
];
const positionPitch = 0.9;

locationsPayload.locations = locationsPayload.locations.filter((item) => !(item.storageType === "wallrack" && item.aisle === "ZE"));
layoutPayload.stacks = layoutPayload.stacks.filter((item) => !(item.type === "wallrack" && item.aisle === "ZE"));

for (const segment of segments) {
  for (let module = segment.firstModule; module <= segment.lastModule; module += 1) {
    for (let position = 1; position <= 2; position += 1) {
      const wallPosition = (module - 1) * 2 + position;
      const offset = (module - segment.firstModule) * 2 + position - 1;
      const levels = [];
      for (let level = 0; level <= 4; level += 1) {
        const id = `ZE.${wallPosition}.${level}`;
        const existing = existingWallLocations.get(id);
        const location = existing ? {
          ...existing,
          id,
          aisle: "ZE",
          rack: module,
          module,
          position: wallPosition,
          wallPosition,
          level,
        } : {
          id,
          aisle: "ZE",
          side: 2,
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
        key: `ZE.${wallPosition}`,
        baseId: `ZE.${wallPosition}.0`,
        aisle: "ZE",
        side: 2,
        rack: module,
        column: module,
        module,
        position: wallPosition,
        wallPosition,
        type: "wallrack",
        row: 55.8,
        col: segment.startCol + offset * positionPitch,
        occupiedLevels: levels.filter((item) => item.occupied).length,
        levels,
      });
    }
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

fs.writeFileSync(locationsPath, `${JSON.stringify(locationsPayload, null, 2)}\n`);
fs.writeFileSync(layoutPath, `${JSON.stringify(layoutPayload, null, 2)}\n`);
console.log("Pared Este actualizada: ZE.1 a ZE.132, 5 niveles y 660 ubicaciones.");
