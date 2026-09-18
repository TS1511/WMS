const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const locations = JSON.parse(fs.readFileSync(path.join(root, "data", "locations.json"), "utf8"));
const layout3d = JSON.parse(fs.readFileSync(path.join(root, "data", "layout3d.json"), "utf8"));
const output = `window.WMS_EMBEDDED_DATA=${JSON.stringify({ locations, layout3d })};\n`;

fs.writeFileSync(path.join(root, "data", "embedded-data.js"), output);
