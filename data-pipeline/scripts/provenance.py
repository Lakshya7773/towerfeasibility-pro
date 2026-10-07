#!/usr/bin/env python3
"""
Single authoritative source of truth for dataset provenance and vintage.

Why this module exists
----------------------
The pack manifest previously hard-coded dataset dates inline in build_pack.py.
That let the manifest claim `towers = 2024-06-01` while the project's own
DATA_SOURCES.md records the Tarang Sanchar registry as **2022** vintage.

A dataset's *publication vintage* is a property of the upstream product, not of
when we happened to build a pack. Conflating the two misrepresents how old the
data is, which is exactly the kind of error a professional user cannot detect.

Rules enforced here:
  * Every shipped dataset has exactly one vintage, defined once, in this file.
  * `vintage` is the UPSTREAM publication/observation date, never a build date.
  * Where the true vintage is not established, it is recorded as "NOT ESTABLISHED"
    rather than guessed.
  * `status` distinguishes measured / registry / modelled / survey data.

Changing a date here changes it everywhere (manifest, report, UI).
"""

# Status vocabulary (mirrors the four knowledge types in the mission rules):
#   MEASURED     - direct observation / instrument
#   REGISTRY     - an authoritative administrative register
#   MODELLED     - a model output, not an observation
#   SURVEY_MAP   - a published survey/map product at a stated scale
#   DERIVED      - computed by us from the above
#   NOT_ESTABLISHED - no authoritative vintage could be confirmed

PROVENANCE = {
    "towers": {
        "source": "Tarang Sanchar (DoT EMF portal)",
        "provider": "Department of Telecommunications, via ramSeraph/indian_communications",
        "type": "REGISTRY",
        # DATA_SOURCES.md: "Data from 2022; may be incomplete."
        # The community extraction carries no per-row date, so 2022 is the
        # documented vintage of the underlying registry snapshot.
        "vintage": "2022",
        "vintage_precision": "year",
        "resolution": "point",
        "coverage": "Rajasthan (filtered from all-India)",
        "status": "screening dataset",
        "limitation": "Undercounts post-2022 builds including 5G rollout; "
                      "completeness of the registry is not independently verified.",
    },
    "fiber": {
        "source": "BharatNet / BBNL OFC",
        "provider": "Bharat Broadband Network Ltd, via ramSeraph/indian_communications",
        "type": "REGISTRY",
        "vintage": "2024",
        "vintage_precision": "year",
        "resolution": "line (route geometry)",
        "coverage": "Rajasthan (filtered from national)",
        "status": "public networks only",
        "limitation": "Covers BharatNet/public OFC only. Urban private fiber "
                      "(Jio/Airtel/Vi) is not represented and no open dataset exists.",
    },
    "soil": {
        "source": "FAO/UNESCO Digital Soil Map of the World (DSMW)",
        "provider": "FAO, via india-geodata",
        "type": "SURVEY_MAP",
        "vintage": "2007",
        "vintage_precision": "year",
        "resolution": "1:5,000,000",
        "coverage": "Rajasthan",
        "status": "screening only",
        "limitation": "1:5M screening map, not a geotechnical survey. "
                      "A borehole / plate-load test is required before foundation design.",
    },
    "population": {
        "source": "WorldPop 2020 1 km unadjusted (Aggregated)",
        "provider": "WorldPop (CC-BY-4.0)",
        "type": "MODELLED",
        "vintage": "2020",
        "vintage_precision": "year",
        "resolution": "1 km grid (cell area 0.769 km2)",
        "coverage": "Rajasthan (masked to state)",
        "status": "modelled estimate",
        "limitation": "Modelled disaggregation, not a census. "
                      "Rajasthan total ~80.2M vs Census 2011 68.5M.",
    },
    "elevation": {
        "source": "SRTM elevation",
        "provider": "NASA/USGS (SRTM mission)",
        "type": "MEASURED",
        "vintage": "2000",
        "vintage_precision": "year",
        "resolution": "~30 m (z11 tiles)",
        "coverage": "Rajasthan",
        "status": "measured terrain",
        "limitation": "SRTM mission vintage (2000). No k-factor radio refraction applied.",
    },
    "basemap": {
        "source": "OpenStreetMap-derived vector tiles",
        "provider": "OpenStreetMap contributors (ODbL)",
        "type": "REGISTRY",
        "vintage": "2026",
        "vintage_precision": "year",
        "resolution": "z0-z12 vector tiles",
        "coverage": "Rajasthan",
        "status": "display layer only",
        "limitation": "Used for map display; not an analytical input.",
    },
}

# Datasets that are deliberately NOT shipped in a pack.
NOT_SHIPPED = {
    "roads": {
        "source": None,
        "type": "NOT_ESTABLISHED",
        "status": "not bundled",
        "limitation": "No road layer is packaged; road accessibility is not assessed.",
    },
    "power": {
        "source": None,
        "type": "NOT_ESTABLISHED",
        "status": "not bundled",
        "limitation": "No power layer is packaged; grid/DG availability is not assessed.",
    },
}


def vintage_map():
    """{dataset: vintage-string} — the manifest's `source_dates` block."""
    return {k: v["vintage"] for k, v in PROVENANCE.items()}


def provenance_block(shipped_keys=None):
    """Full provenance records for the datasets actually shipped."""
    keys = shipped_keys if shipped_keys is not None else PROVENANCE.keys()
    return {k: dict(PROVENANCE[k]) for k in keys if k in PROVENANCE}


if __name__ == "__main__":
    import json
    print(json.dumps({"vintages": vintage_map(), "provenance": provenance_block()},
                     indent=2))
