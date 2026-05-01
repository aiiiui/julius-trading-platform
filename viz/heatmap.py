"""
Strategy × Stock return heatmap.
Rows = tickers, Columns = strategy names, Cell values = chosen metric.
Color: red (negative) → white (zero) → green (positive).
"""

import plotly.graph_objects as go
import pandas as pd
import numpy as np


_METRIC_LABELS = {
    "total_return":  "Total Return",
    "sharpe_ratio":  "Sharpe Ratio",
    "max_drawdown":  "Max Drawdown",
    "calmar_ratio":  "Calmar Ratio",
    "win_rate":      "Win Rate",
    "cagr":          "CAGR",
}


def plot_return_heatmap(
    batch_results: dict,
    metric: str = "total_return",
    title: str = None,
) -> go.Figure:
    """
    Args:
        batch_results: {ticker: {strategy_name: result_dict}}
                       The "PAIRS" key is excluded automatically.
        metric:        Key from result["metrics"] dict.
        title:         Chart title (auto-generated if None).

    Returns:
        Plotly Figure with annotated heatmap.
    """
    # Exclude the synthetic PAIRS row — it's shown separately
    per_ticker = {k: v for k, v in batch_results.items() if k != "PAIRS"}

    if not per_ticker:
        fig = go.Figure()
        fig.add_annotation(text="No data", showarrow=False)
        return fig

    # Collect all strategy names across all tickers (preserves order)
    all_strategies = []
    for results in per_ticker.values():
        for name in results:
            if name not in all_strategies:
                all_strategies.append(name)

    tickers = list(per_ticker.keys())

    # Build value matrix
    z_matrix = []
    text_matrix = []

    for ticker in tickers:
        row_z = []
        row_t = []
        for strat in all_strategies:
            result = per_ticker[ticker].get(strat)
            if result is None:
                row_z.append(np.nan)
                row_t.append("—")
            else:
                val = result["metrics"].get(metric, np.nan)
                if pd.isna(val):
                    row_z.append(0.0)
                    row_t.append("—")
                else:
                    row_z.append(float(val))
                    row_t.append(_fmt_metric(val, metric))
        z_matrix.append(row_z)
        text_matrix.append(row_t)

    z_arr = np.array(z_matrix, dtype=float)

    # Symmetric color range around zero
    abs_max = np.nanmax(np.abs(z_arr)) or 1.0

    fig = go.Figure(go.Heatmap(
        z=z_arr,
        x=all_strategies,
        y=tickers,
        text=text_matrix,
        texttemplate="%{text}",
        textfont=dict(size=11),
        colorscale=[[0, "#EF5350"], [0.5, "#FAFAFA"], [1, "#66BB6A"]],
        zmid=0,
        zmin=-abs_max,
        zmax=abs_max,
        showscale=True,
        colorbar=dict(title=_METRIC_LABELS.get(metric, metric)),
        hovertemplate="<b>%{y}</b> — %{x}<br>%{text}<extra></extra>",
    ))

    fig.update_layout(
        title=title or f"{_METRIC_LABELS.get(metric, metric)} — All Strategies × All Stocks",
        xaxis=dict(side="top", tickangle=-30),
        yaxis=dict(autorange="reversed"),
        template="plotly_white",
        height=max(300, 60 + len(tickers) * 40),
        margin=dict(l=80, r=20, t=100, b=20),
    )
    return fig


def _fmt_metric(val: float, metric: str) -> str:
    if metric in ("total_return", "max_drawdown", "win_rate", "cagr"):
        return f"{val:+.1%}"
    return f"{val:.2f}"
