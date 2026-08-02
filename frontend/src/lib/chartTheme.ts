/* -------------------------------------------------------------------------- */
/* One theme for every Recharts surface in the product.                       */
/*                                                                            */
/* Axis ticks, grid lines and tooltip chrome were declared inline in six       */
/* different files, which is how the same axis ended up at 10px in Compare and */
/* 11px on the Position chart, and why raising the contrast of a tick meant    */
/* finding every one of them. They are declared once here instead.            */
/*                                                                            */
/* AND THEY RESOLVE THROUGH VARIABLES, NOT THROUGH HEX.                       */
/*                                                                            */
/* Every value in this file used to be a dark-theme literal: a grey tick, a    */
/* white grid line at 5.5% and a near-black tooltip. In light mode the grid    */
/* was white on white and simply absent, and the tooltip was a black card in a */
/* daylight interface. That is the whole "light mode is unfinished" report in  */
/* one file — a chart does not stop working when the page turns white, it just */
/* stops being visible, which is worse because nothing announces it.           */
/*                                                                            */
/* These are strings rather than a hook on purpose. Recharts writes them       */
/* straight into SVG attributes and inline styles, both of which resolve       */
/* `var()` at paint time — so the charts re-theme on the same frame the page   */
/* does, with no subscription, no re-render and no chance of a stale colour.   */
/* -------------------------------------------------------------------------- */

export const AXIS_TICK_COLOR = "rgb(var(--axis))";
export const AXIS_LINE_COLOR = "rgb(var(--tint) / 0.11)";
export const GRID_COLOR = "rgb(var(--tint) / 0.07)";
/** The faint vertical rule a hover leaves behind on a cartesian chart. */
export const CURSOR_COLOR = "rgb(var(--tint) / 0.22)";
/** Whatever a marker is drawn on top of — a dot's halo, a label's plate. */
export const SURFACE_COLOR = "rgb(var(--base-900))";

/** Standard axis tick. Pass a size only when a chart genuinely needs a bigger one. */
export const axisTick = (fontSize = 11) => ({ fill: AXIS_TICK_COLOR, fontSize });
export const axisLine = { stroke: AXIS_LINE_COLOR };

/**
 * Tooltip chrome. Recharts renders these inline, so they can't inherit the
 * app's surface classes — this keeps them identical to a hand-built hover card.
 */
export const TOOLTIP_STYLE: React.CSSProperties = {
  background: "rgb(var(--base-900) / 0.97)",
  border: "1px solid rgb(var(--tint) / 0.12)",
  borderRadius: 12,
  fontSize: 12.5,
  padding: "9px 11px",
  boxShadow: "0 0 0 1px rgb(var(--tint) / 0.04), var(--el-3)",
};
export const TOOLTIP_LABEL_STYLE: React.CSSProperties = {
  color: "rgb(var(--ink))",
  fontWeight: 600,
  marginBottom: 3,
};
export const TOOLTIP_ITEM_STYLE: React.CSSProperties = { padding: "1px 0" };

/**
 * Room for a chart to breathe inside its container.
 *
 * Negative left margins were being used to claw back the gap Recharts leaves
 * for the Y axis — which pulls the plot outside the SVG viewport and crops the
 * axis and the first data point. Margins are never negative; if a chart needs
 * to sit tighter, the axis `width` comes down instead.
 */
export const CHART_MARGIN = { top: 12, right: 16, bottom: 6, left: 0 };
