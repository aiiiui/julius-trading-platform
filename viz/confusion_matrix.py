"""
2×2 confusion matrix visualization for the LSTM strategy test set.
Rows = Actual direction, Columns = Predicted direction.
"""

import plotly.graph_objects as go
import numpy as np


def plot_confusion_matrix(
    y_true: np.ndarray,
    y_pred: np.ndarray,
    title: str = "LSTM Signal Confusion Matrix (Test Set)",
    labels: list = ["DOWN (0)", "UP (1)"],
) -> go.Figure:
    """
    Args:
        y_true:  Ground truth labels (0 or 1)
        y_pred:  Predicted labels (0 or 1)
        title:   Chart title
        labels:  Class label names for axes
    """
    from sklearn.metrics import confusion_matrix as sk_cm
    cm = sk_cm(y_true, y_pred)

    n_total = cm.sum()
    # Text annotations: count + percentage
    text = [[f"{cm[r][c]}<br>({cm[r][c]/n_total:.1%})" for c in range(2)] for r in range(2)]

    # Color: use values so diagonal (correct) cells are darker blue
    # Off-diagonal cells are lighter
    z_display = [[cm[r][c] for c in range(2)] for r in range(2)]

    fig = go.Figure(go.Heatmap(
        z=z_display,
        x=labels,
        y=labels,
        text=text,
        texttemplate="%{text}",
        textfont=dict(size=13, color="black"),
        colorscale=[[0, "#EDE7F6"], [1, "#4527A0"]],
        showscale=False,
        hovertemplate="Actual: %{y}<br>Predicted: %{x}<br>Count: %{z}<extra></extra>",
    ))

    fig.update_layout(
        title=title,
        xaxis_title="Predicted",
        yaxis_title="Actual",
        yaxis=dict(autorange="reversed"),
        template="plotly_white",
        height=380,
        width=420,
    )
    return fig
