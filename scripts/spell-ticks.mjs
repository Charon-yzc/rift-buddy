// Pure DoT tick math shared by scripts/enrich-spells.mjs and tests.
// A tick count is only attached when the schema proves it; unknown patterns
// attach nothing (the slot stays partial instead of guessed).
//
// Units: period-style values (SecondsPerTick, TickInterval, TickPeriod) are
// seconds-per-tick so total = round(dur/f); frequency-style values
// (TickFrequency, TicksPerSecond, TickRate) are ticks-per-second so
// total = round(dur*f). Riot's schema carries both vocabularies
// (SecondsPerTick coexists with TickFrequency), which is the evidence for
// reading them differently. They coincide at 1 (Teemo E poison, the proven
// case: 4s x 1/s = 4 ticks).
export function totalTicks(dur, f, freqIsPeriod) {
 if (!Number.isFinite(dur) || dur <= 0) return null;
 if (!Number.isFinite(f) || f <= 0) return null;
 const total = freqIsPeriod ? Math.round(dur / f) : Math.round(dur * f);
 return total >= 1 ? total : null;
}

// Ticks of one application landing inside the trading window. interval is
// derived from the total itself (dur/total), so the cap is correct for any
// tick rate: fast ticks keep them all, slow ticks keep floor(window/interval),
// and an interval longer than the window keeps none (0, not 1).
export function landedTicks(dur, f, freqIsPeriod, windowSec = 6) {
 const total = totalTicks(dur, f, freqIsPeriod);
 if (total === null) return null;
 const interval = dur / total;
 return Math.min(total, Math.max(0, Math.floor(windowSec / interval)));
}
