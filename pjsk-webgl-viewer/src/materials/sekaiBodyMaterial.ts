import * as THREE from "three";

export type BodyMaterialUniforms = {
  baseColor: THREE.ColorRepresentation;
  shadowColor: THREE.ColorRepresentation;
  skinColorDefault?: THREE.ColorRepresentation;
  skinColor1?: THREE.ColorRepresentation;
  skinColor2?: THREE.ColorRepresentation;
  mainTex?: THREE.Texture | null;
  shadowTex?: THREE.Texture | null;
  valueTex?: THREE.Texture | null;
  lightDirection: THREE.Vector3;
  lightIntensity: number;
  ambientIntensity: number;
  shadowThreshold: number;
  shadowWeight: number;
  shadowWidth?: number;
  characterAmbientIntensity?: number;
  rimIntensity?: number;
  controllerRimThreshold?: number;
  rimDirectionality?: number;
  rimDirection?: THREE.Vector3;
  specularPower?: number;
  rimThreshold?: number;
  shadowTexWeight?: number;
  saturation?: number;
  partsAmbientColor?: THREE.ColorRepresentation;
  reflectionBlendColor?: THREE.ColorRepresentation;
  globalShadowColor?: THREE.ColorRepresentation;
  controllerAmbientColor?: THREE.ColorRepresentation;
  controllerRimColor?: THREE.ColorRepresentation;
  controllerShadowRimColor?: THREE.ColorRepresentation;
  controllerRimColorWeight?: number;
  controllerShadowRimColorWeight?: number;
  controllerRimEdgeSmoothness?: number;
  controllerRimShadowSharpness?: number;
  skinTintEnabled?: boolean;
};

export function createSekaiBodyMaterial(initial: BodyMaterialUniforms) {
  return new THREE.ShaderMaterial({
    transparent: false,
    depthWrite: true,
    side: THREE.DoubleSide,
    vertexColors: true,
    uniforms: {
      uBaseColor: { value: new THREE.Color(initial.baseColor) },
      uShadowColor: { value: new THREE.Color(initial.shadowColor) },
      uSkinColorDefault: { value: new THREE.Color(initial.skinColorDefault ?? initial.baseColor) },
      uSkinColor1: { value: new THREE.Color(initial.skinColor1 ?? initial.shadowColor) },
      uSkinColor2: { value: new THREE.Color(initial.skinColor2 ?? initial.skinColor1 ?? initial.shadowColor) },
      uPartsAmbientColor: { value: new THREE.Color(initial.partsAmbientColor ?? "#ffffff") },
      uReflectionBlendColor: { value: new THREE.Color(initial.reflectionBlendColor ?? "#ffffff") },
      uGlobalShadowColor: { value: new THREE.Color(initial.globalShadowColor ?? "#ffffff") },
      uControllerAmbientColor: { value: new THREE.Color(initial.controllerAmbientColor ?? "#ffffff") },
      uControllerRimColor: { value: new THREE.Color(initial.controllerRimColor ?? "#e6edf9") },
      uControllerShadowRimColor: { value: new THREE.Color(initial.controllerShadowRimColor ?? "#ffffff") },
      uControllerRimColorWeight: {
        value: initial.controllerRimColorWeight ?? (initial.controllerRimColor ? 1.0 : 0.0),
      },
      uControllerShadowRimColorWeight: {
        value: initial.controllerShadowRimColorWeight ?? (initial.controllerShadowRimColor ? 1.0 : 0.0),
      },
      uControllerRimEdgeSmoothness: { value: initial.controllerRimEdgeSmoothness ?? 0.38 },
      uControllerRimShadowSharpness: { value: initial.controllerRimShadowSharpness ?? 0.0 },
      uMainTex: { value: initial.mainTex ?? null },
      uShadowTex: { value: initial.shadowTex ?? null },
      uValueTex: { value: initial.valueTex ?? null },
      uUseMainTex: { value: initial.mainTex ? 1.0 : 0.0 },
      uUseShadowTex: { value: initial.shadowTex ? 1.0 : 0.0 },
      uUseValueTex: { value: initial.valueTex ? 1.0 : 0.0 },
      uLightDirection: { value: initial.lightDirection.clone().normalize() },
      uCameraPosition: { value: new THREE.Vector3() },
      uLightIntensity: { value: initial.lightIntensity },
      uAmbientIntensity: { value: initial.ambientIntensity },
      uShadowThreshold: { value: initial.shadowThreshold },
      uShadowWeight: { value: initial.shadowWeight },
      uShadowWidth: { value: initial.shadowWidth ?? 0.04 },
      uCharacterAmbientIntensity: { value: initial.characterAmbientIntensity ?? 0.3 },
      uRimIntensity: { value: initial.rimIntensity ?? 0.35 },
      uControllerRimThreshold: { value: initial.controllerRimThreshold ?? 0.18 },
      uRimDirectionality: { value: initial.rimDirectionality ?? 0.85 },
      uRimDirection: {
        value: (initial.rimDirection ?? new THREE.Vector3(0, 0.70710678, -0.70710678)).clone().normalize(),
      },
      uSpecularPower: { value: initial.specularPower ?? 0 },
      uRimThreshold: { value: initial.rimThreshold ?? 0.2 },
      uShadowTexWeight: { value: initial.shadowTexWeight ?? 1 },
      uSaturation: { value: initial.saturation ?? 0.5 },
      uSkinTintEnabled: { value: initial.skinTintEnabled === false ? 0.0 : 1.0 },
    },
    vertexShader: `
      #include <common>
      #include <uv_pars_vertex>
      #include <color_pars_vertex>
      #include <skinning_pars_vertex>

      varying vec3 vWorldPosition;
      varying vec3 vWorldNormal;
      varying vec2 vUv;

      void main() {
        #include <uv_vertex>
        #include <color_vertex>
        #include <skinbase_vertex>
        #include <beginnormal_vertex>
        #include <skinnormal_vertex>
        #include <defaultnormal_vertex>
        #include <begin_vertex>
        #include <skinning_vertex>

        vec4 worldPosition = modelMatrix * vec4(transformed, 1.0);
        vWorldPosition = worldPosition.xyz;
        vWorldNormal = normalize(mat3(modelMatrix) * objectNormal);
        vUv = uv;
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
      }
    `,
    fragmentShader: `
      #include <common>
      #include <color_pars_fragment>

      uniform vec3 uBaseColor;
      uniform vec3 uShadowColor;
      uniform vec3 uSkinColorDefault;
      uniform vec3 uSkinColor1;
      uniform vec3 uSkinColor2;
      uniform vec3 uPartsAmbientColor;
      uniform vec3 uReflectionBlendColor;
      uniform vec3 uGlobalShadowColor;
      uniform vec3 uControllerAmbientColor;
      uniform vec3 uControllerRimColor;
      uniform vec3 uControllerShadowRimColor;
      uniform float uControllerRimColorWeight;
      uniform float uControllerShadowRimColorWeight;
      uniform float uControllerRimEdgeSmoothness;
      uniform float uControllerRimShadowSharpness;
      uniform sampler2D uMainTex;
      uniform sampler2D uShadowTex;
      uniform sampler2D uValueTex;
      uniform float uUseMainTex;
      uniform float uUseShadowTex;
      uniform float uUseValueTex;
      uniform vec3 uLightDirection;
      uniform vec3 uCameraPosition;
      uniform float uLightIntensity;
      uniform float uAmbientIntensity;
      uniform float uShadowThreshold;
      uniform float uShadowWeight;
      uniform float uShadowWidth;
      uniform float uCharacterAmbientIntensity;
      uniform float uRimIntensity;
      uniform float uControllerRimThreshold;
      uniform float uRimDirectionality;
      uniform vec3 uRimDirection;
      uniform float uSpecularPower;
      uniform float uRimThreshold;
      uniform float uShadowTexWeight;
      uniform float uSaturation;
      uniform float uSkinTintEnabled;

      varying vec3 vWorldPosition;
      varying vec3 vWorldNormal;
      varying vec2 vUv;

      vec3 outputColor(vec3 color) {
        bvec3 cutoff = lessThanEqual(color, vec3(0.0031308));
        vec3 lower = color * 12.92;
        vec3 higher = pow(max(color, vec3(0.0)), vec3(1.0 / 2.4)) * 1.055 - vec3(0.055);
        return mix(higher, lower, vec3(cutoff));
      }

      vec3 applyMaterialSaturation(vec3 color, float saturation) {
        float gray = dot(color, vec3(0.299, 0.587, 0.114));
        float amount = clamp(1.0 + (saturation - 0.5) * 0.35, 0.65, 1.35);
        return mix(vec3(gray), color, amount);
      }

      float toonBand(float value, float threshold, float width) {
        return smoothstep(threshold - width, threshold + width, value);
      }

      void main() {
        vec3 normal = normalize(vWorldNormal);
        vec3 lightDir = normalize(uLightDirection);
        vec3 viewDir = normalize(uCameraPosition - vWorldPosition);
        float ndl = dot(normal, lightDir);
        vec4 mainSample = vec4(1.0);
        vec3 mainColor = uBaseColor;
        if (uUseMainTex > 0.5) {
          mainSample = texture2D(uMainTex, vUv);
          mainColor = mainSample.rgb;
        }
        vec3 shadowValue = mainColor;
        if (uUseShadowTex > 0.5) {
          shadowValue = mix(shadowValue, texture2D(uShadowTex, vUv).rgb, clamp(uShadowTexWeight, 0.0, 1.0));
        }
        vec4 valueSample = vec4(0.0, 0.0, 1.0, 0.0);
        if (uUseValueTex > 0.5) {
          valueSample = texture2D(uValueTex, vUv);
        }
        float skinMask = (uSkinTintEnabled > 0.5 && uUseValueTex > 0.5) ? step(0.5, valueSample.r) : 0.0;
        float skinTextureLuma = dot(mainColor, vec3(0.299, 0.587, 0.114));
        float skinLinePreserve = smoothstep(0.36, 0.72, skinTextureLuma);
        float skinTintMask = skinMask * skinLinePreserve;
        float skinRamp = smoothstep(0.36, 0.92, mainSample.r);
        vec3 skinLitColor = mix(uSkinColor1, uSkinColorDefault, skinRamp) * vec3(1.015, 0.998, 0.986);
        vec3 skinShadowRampColor = mix(uSkinColor2, uSkinColor1, skinRamp);
        vec3 skinShadowColor = mix(skinShadowRampColor, skinLitColor, 0.18);
        mainColor = mix(mainColor, skinLitColor, skinTintMask);
        shadowValue = mix(shadowValue, skinShadowColor, skinTintMask);
        float hMask = valueSample.b;
        float hAlpha = valueSample.a;

        float halfNdl = clamp(ndl * 0.5 + 0.5, 0.0, 1.0);
        float hShadowOffset = (uUseValueTex > 0.5) ? valueSample.b * 2.0 - 1.0 : 0.0;
        float shadowLuma = clamp(halfNdl + hShadowOffset, 0.0, 1.0);
        float materialShadowThreshold = clamp(uShadowThreshold, 0.0, 1.0);
        float shadowWidth = max(uShadowWidth, 0.001);
        float litBand = smoothstep(
          materialShadowThreshold - shadowWidth,
          materialShadowThreshold + shadowWidth,
          shadowLuma
        );
        float shadowBand = clamp((1.0 - litBand) * uShadowWeight, 0.0, 1.0);

        // PJSK character shader semantics: C is the lit color; S already owns the toon-shadow target color.
        vec3 fallbackShadowColor = mainColor * uShadowColor * uGlobalShadowColor;
        vec3 shadowColor = (uUseShadowTex > 0.5) ? shadowValue * uGlobalShadowColor : fallbackShadowColor;
        vec3 color = mix(mainColor, shadowColor, shadowBand);

        vec3 partsAmbient = mix(vec3(1.0), uPartsAmbientColor, 0.62);
        float characterAmbient = clamp(uAmbientIntensity + uCharacterAmbientIntensity, 0.0, 1.0);
        vec3 ambientTarget = max(color, mainColor * partsAmbient * uControllerAmbientColor);
        color = mix(color, ambientTarget, characterAmbient * 0.18 * (0.35 + shadowBand * 0.65));

        float halfLambert = clamp(dot(normal, normalize(lightDir + viewDir)), 0.0, 1.0);
        float specPower = 10.0 / max(uSpecularPower, 0.001);
        float specMask = max(hAlpha, hMask * 0.35) * step(0.01, uSpecularPower);
        float litGate = toonBand(ndl, -0.02, 0.12);
        float specular = pow(halfLambert, specPower) * specMask * litGate;

        float nDotV = clamp(dot(normal, viewDir), 0.0, 1.0);
        vec3 rimDirection = normalize(uRimDirection);
        float nDotRim = dot(normal, rimDirection);
        float vDotRim = max(dot(viewDir, rimDirection), 0.0);
        float rimFactorX = 7.2;
        float rimFactorZ = clamp(uControllerRimEdgeSmoothness, 0.02, 1.0);
        float rimFactorW = clamp(uRimDirectionality, 0.0, 1.0);
        float viewFresnel = pow(1.0 - nDotV, 10.0 - rimFactorX);
        float rimViewModulation = max(0.0, 1.0 + rimFactorW * (vDotRim - 1.0));
        float rimBase = viewFresnel * rimViewModulation * step(0.0, nDotRim);
        float rimThreshold = clamp(max(uRimThreshold, uControllerRimThreshold), 0.0, 0.95);
        float rim = smoothstep(0.0, rimFactorZ, rimBase - rimThreshold);
        float rimMask = max(hMask, hAlpha);
        vec3 controllerRimBase = mix(
          vec3(0.9, 0.93, 0.98),
          uControllerRimColor,
          clamp(uControllerRimColorWeight, 0.0, 1.0)
        );
        vec3 rimLitColor = mix(controllerRimBase, uReflectionBlendColor, 0.2);
        vec3 controllerShadowRimBase = mix(
          shadowColor,
          uControllerShadowRimColor,
          clamp(uControllerShadowRimColorWeight, 0.0, 1.0)
        );
        vec3 rimShadowColor = mix(controllerShadowRimBase, rimLitColor, 0.42);
        float rimShadowTransitionWidth = mix(1.0, 0.08, clamp(uControllerRimShadowSharpness, 0.0, 1.0));
        float rimColorMix = smoothstep(
          -rimShadowTransitionWidth * 0.5,
          rimShadowTransitionWidth * 0.5,
          nDotRim
        );
        vec3 rimColor = mix(rimLitColor, rimShadowColor, rimColorMix);
        float rimEnergy = 0.42 * uRimIntensity * clamp(0.72 + uLightIntensity, 0.0, 1.25);
        color += rimColor * rim * rimMask * rimEnergy * mix(0.42, 1.0, litBand);
        color += uReflectionBlendColor * specular * uLightIntensity * 0.22;

        color *= mix(vec3(1.0), uPartsAmbientColor, 0.06);
        color = applyMaterialSaturation(color, uSaturation);
        gl_FragColor = vec4(outputColor(clamp(color, 0.0, 1.0)), 1.0);
      }
    `,
  });
}

export function updateSekaiBodyMaterial(
  material: THREE.ShaderMaterial,
  next: BodyMaterialUniforms
) {
  material.uniforms.uBaseColor.value.set(next.baseColor);
  material.uniforms.uShadowColor.value.set(next.shadowColor);
  material.uniforms.uSkinColorDefault.value.set(next.skinColorDefault ?? next.baseColor);
  material.uniforms.uSkinColor1.value.set(next.skinColor1 ?? next.shadowColor);
  material.uniforms.uSkinColor2.value.set(next.skinColor2 ?? next.skinColor1 ?? next.shadowColor);
  material.uniforms.uPartsAmbientColor.value.set(next.partsAmbientColor ?? "#ffffff");
  material.uniforms.uReflectionBlendColor.value.set(next.reflectionBlendColor ?? "#ffffff");
  material.uniforms.uGlobalShadowColor.value.set(next.globalShadowColor ?? "#ffffff");
  material.uniforms.uControllerAmbientColor.value.set(next.controllerAmbientColor ?? "#ffffff");
  material.uniforms.uControllerRimColor.value.set(next.controllerRimColor ?? "#e6edf9");
  material.uniforms.uControllerShadowRimColor.value.set(next.controllerShadowRimColor ?? "#ffffff");
  material.uniforms.uControllerRimColorWeight.value =
    next.controllerRimColorWeight ?? (next.controllerRimColor ? 1.0 : 0.0);
  material.uniforms.uControllerShadowRimColorWeight.value =
    next.controllerShadowRimColorWeight ?? (next.controllerShadowRimColor ? 1.0 : 0.0);
  material.uniforms.uControllerRimEdgeSmoothness.value = next.controllerRimEdgeSmoothness ?? 0.38;
  material.uniforms.uControllerRimShadowSharpness.value = next.controllerRimShadowSharpness ?? 0.0;
  material.uniforms.uMainTex.value = next.mainTex ?? null;
  material.uniforms.uShadowTex.value = next.shadowTex ?? null;
  material.uniforms.uValueTex.value = next.valueTex ?? null;
  material.uniforms.uUseMainTex.value = next.mainTex ? 1.0 : 0.0;
  material.uniforms.uUseShadowTex.value = next.shadowTex ? 1.0 : 0.0;
  material.uniforms.uUseValueTex.value = next.valueTex ? 1.0 : 0.0;
  material.uniforms.uLightDirection.value.copy(
    next.lightDirection.clone().normalize()
  );
  material.uniforms.uLightIntensity.value = next.lightIntensity;
  material.uniforms.uAmbientIntensity.value = next.ambientIntensity;
  material.uniforms.uShadowThreshold.value = next.shadowThreshold;
  material.uniforms.uShadowWeight.value = next.shadowWeight;
  material.uniforms.uShadowWidth.value = next.shadowWidth ?? material.uniforms.uShadowWidth.value;
  material.uniforms.uCharacterAmbientIntensity.value = next.characterAmbientIntensity ?? 0.3;
  material.uniforms.uRimIntensity.value = next.rimIntensity ?? 0.35;
  material.uniforms.uControllerRimThreshold.value = next.controllerRimThreshold ?? 0.18;
  material.uniforms.uRimDirectionality.value = next.rimDirectionality ?? 0.85;
  material.uniforms.uRimDirection.value.copy(
    (next.rimDirection ?? new THREE.Vector3(0, 0.70710678, -0.70710678)).clone().normalize()
  );
  material.uniforms.uSpecularPower.value = next.specularPower ?? 0;
  material.uniforms.uRimThreshold.value = next.rimThreshold ?? 0.2;
  material.uniforms.uShadowTexWeight.value = next.shadowTexWeight ?? 1;
  material.uniforms.uSaturation.value = next.saturation ?? 0.5;
  material.uniforms.uSkinTintEnabled.value = next.skinTintEnabled === false ? 0.0 : 1.0;
}

export function updateSekaiBodyCamera(
  material: THREE.ShaderMaterial,
  cameraPosition: THREE.Vector3
) {
  material.uniforms.uCameraPosition.value.copy(cameraPosition);
}
