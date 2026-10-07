#!/usr/bin/env python3
"""
T0.2.5 — Soil Data Processor

Processes the India FAO soil map (634 polygons, 186 FAO soil units) into:
  1. A runtime GeoJSON with an added `soil_type` + `foundation_suitability` per polygon
  2. config/soil-classification.json  (FAO code -> Indian soil class -> foundation guidance)

FAO soil unit codes are two letters: great group + subunit, e.g.
    Af = Ferric Acrisols, Bc = Chromic Cambisols, I = Lithosols

Usage:
    python process_soil.py --input <geojson> --output-dir <dir>
"""
import argparse
import json
import os

import geopandas as gpd

# FAO great-group letter -> (Indian soil class, foundation suitability, note)
FAO_GROUP = {
    "A": ("Red",        "Good",  "Acrisols - well drained red soil, standard foundation"),
    "B": ("Alluvial",   "Good",  "Cambisols - brown/alluvial, standard foundation"),
    "C": ("Black",      "Fair",  "Chernozems - deep foundation recommended"),
    "D": ("Podzolic",   "Fair",  "Podzoluvisols - leached, verify bearing capacity"),
    "E": ("Rocky",      "Best",  "Rendzinas - shallow rocky, shallow foundation possible"),
    "F": ("Laterite",   "Good",  "Ferralsols - lateritic, standard foundation"),
    "G": ("Marshy",     "Poor",  "Gleysols - waterlogged, pile foundation likely"),
    "H": ("Black",      "Fair",  "Phaeozems - deep foundation recommended"),
    "I": ("Rocky",      "Best",  "Lithosols - shallow rock, best case for foundation"),
    "J": ("Alluvial",   "Good",  "Fluvisols - riverine alluvium, standard foundation"),
    "K": ("Black",      "Fair",  "Kastanozems - deep foundation recommended"),
    "L": ("Red",        "Good",  "Luvisols - clay-enriched red/brown, standard foundation"),
    "M": ("Alluvial",   "Fair",  "Greyzems - verify drainage"),
    "N": ("Red",        "Good",  "Nitisols - deep red, standard foundation"),
    "O": ("Marshy",     "Poor",  "Histosols - organic/peat, pile foundation"),
    "P": ("Podzolic",   "Fair",  "Podzols - sandy leached, verify bearing capacity"),
    "Q": ("Sandy",      "Fair",  "Arenosols - sandy, wide footing recommended"),
    "R": ("Sandy",      "Fair",  "Regosols - weakly developed, verify bearing capacity"),
    "S": ("Saline",     "Poor",  "Solonetz - alkaline/sodic, special foundation"),
    "T": ("Volcanic",   "Good",  "Andosols - volcanic, standard foundation"),
    "U": ("Rocky",      "Best",  "Rankers - shallow rocky, shallow foundation possible"),
    "V": ("Black",      "Fair",  "Vertisols - expansive black cotton soil, SPECIAL foundation"),
    "W": ("Alluvial",   "Fair",  "Planosols - poor drainage, verify"),
    "X": ("Sandy",      "Fair",  "Xerosols - arid, wide footing recommended"),
    "Y": ("Sandy",      "Fair",  "Yermosols - arid desert, wide footing recommended"),
    "Z": ("Saline",     "Poor",  "Solonchaks - saline, special foundation"),
}


def classify(fao_code: str):
    if not fao_code or not isinstance(fao_code, str):
        return ("Unknown", "Unknown", "no data")
    first = fao_code.strip()[0].upper()
    return FAO_GROUP.get(first, ("Unknown", "Unknown", f"unmapped FAO code: {fao_code}"))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", required=True)
    ap.add_argument("--output-dir", required=True)
    args = ap.parse_args()

    os.makedirs(args.output_dir, exist_ok=True)
    os.makedirs(os.path.join(args.output_dir, "config"), exist_ok=True)

    g = gpd.read_file(args.input)
    print(f"loaded {len(g)} soil polygons, CRS={g.crs}")

    rows = g.apply(lambda r: classify(r.get("FAOSOIL")), axis=1)
    g["soil_type"] = [r[0] for r in rows]
    g["foundation_suitability"] = [r[1] for r in rows]
    g["foundation_note"] = [r[2] for r in rows]

    # runtime layer
    out_geo = os.path.join(args.output_dir, "soil_india.geojson")
    g.to_file(out_geo, driver="GeoJSON")
    print(f"wrote {out_geo} ({os.path.getsize(out_geo)/1e6:.1f} MB)")

    # classification config
    counts = g["soil_type"].value_counts().to_dict()
    cfg = {
        "fao_group_map": {k: {"soil_type": v[0], "foundation_suitability": v[1], "note": v[2]}
                          for k, v in FAO_GROUP.items()},
        "polygon_counts_by_soil_type": counts,
        "total_polygons": len(g),
        "source": "FAO/UNESCO Digital Soil Map of the World, 1:5M (via india-geodata)",
    }
    out_cfg = os.path.join(args.output_dir, "config", "soil-classification.json")
    with open(out_cfg, "w") as f:
        json.dump(cfg, f, indent=2)
    print(f"wrote {out_cfg}")
    print("soil type distribution:", counts)


if __name__ == "__main__":
    main()
