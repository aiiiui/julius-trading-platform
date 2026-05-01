"""
Trading Strategy Comparison Platform
Bocconi University — AI Tools for Economics and Marketing, Spring 2026

5-tab dashboard:
  Tab 1 — Portfolio Overview   : all stocks × all strategies summary + heatmap
  Tab 2 — Strategy Comparison  : single-stock equity curves + full metrics table
  Tab 3 — AI Analysis (LSTM)   : confusion matrix + confidence distribution
  Tab 4 — Regime Analysis      : calm vs volatile performance breakdown
  Tab 5 — Live Markets         : TradingView charts + live signal scanner + paper trading
"""

import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

import streamlit as st
import pandas as pd
import numpy as np

from data.fetcher import fetch_ohlcv
from data.vix import get_regime_labels
from data.sp500_tickers import UNIVERSE, ALL_TICKERS, BENCHMARK

from strategies.registry import STRATEGY_REGISTRY, DEFAULT_STRATEGIES, build_strategies
from backtest.batch import run_all_stocks
from analytics.regime import build_regime_table

from viz.cumulative_returns import plot_cumulative_returns
from viz.heatmap import plot_return_heatmap
from viz.confusion_matrix import plot_confusion_matrix
from viz.confidence_dist import plot_confidence_distribution
from viz.tradingview_widget import (
    tradingview_chart_widget,
    tradingview_ticker_tape,
    tradingview_market_overview,
)

from paper_trade.state import PaperPortfolio
from paper_trade.engine import get_current_signals, update_portfolio as pt_update

# ── Page config ───────────────────────────────────────────────────────────────
st.set_page_config(
    page_title="S&P 500 Strategy Comparator",
    page_icon="📈",
    layout="wide",
)

st.title("📈 S&P 500 Trading Strategy Comparator")
st.caption("Bocconi University | AI Tools for Economics and Marketing | Spring 2026")

# ── Sidebar ───────────────────────────────────────────────────────────────────
with st.sidebar:
    st.header("⚙️ Settings")

    start_date = st.date_input("Start date", value=pd.Timestamp("2025-01-01"))
    end_date   = st.date_input("End date",   value=pd.Timestamp("2025-12-31"))

    initial_cash = st.number_input("Initial capital (€)", value=10_000, step=1_000)
    tc_pct       = st.slider("Transaction cost (%)", 0.0, 1.0, 0.1, 0.05) / 100

    st.subheader("Stocks")
    selected_tickers = st.multiselect(
        "Stocks for batch run",
        options=ALL_TICKERS,
        default=["AAPL", "MSFT", "JPM", "XOM"],
    )
    if selected_tickers:
        focus_ticker = st.selectbox("Focus stock (Tabs 2 & 3)", options=selected_tickers)
    else:
        focus_ticker = None

    st.subheader("Strategies")
    selected_strategy_names = []
    for name in STRATEGY_REGISTRY:
        checked = name in DEFAULT_STRATEGIES
        if st.checkbox(name, value=checked):
            selected_strategy_names.append(name)

    use_pairs = st.checkbox("Pairs Trading", value=False)

    st.divider()
    run_btn = st.button("▶  Run Backtest", type="primary", use_container_width=True)

# ── Tab layout ────────────────────────────────────────────────────────────────
tab1, tab2, tab3, tab4, tab5 = st.tabs([
    "📊 Portfolio Overview",
    "⚖️ Strategy Comparison",
    "🤖 AI Analysis (LSTM)",
    "🌡️ Regime Analysis",
    "🟢 Live Markets",
])

# ── Run backtest on button click ──────────────────────────────────────────────
if run_btn:
    if not selected_tickers:
        st.error("Select at least one stock.")
        st.stop()
    if not selected_strategy_names and not use_pairs:
        st.error("Select at least one strategy.")
        st.stop()

    strategies = build_strategies(selected_strategy_names)

    progress_bar = st.sidebar.progress(0)
    status_text  = st.sidebar.empty()

    def _progress(current, total, msg):
        progress_bar.progress(current / max(total, 1))
        status_text.caption(f"[{current}/{total}] {msg}")

    with st.spinner("Running batch backtest across all selected stocks…"):
        batch_results, metadata = run_all_stocks(
            strategies=strategies,
            use_pairs=use_pairs,
            tickers=selected_tickers,
            start=str(start_date),
            end=str(end_date),
            initial_cash=float(initial_cash),
            tc_pct=tc_pct,
            progress_callback=_progress,
        )
        regime_labels = get_regime_labels(str(start_date), str(end_date))

    progress_bar.empty()
    status_text.empty()

    st.session_state.update({
        "batch_results":  batch_results,
        "regime_labels":  regime_labels,
        "lstm_by_ticker": metadata.get("lstm_by_ticker", {}),
        "focus_ticker":   focus_ticker,
        "initial_cash":   float(initial_cash),
        "tc_pct":         tc_pct,
        "start_str":      str(start_date),
        "end_str":        str(end_date),
    })
    st.success(f"Done! {len(selected_tickers)} stocks × {len(selected_strategy_names)} strategies"
               + (" + Pairs Trading" if use_pairs else ""))


# ── Helper: guard tabs when no data ──────────────────────────────────────────
def _no_data_message():
    st.info("Configure settings in the sidebar and click **▶ Run Backtest** to populate this tab.")


# ═══════════════════════════════════════════════════════════════════════════════
# TAB 1 — Portfolio Overview
# ═══════════════════════════════════════════════════════════════════════════════
with tab1:
    if "batch_results" not in st.session_state:
        _no_data_message()
    else:
        br   = st.session_state["batch_results"]
        cash = st.session_state["initial_cash"]
        per_ticker = {k: v for k, v in br.items() if k != "PAIRS"}

        # ── Stock summary cards ──────────────────────────────────────────
        st.subheader("Stock Summary")
        cols = st.columns(min(len(per_ticker), 4))
        for i, (ticker, results) in enumerate(per_ticker.items()):
            if not results:
                continue
            returns = {name: r["metrics"]["total_return"] for name, r in results.items()}
            best_name  = max(returns, key=returns.get)
            worst_name = min(returns, key=returns.get)
            with cols[i % 4]:
                st.metric(
                    label=f"**{ticker}**",
                    value=f"Best: {returns[best_name]:+.1%}",
                    delta=f"Worst: {returns[worst_name]:+.1%}",
                )
                st.caption(f"↑ {best_name[:20]}")

        st.divider()

        # ── Return heatmap ───────────────────────────────────────────────
        st.subheader("Performance Heatmap")
        metric_choice = st.selectbox(
            "Metric",
            options=["total_return", "sharpe_ratio", "max_drawdown", "calmar_ratio", "win_rate"],
            format_func=lambda x: {
                "total_return": "Total Return",
                "sharpe_ratio": "Sharpe Ratio",
                "max_drawdown": "Max Drawdown",
                "calmar_ratio": "Calmar Ratio",
                "win_rate":     "Win Rate",
            }[x],
            key="heatmap_metric",
        )
        if per_ticker:
            fig_hm = plot_return_heatmap(per_ticker, metric=metric_choice)
            st.plotly_chart(fig_hm, use_container_width=True)

        # ── Avg P&L per stock table ──────────────────────────────────────
        st.subheader("Avg P&L per Stock (across all trades)")
        pnl_rows = []
        for ticker, results in per_ticker.items():
            for strat_name, result in results.items():
                m = result["metrics"]
                trades = result["trades"]
                # Avg P&L per completed trade in € terms
                buys  = trades[trades["action"] == "BUY"]["price"] if not trades.empty and "action" in trades.columns else pd.Series(dtype=float)
                sells = trades[trades["action"] == "SELL"]["price"] if not trades.empty and "action" in trades.columns else pd.Series(dtype=float)
                pairs_n = min(len(buys), len(sells))
                if pairs_n > 0:
                    # Approximate avg trade P&L = (avg_exit / avg_entry - 1) * initial_cash
                    avg_pnl = ((sells.values[:pairs_n] / buys.values[:pairs_n] - 1) * cash).mean()
                else:
                    avg_pnl = float("nan")

                pnl_rows.append({
                    "Ticker":          ticker,
                    "Strategy":        strat_name,
                    "Total Return":    f"{m['total_return']:+.1%}",
                    "Avg P&L / Trade": f"€{avg_pnl:+.0f}" if not pd.isna(avg_pnl) else "N/A",
                    "Avg Duration":    f"{m['avg_trade_duration']:.0f}d" if not pd.isna(m.get("avg_trade_duration", float("nan"))) else "N/A",
                    "# Trades":        int(m["n_trades"]),
                    "Win Rate":        f"{m['win_rate']:.0%}" if not pd.isna(m["win_rate"]) else "N/A",
                })

        if pnl_rows:
            pnl_df = pd.DataFrame(pnl_rows)
            st.dataframe(pnl_df, use_container_width=True, hide_index=True)

        # ── Pairs trading section ────────────────────────────────────────
        if "PAIRS" in br:
            st.divider()
            st.subheader("Pairs Trading Result")
            pm = br["PAIRS"]["Pairs Trading"]["metrics"]
            c1, c2, c3, c4 = st.columns(4)
            c1.metric("Total Return",  f"{pm['total_return']:+.1%}")
            c2.metric("Sharpe Ratio",  f"{pm['sharpe_ratio']:.2f}")
            c3.metric("Max Drawdown",  f"{pm['max_drawdown']:.1%}")
            c4.metric("# Trades",      int(pm["n_trades"]))


# ═══════════════════════════════════════════════════════════════════════════════
# TAB 2 — Strategy Comparison
# ═══════════════════════════════════════════════════════════════════════════════
with tab2:
    if "batch_results" not in st.session_state:
        _no_data_message()
    else:
        br   = st.session_state["batch_results"]
        rl   = st.session_state["regime_labels"]
        cash = st.session_state["initial_cash"]
        per_ticker = {k: v for k, v in br.items() if k != "PAIRS"}

        # Allow changing focus stock within the tab
        available_tickers = list(per_ticker.keys())
        if available_tickers:
            default_idx = 0
            saved_focus = st.session_state.get("focus_ticker")
            if saved_focus in available_tickers:
                default_idx = available_tickers.index(saved_focus)

            focus = st.selectbox(
                "Select stock",
                options=available_tickers,
                index=default_idx,
                key="tab2_focus",
            )
        else:
            st.warning("No results available.")
            st.stop()

        ticker_results = per_ticker.get(focus, {})
        if not ticker_results:
            st.warning(f"No strategy results for {focus}.")
        else:
            # ── Equity curve ────────────────────────────────────────────
            st.subheader(f"Equity Curves — {focus}")
            fig_eq = plot_cumulative_returns(
                ticker_results,
                regime_labels=rl,
                title=f"{focus}: All Strategies ({st.session_state.get('start_str', '')} → {st.session_state.get('end_str', '')})",
                initial_cash=cash,
            )
            st.plotly_chart(fig_eq, use_container_width=True)

            # ── Full metrics table ───────────────────────────────────────
            st.subheader("Performance Metrics")
            rows = []
            for name, result in ticker_results.items():
                m = result["metrics"]
                rows.append({
                    "Strategy":       name,
                    "Total Return":   f"{m['total_return']:+.1%}",
                    "CAGR":           f"{m['cagr']:+.1%}",
                    "Sharpe":         f"{m['sharpe_ratio']:.2f}",
                    "Max DD":         f"{m['max_drawdown']:.1%}",
                    "Calmar":         f"{m['calmar_ratio']:.2f}",
                    "Win Rate":       f"{m['win_rate']:.0%}" if not pd.isna(m["win_rate"]) else "N/A",
                    "Avg Duration":   f"{m.get('avg_trade_duration', float('nan')):.0f}d"
                                      if not pd.isna(m.get("avg_trade_duration", float("nan"))) else "N/A",
                    "# Trades":       int(m["n_trades"]),
                })
            st.dataframe(pd.DataFrame(rows).set_index("Strategy"), use_container_width=True)

            # ── Trade logs ───────────────────────────────────────────────
            st.subheader("Trade Logs")
            for name, result in ticker_results.items():
                trades = result["trades"]
                with st.expander(f"{name}  ({len(trades)} entries)"):
                    if trades.empty:
                        st.caption("No trades executed.")
                    else:
                        st.dataframe(trades, use_container_width=True)

        # ── Pairs section ────────────────────────────────────────────────
        if "PAIRS" in br:
            st.divider()
            st.subheader("Pairs Trading — Equity Curve")
            pairs_result = br["PAIRS"]["Pairs Trading"]
            fig_pairs = plot_cumulative_returns(
                {"Pairs Trading": pairs_result},
                title="Pairs Trading Performance",
                initial_cash=cash,
            )
            st.plotly_chart(fig_pairs, use_container_width=True)


# ═══════════════════════════════════════════════════════════════════════════════
# TAB 3 — AI Analysis (LSTM)
# ═══════════════════════════════════════════════════════════════════════════════
with tab3:
    if "batch_results" not in st.session_state:
        _no_data_message()
    else:
        br            = st.session_state["batch_results"]
        lstm_by_tick  = st.session_state.get("lstm_by_ticker", {})
        per_ticker    = {k: v for k, v in br.items() if k != "PAIRS"}
        available     = list(per_ticker.keys())

        if not available:
            st.warning("No results available.")
        else:
            default_idx = 0
            saved_focus = st.session_state.get("focus_ticker")
            if saved_focus in available:
                default_idx = available.index(saved_focus)

            focus_ai = st.selectbox("Select stock", options=available,
                                    index=default_idx, key="tab3_focus")

            lstm_strat = lstm_by_tick.get(focus_ai)
            lstm_result = per_ticker.get(focus_ai, {}).get("LSTM Multi-Signal")

            if lstm_strat is None or not getattr(lstm_strat, "_trained", False):
                st.info(
                    "**LSTM Multi-Signal** was not selected or failed to train for this stock. "
                    "Enable it in the sidebar and re-run the backtest."
                )
            else:
                # ── Classification metrics ─────────────────────────────
                from sklearn.metrics import (
                    accuracy_score, precision_score, recall_score, f1_score
                )
                y_true = lstm_strat.test_actuals
                y_pred = lstm_strat.test_predictions

                acc  = accuracy_score(y_true, y_pred)
                prec = precision_score(y_true, y_pred, zero_division=0)
                rec  = recall_score(y_true, y_pred, zero_division=0)
                f1   = f1_score(y_true, y_pred, zero_division=0)

                c1, c2, c3, c4 = st.columns(4)
                c1.metric("Accuracy",  f"{acc:.1%}")
                c2.metric("Precision", f"{prec:.1%}")
                c3.metric("Recall",    f"{rec:.1%}")
                c4.metric("F1 Score",  f"{f1:.3f}")

                st.caption(
                    f"Metrics computed on **test set** (15% of 2020–2024 data, "
                    f"{len(y_true)} samples). Not the backtest period."
                )

                st.divider()

                # ── Charts side by side ───────────────────────────────
                col_left, col_right = st.columns(2)

                with col_left:
                    st.subheader("Confusion Matrix")
                    fig_cm = plot_confusion_matrix(y_true, y_pred)
                    st.plotly_chart(fig_cm, use_container_width=True)

                with col_right:
                    st.subheader("Confidence Distribution")
                    fig_cd = plot_confidence_distribution(
                        lstm_strat.confidence_scores,
                        buy_threshold=lstm_strat.buy_threshold,
                        sell_threshold=lstm_strat.sell_threshold,
                    )
                    st.plotly_chart(fig_cd, use_container_width=True)

                # ── Backtest performance for this ticker ──────────────
                if lstm_result:
                    st.divider()
                    st.subheader(f"LSTM Backtest Performance — {focus_ai}")
                    m = lstm_result["metrics"]
                    bc1, bc2, bc3, bc4 = st.columns(4)
                    bc1.metric("Total Return",  f"{m['total_return']:+.1%}")
                    bc2.metric("Sharpe Ratio",  f"{m['sharpe_ratio']:.2f}")
                    bc3.metric("Max Drawdown",  f"{m['max_drawdown']:.1%}")
                    bc4.metric("# Trades",      int(m["n_trades"]))


# ═══════════════════════════════════════════════════════════════════════════════
# TAB 4 — Regime Analysis
# ═══════════════════════════════════════════════════════════════════════════════
with tab4:
    if "batch_results" not in st.session_state:
        _no_data_message()
    else:
        br         = st.session_state["batch_results"]
        rl         = st.session_state["regime_labels"]
        per_ticker = {k: v for k, v in br.items() if k != "PAIRS"}
        available  = list(per_ticker.keys())

        if not available:
            st.warning("No results available.")
        else:
            default_idx = 0
            saved_focus = st.session_state.get("focus_ticker")
            if saved_focus in available:
                default_idx = available.index(saved_focus)

            focus_reg = st.selectbox("Select stock", options=available,
                                     index=default_idx, key="tab4_focus")

            ticker_results = per_ticker.get(focus_reg, {})
            if not ticker_results:
                st.warning(f"No results for {focus_reg}.")
            else:
                # ── Regime day counts ────────────────────────────────
                calm_days     = int((rl == "calm").sum())
                volatile_days = int((rl == "volatile").sum())
                total_days    = len(rl)

                rc1, rc2, rc3 = st.columns(3)
                rc1.metric("Total Trading Days", total_days)
                rc2.metric("Calm Days (VIX < 20)",      calm_days,     f"{calm_days/total_days:.0%}")
                rc3.metric("Volatile Days (VIX ≥ 20)",  volatile_days, f"{volatile_days/total_days:.0%}")

                st.divider()

                # ── Regime breakdown table ────────────────────────────
                st.subheader(f"Performance by Regime — {focus_reg}")
                st.caption("VIX < 20 = Calm  |  VIX ≥ 20 = Volatile")

                try:
                    regime_df = build_regime_table(ticker_results, rl)

                    def _fmt(v, kind):
                        if v is None or (isinstance(v, float) and pd.isna(v)):
                            return "—"
                        if kind == "pct":
                            return f"{v:+.1%}"
                        return f"{v:.2f}"

                    display = regime_df.copy()
                    for col in display.columns:
                        if "Return" in col or "MaxDD" in col or "WinRate" in col:
                            display[col] = display[col].apply(lambda v: _fmt(v, "pct"))
                        elif "Sharpe" in col:
                            display[col] = display[col].apply(lambda v: _fmt(v, "float"))

                    st.dataframe(display, use_container_width=True)
                except Exception as e:
                    st.warning(f"Regime table error: {e}")

# ═══════════════════════════════════════════════════════════════════════════════
# TAB 5 — Live Markets
# ═══════════════════════════════════════════════════════════════════════════════
with tab5:
    import streamlit.components.v1 as components
    from data.sp500_tickers import ALL_TICKERS

    NON_ML_STRATEGIES = [
        n for n in STRATEGY_REGISTRY
        if n not in {"AI/ML (Logistic Regression)", "LSTM Multi-Signal", "Random Monte Carlo"}
    ]

    # ── Ticker tape (always visible) ─────────────────────────────────────────
    components.html(tradingview_ticker_tape(), height=72, scrolling=False)

    st.subheader("Live Markets")
    st.caption(
        "Live data via Yahoo Finance (15-min delayed). "
        "Charts powered by [TradingView](https://www.tradingview.com/). "
        "Separate from the 2025 historical backtest — always reflects today's market."
    )

    # ── Market Overview ──────────────────────────────────────────────────────
    st.markdown("#### Market Overview")
    components.html(tradingview_market_overview(height=520), height=540, scrolling=False)

    st.divider()

    # ── Signal Scanner ───────────────────────────────────────────────────────
    st.markdown("#### Live Signal Scanner")
    st.caption("Runs your selected strategies against the last 400 days of live price data.")

    col_scan_l, col_scan_r = st.columns([2, 1])
    with col_scan_l:
        scan_tickers = st.multiselect(
            "Stocks to scan",
            options=ALL_TICKERS,
            default=["AAPL", "MSFT", "JPM", "XOM"],
            key="live_scan_tickers",
        )
    with col_scan_r:
        scan_strategies = st.multiselect(
            "Strategies",
            options=NON_ML_STRATEGIES,
            default=["EMA Crossover + Volume", "RSI + Bollinger Bands", "MACD + ADX"],
            key="live_scan_strats",
        )

    scan_btn = st.button("🔍  Scan Live Signals", type="primary")

    if scan_btn:
        if not scan_tickers or not scan_strategies:
            st.warning("Select at least one stock and one strategy.")
        else:
            with st.spinner("Fetching live data and computing signals…"):
                sig_df = get_current_signals(scan_tickers, scan_strategies)
            st.session_state["live_signals"]     = sig_df
            st.session_state["live_signals_time"] = pd.Timestamp.now().strftime("%Y-%m-%d %H:%M")

    if "live_signals" in st.session_state:
        sig = st.session_state["live_signals"]
        ts  = st.session_state.get("live_signals_time", "")
        st.caption(f"Last updated: {ts}")

        def _color_signal(val):
            if val == "BUY":
                return "background-color:#1a4a1a; color:#4cff4c; font-weight:bold;"
            if val == "SELL":
                return "background-color:#4a1a1a; color:#ff4c4c; font-weight:bold;"
            if val == "HOLD":
                return "color:#aaaaaa;"
            return "color:#666666;"

        if not sig.empty:
            st.dataframe(
                sig.style.applymap(_color_signal),
                use_container_width=True,
            )
        else:
            st.warning("No signals returned — check your ticker or strategy selection.")

    st.divider()

    # ── TradingView Interactive Chart ────────────────────────────────────────
    st.markdown("#### Interactive Chart")

    chart_col_l, chart_col_r = st.columns([2, 1])
    with chart_col_l:
        chart_ticker = st.selectbox(
            "Ticker",
            options=ALL_TICKERS,
            index=0,
            key="live_chart_ticker",
        )
    with chart_col_r:
        chart_interval = st.selectbox(
            "Interval",
            options=["D", "W", "60", "15"],
            format_func=lambda x: {"D": "Daily", "W": "Weekly", "60": "Hourly", "15": "15-min"}[x],
            key="live_chart_interval",
        )

    components.html(
        tradingview_chart_widget(chart_ticker, interval=chart_interval, height=520),
        height=540,
        scrolling=False,
    )

    st.divider()

    # ── Paper Portfolio ──────────────────────────────────────────────────────
    st.markdown("#### Paper Portfolio")
    st.caption(
        "Virtual portfolio tracking. Capital is allocated per ticker independently "
        "(same structure as the backtester). State persists across page refreshes."
    )

    # Load persisted state
    portfolio = PaperPortfolio.load()

    if portfolio is None:
        # ── Initialization form ──────────────────────────────────────────
        st.info("No active paper portfolio. Initialize one below.")
        with st.form("init_portfolio"):
            p_cash     = st.number_input("Initial capital per ticker (€)", value=10_000, step=1_000)
            p_tc       = st.slider("Transaction cost (%)", 0.0, 1.0, 0.1, 0.05) / 100
            p_strategy = st.selectbox("Strategy to follow", options=NON_ML_STRATEGIES,
                                      index=NON_ML_STRATEGIES.index("EMA Crossover + Volume")
                                            if "EMA Crossover + Volume" in NON_ML_STRATEGIES else 0)
            p_tickers  = st.multiselect("Stocks to track", options=ALL_TICKERS,
                                         default=["AAPL", "MSFT", "JPM", "XOM"])
            submitted = st.form_submit_button("🚀  Start Paper Portfolio", type="primary")

        if submitted:
            if not p_tickers:
                st.error("Select at least one stock.")
            else:
                new_p = PaperPortfolio(initial_cash=float(p_cash), tc_pct=p_tc)
                new_p.strategy_name = p_strategy
                for t in p_tickers:
                    new_p.init_ticker(t)
                new_p.save()
                st.success(f"Paper portfolio initialized for {', '.join(p_tickers)}.")
                st.rerun()

    else:
        # ── Active portfolio controls ────────────────────────────────────
        pf_col1, pf_col2 = st.columns([3, 1])
        with pf_col1:
            st.markdown(
                f"**Strategy:** {portfolio.strategy_name}  |  "
                f"**Started:** {portfolio.start_date}  |  "
                f"**Tickers:** {', '.join(portfolio.tickers.keys())}"
            )
        with pf_col2:
            refresh_btn = st.button("🔄  Refresh & Apply Signals", type="primary",
                                    use_container_width=True)
            reset_btn   = st.button("🗑️  Reset Portfolio", use_container_width=True)

        if reset_btn:
            PaperPortfolio.reset()
            st.success("Portfolio reset.")
            st.rerun()

        if refresh_btn:
            active_tickers = list(portfolio.tickers.keys())
            with st.spinner("Fetching live prices and applying signals…"):
                live_sig_df, live_prices = pt_update(
                    portfolio,
                    tickers=active_tickers,
                    strategy_name=portfolio.strategy_name,
                )
            portfolio = PaperPortfolio.load()  # reload after save
            st.session_state["pt_live_prices"] = live_prices
            st.success(f"Signals applied at {pd.Timestamp.now().strftime('%H:%M')}.")

        live_prices: dict = st.session_state.get("pt_live_prices", {})

        # ── Summary metrics ──────────────────────────────────────────────
        n_positions = sum(1 for t in portfolio.tickers.values() if t["in_position"])
        n_trades    = sum(len(t["trades"]) for t in portfolio.tickers.values())
        total_val   = portfolio.total_value(live_prices) if live_prices else None
        total_pnl   = portfolio.total_pnl_pct(live_prices) if live_prices else None
        n_tracked   = len(portfolio.tickers)

        sm1, sm2, sm3, sm4 = st.columns(4)
        sm1.metric("Tracked Stocks",  n_tracked)
        sm2.metric("Open Positions",  n_positions)
        sm3.metric("Total Trades",    n_trades)
        if total_val is not None:
            sm4.metric(
                "Total Portfolio Value",
                f"€{total_val:,.0f}",
                delta=f"{total_pnl:+.2%}",
            )
        else:
            sm4.metric("Total P&L", "—", delta="Refresh to update")

        st.divider()

        # ── Per-ticker positions table ───────────────────────────────────
        st.subheader("Current Positions")
        pos_rows = []
        for ticker, t in portfolio.tickers.items():
            curr_price = live_prices.get(ticker)
            curr_val   = portfolio.current_value(ticker, curr_price) if curr_price else None
            pnl_pct    = portfolio.pnl_pct(ticker, curr_price)       if curr_price else None
            pos_rows.append({
                "Ticker":        ticker,
                "Status":        "LONG" if t["in_position"] else "CASH",
                "Entry Price":   f"€{t['entry_price']:,.2f}" if t["in_position"] else "—",
                "Entry Date":    t["entry_date"] if t["in_position"] else "—",
                "Current Price": f"€{curr_price:,.2f}" if curr_price else "—",
                "Value":         f"€{curr_val:,.0f}" if curr_val else "—",
                "P&L":           f"{pnl_pct:+.2%}" if pnl_pct is not None else "—",
                "# Trades":      len(t["trades"]),
            })

        if pos_rows:
            pos_df = pd.DataFrame(pos_rows)

            def _color_status(val):
                if val == "LONG": return "color:#4cff4c; font-weight:bold;"
                return "color:#aaaaaa;"

            def _color_pnl(val):
                if val.startswith("+") and val != "+0.00%": return "color:#4cff4c;"
                if val.startswith("-"):                      return "color:#ff4c4c;"
                return ""

            styled = pos_df.style \
                .applymap(_color_status, subset=["Status"]) \
                .applymap(_color_pnl,    subset=["P&L"])
            st.dataframe(styled, use_container_width=True, hide_index=True)

        # ── Trade history ────────────────────────────────────────────────
        st.subheader("Trade History")
        all_trades = []
        for ticker, t in portfolio.tickers.items():
            for trade in t["trades"]:
                all_trades.append({"Ticker": ticker, **trade})

        if all_trades:
            trades_df = pd.DataFrame(all_trades)
            for col in trades_df.columns:
                if col == "pnl":
                    trades_df.rename(columns={"pnl": "P&L (€)"}, inplace=True)
                if col == "cost":
                    trades_df.rename(columns={"cost": "TC (€)"}, inplace=True)
            st.dataframe(trades_df, use_container_width=True, hide_index=True)
        else:
            st.caption("No trades executed yet. Click **Refresh & Apply Signals** to run the strategy.")

# ── Data caveat ───────────────────────────────────────────────────────────────
st.divider()
st.caption(
    "**Data caveat:** All results are simulated backtests using historical price data from Yahoo Finance "
    "via the `yfinance` library. Results do not represent real investment returns. "
    "Past performance does not guarantee future results. "
    "Signals execute at next-bar open price (no look-ahead bias). "
    "Transaction costs: {:.2%} per trade.".format(
        st.session_state.get("tc_pct", 0.001)
    )
)
