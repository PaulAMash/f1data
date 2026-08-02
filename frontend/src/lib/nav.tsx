"use client";
import { usePathname, useRouter } from "next/navigation";

/* -------------------------------------------------------------------------- */
/* Going back, in an application rather than in a browser.                    */
/*                                                                            */
/* V59 gave the bar a back control that walked the reader's own history of    */
/* in-app navigations. It was correct and it was the wrong model: a reader who */
/* had been through Explore, Historical, Settings and Compare had to press     */
/* Back five times to get home, and could not predict where any one press      */
/* would land. History is a record of what you did; it is not a structure.     */
/*                                                                            */
/* Pitwall IQ has a structure, and it is one level deep. Home is the parent;   */
/* Explore, Historical and Settings are siblings under it. So Back means the   */
/* one thing it can mean here — UP — and the deepest it can ever be is:        */
/*                                                                            */
/*     Explore  →  Home                                                        */
/*                                                                            */
/* One press, always the same destination, and nothing to remember. The        */
/* forward control went with the history stack: forward through a structure is */
/* not a direction, and a control that is meaningless half the time is worse   */
/* than no control.                                                            */
/* -------------------------------------------------------------------------- */

export function useNavHistory() {
  const router = useRouter();
  const path = usePathname();
  return {
    canBack: path !== "/",
    back: () => router.push("/"),
  };
}
