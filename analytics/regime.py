"""
Regime-split performance analysis.
Splits backtest results into calm vs volatile periods and recomputes metrics for each.
"""

import pandas as pd
from backtest.metrics import compute_all
from backtest.portfolio import Portfolio


def split_by_regime(
    value_series: pd.Series,
    trades_df: pd.DataFrame,
    regime_labels: pd.Series,
    strategy_name: str = "",
) -> dict:
    """
    Split a strategy's value series by VIX regime and compute metrics for each.

    Returns:
        {
          'overall': {...metrics...},
          'calm':    {...metrics...},
          'volatile':{...metrics...},
        }
    """
    regime_aligned = regime_labels.reindex(value_series.index).ffill()

    results = {"overall": compute_all(value_series, trades_df, strategy_name)}

    for regime in ["calm", "volatile"]:
        mask = regime_aligned == regime
        subset = value_series[mask]
        if len(subset) < 5:
            results[regime] = None
            continue
        # Rebase to 1.0 so metrics are regime-relative
        subset_rebased = subset / subset.iloc[0] * 10_000
        # Filter trades to this regime's dates
        if not trades_df.empty:
            regime_dates = set(value_series.index[mask])
            trades_subset = trades_df[trades_df.index.isin(regime_dates)]
        else:
            trades_subset = trades_df
        results[regime] = compute_all(subset_rebased, trades_subset, f"{strategy_name} [{regime}]")

    return results


def build_regime_table(all_results: dict, regime_labels: pd.Series) -> pd.DataFrame:
    """
    Build a summary table: strategies × (overall + calm + volatile) metrics.

    all_results: {strategy_name: backtest_result_dict}
    Returns a wide DataFrame for display.
    """
    rows = []
    for name, result in all_results.items():
        split = split_by_regime(
            result["value_series"],
            result["trades"],
            regime_labels,
            name,
        )
        row = {
            "Strategy": name,
            # Overall
            "Return (Overall)":   split["overall"]["total_return"],
            "Sharpe (Overall)":   split["overall"]["sharpe_ratio"],
            "MaxDD (Overall)":    split["overall"]["max_drawdown"],
            "WinRate (Overall)":  split["overall"]["win_rate"],
        }
        for regime in ["calm", "volatile"]:
            label = regime.capitalize()
            if split[regime]:
                row[f"Return ({label})"] = split[regime]["total_return"]
                row[f"Sharpe ({label})"] = split[regime]["sharpe_ratio"]
                row[f"MaxDD ({label})"]  = split[regime]["max_drawdown"]
            else:
                row[f"Return ({label})"] = None
                row[f"Sharpe ({label})"] = None
                row[f"MaxDD ({label})"]  = None
        rows.append(row)

    return pd.DataFrame(rows).set_index("Strategy")
