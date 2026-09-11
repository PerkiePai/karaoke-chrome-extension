#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Generate report.md from the 44 researched JSON files in results/, using
fields.yaml as the field-structure/label source.
"""

import json
import re
from pathlib import Path

import yaml

BASE_DIR = Path(__file__).parent
FIELDS_PATH = BASE_DIR / "fields.yaml"
RESULTS_DIR = BASE_DIR / "results"
OUTPUT_PATH = BASE_DIR / "report.md"

TOPIC = (
    "Classifying YouTube videos as music vs. non-music, and — if music — "
    "identifying the song title and artist (for the karaoke-chrome-extension project)"
)

_SKIP_KEYS = {"_source_file", "uncertain"}

# Bidirectional-ish category name mapping: fields.yaml category key -> possible
# aliases that might appear as a JSON top-level wrapper key (nested-structure
# support), plus a human-readable display label.
CATEGORY_MAPPING = {
    "basic_info": {
        "aliases": ["basic_info", "Basic Info"],
        "label": "Basic Info",
    },
    "technical_approach": {
        "aliases": ["technical_approach", "technical_features", "Technical Approach"],
        "label": "Technical Approach",
    },
    "accuracy_reliability": {
        "aliases": ["accuracy_reliability", "performance_metrics", "Accuracy & Reliability"],
        "label": "Accuracy & Reliability",
    },
    "integration_feasibility": {
        "aliases": ["integration_feasibility", "Integration Feasibility"],
        "label": "Integration Feasibility",
    },
    "latency": {
        "aliases": ["latency", "Latency"],
        "label": "Latency",
    },
    "output": {
        "aliases": ["output", "Output"],
        "label": "Output",
    },
    "licensing_legal": {
        "aliases": ["licensing_legal", "business_info", "Licensing & Legal"],
        "label": "Licensing & Legal",
    },
    "pipeline_role": {
        "aliases": ["pipeline_role", "market_positioning", "Pipeline Role"],
        "label": "Pipeline Role",
    },
}

# Item (JSON filename stem) -> research-item group, matching outline.yaml's
# section structure. Used for TOC grouping only.
ITEM_GROUPS = {
    "yt_data_api_v3": "YouTube-native signals",
    "yt_initial_data_scrape": "YouTube-native signals",
    "innertube_direct_endpoints": "YouTube-native signals",
    "topic_channel_signal": "YouTube-native signals",
    "art_track_description_block": "YouTube-native signals",
    "music_panel_documented_behavior": "YouTube-native signals",
    "yt_dlp_extractor_reference": "YouTube-native signals",
    "yt_timedtext_captions": "YouTube-native signals",
    "title_normalizer_heuristics": "YouTube-native signals",
    "yt_music_scraping": "YouTube-native signals",
    "acrcloud": "Audio fingerprinting (identification)",
    "audd": "Audio fingerprinting (identification)",
    "shazam_shazamkit": "Audio fingerprinting (identification)",
    "songrec": "Audio fingerprinting (identification)",
    "acoustid_chromaprint": "Audio fingerprinting (identification)",
    "soundhound_houndify": "Audio fingerprinting (identification)",
    "olaf": "Audio fingerprinting (identification)",
    "panako": "Audio fingerprinting (identification)",
    "research_grade_fingerprinters": "Audio fingerprinting (identification)",
    "gracenote": "Audio fingerprinting (identification)",
    "yamnet_mediapipe": "Audio/ML classification",
    "vggish": "Audio/ML classification",
    "panns": "Audio/ML classification",
    "essentia_js": "Audio/ML classification",
    "clap": "Audio/ML classification",
    "mert": "Audio/ML classification",
    "muq_mulan": "Audio/ML classification",
    "singing_voice_detection": "Audio/ML classification",
    "source_separation": "Audio/ML classification",
    "lrclib": "Metadata resolution & lyrics",
    "odesli_songlink": "Metadata resolution & lyrics",
    "itunes_search_api": "Metadata resolution & lyrics",
    "deezer_api": "Metadata resolution & lyrics",
    "spotify_web_api": "Metadata resolution & lyrics",
    "musicbrainz_listenbrainz": "Metadata resolution & lyrics",
    "discogs_api": "Metadata resolution & lyrics",
    "musicfetch": "Metadata resolution & lyrics",
    "syncedlyrics_blueprint": "Metadata resolution & lyrics",
    "musixmatch_richsync": "Metadata resolution & lyrics",
    "netease_qq_lyrics": "Metadata resolution & lyrics",
    "betterlyrics_prior_art": "Metadata resolution & lyrics",
    "whisper_web": "Metadata resolution & lyrics",
    "tabcapture_offscreen": "Extension architecture constraints",
    "cors_host_permissions": "Extension architecture constraints",
}

GROUP_ORDER = [
    "YouTube-native signals",
    "Audio fingerprinting (identification)",
    "Audio/ML classification",
    "Metadata resolution & lyrics",
    "Extension architecture constraints",
]


def load_fields():
    with FIELDS_PATH.open(encoding="utf-8") as f:
        data = yaml.safe_load(f) or {}
    fn = data.get("fields", {})
    # ordered list of (category_key, [ {name, description, detail_level}, ... ])
    categories = []
    for cat_key, flist in fn.items():
        if cat_key in _SKIP_KEYS:
            continue
        categories.append((cat_key, flist))
    return categories


def humanize(field_name):
    return field_name.replace("_", " ").strip().capitalize()


def slugify(text):
    slug = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return slug


def find_field_value(data, field_name, category_key):
    """Look up a field's value: top-level first, then inside a nested wrapper
    matching this category's known aliases, then any nested dict."""
    if field_name in data and not isinstance(data[field_name], dict):
        return data[field_name]
    aliases = CATEGORY_MAPPING.get(category_key, {}).get("aliases", [category_key])
    for alias in aliases:
        wrapper = data.get(alias)
        if isinstance(wrapper, dict) and field_name in wrapper:
            return wrapper[field_name]
    # fallback: search any nested dict
    for v in data.values():
        if isinstance(v, dict) and field_name in v:
            return v[field_name]
    return None


def is_skippable(field_name, value, uncertain_list):
    if value is None:
        return True
    if isinstance(value, str) and value.strip() == "":
        return True
    if isinstance(value, str) and "[uncertain]" in value:
        return True
    if field_name in uncertain_list:
        return True
    return False


def format_value(value):
    if isinstance(value, list):
        if all(isinstance(v, dict) for v in value) and value:
            lines = []
            for item in value:
                parts = [f"{k}: {v}" for k, v in item.items()]
                lines.append("- " + " | ".join(parts))
            return "\n".join(lines)
        joined = ", ".join(str(v) for v in value)
        if len(joined) <= 100:
            return joined
        return "\n".join(f"- {v}" for v in value)
    if isinstance(value, dict):
        return "; ".join(f"**{k}**: {v}" for k, v in value.items())
    text = str(value)
    return text


def collect_extra_fields(data, known_field_names):
    known_wrapper_keys = {
        alias for cfg in CATEGORY_MAPPING.values() for alias in cfg["aliases"]
    }
    extra = {}
    for k, v in data.items():
        if k in _SKIP_KEYS:
            continue
        if k in known_wrapper_keys:
            if isinstance(v, dict):
                for nk, nv in v.items():
                    if nk not in known_field_names:
                        extra[nk] = nv
            continue
        if k not in known_field_names:
            extra[k] = v
    return extra


def main():
    categories = load_fields()
    known_field_names = {f["name"] for _, flist in categories for f in flist}

    json_files = sorted(RESULTS_DIR.glob("*.json"))
    items = []
    for jf in json_files:
        stem = jf.stem
        with jf.open(encoding="utf-8") as f:
            data = json.load(f)
        name = data.get("name") or find_field_value(data, "name", "basic_info") or stem
        group = ITEM_GROUPS.get(stem, "Other")
        uncertain_list = data.get("uncertain") or []
        items.append(
            {
                "stem": stem,
                "name": name,
                "group": group,
                "data": data,
                "uncertain": uncertain_list,
                "anchor": slugify(name),
            }
        )

    items_by_group = {g: [] for g in GROUP_ORDER}
    for it in items:
        items_by_group.setdefault(it["group"], []).append(it)

    lines = []
    lines.append(f"# Research Report: YouTube Music Classification & Identification")
    lines.append("")
    lines.append(f"**Topic**: {TOPIC}")
    lines.append("")
    lines.append(f"**Items researched**: {len(items)}")
    lines.append("")
    lines.append("## Table of Contents")
    lines.append("")

    counter = 1
    anchor_used = {}
    for group in GROUP_ORDER:
        group_items = items_by_group.get(group, [])
        if not group_items:
            continue
        lines.append(f"### {group}")
        lines.append("")
        for it in group_items:
            anchor = it["anchor"]
            n = anchor_used.get(anchor, 0)
            anchor_used[anchor] = n + 1
            if n > 0:
                anchor = f"{anchor}-{n}"
                it["anchor"] = anchor
            lines.append(f"{counter}. [{it['name']}](#{anchor})")
            counter += 1
        lines.append("")

    lines.append("---")
    lines.append("")
    lines.append("## Detailed Findings")
    lines.append("")

    for group in GROUP_ORDER:
        group_items = items_by_group.get(group, [])
        if not group_items:
            continue
        lines.append(f"## {group}")
        lines.append("")
        for it in group_items:
            data = it["data"]
            uncertain_list = it["uncertain"]
            lines.append(f"### {it['name']}")
            lines.append("")

            for cat_key, flist in categories:
                cat_label = CATEGORY_MAPPING.get(cat_key, {}).get("label", humanize(cat_key))
                rendered_fields = []
                for field in flist:
                    fname = field["name"]
                    value = find_field_value(data, fname, cat_key)
                    if is_skippable(fname, value, uncertain_list):
                        continue
                    rendered_fields.append((fname, value))
                if not rendered_fields:
                    continue
                lines.append(f"**{cat_label}**")
                lines.append("")
                for fname, value in rendered_fields:
                    formatted = format_value(value)
                    label = humanize(fname)
                    if len(formatted) > 100 or "\n" in formatted:
                        lines.append(f"- *{label}*:")
                        lines.append("")
                        if "\n" in formatted:
                            lines.append(formatted)
                        else:
                            lines.append(f"  {formatted}")
                        lines.append("")
                    else:
                        lines.append(f"- *{label}*: {formatted}")
                lines.append("")

            extra = collect_extra_fields(data, known_field_names)
            if extra:
                lines.append("**Other Info**")
                lines.append("")
                for k, v in extra.items():
                    lines.append(f"- *{humanize(k)}*: {format_value(v)}")
                lines.append("")

            if uncertain_list:
                lines.append("**Uncertain fields** (excluded above, listed for reference)")
                lines.append("")
                for u in uncertain_list:
                    lines.append(f"- {u}")
                lines.append("")

            lines.append("---")
            lines.append("")

    OUTPUT_PATH.write_text("\n".join(lines), encoding="utf-8")
    print(f"Wrote {OUTPUT_PATH} ({len(items)} items)")


if __name__ == "__main__":
    main()
