These `by-model-*.json` are REAL sanitized recordings (user_key stripped) captured from the wheel-size.com v2 `/search/by_model/` endpoint during the Task-1 sandbox validation gate:

- `by-model-sedan-5x114_3.json` — Mitsubishi Outlander, bolt_pattern "5x114.3", technical.centre_bore "67.1" (STRING).
- `by-model-truck-8x180.json` — Chevrolet Silverado 2500 HD, bolt_pattern "8x180", technical.centre_bore "124.1" (STRING).
- `by-model-nodata.json` — a real 200 with `data: []` (genuine no-data => not_found).

These confirmed two contract facts now encoded in the code: by_model REQUIRES make+model (modification/year only narrows the trim), and technical.centre_bore is a STRING, read via normalize.ts' loose numeric reader.
