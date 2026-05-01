"""
LSTM prediction confidence distribution chart.
Shows histogram of model output probabilities with BUY/HOLD/SELL zones.
"""

import plotly.graph_objects as go
import numpy as np


def plot_confidence_distribution(
    confidence_scores: np.ndarray,
    buy_threshold: float = 0.6,
    sell_threshold: float = 0.4,
    title: str = "LSTM Prediction Confidence Distribution",
) -> go.Figure:
    """
    Args:
        confidence_scores: Array of sigmoid output probabilities [0, 1]
        buy_threshold:     Probability above which signal = BUY
        sell_threshold:    Probability below which signal = SELL
        title:             Chart title
    """
    n_sell = int((confidence_scores < sell_threshold).sum())
    n_hold = int(((confidence_scores >= sell_threshold) & (confidence_scores <= buy_threshold)).sum())
    n_buy  = int((confidence_scores > buy_threshold).sum())
    n_total = len(confidence_scores)

    fig = go.Figure()

    # Background zone shading
    fig.add_vrect(x0=0,               x1=sell_threshold,  fillcolor="rgba(239,83,80,0.12)",  layer="below", line_width=0)
    fig.add_vrect(x0=sell_threshold,  x1=buy_threshold,   fillcolor="rgba(200,200,200,0.15)", layer="below", line_width=0)
    fig.add_vrect(x0=buy_threshold,   x1=1.0,             fillcolor="rgba(102,187,106,0.12)", layer="below", line_width=0)

    # Histogram
    fig.add_trace(go.Histogram(
        x=confidence_scores,
        nbinsx=50,
        marker_color="#5C6BC0",
        opacity=0.8,
        name="Confidence",
        hovertemplate="Prob: %{x:.2f}<br>Count: %{y}<extra></extra>",
    ))

    # Threshold lines
    fig.add_vline(x=sell_threshold, line_dash="dash", line_color="#EF5350", line_width=2,
                  annotation_text=f"SELL < {sell_threshold}", annotation_position="top left",
                  annotation_font_color="#EF5350")
    fig.add_vline(x=buy_threshold,  line_dash="dash", line_color="#66BB6A", line_width=2,
                  annotation_text=f"BUY > {buy_threshold}", annotation_position="top right",
                  annotation_font_color="#66BB6A")

    # Zone count annotations
    fig.add_annotation(x=sell_threshold / 2,                          y=1, yref="paper",
                       text=f"<b>SELL</b><br>{n_sell} ({n_sell/n_total:.0%})",
                       showarrow=False, font=dict(color="#EF5350", size=11))
    fig.add_annotation(x=(sell_threshold + buy_threshold) / 2,        y=1, yref="paper",
                       text=f"<b>HOLD</b><br>{n_hold} ({n_hold/n_total:.0%})",
                       showarrow=False, font=dict(color="#757575", size=11))
    fig.add_annotation(x=(buy_threshold + 1) / 2,                     y=1, yref="paper",
                       text=f"<b>BUY</b><br>{n_buy} ({n_buy/n_total:.0%})",
                       showarrow=False, font=dict(color="#66BB6A", size=11))

    fig.update_layout(
        title=title,
        xaxis_title="Model Output Probability (→ UP)",
        yaxis_title="Count",
        template="plotly_white",
        height=380,
        showlegend=False,
    )
    return fig
