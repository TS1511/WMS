import json
import re
from collections import defaultdict
from pathlib import Path

import openpyxl


SOURCE = Path(r"C:\Users\santi\Desktop\wms\Layout WMS.xlsx")
OUTPUT = Path("data/layout3d.json")
POSITION_RE = re.compile(r"^([A-Z]{1,2})([12])\.(\d{2})\.([0-4])$")


def position_key(position_id):
    match = POSITION_RE.match(position_id)
    if not match:
        return None
    aisle, side, module, _level = match.groups()
    return f"{aisle}{side}.{module}"


def main():
    workbook = openpyxl.load_workbook(SOURCE, data_only=True, read_only=True)

    aerial = workbook["Layout Vista Aerea"]
    base_positions = []
    for row in aerial.iter_rows():
        for cell in row:
            value = cell.value.strip() if isinstance(cell.value, str) else ""
            match = POSITION_RE.match(value)
            if not match:
                continue
            aisle, side, module, level = match.groups()
            if level != "0":
                continue
            base_positions.append(
                {
                    "key": position_key(value),
                    "baseId": value,
                    "aisle": aisle,
                    "side": int(side),
                    "module": int(module),
                    "row": cell.row,
                    "col": cell.column,
                }
            )

    source_locations = json.loads(Path("data/locations.json").read_text(encoding="utf-8"))["locations"]
    levels_by_key = defaultdict(list)
    for location in source_locations:
        key = position_key(location["id"])
        if key is None:
            continue
        levels_by_key[key].append(
            {
                "id": location["id"],
                "level": location["level"],
                "rack": location["rack"],
                "occupied": location["occupied"],
                "material": location["material"],
                "quantity": location["quantity"],
            }
        )

    rows = [item["row"] for item in base_positions]
    cols = [item["col"] for item in base_positions]
    payload = {
        "source": {
            "file": str(SOURCE),
            "layoutSheet": "Layout Vista Aerea",
            "stockSheet": "Listado Posiciones",
        },
        "bounds": {
            "minRow": min(rows),
            "maxRow": max(rows),
            "minCol": min(cols),
            "maxCol": max(cols),
        },
        "stacks": [],
    }

    for base in base_positions:
        levels = sorted(levels_by_key.get(base["key"], []), key=lambda item: item["level"])
        rack = levels[0]["rack"] if levels else None
        payload["stacks"].append(
            {
                **base,
                "rack": rack,
                "occupiedLevels": sum(1 for item in levels if item["occupied"]),
                "levels": levels,
            }
        )

    OUTPUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {len(payload['stacks'])} 3D stacks to {OUTPUT}")


if __name__ == "__main__":
    main()
