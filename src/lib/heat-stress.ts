// The Universal Thermal Climate Index (UTCI) in sun and in shade, from the
// same weather the app shows, via jsthermalcomfort (a port of the
// pythermalcomfort library; Bröde et al. 2012's operational polynomial).
import { utci } from "jsthermalcomfort/lib/esm/models/utci.js";
import { solar_gain } from "jsthermalcomfort/lib/esm/models/solar_gain.js";
import type { Environment, World } from "../../shared/types.js";
import { sunDirection } from "./environment.js";

/** UTCI heat-stress bands (°C), from "no thermal stress" up. */
export const UTCI_BANDS = [
  { minC: -Infinity, label: "No heat stress", short: "none" },
  { minC: 26, label: "Moderate heat stress", short: "moderate" },
  { minC: 32, label: "Strong heat stress", short: "strong" },
  { minC: 38, label: "Very strong heat stress", short: "very strong" },
  { minC: 46, label: "Extreme heat stress", short: "extreme" },
] as const;

export function utciBand(utciC: number) {
  let band = 0;
  UTCI_BANDS.forEach((b, i) => {
    if (utciC >= b.minC) band = i;
  });
  return band;
}

export interface HeatStress {
  /** UTCI, °C (an equivalent air temperature). */
  shadeC: number;
  sunC: number;
  /** Extra mean radiant temperature from direct sun, °C. */
  sunMrtC: number;
}

/** Clear-sky direct-beam sunlight (W/m²) for a sun height, Meinel's form. */
function directBeam(altitudeRad: number) {
  const airMass = 1 / Math.max(0.05, Math.sin(altitudeRad));
  return 1353 * Math.pow(0.7, Math.pow(airMass, 0.678));
}

/**
 * UTCI for a person walking in shade and in full sun now. Shade takes the
 * mean radiant temperature as the air's; sun adds the ASHRAE 55 SolarCal
 * gain for a standing person side-on to the sun, with the beam dimmed by
 * cloud (or measured sunlight in live weather). Null outside the model's
 * range (for example, freezing wind chill) so callers show nothing.
 */
export function heatStress(
  env: Environment,
  origin: World["origin"],
): HeatStress | null {
  const sun = sunDirection(env, origin);
  const altitude = (sun.altitude * 180) / Math.PI;
  let beam = 0;
  if (altitude > 0) {
    const clear = directBeam(sun.altitude);
    const cloud = Math.min(1, Math.max(0, env.cloudCover / 100));
    beam =
      env.weatherMode === "forecast" && Number.isFinite(env.solarWm2)
        ? // Live sunlight is global horizontal; most of it is beam on clear days.
          Math.min(clear, (env.solarWm2! * 0.85) / Math.max(0.1, sun.y))
        : clear * (1 - 0.75 * Math.pow(cloud, 3.4));
  }
  // SolarCal's valid range starts at 200 W/m²; weaker sun adds little.
  const sunMrtC =
    beam >= 200
      ? solar_gain(
          Math.min(90, altitude),
          90,
          Math.min(1000, beam),
          1,
          0.5,
          1,
          0.7,
          "standing",
          0.2,
        ).delta_mrt
      : 0;
  // UTCI's wind is at 10 m and at least 0.5 m/s.
  const wind = Math.min(17, Math.max(0.5, env.windMps));
  const calc = (mrtC: number) => {
    const { utci: value } = utci(
      env.temperatureC,
      env.temperatureC + mrtC,
      wind,
      env.humidity,
    );
    return Number.isFinite(value) ? value : null;
  };
  const shadeC = calc(0);
  const sunC = calc(sunMrtC);
  if (shadeC === null || sunC === null) return null;
  return { shadeC, sunC, sunMrtC };
}

/** UTCI for a walk with this shaded share, blending sun and shade. */
export const walkUtci = (s: HeatStress, shadeFraction: number) =>
  s.shadeC * shadeFraction + s.sunC * (1 - shadeFraction);
