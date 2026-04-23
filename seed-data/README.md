# Codex-ready data package

Recommended for Codex cloud tasks:
1. Commit this folder into your GitHub repo, for example at `seed-data/`.
2. Push to GitHub.
3. In Codex, reference the files by path. Example:
   - `seed-data/manifest.json`
   - `seed-data/Vehiculo/Vehiculo.json`
   - `seed-data/Movimiento/Movimiento.part_01.json`

Notes:
- Each table is available in JSON array format (`*.json`)
- Each table is also available in NDJSON (`*.ndjson`)
- Large tables are split into chunks of 50 rows (`*.part_XX.json`)
