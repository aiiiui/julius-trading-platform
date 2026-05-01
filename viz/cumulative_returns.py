"""
Cumulative return chart: all strategies overlaid on one plot.
Optionally shades calm vs volatile regime periods in the background.
"""

import plotly.graph_objects as go
import pandas as pd


STRATEGY_COLORS = {
    # Original strategies
    "Buy & Hold":                    "#2196F3",  # blue
    "MA Crossover (50/200)":         "#FF9800",  # orange
    "Random (Monte Carlo)":          "#9E9E9E",  # grey
    "Random Monte Carlo":            "#9E9E9E",  # grey (registry name)
    "AI/ML (Logistic Regression)":   "#4CAF50",  # green
    "Your Custom Bot":               "#E91E63",  # pink
    # New strategies
    "EMA Crossover + Volume":        "#9C27B0",  # purple
    "RSI + Bollinger Bands":         "#F44336",  # red
    "MACD + ADX":                    "#009688",  # teal
    "Pairs Trading":                 "#FF5722",  # deep orange
    "LSTM Multi-Signal":             "#3F51B5",  # indigo
}
DEFAULT_COLOR = "#607D8B"

REGIME_COLORS = {
    "calm":     "rgba(200, 230, 201, 0.25)",   # light green
    "volatile": "rgba(255, 205, 210, 0.25)",   # light red
}


def plot_cumulative_returns(
    all_results: dict,
    regime_labels: pd.Series = None,
    title: str = "Strategy Comparison — S&P 500 2025",
    initial_cash: float = 10_000.0,
) -> go.Figure:
    """
    Args:
        all_results:   {strategy_name: backtest_result_dict}
        regime_labels: pd.Series indexed by date with 'calm'/'volatile' values
        title:         chart title
    """
    fig = go.Figure()

    # Add regime shading first (so it sits behind the lines)
    if regime_labels is not None:
        _add_regime_shading(fig, regime_labels)

    # Add one line per strategy
    for name, result in all_results.items():
        vs = result["value_series"]
        normalised = (vs / initial_cash - 1) * 100  # convert to % return

        color = STRATEGY_COLORS.get(name, DEFAULT_COLOR)
        fig.add_trace(go.Scatter(
            x=normalised.index,
            y=normalised.values,
            name=name,
            mode="lines",
            line=dict(color=color, width=2),
            hovertemplate="%{x|%Y-%m-%d}<br>Return: %{y:.1f}%<extra>" + name + "</extra>",
        ))

    fig.add_hline(y=0, line_dash="dot", line_color="black", opacity=0.4)

    fig.update_layout(
        title=dict(text=title, font=dict(size=18)),
        xaxis_title="Date",
        yaxis_title="Cumulative Return (%)",
        legend=dict(orientation="h", yanchor="bottom", y=1.02, xanchor="right", x=1),
        template="plotly_white",
        height=500,
        hovermode="x unified",
    )
    return fig


def _add_regime_shading(fig: go.Figure, regime_labels: pd.Series):
    """Add background shading for calm/volatile periods."""
    if regime_labels is None or regime_labels.empty:
        return

    current_regime = None
    start_date = None

    for date, regime in regime_labels.items():
        if regime != current_regime:
            if current_regime is not None:
                _add_vrect(fig, start_date, date, current_regime)
            current_regime = regime
            start_date = date

    if current_regime is not None:
        _add_vrect(fig, start_date, regime_labels.index[-1], current_regime)


def _add_vrect(fig, x0, x1, regime):
    fig.add_vrect(
        x0=x0, x1=x1,
        fillcolor=REGIME_COLORS.get(regime, "rgba(200,200,200,0.2)"),
        layer="below",
        line_width=0,
        annotation_text=regime if (x1 - x0).days > 20 else "",
        annotation_position="top left",
        annotation_font_size=9,
        annotation_font_color="grey",
    )
