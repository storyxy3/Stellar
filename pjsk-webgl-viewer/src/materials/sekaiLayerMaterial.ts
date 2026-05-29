import * as THREE from "three";

export type SekaiLayerMode = "alpha" | "add" | "eye" | "eyelight";

export type SekaiLayerAtlas = {
  tileX: number;
  tileY: number;
  sample: number;
  enabled?: boolean;
};

export type SekaiLayerOptions = {
  tintColor?: THREE.ColorRepresentation | null;
  emissionColor?: THREE.ColorRepresentation | null;
  lightInfluence?: number | null;
  highlightInfluence?: number | null;
  vertexBViewOffset?: number | null;
  distortionFps?: number | null;
  distortionIntensity?: number | null;
  distortionIntensityX?: number | null;
  distortionIntensityY?: number | null;
  distortionOffsetX?: number | null;
  distortionOffsetY?: number | null;
  distortionScrollSpeed?: number | null;
  distortionScrollX?: number | null;
  distortionScrollY?: number | null;
  distortionTexTilingX?: number | null;
  distortionTexTilingY?: number | null;
  threshold?: number | null;
};

export function createSekaiLayerMaterial(
  texture: THREE.Texture | null,
  mode: SekaiLayerMode = "alpha",
  atlas?: SekaiLayerAtlas | null,
  options?: SekaiLayerOptions
) {
  const isAdditive = mode === "add" || mode === "eyelight";
  const isEyelight = mode === "eyelight";
  const atlasTileX = atlas && atlas.tileX > 0 ? atlas.tileX : 1;
  const atlasTileY = atlas && atlas.tileY > 0 ? atlas.tileY : 1;
  const atlasSample = Math.max(0, atlas?.sample ?? 0);
  const useVertexBViewOffset = (options?.vertexBViewOffset ?? 0.0) > 0.0;
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
    vertexColors: useVertexBViewOffset,
    blending: isAdditive ? THREE.AdditiveBlending : THREE.NormalBlending,
    polygonOffset: true,
    polygonOffsetFactor: isEyelight ? -2 : -1,
    polygonOffsetUnits: isEyelight ? -2 : -1,
    uniforms: {
      uMainTex: { value: texture },
      uUseMainTex: { value: texture ? 1.0 : 0.0 },
      uMode: { value: mode === "eye" ? 1.0 : isEyelight ? 2.0 : 0.0 },
      uTintColor: { value: new THREE.Color(options?.tintColor ?? "#ffffff") },
      uEmissionColor: { value: new THREE.Color(options?.emissionColor ?? "#000000") },
      uAtlasTile: { value: new THREE.Vector2(atlasTileX, atlasTileY) },
      uAtlasSample: { value: atlasSample },
      uUseAtlas: { value: atlas?.enabled === false ? 0.0 : atlas ? 1.0 : 0.0 },
      uTime: { value: 0.0 },
      uLightInfluence: { value: THREE.MathUtils.clamp(options?.lightInfluence ?? 1.0, 0.0, 1.0) },
      uHighlightInfluence: { value: THREE.MathUtils.clamp(options?.highlightInfluence ?? 1.0, 0.0, 1.0) },
      uVertexBViewOffset: { value: Math.max(0.0, options?.vertexBViewOffset ?? 0.0) },
      uDistortionFps: { value: Math.max(1.0, options?.distortionFps ?? 12.0) },
      uDistortionIntensity: { value: Math.max(0.0, options?.distortionIntensity ?? (isEyelight ? 1.0 : 0.0)) },
      uDistortionIntensityXY: {
        value: new THREE.Vector2(
          Math.max(0.0, options?.distortionIntensityX ?? (isEyelight ? 1.0 : 0.0)),
          Math.max(0.0, options?.distortionIntensityY ?? (isEyelight ? 1.0 : 0.0))
        ),
      },
      uDistortionOffset: {
        value: new THREE.Vector2(options?.distortionOffsetX ?? 0.0, options?.distortionOffsetY ?? 0.0),
      },
      uDistortionScroll: {
        value: new THREE.Vector2(options?.distortionScrollX ?? 0.5, options?.distortionScrollY ?? 0.5),
      },
      uDistortionScrollSpeed: { value: options?.distortionScrollSpeed ?? 1.0 },
      uDistortionTexTiling: {
        value: new THREE.Vector2(
          Math.max(0.001, options?.distortionTexTilingX ?? 1.0),
          Math.max(0.001, options?.distortionTexTilingY ?? 1.0)
        ),
      },
      uThreshold: { value: THREE.MathUtils.clamp(options?.threshold ?? 0.5, 0.0, 1.0) },
    },
    vertexShader: `
      #include <common>
      #include <uv_pars_vertex>
      #include <color_pars_vertex>
      #include <skinning_pars_vertex>
      #include <morphtarget_pars_vertex>

      uniform float uVertexBViewOffset;

      varying vec2 vUv;
      varying vec3 vViewNormal;

      void main() {
        #include <uv_vertex>
        #include <color_vertex>
        #include <beginnormal_vertex>
        #include <morphnormal_vertex>
        #include <skinbase_vertex>
        #include <skinnormal_vertex>
        #include <defaultnormal_vertex>
        #include <begin_vertex>
        #include <morphtarget_vertex>
        #include <skinning_vertex>

        vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0);
        #ifdef USE_COLOR
        mvPosition.z += clamp(vColor.b, 0.0, 1.0) * uVertexBViewOffset;
        #endif
        vUv = uv;
        vViewNormal = normalize(normalMatrix * objectNormal);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      #include <common>

      uniform sampler2D uMainTex;
      uniform float uUseMainTex;
      uniform float uMode;
      uniform vec3 uTintColor;
      uniform vec3 uEmissionColor;
      uniform vec2 uAtlasTile;
      uniform float uAtlasSample;
      uniform float uUseAtlas;
      uniform float uTime;
      uniform float uLightInfluence;
      uniform float uHighlightInfluence;
      uniform float uDistortionFps;
      uniform float uDistortionIntensity;
      uniform vec2 uDistortionIntensityXY;
      uniform vec2 uDistortionOffset;
      uniform vec2 uDistortionScroll;
      uniform float uDistortionScrollSpeed;
      uniform vec2 uDistortionTexTiling;
      uniform float uThreshold;

      varying vec2 vUv;
      varying vec3 vViewNormal;

      vec3 outputColor(vec3 color) {
        bvec3 cutoff = lessThanEqual(color, vec3(0.0031308));
        vec3 lower = color * 12.92;
        vec3 higher = pow(max(color, vec3(0.0)), vec3(1.0 / 2.4)) * 1.055 - vec3(0.055);
        return mix(higher, lower, vec3(cutoff));
      }

      void main() {
        vec2 uv = vUv;
        if (uUseAtlas > 0.5) {
          vec2 tile = max(uAtlasTile, vec2(1.0));
          float sampleIndex = floor(max(uAtlasSample, 0.0));
          float tileX = mod(sampleIndex, tile.x);
          float tileY = floor(sampleIndex / tile.x);
          uv = (uv + vec2(tileX, tileY)) / tile;
        }
        if (uMode > 1.5) {
          float steppedTime = floor(uTime * uDistortionFps) / uDistortionFps;
          vec2 distortionUv = uv * uDistortionTexTiling
            + uDistortionOffset
            + uDistortionScroll * steppedTime * uDistortionScrollSpeed;
          vec2 proceduralDistortion = vec2(
            sin((distortionUv.x + distortionUv.y) * 6.2831853),
            cos((distortionUv.x - distortionUv.y) * 6.2831853)
          ) * 0.5 + vec2(
            sin(distortionUv.y * 12.5663706 + steppedTime),
            cos(distortionUv.x * 12.5663706 - steppedTime)
          ) * 0.25;
          float edge = 1.0 - clamp(abs(vViewNormal.z), 0.0, 1.0);
          vec2 normalDrift = normalize(vViewNormal.xy + vec2(0.0001)) * edge * 0.0045;
          vec2 distortion = proceduralDistortion * uDistortionIntensityXY * 0.0032 * uDistortionIntensity;
          uv += (normalDrift + distortion) * mix(0.25, 1.0, uHighlightInfluence);
        }
        vec4 sampleColor = uUseMainTex > 0.5 ? texture2D(uMainTex, uv) : vec4(1.0);
        float alpha = sampleColor.a;
        if (uMode > 1.5) {
          float brightness = max(max(sampleColor.r, sampleColor.g), sampleColor.b);
          float alphaHigh = mix(0.075, 0.18, uThreshold);
          alpha = smoothstep(0.012, alphaHigh, brightness);
        }
        if (alpha < 0.001) {
          discard;
        }
        vec3 color = sampleColor.rgb * uTintColor + uEmissionColor;
        if (uMode > 0.5 && uMode < 1.5) {
          color *= mix(1.0, 1.04, uLightInfluence);
        }
        if (uMode > 1.5) {
          float brightness = max(max(sampleColor.r, sampleColor.g), sampleColor.b);
          color = max(color, vec3(brightness) * uTintColor);
          color *= 0.95 + alpha * mix(0.45, 0.72, uHighlightInfluence);
          alpha = clamp(alpha * mix(0.9, 1.2, uHighlightInfluence), 0.0, 1.0);
        }
        gl_FragColor = vec4(outputColor(clamp(color, 0.0, 1.0)), alpha);
      }
    `,
  });
  material.forceSinglePass = true;
  return material;
}
