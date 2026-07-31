"use client";

/* -------------------------------------------------------------------------- */
/* Moving between rooms.                                                      */
/*                                                                            */
/* Next's App Router remounts `template.tsx` on every navigation, which is     */
/* exactly the hook a route transition needs — `layout.tsx` would persist and  */
/* never re-run.                                                              */
/*                                                                            */
/* The motion is deliberately small: a short rise and fade, on the house       */
/* curve, over dur-3. A page that slides in from the side announces itself and */
/* gets tiring by the fourth navigation; a page that simply arrives feels like */
/* the same application showing you something else.                            */
/*                                                                            */
/* The nav bar is inside each page rather than the layout, so it re-renders    */
/* too — but because it is identical either side of a navigation and the       */
/* transform is applied to the whole subtree, it reads as staying put.         */
/* -------------------------------------------------------------------------- */

export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="route-in">{children}</div>;
}
