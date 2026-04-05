import { Mesh, Scene } from "@babylonjs/core";
import { LOD_HIGH_DISTANCE, LOD_MEDIUM_DISTANCE, LOD_CULL_DISTANCE } from "../constants";

/**
 * Manages Level-of-Detail for traffic meshes.
 * Since we use simple box meshes (placeholder), LOD currently means
 * visibility scaling. When real models are added, this will switch
 * between high/medium/low poly meshes via Babylon's built-in LOD API.
 */
export class LODManager {
  /** Apply simple distance-based visibility scaling to a mesh based on camera distance. */
  static updateMeshLOD(mesh: Mesh, distanceToCamera: number): void {
    if (distanceToCamera < LOD_HIGH_DISTANCE) {
      mesh.visibility = 1.0;
    } else if (distanceToCamera < LOD_MEDIUM_DISTANCE) {
      // Fade slightly
      mesh.visibility = 0.85;
      // When real models exist: mesh.addLODLevel(LOD_HIGH_DISTANCE, mediumMesh)
    } else if (distanceToCamera < LOD_CULL_DISTANCE) {
      mesh.visibility = 0.5;
    } else {
      mesh.visibility = 0;
    }
  }
}
