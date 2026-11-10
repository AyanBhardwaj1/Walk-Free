import {
  Bloom,
  EffectComposer,
  N8AO,
  SMAA,
  Vignette,
} from "@react-three/postprocessing";

/**
 * The Cinematic look's finish, with the open-source pmndrs postprocessing
 * library: ambient occlusion (N8AO) so streets read as deep canyons
 * between buildings, a soft bloom on lights (strongest at night, when
 * windows and street lamps glow), a light vignette, and SMAA edges.
 * Loaded only when Cinematic is chosen.
 */
export default function CinematicEffects({
  night,
  extent,
}: {
  night: boolean;
  /** The map's size, metres: occlusion reaches a share of it. */
  extent: number;
}) {
  return (
    <EffectComposer multisampling={0}>
      <N8AO
        aoRadius={Math.max(8, Math.min(40, extent / 60))}
        distanceFalloff={1}
        intensity={night ? 1.6 : 2.4}
        quality="medium"
        halfRes
      />
      <Bloom
        mipmapBlur
        luminanceThreshold={night ? 0.55 : 0.9}
        intensity={night ? 0.9 : 0.25}
      />
      <Vignette eskil={false} offset={0.25} darkness={0.45} />
      <SMAA />
    </EffectComposer>
  );
}
