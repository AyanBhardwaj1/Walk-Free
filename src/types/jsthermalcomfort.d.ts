// Deep imports of the two models used, so the bundle skips the rest.
declare module "jsthermalcomfort/lib/esm/models/utci.js" {
  export function utci(
    tdb: number,
    tr: number,
    v: number,
    rh: number,
    units?: "SI" | "IP",
    return_stress_category?: boolean,
    limit_inputs?: boolean,
  ): { utci: number; stress_category?: string };
}
declare module "jsthermalcomfort/lib/esm/models/solar_gain.js" {
  export function solar_gain(
    sol_altitude: number,
    sharp: number,
    sol_radiation_dir: number,
    sol_transmittance: number,
    f_svv: number,
    f_bes: number,
    asw?: number,
    posture?: "standing" | "supine" | "sitting",
    floor_reflectance?: number,
  ): { erf: number; delta_mrt: number };
}
