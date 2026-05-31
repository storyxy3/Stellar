import * as THREE from "three";
import {
  applyUtjLengthLimits,
  cacheUtjSpringBonePosition,
  checkUtjGroundCollision,
  checkUtjCollisions,
  computeUtjLocalRotation,
  computeAnimatedTipPosition,
  constrainUtjAngleLimit,
  createUtjSpringBoneState,
  updateUtjSpring,
  type UtjAngleLimit,
  type UtjCollider,
  type UtjLengthLimitTarget,
  type UtjSpringBoneState,
} from "./utjSpringBoneRuntime";

type JsonRecord = Record<string, unknown>;

type Candidate = {
  vrmExtensionDraft?: {
    colliders?: CandidateCollider[];
    colliderGroups?: CandidateColliderGroup[];
    springs?: CandidateSpring[];
  };
};

type CandidateCollider = {
  index?: number;
  name?: string;
  enabled?: boolean;
  linkedRenderer?: {
    fileId?: number;
    pathId?: number;
    name?: string | null;
    transformPath?: string | null;
  } | null;
  linkedRendererEnabled?: boolean | null;
  nodeName?: string | null;
  nodePath?: string | null;
  shape?: {
    sphere?: {
      offset?: number[];
      radius?: number;
    } | null;
    capsule?: {
      offset?: number[];
      radius?: number;
      tail?: number[];
    } | null;
    panel?: {
      width?: number;
      height?: number;
    } | null;
  };
};

type CandidateColliderGroup = {
  index?: number;
  colliders?: number[];
};

type CandidateSpring = {
  name?: string;
  managerPathId?: number;
  enabled?: boolean;
  dynamicRatio?: number;
  automaticUpdates?: boolean;
  enableLengthLimits?: boolean;
  enableAngleLimits?: boolean;
  enableCollision?: boolean;
  collideWithGround?: boolean;
  groundHeight?: number;
  isSumOfForcesOnBone?: boolean;
  isPaused?: boolean;
  simulationFrameRate?: number;
  slowMotionScale?: number;
  bounce?: number;
  friction?: number;
  animatedBoneNames?: string[];
  rawGravity?: { X?: number; Y?: number; Z?: number } | null;
  forceProviders?: CandidateForceProvider[];
  joints?: CandidateJoint[];
  colliderGroups?: number[];
  jointColliderGroups?: Record<string, number[]>;
};

type CandidateForceProvider = {
  sourcePathId?: number;
  scriptName?: string;
  nodeName?: string | null;
  nodePath?: string | null;
  activeSelf?: boolean | null;
  activeInHierarchy?: boolean | null;
  springManagerPathId?: number | null;
  raw?: JsonRecord | null;
};

type CandidateJoint = {
  nodeName?: string | null;
  nodePath?: string | null;
  sourcePathId?: number;
  enabled?: boolean;
  pivotNodeName?: string | null;
  pivotNodePath?: string | null;
  hitRadius?: number;
  rawStiffnessForce?: number | null;
  rawDragForce?: number | null;
  rawAngularStiffness?: number | null;
  rawSpringConstant?: number | null;
  rawWindInfluence?: number | null;
  dragForce?: number;
  rawSpringForce?: { X?: number; Y?: number; Z?: number } | null;
  lengthLimitTargets?: CandidateLengthLimitTarget[];
  rawAngleLimits?: {
    y?: CandidateAngleLimit | null;
    z?: CandidateAngleLimit | null;
  } | null;
};

type CandidateLengthLimitTarget = {
  nodeName?: string | null;
  nodePath?: string | null;
  sourcePathId?: number;
};

type CandidateAngleLimit = {
  active?: boolean;
  min?: number | null;
  max?: number | null;
};

type RuntimeCollider = {
  source: CandidateCollider;
  node: THREE.Object3D;
};

type RuntimeBone = {
  managerPathId: number | null;
  springName: string;
  automaticUpdates: boolean;
  enabled: boolean;
  enableLengthLimits: boolean;
  enableAngleLimits: boolean;
  enableCollision: boolean;
  collideWithGround: boolean;
  groundHeight: number;
  isSumOfForcesOnBone: boolean;
  isPaused: boolean;
  gravity: THREE.Vector3;
  forceProviders: RuntimeForceProvider[];
  node: THREE.Object3D;
  state: UtjSpringBoneState;
  initialLocalRotation: THREE.Quaternion;
  skinAnimationLocalRotation: THREE.Quaternion;
  lastAppliedLocalRotation: THREE.Quaternion;
  hasAppliedLocalRotation: boolean;
  boneAxis: THREE.Vector3;
  springLength: number;
  dynamicRatio: number;
  isAnimated: boolean;
  simulationFrameRate: number;
  slowMotionScale: number;
  bounce: number;
  friction: number;
  radius: number;
  stiffnessForce: number;
  dragForce: number;
  springForce: THREE.Vector3;
  windInfluence: number;
  springConstant: number;
  lengthLimitTargets: RuntimeLengthLimitTarget[];
  angularStiffness: number;
  pivotNode: THREE.Object3D | null;
  yAngleLimit: UtjAngleLimit | null;
  zAngleLimit: UtjAngleLimit | null;
  colliders: RuntimeCollider[];
  angleLimitForwardSign: number;
  lastCollisionStatus: number;
  lastAngleLimitApplied: boolean;
};

type RuntimeForceProvider = RuntimeWindVolumeOneSelf;

type RuntimeWindVolumeOneSelf = {
  kind: "WindVolumeOneSelf";
  sourcePathId: number | null;
  node: THREE.Object3D;
  springManagerPathId: number | null;
  isActive: boolean;
  dynamicRatio: number;
  simulationFrameRate: number;
  weight: number;
  strength: number;
  period: number;
  currentTime: number;
  spinPeriod: number;
  spinTime: number;
  amplitude: number;
  peakDistance: number;
  additionalWindAngle: number;
  additionalWindStrength: number;
};

type RuntimeLengthLimitTarget = {
  node: THREE.Object3D;
  initialLength: number;
};

type NodeResolution = {
  nodeByPath: Map<string, THREE.Object3D>;
  nodeByName: Map<string, THREE.Object3D[]>;
};

type ManagerSettings = {
  dynamicRatio: number;
  animatedBoneNames: ReadonlySet<string>;
  simulationFrameRate: number;
  slowMotionScale: number;
  bounce: number;
  friction: number;
};

type VectorSnapshot = {
  x: number;
  y: number;
  z: number;
  length: number;
};

export type UtjSpringBoneRuntimeSnapshot = {
  enabled: boolean;
  springCount: number;
  boneCount: number;
  colliderCount: number;
  missingNodeCount: number;
  maxSleeveOffset: number;
  maxSkirtOffset: number;
  topOffsets: {
    name: string;
    springName: string;
    offset: number;
    colliderCount: number;
    lastCollisionStatus: number;
    hasSpringForce: boolean;
    forceProviderCount: number;
  }[];
  skirtOffsets: {
    name: string;
    springName: string;
    offset: number;
    appliedRotationDegrees: number;
    colliderCount: number;
    lastCollisionStatus: number;
    lastAngleLimitApplied: boolean;
    hasSpringForce: boolean;
    forceProviderCount: number;
    stiffnessForce: number;
    dragForce: number;
    dynamicRatio: number;
    animatedTipDelta: VectorSnapshot;
    velocity: VectorSnapshot;
    headMovement: VectorSnapshot;
    gravity: VectorSnapshot;
    springForce: VectorSnapshot;
  }[];
  skinnedBoneMatches: number;
  skinnedBoneMisses: number;
};

const UNITY_MATHF_EPSILON = 1.401298464324817e-45;

export class UtjSpringBoneRuntime {
  private readonly bones: RuntimeBone[];
  private readonly missingNodes: string[];
  private readonly skinnedBones: Set<THREE.Object3D>;
  private readonly externalForce = new THREE.Vector3(0, 0, 0);
  private readonly parentRotation = new THREE.Quaternion();
  private readonly headPosition = new THREE.Vector3();
  private readonly localRotation = new THREE.Quaternion();
  private readonly skinAnimationLocalRotation = new THREE.Quaternion();
  private readonly unitScale = new THREE.Vector3(1, 1, 1);
  private readonly colliderLocalToWorld = new THREE.Matrix4();
  private readonly colliderWorldToLocal = new THREE.Matrix4();
  private readonly frameColliderCache = new Map<RuntimeCollider, UtjCollider>();
  private readonly angleVector = new THREE.Vector3();
  private readonly constrainedAngleVector = new THREE.Vector3();
  private readonly pivotRotation = new THREE.Quaternion();
  private readonly pivotInverseRotation = new THREE.Quaternion();
  private readonly providerForce = new THREE.Vector3();
  private readonly waveAxis = new THREE.Vector3();
  private readonly localBonePosition = new THREE.Vector3();
  private readonly additionalDirection = new THREE.Vector3();
  private readonly debugAnimatedTip = new THREE.Vector3();

  private constructor(bones: RuntimeBone[], missingNodes: string[], skinnedBones: Set<THREE.Object3D>) {
    this.bones = bones;
    this.missingNodes = missingNodes;
    this.skinnedBones = skinnedBones;
  }

  static fromPjskRuntimeExtension(
    extension: unknown,
    root: THREE.Object3D
  ): UtjSpringBoneRuntime | null {
    const payload = asRecord(extension);
    const springBone = asRecord(payload?.pjskSpringBone ?? payload?.PjskSpringBone);
    const candidate = asRecord(springBone?.vrmCandidate ?? springBone?.VrmCandidate) as
      | Candidate
      | null;
    const draft = candidate?.vrmExtensionDraft;
    if (!draft?.springs?.length) {
      return null;
    }

    root.updateMatrixWorld(true);
    const resolution = buildNodeResolution(root);
    const skinnedBones = collectSkinnedBones(root);
    const managerSettingsByPathId = buildManagerSettingsByPathId(springBone);
    const colliderByIndex = new Map<number, RuntimeCollider>();
    const missingNodes: string[] = [];

    for (const collider of draft.colliders ?? []) {
      if (typeof collider.index !== "number") {
        continue;
      }
      const node = resolveNode(resolution, collider.nodePath, collider.nodeName);
      if (!node) {
        missingNodes.push(collider.nodePath ?? collider.nodeName ?? `collider:${collider.index}`);
        continue;
      }
      colliderByIndex.set(collider.index, { source: collider, node });
    }

    const colliderGroupByIndex = new Map<number, RuntimeCollider[]>();
    for (const group of draft.colliderGroups ?? []) {
      if (typeof group.index !== "number") {
        continue;
      }
      const colliders = (group.colliders ?? [])
        .map((index) => colliderByIndex.get(index))
        .filter((collider): collider is RuntimeCollider => Boolean(collider));
      colliderGroupByIndex.set(group.index, colliders);
    }

    const bones: RuntimeBone[] = [];
    const childExclusionNodes = collectSpringBoneChildExclusionNodes(draft.springs, resolution);
    const forceProviderCache = new Map<string, RuntimeForceProvider>();
    for (const spring of draft.springs) {
      const joints = spring.joints ?? [];
      const jointNodes = joints.map((joint) =>
        resolveNode(resolution, joint.nodePath, joint.nodeName)
      );
      const forceProviders = resolveForceProviders(resolution, spring, forceProviderCache);

      for (let index = 0; index < joints.length; index += 1) {
        const joint = joints[index];
        const node = jointNodes[index];
        if (!node) {
          missingNodes.push(joint.nodePath ?? joint.nodeName ?? `${spring.name ?? "spring"}:${index}`);
          continue;
        }

        const pivotNode = resolveSpringBonePivotNode(resolution, joint, node);

        const runtimeBone = createRuntimeBone(
          spring,
          joint,
          node,
          computeUtjChildPosition(node, childExclusionNodes),
          pivotNode,
          resolveLengthLimitTargets(resolution, joint),
          forceProviders,
          resolveJointColliders(spring, joint, colliderGroupByIndex),
          managerSettingsByPathId
        );
        if (runtimeBone) {
          bones.push(runtimeBone);
        }
      }
    }

    bones.sort((a, b) => getUtjObjectDepth(a.node) - getUtjObjectDepth(b.node));

    return bones.length > 0
      ? new UtjSpringBoneRuntime(bones, missingNodes, skinnedBones)
      : null;
  }

  getControlledTrackNodeNames(): Set<string> {
    return new Set(this.bones.map((bone) => bone.node.name).filter(Boolean));
  }

  update(deltaTime: number): void {
    if (this.bones.some((bone) => bone.automaticUpdates && !bone.isPaused)) {
      this.preUpdateColliders();
    }

    const windLateUpdateProviders = this.collectWindLateUpdateProviders();
    const windLateUpdateManagerIds = new Set(
      windLateUpdateProviders
        .filter((provider) => provider.isActive)
        .map((provider) => provider.springManagerPathId)
        .filter((managerPathId): managerPathId is number => managerPathId !== null)
    );
    const windSumEnabledManagerIds = new Set(
      windLateUpdateProviders
        .filter((provider) => !provider.isActive)
        .map((provider) => provider.springManagerPathId)
        .filter((managerPathId): managerPathId is number => managerPathId !== null)
    );

    for (const bone of this.bones) {
      const dt = calcUtjManagerTimeStep(deltaTime, bone.simulationFrameRate, bone.slowMotionScale);
      if (!bone.automaticUpdates) {
        continue;
      }
      if (!bone.enabled) {
        continue;
      }
      bone.node.parent?.getWorldQuaternion(this.parentRotation);
      bone.node.getWorldPosition(this.headPosition);
      if (bone.isPaused) {
        this.applyBoneRotation(bone);
        continue;
      }
      const windManagerControlsSum = bone.managerPathId !== null &&
        windSumEnabledManagerIds.has(bone.managerPathId);
      const managerSumsForces = windManagerControlsSum ? true : bone.isSumOfForcesOnBone;
      if (!managerSumsForces ||
        (bone.managerPathId !== null && windLateUpdateManagerIds.has(bone.managerPathId))) {
        continue;
      }
      this.updateBoneSpringAndRotation(
        bone,
        dt,
        this.computeExternalForce(bone, deltaTime),
        bone.dynamicRatio
      );
    }

    for (const provider of windLateUpdateProviders) {
      if (!provider.isActive) {
        continue;
      }
      this.updateWindVolumeOneSelfLateUpdate(provider, deltaTime);
    }
  }

  private collectWindLateUpdateProviders(): RuntimeWindVolumeOneSelf[] {
    const providers = new Map<string, RuntimeWindVolumeOneSelf>();
    for (const bone of this.bones) {
      for (const provider of bone.forceProviders) {
        if (provider.springManagerPathId === null) {
          continue;
        }
        const key = provider.sourcePathId !== null
          ? `path:${provider.sourcePathId}`
          : `node:${provider.node.uuid}:${provider.springManagerPathId}`;
        if (!providers.has(key)) {
          providers.set(key, provider);
        }
      }
    }
    return [...providers.values()];
  }

  private updateWindVolumeOneSelfLateUpdate(
    provider: RuntimeWindVolumeOneSelf,
    deltaTime: number
  ): void {
    const managerPathId = provider.springManagerPathId;
    if (managerPathId === null) {
      return;
    }
    const dt = provider.simulationFrameRate > 0 ? 1.0 / provider.simulationFrameRate : deltaTime;
    for (const bone of this.bones) {
      if (bone.managerPathId !== managerPathId) {
        continue;
      }
      this.computeWindVolumeOneSelfForce(provider, bone, deltaTime);
      this.externalForce.copy(bone.gravity).add(this.providerForce);
      this.updateBoneSpringAndRotation(
        bone,
        dt,
        this.externalForce,
        bone.isAnimated ? provider.dynamicRatio : 1.0
      );
    }
  }

  private updateBoneSpringAndRotation(
    bone: RuntimeBone,
    deltaTime: number,
    externalForce: THREE.Vector3,
    dynamicRatio: number
  ): void {
    bone.node.parent?.getWorldQuaternion(this.parentRotation);
    bone.node.getWorldPosition(this.headPosition);
    this.captureSkinAnimationLocalRotation(bone);
    cacheUtjSpringBonePosition(bone.state, this.headPosition);
    updateUtjSpring(bone.state, {
      headPosition: this.headPosition,
      parentRotation: this.parentRotation,
      initialLocalRotation: bone.initialLocalRotation,
      boneAxis: bone.boneAxis,
      lengthFallbackDirection: bone.boneAxis.clone().applyQuaternion(
        bone.node.getWorldQuaternion(new THREE.Quaternion())
      ),
      springLength: bone.springLength,
      stiffnessForce: bone.stiffnessForce,
      dragForce: bone.dragForce,
      springForce: bone.springForce,
      externalForce,
      deltaTime,
    });

    this.applyLengthLimits(bone, deltaTime);
    const tailRadius = Math.abs(bone.radius) * matrixXDirectionLength(bone.node.matrixWorld);
    const groundHit = bone.collideWithGround
      ? checkUtjGroundCollision(bone.state, {
        headPosition: this.headPosition,
        springLength: bone.springLength,
        tailRadius,
        groundHeight: bone.groundHeight,
        lengthFallbackDirection: bone.boneAxis.clone().applyQuaternion(
          bone.node.getWorldQuaternion(new THREE.Quaternion())
        ),
        bounce: bone.bounce,
        friction: bone.friction,
      })
      : false;
    bone.lastCollisionStatus = !groundHit && bone.enableCollision
      ? checkUtjCollisions(bone.state, {
        headPosition: this.headPosition,
        springLength: bone.springLength,
        tailRadius,
        colliders: this.buildWorldColliders(bone.colliders),
        bounce: bone.bounce,
        friction: bone.friction,
      })
      : 0;
    bone.lastAngleLimitApplied = bone.enableAngleLimits
      ? this.applyAngleLimits(bone, deltaTime)
      : false;
    this.resetInvalidTipPosition(bone);
    this.applyBoneRotation(bone, dynamicRatio);
  }

  settleCurrentPose(frameCount = 120, deltaTime = 1 / 60): void {
    const count = Math.max(0, Math.floor(frameCount));
    for (let frame = 0; frame < count; frame += 1) {
      this.update(deltaTime);
    }
  }

  private resetInvalidTipPosition(bone: RuntimeBone): void {
    if (
      !Number.isNaN(bone.state.currTipPos.x) &&
      !Number.isNaN(bone.state.currTipPos.y) &&
      !Number.isNaN(bone.state.currTipPos.z)
    ) {
      return;
    }

    this.debugAnimatedTip.copy(computeAnimatedTipPosition({
      headPosition: this.headPosition,
      parentRotation: this.parentRotation,
      initialLocalRotation: bone.initialLocalRotation,
      boneAxis: bone.boneAxis,
      springLength: bone.springLength,
    }));
    bone.state.currTipPos.copy(this.debugAnimatedTip);
    bone.state.prevTipPos.copy(this.debugAnimatedTip);
  }

  private applyBoneRotation(bone: RuntimeBone, dynamicRatio = bone.dynamicRatio): void {
    this.resetInvalidTipPosition(bone);
    this.localRotation.copy(
      computeUtjLocalRotation(
        this.headPosition,
        bone.state.currTipPos,
        this.parentRotation,
        bone.initialLocalRotation,
        bone.boneAxis
      )
    );
    bone.node.quaternion.copy(lerpQuaternionNormalized(
      bone.skinAnimationLocalRotation,
      this.localRotation,
      dynamicRatio
    ));
    bone.lastAppliedLocalRotation.copy(bone.node.quaternion);
    bone.hasAppliedLocalRotation = true;
    bone.node.scale.copy(this.unitScale);
    bone.node.updateMatrix();
    bone.node.updateMatrixWorld(true);
  }

  private captureSkinAnimationLocalRotation(bone: RuntimeBone): void {
    this.skinAnimationLocalRotation.copy(bone.node.quaternion);
    if (
      bone.hasAppliedLocalRotation &&
      quaternionsAlmostEqual(this.skinAnimationLocalRotation, bone.lastAppliedLocalRotation)
    ) {
      return;
    }
    bone.skinAnimationLocalRotation.copy(this.skinAnimationLocalRotation);
  }

  resetPose(): void {
    for (const bone of this.bones) {
      bone.node.quaternion.copy(bone.initialLocalRotation);
      bone.skinAnimationLocalRotation.copy(bone.initialLocalRotation);
      bone.lastAppliedLocalRotation.copy(bone.initialLocalRotation);
      bone.hasAppliedLocalRotation = false;
      bone.node.scale.copy(this.unitScale);
      bone.node.updateMatrix();
      bone.node.updateMatrixWorld(true);
    }
  }

  resetStateToCurrentPose(): void {
    for (const bone of this.bones) {
      bone.node.parent?.getWorldQuaternion(this.parentRotation);
      bone.node.getWorldPosition(this.headPosition);
      bone.skinAnimationLocalRotation.copy(bone.node.quaternion);
      this.debugAnimatedTip.copy(computeAnimatedTipPosition({
        headPosition: this.headPosition,
        parentRotation: this.parentRotation,
        initialLocalRotation: bone.initialLocalRotation,
        boneAxis: bone.boneAxis,
        springLength: bone.springLength,
      }));
      bone.state.currTipPos.copy(this.debugAnimatedTip);
      bone.state.prevTipPos.copy(this.debugAnimatedTip);
      bone.state.cachedPosition.copy(this.headPosition);
      bone.state.cachedMovement.set(0, 0, 0);
      bone.state.hitNormal.set(0, 0, 0);
      bone.skinAnimationLocalRotation.copy(bone.node.quaternion);
      bone.lastAppliedLocalRotation.copy(bone.node.quaternion);
      bone.hasAppliedLocalRotation = false;
    }
  }

  private computeExternalForce(bone: RuntimeBone, deltaTime: number): THREE.Vector3 {
    this.externalForce.copy(bone.gravity);
    for (const provider of bone.forceProviders) {
      this.externalForce.add(this.computeForceProvider(provider, bone, deltaTime));
    }
    return this.externalForce;
  }

  private computeForceProvider(
    provider: RuntimeForceProvider,
    bone: RuntimeBone,
    deltaTime: number
  ): THREE.Vector3 {
    if (provider.kind === "WindVolumeOneSelf") {
      return this.computeWindVolumeOneSelfForce(provider, bone, deltaTime);
    }
    return this.providerForce.set(0, 0, 0);
  }

  private computeWindVolumeOneSelfForce(
    provider: RuntimeWindVolumeOneSelf,
    bone: RuntimeBone,
    deltaTime: number
  ): THREE.Vector3 {
    const baseStrength = provider.weight * provider.strength;
    if (baseStrength <= UNITY_MATHF_EPSILON || provider.period <= UNITY_MATHF_EPSILON) {
      return this.providerForce.set(0, 0, 0);
    }

    provider.currentTime = addPeriodically(provider.currentTime, deltaTime, provider.period);
    const phase = provider.currentTime * Math.PI * 2 / provider.period;
    provider.node.updateMatrixWorld(true);
    this.waveAxis.set(0, 1, 0).transformDirection(provider.node.matrixWorld);

    if (Math.abs(provider.spinPeriod) > 0.001) {
      provider.spinTime = addPeriodically(provider.spinTime, deltaTime, provider.spinPeriod);
      const spinPhase = provider.spinTime * Math.PI * 2 / provider.spinPeriod;
      const right = new THREE.Vector3(1, 0, 0).transformDirection(provider.node.matrixWorld);
      const up = new THREE.Vector3(0, 1, 0).transformDirection(provider.node.matrixWorld);
      this.waveAxis.copy(right.multiplyScalar(Math.cos(spinPhase))).addScaledVector(
        up,
        Math.sin(spinPhase)
      );
    }

    provider.peakDistance = Math.max(provider.peakDistance, UNITY_MATHF_EPSILON);
    bone.node.getWorldPosition(this.localBonePosition).applyMatrix4(
      provider.node.matrixWorld.clone().invert()
    );
    const k = Math.PI * 2 / provider.peakDistance;
    const wave = Math.sin(
      phase +
      Math.sin(k * this.localBonePosition.x) +
      Math.cos(k * this.localBonePosition.z)
    );
    const mainDirection = new THREE.Vector3(0, 0, 1)
      .transformDirection(provider.node.matrixWorld)
      .addScaledVector(this.waveAxis, provider.amplitude * wave)
      .normalize();
    this.additionalDirection
      .set(Math.sin(THREE.MathUtils.degToRad(provider.additionalWindAngle)), 0, Math.cos(THREE.MathUtils.degToRad(provider.additionalWindAngle)))
      .normalize();

    return this.providerForce
      .copy(mainDirection)
      .multiplyScalar(baseStrength)
      .addScaledVector(this.additionalDirection, provider.additionalWindStrength)
      .multiplyScalar(bone.windInfluence);
  }

  private applyLengthLimits(bone: RuntimeBone, deltaTime: number): void {
    if (!bone.enableLengthLimits || bone.lengthLimitTargets.length === 0) {
      return;
    }

    const targets: UtjLengthLimitTarget[] = bone.lengthLimitTargets.map((target) => ({
      position: target.node.getWorldPosition(new THREE.Vector3()),
      initialLength: target.initialLength,
    }));
    applyUtjLengthLimits({
      currTipPos: bone.state.currTipPos,
      springConstant: bone.springConstant,
      deltaTime,
      targets,
    });
  }

  private applyAngleLimits(bone: RuntimeBone, deltaTime: number): boolean {
    if (!bone.yAngleLimit && !bone.zAngleLimit) {
      return false;
    }

    const pivot = bone.pivotNode;
    if (!pivot) {
      return false;
    }

    pivot.updateMatrixWorld(true);
    this.angleVector.copy(bone.state.currTipPos).sub(bone.state.cachedPosition);

    const forward = new THREE.Vector3(bone.angleLimitForwardSign, 0, 0).transformDirection(pivot.matrixWorld);
    const back = new THREE.Vector3(0, 0, -1).transformDirection(pivot.matrixWorld);
    const down = new THREE.Vector3(0, -1, 0).transformDirection(pivot.matrixWorld);

    let constrained = false;
    if (bone.yAngleLimit) {
      constrained = constrainUtjAngleLimit({
        basisSide: down,
        basisUp: back,
        basisForward: forward,
        springStrength: bone.angularStiffness,
        deltaTime,
        limit: bone.yAngleLimit,
        vector: this.angleVector,
      }) || constrained;
    }

    if (bone.zAngleLimit) {
      constrained = constrainUtjAngleLimit({
        basisSide: back,
        basisUp: down,
        basisForward: forward,
        springStrength: bone.angularStiffness,
        deltaTime,
        limit: bone.zAngleLimit,
        vector: this.angleVector,
      }) || constrained;
    }

    bone.state.currTipPos.copy(bone.state.cachedPosition).add(this.angleVector);
    return constrained;
  }

  getSnapshot(enabled = true): UtjSpringBoneRuntimeSnapshot {
    const colliderIndexes = new Set<RuntimeCollider>();
    const topOffsets: UtjSpringBoneRuntimeSnapshot["topOffsets"] = [];
    const skirtOffsets: UtjSpringBoneRuntimeSnapshot["skirtOffsets"] = [];
    let maxSleeveOffset = 0;
    let maxSkirtOffset = 0;
    let skinnedBoneMatches = 0;
    let skinnedBoneMisses = 0;
    for (const bone of this.bones) {
      for (const collider of bone.colliders) {
        colliderIndexes.add(collider);
      }
      bone.node.parent?.getWorldQuaternion(this.parentRotation);
      bone.node.getWorldPosition(this.headPosition);
      this.debugAnimatedTip.copy(computeAnimatedTipPosition({
        headPosition: this.headPosition,
        parentRotation: this.parentRotation,
        initialLocalRotation: bone.initialLocalRotation,
        boneAxis: bone.boneAxis,
        springLength: bone.springLength,
      }));
      const offset = this.debugAnimatedTip.distanceTo(bone.state.currTipPos);
      const name = bone.node.name.toLowerCase();
      if (name.includes("sleeve")) {
        maxSleeveOffset = Math.max(maxSleeveOffset, offset);
      }
      if (name.includes("skirt")) {
        maxSkirtOffset = Math.max(maxSkirtOffset, offset);
      }
      if (this.skinnedBones.has(bone.node)) {
        skinnedBoneMatches += 1;
      } else {
        skinnedBoneMisses += 1;
      }
      topOffsets.push({
        name: bone.node.name,
        springName: bone.springName,
        offset,
        colliderCount: bone.colliders.length,
        lastCollisionStatus: bone.lastCollisionStatus,
        hasSpringForce: bone.springForce.lengthSq() > 0.00000001,
        forceProviderCount: bone.forceProviders.length,
      });
      if (name.includes("skirt")) {
        const animatedTipDelta = bone.state.currTipPos.clone().sub(this.debugAnimatedTip);
        const velocity = bone.state.currTipPos.clone().sub(bone.state.prevTipPos);
        skirtOffsets.push({
          name: bone.node.name,
          springName: bone.springName,
          offset,
          appliedRotationDegrees: THREE.MathUtils.radToDeg(
            bone.skinAnimationLocalRotation.angleTo(bone.node.quaternion)
          ),
          colliderCount: bone.colliders.length,
          lastCollisionStatus: bone.lastCollisionStatus,
          lastAngleLimitApplied: bone.lastAngleLimitApplied,
          hasSpringForce: bone.springForce.lengthSq() > 0.00000001,
          forceProviderCount: bone.forceProviders.length,
          stiffnessForce: bone.stiffnessForce,
          dragForce: bone.dragForce,
          dynamicRatio: bone.dynamicRatio,
          animatedTipDelta: vectorSnapshot(animatedTipDelta),
          velocity: vectorSnapshot(velocity),
          headMovement: vectorSnapshot(bone.state.cachedMovement),
          gravity: vectorSnapshot(bone.gravity),
          springForce: vectorSnapshot(bone.springForce),
        });
      }
    }
    topOffsets.sort((a, b) => b.offset - a.offset);
    skirtOffsets.sort((a, b) => b.offset - a.offset);
    return {
      enabled,
      springCount: new Set(this.bones.map((bone) => bone.springName)).size,
      boneCount: this.bones.length,
      colliderCount: colliderIndexes.size,
      missingNodeCount: this.missingNodes.length,
      maxSleeveOffset,
      maxSkirtOffset,
      topOffsets: topOffsets.slice(0, 8),
      skirtOffsets,
      skinnedBoneMatches,
      skinnedBoneMisses,
    };
  }

  private buildWorldColliders(colliders: readonly RuntimeCollider[]): UtjCollider[] {
    const result: UtjCollider[] = [];
    for (const collider of colliders) {
      const worldCollider = this.frameColliderCache.get(collider) ?? this.createWorldCollider(collider);
      if (worldCollider) {
        result.push(worldCollider);
      }
    }
    return result;
  }

  private preUpdateColliders(): void {
    this.frameColliderCache.clear();
    const uniqueColliders = new Set<RuntimeCollider>();
    for (const bone of this.bones) {
      for (const collider of bone.colliders) {
        uniqueColliders.add(collider);
      }
    }
    const orderedColliders = [...uniqueColliders].sort(
      (a, b) => sourceColliderOrder(a.source) - sourceColliderOrder(b.source)
    );
    for (const collider of orderedColliders) {
      const worldCollider = this.createWorldCollider(collider);
      if (worldCollider) {
        this.frameColliderCache.set(collider, worldCollider);
      }
    }
  }

  private createWorldCollider(collider: RuntimeCollider): UtjCollider | null {
    const shape = collider.source.shape;
    const componentEnabled = collider.source.enabled !== false;
    const rendererGatedEnabled = componentEnabled &&
      collider.source.linkedRendererEnabled !== false;

    if (shape?.sphere) {
      collider.node.updateMatrixWorld(true);
      this.colliderLocalToWorld.copy(collider.node.matrixWorld);
      this.colliderWorldToLocal.copy(collider.node.matrixWorld).invert();
      const worldToLocalDirection = makeNormalDirectionMatrix(this.colliderWorldToLocal);
      const localToWorldDirection = makeNormalDirectionMatrix(this.colliderLocalToWorld);
      return {
        kind: "sphere",
        enabled: componentEnabled,
        localOffset: new THREE.Vector3(0, 0, 0),
        radius: Math.max(0, shape.sphere.radius ?? 0.01),
        localToWorldMatrix: this.colliderLocalToWorld.clone(),
        worldToLocalMatrix: this.colliderWorldToLocal.clone(),
        worldToLocalRadiusScale: 1,
        localToWorldNormalMatrix: localToWorldDirection,
        lossyScaleX: worldScaleX(collider.node),
      };
    }

    if (shape?.capsule) {
      collider.node.updateMatrixWorld(true);
      this.colliderLocalToWorld.copy(collider.node.matrixWorld);
      this.colliderWorldToLocal.copy(collider.node.matrixWorld).invert();
      return {
        kind: "capsuleLocal",
        enabled: rendererGatedEnabled,
        localStart: new THREE.Vector3(0, 0, 0),
        localEnd: vectorFromArray(shape.capsule.tail),
        radius: Math.max(0, shape.capsule.radius ?? 0.01),
        localToWorldMatrix: this.colliderLocalToWorld.clone(),
        worldToLocalMatrix: this.colliderWorldToLocal.clone(),
        worldToLocalRadiusScale: 1,
        localToWorldNormalMatrix: makeNormalDirectionMatrix(this.colliderLocalToWorld),
        lossyScaleX: worldScaleX(collider.node),
      };
    }

    if (shape?.panel) {
      collider.node.updateMatrixWorld(true);
      this.colliderLocalToWorld.copy(collider.node.matrixWorld);
      this.colliderWorldToLocal.copy(collider.node.matrixWorld).invert();
      return {
        kind: "panel",
        enabled: rendererGatedEnabled,
        width: Math.max(0, shape.panel.width ?? 0),
        height: Math.max(0, shape.panel.height ?? 0),
        localToWorldMatrix: this.colliderLocalToWorld.clone(),
        worldToLocalMatrix: this.colliderWorldToLocal.clone(),
        worldToLocalRadiusScale: matrixXDirectionLength(this.colliderWorldToLocal),
        worldToLocalLengthScale: matrixXDirectionLength(this.colliderWorldToLocal),
        localToWorldNormalMatrix: makeNormalDirectionMatrix(this.colliderLocalToWorld),
      };
    }

    return null;
  }
}

function vectorSnapshot(vector: THREE.Vector3): VectorSnapshot {
  return {
    x: vector.x,
    y: vector.y,
    z: vector.z,
    length: vector.length(),
  };
}

function createRuntimeBone(
  spring: CandidateSpring,
  joint: CandidateJoint,
  node: THREE.Object3D,
  tailPosition: THREE.Vector3,
  pivotNode: THREE.Object3D | null,
  lengthLimitTargetNodes: THREE.Object3D[],
  forceProviders: RuntimeForceProvider[],
  colliders: RuntimeCollider[],
  managerSettingsByPathId: ReadonlyMap<number, ManagerSettings>
): RuntimeBone | null {
  const headPosition = node.getWorldPosition(new THREE.Vector3());
  const direction = tailPosition.clone().sub(headPosition);
  const springLength = direction.length();

  const initialLocalRotation = node.quaternion.clone();
  const localTipPosition = node.worldToLocal(tailPosition.clone());
  const boneAxis = localTipPosition.lengthSq() <= 0.00001 * 0.00001
    ? new THREE.Vector3(0, 0, 0)
    : localTipPosition.normalize();
  const lengthLimitTargets = lengthLimitTargetNodes.map((targetNode) => ({
    node: targetNode,
    initialLength: targetNode.getWorldPosition(new THREE.Vector3()).distanceTo(tailPosition),
  }));
  const managerSettings = resolveManagerSettings(spring, managerSettingsByPathId);
  const isAnimated = isBoneAnimated(joint, node, managerSettings);
  const angleLimitForwardSign = computeAngleLimitForwardSign(pivotNode, direction);

  return {
    managerPathId: typeof spring.managerPathId === "number" ? spring.managerPathId : null,
    springName: spring.name ?? "spring",
    automaticUpdates: spring.automaticUpdates !== false,
    enabled: spring.enabled !== false && joint.enabled !== false,
    enableLengthLimits: spring.enableLengthLimits !== false,
    enableAngleLimits: spring.enableAngleLimits !== false,
    enableCollision: spring.enableCollision !== false,
    collideWithGround: spring.collideWithGround !== false,
    groundHeight: spring.groundHeight ?? 0,
    isSumOfForcesOnBone: spring.isSumOfForcesOnBone !== false,
    isPaused: spring.isPaused === true,
    gravity: vectorFromRaw(spring.rawGravity, new THREE.Vector3(0, -10, 0)),
    forceProviders,
    node,
    state: createUtjSpringBoneState(headPosition, tailPosition),
    initialLocalRotation,
    skinAnimationLocalRotation: initialLocalRotation.clone(),
    lastAppliedLocalRotation: initialLocalRotation.clone(),
    hasAppliedLocalRotation: false,
    boneAxis,
    springLength,
    dynamicRatio: isAnimated ? managerSettings.dynamicRatio : 1.0,
    isAnimated,
    simulationFrameRate: managerSettings.simulationFrameRate,
    slowMotionScale: managerSettings.slowMotionScale,
    bounce: managerSettings.bounce,
    friction: managerSettings.friction,
    radius: Math.max(0, joint.hitRadius ?? 0.05),
    stiffnessForce: joint.rawStiffnessForce ?? 300,
    dragForce: joint.rawDragForce ?? joint.dragForce ?? 0.4,
    springForce: vectorFromRaw(joint.rawSpringForce),
    windInfluence: Math.max(0, joint.rawWindInfluence ?? 1),
    springConstant: joint.rawSpringConstant ?? 0.5,
    lengthLimitTargets,
    angularStiffness: Math.max(0, joint.rawAngularStiffness ?? 100),
    pivotNode,
    yAngleLimit: angleLimitFromCandidate(joint.rawAngleLimits?.y),
    zAngleLimit: angleLimitFromCandidate(joint.rawAngleLimits?.z),
    colliders,
    angleLimitForwardSign,
    lastCollisionStatus: 0,
    lastAngleLimitApplied: false,
  };
}

function computeAngleLimitForwardSign(
  pivotNode: THREE.Object3D | null,
  worldDirection: THREE.Vector3
): number {
  if (!pivotNode || worldDirection.lengthSq() <= 0.00000001) {
    return -1;
  }
  pivotNode.updateMatrixWorld(true);
  const pivotRotation = pivotNode.getWorldQuaternion(new THREE.Quaternion()).invert();
  const pivotLocalDirection = worldDirection.clone().normalize().applyQuaternion(pivotRotation);
  return pivotLocalDirection.x >= 0 ? 1 : -1;
}

function resolveForceProviders(
  resolution: NodeResolution,
  spring: CandidateSpring,
  cache: Map<string, RuntimeForceProvider>
): RuntimeForceProvider[] {
  return (spring.forceProviders ?? [])
    .map((provider) => {
      const key = forceProviderCacheKey(provider);
      const cached = key ? cache.get(key) : undefined;
      if (cached) {
        return cached;
      }
      const runtimeProvider = createForceProvider(resolution, provider);
      if (runtimeProvider && key) {
        cache.set(key, runtimeProvider);
      }
      return runtimeProvider;
    })
    .filter((provider): provider is RuntimeForceProvider => Boolean(provider));
}

function forceProviderCacheKey(provider: CandidateForceProvider): string | null {
  if (typeof provider.sourcePathId === "number") {
    return `path:${provider.sourcePathId}`;
  }
  if (provider.nodePath) {
    return `nodePath:${provider.nodePath}`;
  }
  if (provider.nodeName) {
    return `nodeName:${provider.nodeName}`;
  }
  return null;
}

function createForceProvider(
  resolution: NodeResolution,
  provider: CandidateForceProvider
): RuntimeForceProvider | null {
  if (!provider.scriptName?.endsWith("WindVolumeOneSelf")) {
    return null;
  }
  const node = resolveNode(resolution, provider.nodePath, provider.nodeName);
  if (!node) {
    return null;
  }
  const raw = provider.raw ?? {};
  if (!readRawBoolean(raw, "m_Enabled", true)) {
    return null;
  }
  if (provider.activeInHierarchy === false || provider.activeSelf === false) {
    return null;
  }
  const dynamicRatio = readFiniteNumber(raw.dynamicRatio ?? raw.DynamicRatio);
  const simulationFrameRate = readFiniteNumber(raw.simulationFrameRate ?? raw.SimulationFrameRate);
  return {
    kind: "WindVolumeOneSelf",
    sourcePathId: typeof provider.sourcePathId === "number" ? provider.sourcePathId : null,
    node,
    springManagerPathId: readFiniteNumber(provider.springManagerPathId) ??
      readRawObjectPathId(raw, "<SpringManager>k__BackingField") ??
      readRawObjectPathId(raw, "_SpringManager_k__BackingField") ??
      readRawObjectPathId(raw, "SpringManager") ??
      readRawObjectPathId(raw, "springManager"),
    isActive: readRawBoolean(raw, "isActive", false),
    dynamicRatio: THREE.MathUtils.clamp(dynamicRatio ?? 0.5, 0, 1),
    simulationFrameRate: Math.max(0, simulationFrameRate ?? 60),
    weight: readRawNumber(raw, "weight", 0),
    strength: readRawNumber(raw, "strength", 0),
    period: readRawNumber(raw, "period", 0),
    currentTime: readRawNumber(raw, "currentTime", 0),
    spinPeriod: readRawNumber(raw, "spinPeriod", 0),
    spinTime: readRawNumber(raw, "spinTime", 0),
    amplitude: readRawNumber(raw, "amplitude", 0),
    peakDistance: readRawNumber(raw, "peakDistance", 0),
    additionalWindAngle: readRawNumber(raw, "additionalWindAngle", 0),
    additionalWindStrength: readRawNumber(raw, "additionalWindStrength", 0),
  };
}

function resolveLengthLimitTargets(
  resolution: NodeResolution,
  joint: CandidateJoint
): THREE.Object3D[] {
  return (joint.lengthLimitTargets ?? [])
    .map((target) => resolveNode(resolution, target.nodePath, target.nodeName))
    .filter((node): node is THREE.Object3D => Boolean(node));
}

function resolveSpringBonePivotNode(
  resolution: NodeResolution,
  joint: CandidateJoint,
  node: THREE.Object3D
): THREE.Object3D {
  return resolveNode(resolution, joint.pivotNodePath, joint.pivotNodeName)
    ?? node.parent
    ?? node;
}

function angleLimitFromCandidate(limit?: CandidateAngleLimit | null): UtjAngleLimit | null {
  if (!limit?.active) {
    return null;
  }

  return {
    active: true,
    min: limit.min ?? 0,
    max: limit.max ?? 0,
  };
}

function resolveJointColliders(
  spring: CandidateSpring,
  joint: CandidateJoint,
  colliderGroupByIndex: ReadonlyMap<number, RuntimeCollider[]>
): RuntimeCollider[] {
  const sourcePathId = typeof joint.sourcePathId === "number"
    ? String(joint.sourcePathId)
    : null;
  const jointGroups = sourcePathId
    ? spring.jointColliderGroups?.[sourcePathId]
    : undefined;
  const groupIndexes = jointGroups !== undefined
    ? jointGroups
    : spring.colliderGroups ?? [];
  const colliders = groupIndexes.flatMap((index) => colliderGroupByIndex.get(index) ?? []);
  return colliders;
}

function worldScaleX(node: THREE.Object3D): number {
  const scale = node.getWorldScale(new THREE.Vector3());
  return scale.x;
}

function matrixXDirectionLength(matrix: THREE.Matrix4): number {
  const elements = matrix.elements;
  return Math.sqrt(
    elements[0] * elements[0] +
    elements[1] * elements[1] +
    elements[2] * elements[2]
  );
}

function lerpQuaternionNormalized(
  from: THREE.Quaternion,
  to: THREE.Quaternion,
  t: number
): THREE.Quaternion {
  const amount = THREE.MathUtils.clamp(t, 0, 1);
  let toX = to.x;
  let toY = to.y;
  let toZ = to.z;
  let toW = to.w;
  if (from.dot(to) < 0) {
    toX = -toX;
    toY = -toY;
    toZ = -toZ;
    toW = -toW;
  }
  return new THREE.Quaternion(
    from.x + (toX - from.x) * amount,
    from.y + (toY - from.y) * amount,
    from.z + (toZ - from.z) * amount,
    from.w + (toW - from.w) * amount
  ).normalize();
}

function makeNormalDirectionMatrix(matrix: THREE.Matrix4): THREE.Matrix4 {
  const normalMatrix = matrix.clone();
  normalMatrix.setPosition(0, 0, 0);
  return normalMatrix.invert().transpose();
}

function sourceColliderOrder(collider: CandidateCollider): number {
  if (collider.shape?.sphere) {
    return 0;
  }
  if (collider.shape?.capsule) {
    return 1;
  }
  return 2;
}

function getUtjObjectDepth(node: THREE.Object3D): number {
  let depth = 0;
  let current: THREE.Object3D | null = node;
  while (current) {
    depth += 1;
    current = current.parent;
  }
  return depth;
}

function collectSpringBoneChildExclusionNodes(
  springs: readonly CandidateSpring[] | undefined,
  resolution: NodeResolution
): Set<THREE.Object3D> {
  const nodes = new Set<THREE.Object3D>();
  for (const spring of springs ?? []) {
    for (const joint of spring.joints ?? []) {
      const pivotNode = resolveNode(resolution, joint.pivotNodePath, joint.pivotNodeName);
      if (pivotNode) {
        nodes.add(pivotNode);
      }
    }
  }
  return nodes;
}

function computeUtjChildPosition(
  node: THREE.Object3D,
  childExclusionNodes: ReadonlySet<THREE.Object3D>
): THREE.Vector3 {
  node.updateMatrixWorld(true);
  const headPosition = node.getWorldPosition(new THREE.Vector3());
  const right = new THREE.Vector3(1, 0, 0).transformDirection(node.matrixWorld);
  const fallback = headPosition.clone().addScaledVector(right, -0.1);
  const validChildren = node.children.filter((child) =>
    !childExclusionNodes.has(child) &&
    !child.name.endsWith("_spring_tail")
  );

  if (validChildren.length === 0) {
    return fallback;
  }

  if (validChildren.length === 1) {
    return validChildren[0].getWorldPosition(new THREE.Vector3());
  }

  const averagePosition = new THREE.Vector3();
  let averageDistance = 0;
  for (const child of validChildren) {
    const childPosition = child.getWorldPosition(new THREE.Vector3());
    averagePosition.add(childPosition);
    averageDistance += childPosition.distanceTo(headPosition);
  }
  averagePosition.multiplyScalar(1 / validChildren.length);
  averageDistance /= validChildren.length;

  const direction = averagePosition.sub(headPosition);
  if (direction.lengthSq() <= 0.00000001) {
    return headPosition.clone();
  }
  return headPosition.clone().addScaledVector(direction.normalize(), averageDistance);
}

function buildNodeResolution(root: THREE.Object3D): NodeResolution {
  const nodeByPath = new Map<string, THREE.Object3D>();
  const nodeByName = new Map<string, THREE.Object3D[]>();

  root.traverse((node) => {
    if (node !== root) {
      const byName = nodeByName.get(node.name) ?? [];
      byName.push(node);
      nodeByName.set(node.name, byName);
    }

    for (const path of buildNodePaths(root, node)) {
      nodeByPath.set(path, node);
    }
  });

  return { nodeByPath, nodeByName };
}

function collectSkinnedBones(root: THREE.Object3D): Set<THREE.Object3D> {
  const bones = new Set<THREE.Object3D>();
  root.traverse((node) => {
    const mesh = node as THREE.SkinnedMesh;
    if (!mesh.isSkinnedMesh) {
      return;
    }
    for (const bone of mesh.skeleton.bones) {
      bones.add(bone);
    }
  });
  return bones;
}

function buildNodePaths(root: THREE.Object3D, node: THREE.Object3D): string[] {
  const path = getObjectPath(node, root);
  if (!path) {
    return [];
  }
  const paths = [path];
  if (path.startsWith("body/")) {
    paths.push(`sit_body/${path.slice("body/".length)}`);
  }
  return paths;
}

function getObjectPath(node: THREE.Object3D, stopAt?: THREE.Object3D): string {
  const names: string[] = [];
  let current: THREE.Object3D | null = node;
  while (current && current !== stopAt) {
    if (current.name && !current.name.startsWith("Loaded:")) {
      names.unshift(current.name);
    }
    current = current.parent;
  }
  return names.join("/");
}

function resolveNode(
  resolution: NodeResolution,
  sourcePath?: string | null,
  sourceName?: string | null
): THREE.Object3D | null {
  for (const candidate of enumeratePathCandidates(sourcePath)) {
    const node = resolution.nodeByPath.get(candidate);
    if (node) {
      return node;
    }
  }

  if (sourceName) {
    return resolution.nodeByName.get(sourceName)?.[0] ?? null;
  }
  return null;
}

function enumeratePathCandidates(sourcePath?: string | null): string[] {
  if (!sourcePath) {
    return [];
  }

  const paths = [sourcePath];
  if (sourcePath.startsWith("sit_body/")) {
    paths.push(`body/${sourcePath.slice("sit_body/".length)}`);
  }

  const faceHumanoidPrefix = "face/Position/Hip/Waist/Spine/Chest/Neck/Head";
  const bodyHumanoidPrefix = "body/Position/PositionOffset/Hip/Waist/Spine/Chest/Neck/Head";
  if (sourcePath.startsWith(faceHumanoidPrefix)) {
    paths.push(bodyHumanoidPrefix + sourcePath.slice(faceHumanoidPrefix.length));
  }

  const facePositionPrefix = "face/Position/Hip";
  const bodyPositionPrefix = "body/Position/PositionOffset/Hip";
  if (sourcePath.startsWith(facePositionPrefix)) {
    paths.push(bodyPositionPrefix + sourcePath.slice(facePositionPrefix.length));
  }
  return paths;
}

function vectorFromRaw(
  value?: { X?: number; Y?: number; Z?: number } | null,
  fallback = new THREE.Vector3(0, 0, 0)
): THREE.Vector3 {
  return new THREE.Vector3(value?.X ?? fallback.x, value?.Y ?? fallback.y, value?.Z ?? fallback.z);
}

function vectorFromArray(values?: number[]): THREE.Vector3 {
  return new THREE.Vector3(values?.[0] ?? 0, values?.[1] ?? 0, values?.[2] ?? 0);
}

function readRawNumber(raw: JsonRecord, key: string, fallback: number): number {
  const value = raw[key] ?? raw[key[0].toUpperCase() + key.slice(1)];
  return typeof value === "number" ? value : fallback;
}

function readRawBoolean(raw: JsonRecord, key: string, fallback: boolean): boolean {
  const value = raw[key] ?? raw[key[0].toUpperCase() + key.slice(1)];
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return value !== 0;
  }
  return fallback;
}

function readRawObjectPathId(raw: JsonRecord, key: string): number | null {
  const value = asRecord(raw[key] ?? raw[key[0].toUpperCase() + key.slice(1)]);
  return readFiniteNumber(value?.m_PathID ?? value?.m_pathID ?? value?.pathId);
}

function calcUtjManagerTimeStep(
  unityDeltaTime: number,
  simulationFrameRate: number,
  slowMotionScale: number
): number {
  const deltaTime = simulationFrameRate > 0 ? 1.0 / simulationFrameRate : unityDeltaTime;
  return slowMotionScale === 1.0 ? deltaTime : deltaTime * slowMotionScale;
}

function buildManagerSettingsByPathId(springBone: JsonRecord | null): Map<number, ManagerSettings> {
  const result = new Map<number, ManagerSettings>();
  const raw = asRecord(springBone?.raw ?? springBone?.Raw);
  addManagerSettingsFromPart(asRecord(raw?.Body ?? raw?.body), result);
  addManagerSettingsFromPart(asRecord(raw?.Head ?? raw?.head), result);
  return result;
}

function addManagerSettingsFromPart(part: JsonRecord | null, result: Map<number, ManagerSettings>): void {
  const managers = part?.Managers ?? part?.managers;
  if (!Array.isArray(managers)) {
    return;
  }

  for (const managerValue of managers) {
    const manager = asRecord(managerValue);
    const pathId = readPathId(manager);
    const raw = asRecord(manager?.Raw ?? manager?.raw);
    const dynamicRatio = readFiniteNumber(raw?.dynamicRatio ?? raw?.DynamicRatio);
    if (pathId === null) {
      continue;
    }
    result.set(pathId, {
      dynamicRatio: THREE.MathUtils.clamp(dynamicRatio ?? 0.5, 0, 1),
      // Sekai.Core.CharacterModel.SetupSpringBone overwrites this with an empty list.
      animatedBoneNames: new Set<string>(),
      simulationFrameRate: readFiniteNumber(raw?.simulationFrameRate ?? raw?.SimulationFrameRate) ?? 60,
      slowMotionScale: readFiniteNumber(raw?.slowMotionScale ?? raw?.SlowMotionScale) ?? 1,
      bounce: readFiniteNumber(raw?.bounce ?? raw?.Bounce) ?? 0,
      friction: readFiniteNumber(raw?.friction ?? raw?.Friction) ?? 1,
    });
  }
}

function readPathId(value: JsonRecord | null): number | null {
  return readFiniteNumber(value?.PathId ?? value?.pathId ?? value?.sourcePathId);
}

function readFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function resolveManagerSettings(
  spring: CandidateSpring,
  managerSettingsByPathId: ReadonlyMap<number, ManagerSettings>
): ManagerSettings {
  const settings = typeof spring.managerPathId === "number"
    ? managerSettingsByPathId.get(spring.managerPathId)
    : undefined;
  const dynamicRatio = settings?.dynamicRatio ?? 0.5;
  const simulationFrameRate = readFiniteNumber(spring.simulationFrameRate) ?? settings?.simulationFrameRate ?? 60;
  const slowMotionScale = readFiniteNumber(spring.slowMotionScale) ?? settings?.slowMotionScale ?? 1;
  const bounce = readFiniteNumber(spring.bounce) ?? settings?.bounce ?? 0;
  const friction = readFiniteNumber(spring.friction) ?? settings?.friction ?? 1;
  const animatedBoneNames = readStringSet(spring.animatedBoneNames);
  if (typeof spring.dynamicRatio === "number" && Number.isFinite(spring.dynamicRatio)) {
    return {
      dynamicRatio: THREE.MathUtils.clamp(spring.dynamicRatio, 0, 1),
      animatedBoneNames,
      simulationFrameRate,
      slowMotionScale,
      bounce,
      friction,
    };
  }
  return {
    dynamicRatio,
    animatedBoneNames,
    simulationFrameRate,
    slowMotionScale,
    bounce,
    friction,
  };
}

function isBoneAnimated(
  joint: CandidateJoint,
  node: THREE.Object3D,
  settings: ManagerSettings
): boolean {
  if (settings.animatedBoneNames.size === 0) {
    return false;
  }
  return containsAnimatedBoneName(node.name, settings.animatedBoneNames) ||
    (typeof joint.nodeName === "string" && containsAnimatedBoneName(joint.nodeName, settings.animatedBoneNames));
}

function containsAnimatedBoneName(
  nodeName: string,
  animatedBoneNames: ReadonlySet<string>
): boolean {
  if (animatedBoneNames.has(nodeName)) {
    return true;
  }
  for (const animatedBoneName of animatedBoneNames) {
    if (animatedBoneName.length > 0 && nodeName.includes(animatedBoneName)) {
      return true;
    }
  }
  return false;
}

function readStringSet(value: unknown): ReadonlySet<string> {
  if (!Array.isArray(value)) {
    return new Set<string>();
  }
  return new Set(value.filter((item): item is string => typeof item === "string"));
}

function constrainFUnitAxisLimit(
  limit: UtjAngleLimit,
  vector: THREE.Vector3,
  forwardAxis: "x" | "y" | "z",
  constrainedAxis: "x" | "y" | "z",
  orthogonalAxis: "x" | "y" | "z"
): boolean {
  if (!limit.active) {
    return false;
  }

  const x = vector[forwardAxis];
  const y = vector[constrainedAxis];
  const z = vector[orthogonalAxis];
  const planarLengthSq = x * x + y * y;
  if (planarLengthSq < 0.00000001) {
    return false;
  }

  const planarLength = Math.sqrt(planarLengthSq);
  const cosMin = Math.cos(THREE.MathUtils.degToRad(limit.min));
  const cosMax = Math.cos(THREE.MathUtils.degToRad(limit.max));
  const limitCos = y > 0 ? cosMin : cosMax;
  if (-x / planarLength >= limitCos) {
    return false;
  }

  if (limitCos <= 0.9999) {
    const ySignProbe = -y / planarLength;
    const sinLimit = Math.sqrt(Math.max(0, 1 - limitCos * limitCos));
    const signedSinLimit = ySignProbe >= 0 ? sinLimit : -sinLimit;
    vector[forwardAxis] = planarLength * -limitCos;
    vector[constrainedAxis] = planarLength * -signedSinLimit;
    normalizeAxisTriplet(vector, forwardAxis, constrainedAxis, orthogonalAxis);
    return true;
  }

  const bothLimitsAreZero =
    Math.abs(limit.min) <= 0.0001 &&
    Math.abs(limit.max) <= 0.0001;
  const remainingSq = 1 - z * z;
  let nextX = remainingSq <= 0.00000001 ? 0 : -Math.sqrt(Math.max(0, remainingSq));
  if (x > 0 && bothLimitsAreZero) {
    nextX = -nextX;
  }
  vector[forwardAxis] = nextX;
  vector[constrainedAxis] = 0;
  normalizeAxisTriplet(vector, forwardAxis, constrainedAxis, orthogonalAxis);
  return true;
}

function normalizeAxisTriplet(
  vector: THREE.Vector3,
  xAxis: "x" | "y" | "z",
  yAxis: "x" | "y" | "z",
  zAxis: "x" | "y" | "z"
): void {
  const x = vector[xAxis];
  const y = vector[yAxis];
  const z = vector[zAxis];
  const lengthSq = x * x + y * y + z * z;
  if (lengthSq <= 0.00000001) {
    vector[xAxis] = 1;
    vector[yAxis] = 0;
    vector[zAxis] = 0;
    return;
  }
  const inverseLength = 1 / Math.sqrt(lengthSq);
  vector[xAxis] = x * inverseLength;
  vector[yAxis] = y * inverseLength;
  vector[zAxis] = z * inverseLength;
}

function quaternionsAlmostEqual(a: THREE.Quaternion, b: THREE.Quaternion): boolean {
  return Math.abs(a.x - b.x) < 0.000001 &&
    Math.abs(a.y - b.y) < 0.000001 &&
    Math.abs(a.z - b.z) < 0.000001 &&
    Math.abs(a.w - b.w) < 0.000001;
}

function addPeriodically(currentValue: number, deltaValue: number, period: number): number {
  let value = currentValue + deltaValue;
  if (period <= 0) {
    return value;
  }
  while (value >= period) {
    value -= period;
  }
  return value;
}

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object"
    ? (value as JsonRecord)
    : null;
}
