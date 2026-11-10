/**
 * Whether a walking-graph node is on an upper (or lower) floor of a mapped
 * interior. Such nodes share their map position with the floors around
 * them, so a tap or a GPS fix must never snap to them. Ids come from
 * place.ts: "indoor:<building>:f<floor>n<k>" (corridors) or "…r<k>" (rooms).
 */
export const upstairs = (id: string) => /^indoor:.+:f-?\d+[nr]\d+$/.test(id);
