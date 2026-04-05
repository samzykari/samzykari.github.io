import {
  Scene,
  FollowCamera,
  Vector3,
  HemisphericLight,
  DirectionalLight,
  PointLight,
  Color3,
  Color4,
  ShadowGenerator,
  AbstractMesh,
} from "@babylonjs/core";
import { BiomeType } from "../types";
import {
  CAMERA_RADIUS,
  CAMERA_HEIGHT_OFFSET,
  CAMERA_ROTATION_OFFSET,
} from "../constants";

export interface BiomeSetup {
  camera: FollowCamera;
  shadowGenerator: ShadowGenerator | null;
}

/** Bright daytime palette per biome. */
interface BiomePalette {
  sky: Color4;
  fog: Color3;
  ambient: Color3;
  ambientGround: Color3;
  sunColor: Color3;
  accentA: Color3;
  accentB: Color3;
}

const BIOME_PALETTES: Record<BiomeType, BiomePalette> = {
  [BiomeType.ModernCity]: {
    sky: new Color4(0.529, 0.808, 0.980, 1),       // #87CEFA
    fog: new Color3(0.529, 0.808, 0.980),
    ambient: new Color3(0.85, 0.9, 1.0),
    ambientGround: new Color3(0.5, 0.55, 0.65),
    sunColor: new Color3(1.0, 0.97, 0.9),
    accentA: new Color3(0, 0.898, 1),               // #00E5FF
    accentB: new Color3(1, 0, 0.498),               // #FF007F
  },
  [BiomeType.DesertCanyon]: {
    sky: new Color4(0, 0.706, 0.847, 1),            // #00B4D8
    fog: new Color3(0.75, 0.65, 0.55),
    ambient: new Color3(0.95, 0.85, 0.75),
    ambientGround: new Color3(0.55, 0.45, 0.35),
    sunColor: new Color3(1.0, 0.92, 0.8),
    accentA: new Color3(1, 0.549, 0),               // #FF8C00
    accentB: new Color3(0.886, 0.447, 0.357),       // #E2725B
  },
  [BiomeType.CoastalHighway]: {
    sky: new Color4(1, 0.498, 0.314, 1),            // #FF7F50 (coral sunset)
    fog: new Color3(1, 0.75, 0.55),
    ambient: new Color3(1.0, 0.88, 0.78),
    ambientGround: new Color3(0.6, 0.5, 0.45),
    sunColor: new Color3(1.0, 0.85, 0.65),
    accentA: new Color3(0, 0.941, 1),               // #00F0FF
    accentB: new Color3(0.596, 1, 0.596),           // #98FF98
  },
};

export class SceneFactory {
  static setupCamera(scene: Scene, target: AbstractMesh): FollowCamera {
    const camera = new FollowCamera(
      "followCam",
      new Vector3(0, CAMERA_HEIGHT_OFFSET, -CAMERA_RADIUS),
      scene
    );
    camera.radius = CAMERA_RADIUS;
    camera.heightOffset = CAMERA_HEIGHT_OFFSET;
    camera.rotationOffset = CAMERA_ROTATION_OFFSET;
    camera.cameraAcceleration = 0.05;
    camera.maxCameraSpeed = 50;
    camera.lockedTarget = target;
    camera.minZ = 0.5;
    camera.maxZ = 1000;
    scene.activeCamera = camera;
    return camera;
  }

  static setupBiome(scene: Scene, biome: BiomeType): ShadowGenerator | null {
    // Clear existing lights
    scene.lights.slice().forEach((l) => l.dispose());
    // Clear old sun disc if any
    scene.meshes
      .filter((m) => m.name === "synthSun")
      .forEach((m) => m.dispose());

    const p = BIOME_PALETTES[biome];

    // Bright sky
    scene.clearColor = p.sky;
    scene.fogMode = Scene.FOGMODE_EXP2;
    scene.fogDensity = 0.0008;
    scene.fogColor = p.fog;
    scene.ambientColor = p.ambient;

    // Hemisphere light (sky + ground fill)
    const hemi = new HemisphericLight(
      "hemi_light",
      new Vector3(0, 1, 0),
      scene
    );
    hemi.diffuse = p.ambient;
    hemi.groundColor = p.ambientGround;
    hemi.intensity = 1.5;

    // Accent point lights (follow player via LightingManager)
    const lightA = new PointLight("accent_a", new Vector3(-10, 6, 0), scene);
    lightA.diffuse = p.accentA;
    lightA.specular = p.accentA.scale(0.4);
    lightA.range = 120;
    lightA.intensity = 0.8;

    const lightB = new PointLight("accent_b", new Vector3(10, 6, 0), scene);
    lightB.diffuse = p.accentB;
    lightB.specular = p.accentB.scale(0.4);
    lightB.range = 120;
    lightB.intensity = 0.8;

    // Strong directional sun for shadows
    const sunDir = new DirectionalLight(
      "sun_light",
      new Vector3(-0.4, -1, 0.6),
      scene
    );
    sunDir.diffuse = p.sunColor;
    sunDir.intensity = 1.3;

    const sg = new ShadowGenerator(2048, sunDir);
    sg.useBlurExponentialShadowMap = true;
    sg.blurKernel = 32;
    return sg;
  }
}
