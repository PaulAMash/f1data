/* -------------------------------------------------------------------------- */
/* One theme for every Recharts surface in the product.                       */
/*                                                                            */
/* Axis ticks, grid lines and tooltip chrome were declared inline in six       */
/* different files, which is how the same axis ended up at 10px in Compare and */
/* 11px on the Position chart, and why raising the contrast of a tick meant    */
/* finding every one of them. They are declared once here instead.            */
/*                                                                            */
/* The tick colour is deliberately brighter than the old #5f6b84: an axis you  */
/* have to lean in to read is an axis that isn't doing its job.                */
/* -------------------------------------------------------------------------- */

export const AXIS_TICK_COLOR = "#8b98b2";
export const AXIS_LINE_COLOR = "rgba(255,255,255,0.09)";
export const GRID_COLOR = "rgba(255,255,255,0.055)";

/** Standard axis tick. Pass a size only when a chart genuinely needs a bigger one. */
export const axisTick = (fontSize = 11) => ({ fill: AXIS_TICK_COLOR, fontSize });
export const axisLine = { stroke: AXIS_LINE_COLOR };

/**
 * Tooltip chrome. Recharts renders these inline, so they can't inherit the
 * app's surface classes — this keeps them identical to a hand-built hover card.
 */
export const TOOLTIP_STYLE: React.CSSProperties = {
  background: "rgba(11,14,22,0.97)",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 12,
  fontSize: 12.5,
  padding: "9px 11px",
  boxShadow: "0 0 0 1px rgba(255,255,255,0.04), 0 10px 40px -12px rgba(0,0,0,0.75)",
};
export const TOOLTIP_LABEL_STYLE: React.CSSProperties = {
  color: "#e8ecf5",
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
