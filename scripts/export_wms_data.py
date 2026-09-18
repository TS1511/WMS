import json
from collections import Counter, defaultdict
from pathlib import Path

import openpyxl


SOURCE = Path(r"C:\Users\santi\Desktop\wms\Layout WMS.xlsx")
OUTPUT = Path("data/locations.json")


def as_int(value, default=0):
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def main():
    workbook = openpyxl.load_workbook(SOURCE, data_only=True, read_only=True)
    sheet = workbook["Listado Posiciones"]
    rows = list(sheet.iter_rows(values_only=True))
    headers = rows[0]
    locations = []

    for row in rows[1:]:
        if not row or row[0] in (None, "Posicion_Completa"):
            continue
        record = dict(zip(headers, row))
        if not isinstance(record.get("Nivel"), (int, float)):
            continue

        material_raw = record.get("Material")
        quantity = as_int(record.get("Cantidad"))
        material = "" if material_raw in (None, 0, "0") else str(material_raw)
        occupied = bool(material) or quantity > 0

        position = {
            "id": str(record["Posicion_Completa"]),
            "aisle": str(record["Pasillo"]),
            "side": as_int(record["Lado"]),
            "rack": as_int(record["Rack"]),
            "module": as_int(record["Modulo_Posicion"]),
            "level": as_int(record["Nivel"]),
            "material": material,
            "quantity": quantity,
            "occupied": occupied,
        }
        locations.append(position)

    by_side = Counter(item["side"] for item in locations)
    by_level = Counter(item["level"] for item in locations)
    by_aisle = Counter(item["aisle"] for item in locations)
    rack_summary = defaultdict(lambda: {"total": 0, "occupied": 0})
    for item in locations:
        key = f'{item["side"]}-{item["rack"]:02d}'
        rack_summary[key]["side"] = item["side"]
        rack_summary[key]["rack"] = item["rack"]
        rack_summary[key]["total"] += 1
        rack_summary[key]["occupied"] += int(item["occupied"])

    payload = {
        "source": {
            "file": str(SOURCE),
            "sheet": "Listado Posiciones",
            "exportedFrom": "Layout WMS.xlsx",
        },
        "summary": {
            "totalLocations": len(locations),
            "occupiedLocations": sum(1 for item in locations if item["occupied"]),
            "availableLocations": sum(1 for item in locations if not item["occupied"]),
            "totalQuantity": sum(item["quantity"] for item in locations),
            "sides": dict(sorted(by_side.items())),
            "levels": dict(sorted(by_level.items())),
            "aisles": dict(sorted(by_aisle.items())),
            "racksBySide": {
                "1": len({item["rack"] for item in locations if item["side"] == 1}),
                "2": len({item["rack"] for item in locations if item["side"] == 2}),
            },
        },
        "rackSummary": sorted(rack_summary.values(), key=lambda item: (item["side"], item["rack"])),
        "locations": locations,
    }

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {len(locations)} locations to {OUTPUT}")


if __name__ == "__main__":
    main()
