"use client";
/**
 * Display mode, re-exported from the preferences store.
 *
 * Mode used to own its own in-memory context. It is now one of several stated
 * preferences (theme, motion intensity, whether the walkthrough has been seen),
 * and they belong in one place that persists — see lib/prefs.tsx. This file
 * stays so the 20-odd call sites that only care about Simple vs Advanced keep
 * importing the thing they actually mean.
 */
export {
  useDisplayMode, useMode, useIsSimple, useIsAdvanced, AdvancedOnly, SimpleOnly,
  type Mode,
} from "./prefs";
