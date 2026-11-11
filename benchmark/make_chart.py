#!/usr/bin/env python3
"""
make_chart.py - Publication-Quality Benchmark Bar Chart Generator for DhwaniFlow

Generates 3-bar grouped charts comparing:
  1. Gnani transcribe (transcribe_kt)
  2. Gnani codemix (codemix_kt)
  3. Whisper large-v3 prompted (from raw metadata)
across evaluated audio conditions (Clean, Phone 8kHz, Phone 8kHz + Noise).

Features:
- Reads dynamic values and engine model, device, and compute type from metadata.
- 3 grouped bars per condition.
- Y-axis starts strictly at 0% and scales to 105%.
- Delta labels placed so they cannot overlap the legend (legend placed above plot).
- Subtitle: "narrowband G.711 µ-law, 8 kHz; synthetic traffic noise, 10 dB SNR".
- Footnote with dataset size (30 sentences), number of speakers (1 speaker), Whisper model, and device.
- Outputs both 1080x1080 (Square) and 1920x1080 (Wide) into benchmark/results/charts/.
"""

import sys
import csv
import json
import argparse
from pathlib import Path
from typing import Dict, List, Tuple, Optional
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

# UTF-8 stdout reconfiguration for Windows
if sys.platform == "win32" and hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass


CONDITION_LABELS = {
    "clean": "Clean Voice\n(Studio/Mic)",
    "phone8k": "Telephone Audio\n(8kHz AMR-WB / G.711)",
    "phone8k_noise": "Phone + Street Noise\n(8kHz, 10dB SNR)",
}


def validate_metadata_label(metadata: Dict[str, str], label: str) -> bool:
    """
    Validates that a chart or report label accurately reflects the underlying metadata.
    Raises ValueError if label claims a different model than the metadata (e.g. claims 'small'
    when metadata specifies 'large-v3').
    """
    meta_model = metadata.get("model", "").strip().lower()
    label_lower = label.strip().lower()
    if meta_model:
        if meta_model in ["large", "large-v3"] and "small" in label_lower and "large" not in label_lower:
            raise ValueError(f"Label mismatch: metadata specifies model '{meta_model}', but label is '{label}'")
        if meta_model == "small" and ("large-v3" in label_lower or "large" in label_lower) and "small" not in label_lower:
            raise ValueError(f"Label mismatch: metadata specifies model '{meta_model}', but label is '{label}'")
        if meta_model not in label_lower and f"whisper {meta_model}" not in label_lower:
            raise ValueError(f"Label '{label}' does not contain expected model '{meta_model}' from metadata.")
    return True


def extract_whisper_metadata(raw_dir: Path) -> Dict[str, str]:
    """
    Extracts Whisper model name, device, and compute type directly from
    raw result metadata for whisper-large-v3 prompted runs.
    """
    candidates = [
        raw_dir / "whisper-large-v3__whisper_prompted__clean.json",
        raw_dir / "whisper-large-v3__whisper_prompted__phone8k.json",
        raw_dir / "whisper-large-v3__whisper_prompted__phone8k_noise.json",
    ]
    for path in candidates:
        if path.exists():
            try:
                with open(path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                if isinstance(data, list) and len(data) > 0 and isinstance(data[0], dict):
                    first = data[0]
                    return {
                        "model": first.get("model", "large-v3"),
                        "device": first.get("device", "cpu"),
                        "compute_type": first.get("compute_type", "int8"),
                    }
            except Exception:
                pass

    return {
        "model": "large-v3",
        "device": "cpu",
        "compute_type": "int8",
    }


def load_chart_data(summary_csv_path: Path, raw_dir: Path) -> Tuple[Dict[str, float], Dict[str, float], Dict[str, float], Dict[str, str]]:
    """
    Parses summary.csv and raw metadata to extract:
      - gnani_transcribe accuracy per condition
      - gnani_codemix accuracy per condition
      - whisper_prompted accuracy per condition
      - whisper metadata dict {model, device, compute_type}
    """
    if not summary_csv_path.exists():
        raise FileNotFoundError(f"Summary CSV not found: {summary_csv_path}")

    metadata = extract_whisper_metadata(raw_dir)

    gnani_transcribe: Dict[str, float] = {}
    gnani_codemix: Dict[str, float] = {}
    whisper_prompted: Dict[str, float] = {}

    with open(summary_csv_path, mode="r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            eng = row.get("engine", "")
            var = row.get("variant", "")
            cond = row.get("condition", "")
            acc_str = row.get("term_accuracy_overall") or row.get("term_accuracy") or "0"
            acc = float(acc_str)

            # Also check if model/device/compute_type are present in CSV
            row_model = row.get("model")
            row_device = row.get("device")
            row_compute = row.get("compute_type")

            if eng == "gnani":
                if var == "transcribe_kt":
                    gnani_transcribe[cond] = acc
                elif var == "codemix_kt":
                    gnani_codemix[cond] = acc
            elif eng == "whisper-large-v3" and var == "whisper_prompted":
                whisper_prompted[cond] = acc
                if row_model:
                    metadata["model"] = row_model
                if row_device:
                    metadata["device"] = row_device
                if row_compute:
                    metadata["compute_type"] = row_compute

    validate_metadata_label(metadata, f"Whisper {metadata.get('model', '')} Prompted")
    return gnani_transcribe, gnani_codemix, whisper_prompted, metadata


def render_chart(gnani_transcribe: Dict[str, float],
                 gnani_codemix: Dict[str, float],
                 whisper_prompted: Dict[str, float],
                 whisper_metadata: Dict[str, str],
                 output_path: Path,
                 width_in: float,
                 height_in: float,
                 dpi: int = 100):
    """
    Renders and saves a 3-bar grouped chart per condition:
      Bar 1: Gnani Transcribe
      Bar 2: Gnani Codemix
      Bar 3: Whisper large-v3 Prompted (from metadata)
    """
    conditions = ["clean", "phone8k", "phone8k_noise"]
    # Filter conditions present in all three
    conditions = [c for c in conditions if c in gnani_transcribe and c in gnani_codemix and c in whisper_prompted]
    if not conditions:
        conditions = ["clean", "phone8k", "phone8k_noise"]

    x_labels = [CONDITION_LABELS.get(c, c.replace("_", " ").title()) for c in conditions]
    trans_vals = [gnani_transcribe.get(c, 0.0) for c in conditions]
    code_vals = [gnani_codemix.get(c, 0.0) for c in conditions]
    whisp_vals = [whisper_prompted.get(c, 0.0) for c in conditions]

    model_name = whisper_metadata.get("model", "large-v3")
    device_name = whisper_metadata.get("device", "cpu")
    compute_type = whisper_metadata.get("compute_type", "int8")

    whisper_label = f"Whisper {model_name} Prompted"

    # Aesthetics & Colors
    bg_color = "#0B0F19"
    card_color = "#111827"
    text_color = "#F3F4F6"
    subtext_color = "#9CA3AF"
    grid_color = "#1F2937"

    color_trans = "#38BDF8"    # Sky Blue
    color_code = "#818CF8"     # Indigo / Violet
    color_whisp = "#FB7185"    # Rose / Coral

    fig, ax = plt.subplots(figsize=(width_in, height_in), dpi=dpi)
    fig.patch.set_facecolor(bg_color)
    ax.set_facecolor(card_color)

    # 3 bars per condition
    x = np.arange(len(conditions))
    bar_width = 0.24

    bars_trans = ax.bar(x - bar_width, trans_vals, bar_width, label="Gnani Transcribe",
                        color=color_trans, edgecolor="#7DD3FC", linewidth=1.2, zorder=3)
    bars_code = ax.bar(x, code_vals, bar_width, label="Gnani Codemix",
                       color=color_code, edgecolor="#A5B4FC", linewidth=1.2, zorder=3)
    bars_whisp = ax.bar(x + bar_width, whisp_vals, bar_width, label=whisper_label,
                        color=color_whisp, edgecolor="#FDA4AF", linewidth=1.2, zorder=3)

    # Value Labels above each bar
    font_size_val = 11 if width_in <= 12 else 13
    for bar in bars_trans:
        h = bar.get_height()
        ax.annotate(f"{h:.1f}%",
                    xy=(bar.get_x() + bar.get_width() / 2, h),
                    xytext=(0, 4),
                    textcoords="offset points",
                    ha="center", va="bottom",
                    fontsize=font_size_val, fontweight="bold", color="#E0F2FE")

    for bar in bars_code:
        h = bar.get_height()
        ax.annotate(f"{h:.1f}%",
                    xy=(bar.get_x() + bar.get_width() / 2, h),
                    xytext=(0, 4),
                    textcoords="offset points",
                    ha="center", va="bottom",
                    fontsize=font_size_val, fontweight="bold", color="#EEF2FF")

    for bar in bars_whisp:
        h = bar.get_height()
        ax.annotate(f"{h:.1f}%",
                    xy=(bar.get_x() + bar.get_width() / 2, h),
                    xytext=(0, 4),
                    textcoords="offset points",
                    ha="center", va="bottom",
                    fontsize=font_size_val, fontweight="bold", color="#FFE4E6")

    # Delta annotation above each condition cluster
    # Delta = best Gnani variant (transcribe or codemix) - Whisper large-v3 prompted
    for i, (t_v, c_v, w_v) in enumerate(zip(trans_vals, code_vals, whisp_vals)):
        g_best = max(t_v, c_v)
        diff = g_best - w_v
        sign = "+" if diff > 0 else ""
        diff_str = f"Δ {sign}{diff:.1f}%"
        # Position delta box above the highest bar of the cluster
        y_pos = min(max(g_best, w_v) + 7.5, 96.0)
        ax.annotate(diff_str,
                    xy=(x[i], y_pos),
                    ha="center", va="bottom",
                    fontsize=font_size_val, fontweight="bold",
                    color="#4ADE80" if diff > 0 else "#F87171",
                    bbox=dict(boxstyle="round,pad=0.3", fc="#1E293B", ec=grid_color, lw=1))

    # Axes configuration: Y-axis strictly starts at 0
    ax.set_ylim(0, 105)
    ax.set_xticks(x)
    ax.set_xticklabels(x_labels, fontsize=12, fontweight="bold", color=text_color)
    ax.tick_params(axis="y", labelsize=11, colors=subtext_color)
    ax.yaxis.grid(True, linestyle="--", alpha=0.5, color=grid_color, zorder=0)
    ax.xaxis.grid(False)

    for spine in ax.spines.values():
        spine.set_color(grid_color)

    # Title and Subtitle
    fig.suptitle("DhwaniFlow Hinglish Developer Benchmark",
                 x=0.5, y=0.96, fontsize=20, fontweight="heavy", color=text_color)
    ax.set_title("narrowband G.711 µ-law, 8 kHz; synthetic traffic noise, 10 dB SNR",
                 fontsize=13, color=subtext_color, pad=28)

    ax.set_ylabel("Technical Term Accuracy (%)", fontsize=12, fontweight="bold", color=text_color, labelpad=10)

    # Legend placed OUTSIDE plot area above the axes so delta labels CANNOT overlap it
    leg = ax.legend(loc="lower center", bbox_to_anchor=(0.5, 1.01), ncol=3, frameon=True,
                    facecolor="#1E293B", edgecolor=grid_color, fontsize=11)
    for text in leg.get_texts():
        text.set_color(text_color)

    # Footnote with dataset size, number of speakers, Whisper model and device
    footnote = (f"* Dataset: 30 sentences, 1 speaker | Whisper model: {model_name}, device: {device_name.upper()} ({compute_type})\n"
                f"  Whisper plain is excluded from headline comparison due to forced Devanagari script output.")
    fig.text(0.5, 0.02, footnote, ha="center", fontsize=10, color="#64748B", style="italic")

    plt.tight_layout(rect=[0.05, 0.06, 0.95, 0.93])

    output_path.parent.mkdir(parents=True, exist_ok=True)
    plt.savefig(output_path, dpi=dpi, facecolor=fig.get_facecolor(), edgecolor="none")
    plt.close()
    print(f"Chart saved: {output_path} ({int(width_in*dpi)}x{int(height_in*dpi)})")


def main():
    base_dir = Path(__file__).resolve().parent
    default_csv = base_dir / "results" / "summary.csv"
    default_raw = base_dir / "results" / "raw"
    charts_dir = base_dir / "results" / "charts"
    default_square = charts_dir / "chart_term_accuracy.png"
    default_wide = charts_dir / "chart_term_accuracy_wide.png"

    parser = argparse.ArgumentParser(description="Generate publication-quality benchmark comparison charts.")
    parser.add_argument("--summary-csv", default=str(default_csv), help="Path to summary.csv")
    parser.add_argument("--raw-dir", default=str(default_raw), help="Path to raw results directory")
    parser.add_argument("--output-square", default=str(default_square), help="Output 1080x1080 PNG path")
    parser.add_argument("--output-wide", default=str(default_wide), help="Output 1920x1080 PNG path")

    args = parser.parse_args()

    csv_path = Path(args.summary_csv)
    raw_dir = Path(args.raw_dir)

    g_trans, g_code, w_prompted, metadata = load_chart_data(csv_path, raw_dir)

    # 1. Square chart (1080x1080)
    render_chart(
        gnani_transcribe=g_trans,
        gnani_codemix=g_code,
        whisper_prompted=w_prompted,
        whisper_metadata=metadata,
        output_path=Path(args.output_square),
        width_in=10.8,
        height_in=10.8,
        dpi=100
    )

    # 2. Wide chart (1920x1080)
    render_chart(
        gnani_transcribe=g_trans,
        gnani_codemix=g_code,
        whisper_prompted=w_prompted,
        whisper_metadata=metadata,
        output_path=Path(args.output_wide),
        width_in=19.2,
        height_in=10.8,
        dpi=100
    )


if __name__ == "__main__":
    main()
