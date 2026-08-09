import { cx } from "@/lib/format";

/* -------------------------------------------------------------------------- */
/* ONE MARK, TWO PLACES.                                                      */
/*                                                                            */
/* The nav bar already has a vocabulary for "this is not the finished thing":  */
/* the small uppercase pill that says SOON beside Drivers, Teams and Re-run    */
/* (NavBar.tsx). Ask needs the same sentence said about a DIFFERENT state — it */
/* is here, it works, it is still being sharpened — so it borrows the pill's   */
/* exact geometry and changes only its colour. Same size, same weight, same    */
/* letter-spacing: a reader who has seen SOON reads BETA without being taught  */
/* a second convention.                                                        */
/*                                                                            */
/* The colour is the accent, not the amber this product reserves for warnings  */
/* and demo data. That is the whole difference between "we're proud of this    */
/* and it's improving" and "careful, this might be wrong", and it is the one   */
/* thing the mark must not get wrong.                                          */
/*                                                                            */
/* `tone="on"` is for a surface that is already accent-tinted (a selected tab, */
/* the notice below the Ask box), where the default tint would disappear.      */
/* -------------------------------------------------------------------------- */
export function BetaTag({ tone = "off", className }: {
  tone?: "on" | "off"; className?: string;
}) {
  return (
    <span aria-hidden className={cx(
      "rounded-[5px] px-1.5 py-px text-[9px] font-bold uppercase leading-[1.5] tracking-[0.1em]",
      tone === "on"
        ? "bg-accent/25 text-accent-soft"
        : "bg-accent/12 text-accent-soft/85",
      className,
    )}>
      beta
    </span>
  );
}
