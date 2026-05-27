import * as THREE from "three";

export type FaceMaterialUniforms = {
  baseColor: THREE.ColorRepresentation;
  warmColor: THREE.ColorRepresentation;
  skinColorDefault?: THREE.ColorRepresentation;
  skinColor1?: THREE.ColorRepresentation;
  skinColor2?: THREE.ColorRepresentation;
  mainTex?: THREE.Texture | null;
  shadowTex?: THREE.Texture | null;
  faceShadowTex?: THREE.Texture | null;
  lightDirection: THREE.Vector3;
  lightIntensity: number;
  ambientIntensity: number;
  faceSoftness: number;
};

export function createSekaiFaceMaterial(initial: FaceMaterialUniforms) {
  return new THREE.ShaderMaterial({
    transparent: false,
    depthWrite: true,
    side: THREE.DoubleSide,
    uniforms: {
      uBaseColor: { value: new THREE.Color(initial.baseColor) },
      uWarmColor: { value: new THREE.Color(initial.warmColor) },
      uSkinColorDefault: { value: new THREE.Color(initial.skinColorDefault ?? initial.baseColor) },
      uSkinColor1: { value: new THREE.Color(initial.skinColor1 ?? initial.warmColor) },
      uSkinColor2: { value: new THREE.Color(initial.skinColor2 ?? initial.warmColor) },
      uMainTex: { value: initial.mainTex ?? null },
      uShadowTex: { value: initial.shadowTex ?? null },
      uFaceShadowTex: { value: initial.faceShadowTex ?? null },
      uUseMainTex: { value: initial.mainTex ? 1.0 : 0.0 },
      uUseShadowTex: { value: initial.shadowTex ? 1.0 : 0.0 },
      uUseFaceShadowTex: { value: initial.faceShadowTex ? 1.0 : 0.0 },
      uLightDirection: { value: initial.lightDirection.clone().normalize() },
      uFaceRight: { value: new THREE.Vector3(1, 0, 0) },
      uFaceForward: { value: new THREE.Vector3(0, 0, 1) },
      uLightIntensity: { value: initial.lightIntensity },
      uAmbientIntensity: { value: initial.ambientIntensity },
      uFaceSoftness: { value: initial.faceSoftness },
    },
    vertexShader: `
      #include <common>
      #include <uv_pars_vertex>
      #include <skinning_pars_vertex>
      #include <morphtarget_pars_vertex>

      varying vec3 vWorldNormal;
      varying vec2 vUv;
      varying vec2 vFaceShadowUv;

      void main() {
        #include <uv_vertex>
        #include <beginnormal_vertex>
        #include <morphnormal_vertex>
        #include <skinbase_vertex>
        #include <skinnormal_vertex>
        #include <defaultnormal_vertex>
        #include <begin_vertex>
        #include <morphtarget_vertex>
        #include <skinning_vertex>

        vec4 worldPosition = modelMatrix * vec4(transformed, 1.0);
        vWorldNormal = normalize(mat3(modelMatrix) * objectNormal);
        vUv = uv;
        #ifdef USE_UV1
          vFaceShadowUv = uv1;
        #else
          vFaceShadowUv = uv;
        #endif
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
      }
    `,
    fragmentShader: `
      #include <common>

      uniform vec3 uBaseColor;
      uniform vec3 uWarmColor;
      uniform vec3 uSkinColorDefault;
      uniform vec3 uSkinColor1;
      uniform vec3 uSkinColor2;
      uniform sampler2D uMainTex;
      uniform sampler2D uShadowTex;
      uniform sampler2D uFaceShadowTex;
      uniform float uUseMainTex;
      uniform float uUseShadowTex;
      uniform float uUseFaceShadowTex;
      uniform vec3 uLightDirection;
      uniform vec3 uFaceRight;
      uniform vec3 uFaceForward;
      uniform float uLightIntensity;
      uniform float uAmbientIntensity;
      uniform float uFaceSoftness;

      varying vec3 vWorldNormal;
      varying vec2 vUv;
      varying vec2 vFaceShadowUv;

      vec3 outputColor(vec3 color) {
        bvec3 cutoff = lessThanEqual(color, vec3(0.0031308));
        vec3 lower = color * 12.92;
        vec3 higher = pow(max(color, vec3(0.0)), vec3(1.0 / 2.4)) * 1.055 - vec3(0.055);
        return mix(higher, lower, vec3(cutoff));
      }

      void main() {
        vec4 mainSample = vec4(1.0);
        vec3 mainColor = uBaseColor;
        if (uUseMainTex > 0.5) {
          mainSample = texture2D(uMainTex, vUv);
          mainColor = mainSample.rgb;
        }

        // sssekai imports Character Tint face material with directional shadow disabled.
        vec3 skinTint = uSkinColorDefault;
        float skinMask = smoothstep(0.18, 0.62, mainSample.r - max(mainSample.g, mainSample.b) * 0.14);
        vec3 color = mix(mainColor, mix(mainColor, skinTint, 0.18), skinMask * 0.12);
        if (uUseShadowTex > 0.5 && uUseFaceShadowTex > 0.5) {
          vec3 shadowColor = texture2D(uShadowTex, vUv).rgb;
          vec3 lightDir = normalize(uLightDirection);
          float faceSide = dot(lightDir, normalize(uFaceRight));
          float faceFront = dot(lightDir, normalize(uFaceForward));
          vec2 sdfUv = vFaceShadowUv;
          if (faceSide < 0.0) {
            sdfUv.x = 1.0 - sdfUv.x;
          }
          vec3 sdfColor = texture2D(uFaceShadowTex, sdfUv).rgb;
          float sdfLimit = clamp(1.0 - (faceFront * 0.5 + 0.5), 0.02, 0.98);
          float sdfWidth = mix(0.015, 0.12, clamp(uFaceSoftness, 0.0, 1.0));
          float sdfMask = 1.0 - smoothstep(sdfLimit - sdfWidth, sdfLimit + sdfWidth, sdfColor.r);
          vec3 softFaceShadow = mix(mainColor, shadowColor, 0.24);
          color = mix(color, softFaceShadow, sdfMask * skinMask * 0.28);
        }
        float sceneExposure = clamp(0.88 + uLightIntensity * 0.25 + uAmbientIntensity * 0.18, 0.82, 1.18);
        color *= sceneExposure * vec3(1.01, 0.998, 0.986);
        gl_FragColor = vec4(outputColor(clamp(color, 0.0, 1.0)), 1.0);
      }
    `,
  });
}

export function updateSekaiFaceMaterial(
  material: THREE.ShaderMaterial,
  next: FaceMaterialUniforms
) {
  material.uniforms.uBaseColor.value.set(next.baseColor);
  material.uniforms.uWarmColor.value.set(next.warmColor);
  material.uniforms.uSkinColorDefault.value.set(next.skinColorDefault ?? next.baseColor);
  material.uniforms.uSkinColor1.value.set(next.skinColor1 ?? next.warmColor);
  material.uniforms.uSkinColor2.value.set(next.skinColor2 ?? next.warmColor);
  material.uniforms.uMainTex.value = next.mainTex ?? null;
  material.uniforms.uShadowTex.value = next.shadowTex ?? null;
  material.uniforms.uFaceShadowTex.value = next.faceShadowTex ?? null;
  material.uniforms.uUseMainTex.value = next.mainTex ? 1.0 : 0.0;
  material.uniforms.uUseShadowTex.value = next.shadowTex ? 1.0 : 0.0;
  material.uniforms.uUseFaceShadowTex.value = next.faceShadowTex ? 1.0 : 0.0;
  material.uniforms.uLightDirection.value.copy(
    next.lightDirection.clone().normalize()
  );
  material.uniforms.uLightIntensity.value = next.lightIntensity;
  material.uniforms.uAmbientIntensity.value = next.ambientIntensity;
  material.uniforms.uFaceSoftness.value = next.faceSoftness;
}

export function updateSekaiFaceBasis(
  material: THREE.ShaderMaterial,
  faceRight: THREE.Vector3,
  faceForward: THREE.Vector3
) {
  material.uniforms.uFaceRight?.value.copy(faceRight).normalize();
  material.uniforms.uFaceForward?.value.copy(faceForward).normalize();
}
