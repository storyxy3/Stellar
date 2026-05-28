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
  faceSdfUseLightDirection?: number;
  faceDebugMode?: number;
  faceDebugLightMode?: number;
  faceSdfEnabled?: boolean;
};

export function createSekaiFaceMaterial(initial: FaceMaterialUniforms) {
  return new THREE.ShaderMaterial({
    defines: {
      USE_UV1: "",
    },
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
      uFaceSdfUseLightDirection: { value: initial.faceSdfUseLightDirection ?? 0.5 },
      uFaceDebugMode: { value: initial.faceDebugMode ?? 0 },
      uFaceDebugLightMode: { value: initial.faceDebugLightMode ?? 0 },
      uFaceSdfEnabled: { value: initial.faceSdfEnabled === false ? 0.0 : 1.0 },
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
      uniform float uFaceSdfUseLightDirection;
      uniform float uFaceDebugMode;
      uniform float uFaceDebugLightMode;
      uniform float uFaceSdfEnabled;

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

        vec3 color = mainColor;
        float faceSkinLuma = dot(mainColor, vec3(0.299, 0.587, 0.114));
        float faceSkinMask = smoothstep(0.46, 0.82, faceSkinLuma) * (1.0 - smoothstep(0.92, 0.99, faceSkinLuma));
        vec3 faceSkinTint = color * vec3(1.035, 0.970, 0.945);
        color = mix(color, faceSkinTint, faceSkinMask * 0.58);
        if ((uFaceSdfEnabled > 0.5 || uFaceDebugMode > 0.5) && uUseShadowTex > 0.5 && uUseFaceShadowTex > 0.5) {
          vec3 shadowColor = texture2D(uShadowTex, vUv).rgb;
          shadowColor = mix(shadowColor, shadowColor * vec3(1.075, 0.930, 1.015), faceSkinMask * 0.75);
          vec3 faceRight = normalize(uFaceRight);
          vec3 faceForward = normalize(uFaceForward);
          vec3 lightDir = normalize(uLightDirection);
          if (uFaceDebugLightMode > 0.5) {
            if (uFaceDebugLightMode < 1.5) {
              lightDir = faceForward;
            } else if (uFaceDebugLightMode < 2.5) {
              lightDir = -faceRight;
            } else if (uFaceDebugLightMode < 3.5) {
              lightDir = faceRight;
            } else {
              lightDir = -faceForward;
            }
          }
          vec2 rawFaceLight = vec2(dot(lightDir, faceRight), dot(lightDir, faceForward));
          vec2 faceLight = rawFaceLight / max(length(rawFaceLight), 0.001);
          float faceSide = faceLight.x;
          float faceFront = faceLight.y;
          vec2 sdfUv = vFaceShadowUv;
          // SekaiShaderTextureHelper does abs(uv * -1 + FlipX):
          // a positive helper sign flips X, while zero/negative keeps the
          // repeated texture on the original side. Keep a neutral zone so
          // back/near-back light does not jitter between both SDF halves.
          if (faceSide > 0.05) {
            sdfUv.x = 1.0 - sdfUv.x;
          }
          float sdfValue = texture2D(uFaceShadowTex, sdfUv).r;
          // sssekai helper semantics: compare SDF against horizontal angle
          // acos(max(dot(front, light), 0)) / (pi / 2). Flip only mirrors UV.
          float sdfLimit = acos(max(faceFront, 0.0)) / 1.5707963;
          sdfLimit *= clamp(uFaceSdfUseLightDirection, 0.0, 1.0);
          sdfLimit = clamp(sdfLimit, 0.015, 0.985);
          float sdfWidth = mix(0.018, 0.11, clamp(uFaceSoftness, 0.0, 1.0));
          float sideGate = smoothstep(0.035, 0.18, abs(faceSide));
          float sdfMask = 1.0 - smoothstep(sdfLimit - sdfWidth, sdfLimit + sdfWidth, sdfValue);
          sdfMask *= sideGate;
          if (uFaceDebugMode > 0.5) {
            if (uFaceDebugMode < 1.5) {
              gl_FragColor = vec4(outputColor(vec3(sdfValue)), 1.0);
              return;
            }
            if (uFaceDebugMode < 2.5) {
              gl_FragColor = vec4(outputColor(vec3(sdfMask)), 1.0);
              return;
            }
            if (uFaceDebugMode < 3.5) {
              gl_FragColor = vec4(outputColor(vec3(sdfLimit)), 1.0);
              return;
            }
            gl_FragColor = vec4(outputColor(max(vec3(faceSide, -faceSide, faceFront), vec3(0.0))), 1.0);
            return;
          }
          if (uFaceSdfEnabled > 0.5) {
            color = mix(mainColor, shadowColor, sdfMask);
          }
        }
        float sceneExposure = clamp(0.86 + uLightIntensity * 0.24 + uAmbientIntensity * 0.16, 0.80, 1.16);
        color *= sceneExposure * vec3(1.018, 0.992, 0.980);
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
  if (next.faceSdfUseLightDirection !== undefined && material.uniforms.uFaceSdfUseLightDirection) {
    material.uniforms.uFaceSdfUseLightDirection.value = next.faceSdfUseLightDirection;
  }
  if (next.faceDebugMode !== undefined) {
    material.uniforms.uFaceDebugMode.value = next.faceDebugMode;
  }
  if (next.faceDebugLightMode !== undefined) {
    material.uniforms.uFaceDebugLightMode.value = next.faceDebugLightMode;
  }
  if (next.faceSdfEnabled !== undefined && material.uniforms.uFaceSdfEnabled) {
    material.uniforms.uFaceSdfEnabled.value = next.faceSdfEnabled ? 1.0 : 0.0;
  }
}

export function updateSekaiFaceBasis(
  material: THREE.ShaderMaterial,
  faceRight: THREE.Vector3,
  faceForward: THREE.Vector3
) {
  material.uniforms.uFaceRight?.value.copy(faceRight).normalize();
  material.uniforms.uFaceForward?.value.copy(faceForward).normalize();
}
