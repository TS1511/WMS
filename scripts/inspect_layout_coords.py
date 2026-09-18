import re

import openpyxl


SOURCE = r"C:\Users\santi\Desktop\wms\Layout WMS.xlsx"
POSITION_RE = re.compile(r"^[A-Z]{1,2}[12]\.\d{2}\.\d$")


workbook = openpyxl.load_workbook(SOURCE, data_only=True, read_only=True)

for sheet_name in ["Layout Vista Aerea", "Layout Posiciones"]:
    sheet = workbook[sheet_name]
    coords = []
    for row in sheet.iter_rows():
        for cell in row:
            if isinstance(cell.value, str) and POSITION_RE.match(cell.value.strip()):
                coords.append((cell.value.strip(), cell.row, cell.column))

    rows = [item[1] for item in coords]
    cols = [item[2] for item in coords]
    print(sheet_name)
    print("positions", len(coords))
    print("row range", min(rows), max(rows))
    print("col range", min(cols), max(cols))
    print("first", coords[:12])
    print("last", coords[-12:])
