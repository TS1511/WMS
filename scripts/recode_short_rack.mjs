import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const locationsPath = path.join(root, "data", "locations.json");
const layoutPath = path.join(root, "data", "layout3d.json");

const locationsPayload = JSON.parse(await readFile(locationsPath, "utf8"));
const layoutPayload = JSON.parse(await readFile(layoutPath, "utf8"));

if (locationsPayload.source?.positionCodeVersion === 2) {
  console.log("La codificación corta ya fue aplicada.");
  process.exit(0);
}

function recode(aisle, side, rack, module) {
  if (Number(side) !== 2 || Number(rack) !== 1) return module;
  if (aisle === "A") return module <= 8 ? null : module - 8;
  if (aisle === "B") return module <= 7 ? null : module - 8;
  return module;
}

function positionId(aisle, side, module, level) {
  return `${aisle}${side}.${String(module).padStart(2, "0")}.${level}`;
}

locationsPayload.locations = locationsPayload.locations.flatMap((location) => {
  const module = recode(location.aisle, location.side, location.rack, Number(location.module));
  if (module == null) return [];
  if (module === Number(location.module)) return [location];
  return [{ ...location, module, id: positionId(location.aisle, location.side, module, location.level) }];
});

layoutPayload.stacks = layoutPayload.stacks.flatMap((stack) => {
  const module = recode(stack.aisle, stack.side, stack.rack, Number(stack.module));
  if (module == null) return [];
  if (module === Number(stack.module)) return [stack];
  const key = `${stack.aisle}${stack.side}.${String(module).padStart(2, "0")}`;
  return [{
    ...stack,
    key,
    baseId: `${key}.0`,
    module,
    levels: stack.levels.map((level) => ({
      ...level,
      id: positionId(stack.aisle, stack.side, module, level.level),
    })),
  }];
});

const locations = locationsPayload.locations;
const countBy = (key) => Object.fromEntries(
  [...new Set(locations.map((item) => String(item[key])))].sort().map((value) => [value, locations.filter((item) => String(item[key]) === value).length])
);
locationsPayload.source.positionCodeVersion = 2;
locationsPayload.source.positionCodeChange = "Primer rack doble corto: solo rack 1 de A2/B2, corrimiento -8";
locationsPayload.summary = {
  ...locationsPayload.summary,
  totalLocations: locations.length,
  occupiedLocations: locations.filter((item) => item.occupied).length,
  availableLocations: locations.filter((item) => !item.occupied).length,
  totalQuantity: locations.reduce((sum, item) => sum + Number(item.quantity || 0), 0),
  sides: countBy("side"),
  levels: countBy("level"),
  aisles: countBy("aisle"),
};

const rackSummary = new Map();
locations.forEach((item) => {
  const key = `${item.side}-${item.rack}`;
  const row = rackSummary.get(key) || { side: item.side, rack: item.rack, total: 0, occupied: 0 };
  row.total += 1;
  row.occupied += Number(Boolean(item.occupied));
  rackSummary.set(key, row);
});
locationsPayload.rackSummary = [...rackSummary.values()].sort((a, b) => a.side - b.side || a.rack - b.rack);
layoutPayload.source.positionCodeVersion = 2;
layoutPayload.source.positionCodeChange = "Primer rack doble corto: solo rack 1 de A2/B2, corrimiento -8";

await writeFile(locationsPath, `${JSON.stringify(locationsPayload, null, 2)}\n`);
await writeFile(layoutPath, `${JSON.stringify(layoutPayload, null, 2)}\n`);
console.log(`Codificación actualizada: ${locations.length} posiciones y ${layoutPayload.stacks.length} columnas 3D.`);
