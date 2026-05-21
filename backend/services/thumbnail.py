"""知識マップのサムネイル SVG を生成.

React Flow の見た目を簡略化した静的 SVG として、
nodes / edges から 800x600 のサムネを直接組み立てる.

ヘッドレスブラウザより遥かに軽量(1 マップあたり数十 ms).
保存先はローカル fs / S3 / R2 などを想定し、
このモジュールでは "SVG 文字列の生成" のみ行う.

使用例:
    svg_str = render_map_thumbnail(nodes, edges)
    save_thumbnail(memo_id, svg_str)  # 別途呼び出し側で実装
"""

from __future__ import annotations

import math
from typing import Sequence
from xml.sax.saxutils import escape

# サムネイルのキャンバスサイズ
CANVAS_W = 800
CANVAS_H = 600
PADDING = 40
NODE_R = 30
FONT_SIZE = 14


def render_map_thumbnail(
    nodes: Sequence[dict],
    edges: Sequence[dict],
    title: str | None = None,
) -> str:
    """nodes/edges から SVG 文字列を生成して返す.

    Args:
        nodes: [{"id": "n1", "data": {"label": "..."}, "position": {"x": ..., "y": ...}}, ...]
        edges: [{"id": "e1", "source": "n1", "target": "n2", "label": "..."}, ...]
        title: 任意のサムネイル右上タイトル

    Returns:
        <svg>...</svg> の文字列.
    """
    if not nodes:
        return _empty_svg("(no nodes)")

    # 座標を [PADDING, CANVAS_W - PADDING] にスケーリング
    xs = [n.get("position", {}).get("x", 0) for n in nodes]
    ys = [n.get("position", {}).get("y", 0) for n in nodes]
    min_x, max_x = min(xs), max(xs)
    min_y, max_y = min(ys), max(ys)
    range_x = max(max_x - min_x, 1)
    range_y = max(max_y - min_y, 1)
    aspect = (CANVAS_W - 2 * PADDING) / (CANVAS_H - 2 * PADDING)
    if range_x / range_y > aspect:
        scale = (CANVAS_W - 2 * PADDING) / range_x
    else:
        scale = (CANVAS_H - 2 * PADDING) / range_y

    def transform(x: float, y: float) -> tuple[float, float]:
        tx = PADDING + (x - min_x) * scale
        ty = PADDING + (y - min_y) * scale
        return tx, ty

    node_positions: dict[str, tuple[float, float]] = {}
    for n in nodes:
        pos = n.get("position", {})
        node_positions[n["id"]] = transform(pos.get("x", 0), pos.get("y", 0))

    parts: list[str] = []
    parts.append(
        f'<svg xmlns="http://www.w3.org/2000/svg" '
        f'viewBox="0 0 {CANVAS_W} {CANVAS_H}" '
        f'width="{CANVAS_W}" height="{CANVAS_H}">'
    )
    # 背景
    parts.append(
        f'<rect width="100%" height="100%" fill="#f8fafc"/>'
    )

    # エッジ
    for e in edges:
        src = node_positions.get(e["source"])
        dst = node_positions.get(e["target"])
        if not src or not dst:
            continue
        parts.append(
            f'<line x1="{src[0]:.1f}" y1="{src[1]:.1f}" '
            f'x2="{dst[0]:.1f}" y2="{dst[1]:.1f}" '
            f'stroke="#94a3b8" stroke-width="1.5"/>'
        )

    # ノード(円 + ラベル)
    for n in nodes:
        cx, cy = node_positions[n["id"]]
        label = n.get("data", {}).get("label") or n.get("id", "")
        parts.append(
            f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="{NODE_R}" '
            f'fill="#dbeafe" stroke="#3b82f6" stroke-width="2"/>'
        )
        # 長いラベルは切り詰め
        truncated = _truncate_label(label, max_chars=10)
        parts.append(
            f'<text x="{cx:.1f}" y="{cy + 4:.1f}" '
            f'font-size="{FONT_SIZE}" font-family="Noto Sans JP, sans-serif" '
            f'text-anchor="middle" fill="#1e293b">{escape(truncated)}</text>'
        )

    if title:
        parts.append(
            f'<text x="{CANVAS_W - 12}" y="24" font-size="14" '
            f'font-family="Noto Sans JP, sans-serif" '
            f'text-anchor="end" fill="#64748b">{escape(_truncate_label(title, 30))}</text>'
        )

    parts.append("</svg>")
    return "".join(parts)


def _truncate_label(label: str, max_chars: int = 10) -> str:
    if len(label) <= max_chars:
        return label
    return label[: max_chars - 1] + "…"


def _empty_svg(message: str) -> str:
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" '
        f'viewBox="0 0 {CANVAS_W} {CANVAS_H}" '
        f'width="{CANVAS_W}" height="{CANVAS_H}">'
        f'<rect width="100%" height="100%" fill="#f8fafc"/>'
        f'<text x="50%" y="50%" font-size="20" '
        f'font-family="sans-serif" text-anchor="middle" fill="#94a3b8">'
        f'{escape(message)}</text></svg>'
    )


# ---------------------------------------------------------------------------
# 永続化のサンプル(ローカル fs 版)
# ---------------------------------------------------------------------------
#
# from pathlib import Path
#
# THUMBNAIL_DIR = Path("instance/thumbnails")
#
# def save_thumbnail_local(memo_id: int, svg_str: str) -> str:
#     THUMBNAIL_DIR.mkdir(parents=True, exist_ok=True)
#     path = THUMBNAIL_DIR / f"{memo_id}.svg"
#     path.write_text(svg_str, encoding="utf-8")
#     return f"/static/thumbnails/{memo_id}.svg"
#
# 本番では S3/R2 に boto3 で put_object する. URL を Memo.thumbnail_url に保存.
