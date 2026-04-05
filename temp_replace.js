      const gapY = -30; // Large vertical gap for clear separation
      const distZ = -12; // Z depth for the items
      const camZ = 0; // Camera stays at 0
      
      const scenePositions = [
          { x: 0, y: gapY * 0, z: distZ },      // 1: Intro
          { x: 0, y: gapY * 1, z: distZ },      // 2: What I Do
          { x: 0, y: gapY * 2, z: distZ },      // 3: Computer Stuff
          { x: 0, y: gapY * 3, z: distZ },      // 4: Cars
          { x: 0, y: gapY * 4, z: distZ },      // 5: Electronics
          { x: 0, y: gapY * 5, z: distZ },      // 6: Advice (No Photo)
          { x: 0, y: gapY * 6, z: distZ },      // 7: Gaming
          { x: 0, y: gapY * 7, z: distZ }       // 8: Watching
      ];
      window.aboutScenePositions = scenePositions;

      const waypoints = [
          { camPos: new THREE.Vector3(0, scenePositions[0].y, camZ) },
          { camPos: new THREE.Vector3(0, scenePositions[1].y, camZ) },
          { camPos: new THREE.Vector3(0, scenePositions[2].y, camZ) },
          { camPos: new THREE.Vector3(0, scenePositions[3].y, camZ) },
          { camPos: new THREE.Vector3(0, scenePositions[4].y, camZ) },
          { camPos: new THREE.Vector3(0, scenePositions[5].y, camZ) },
          { camPos: new THREE.Vector3(0, scenePositions[6].y, camZ) },
          { camPos: new THREE.Vector3(0, scenePositions[7].y, camZ) },
          { camPos: new THREE.Vector3(0, scenePositions[7].y - 12, camZ - 3) } // 9: Terminal (drops further down and angles slightly)
      ];

      for(let i = 0; i < 8; i++) {
          waypoints[i].lookAt = new THREE.Vector3(scenePositions[i].x, scenePositions[i].y, scenePositions[i].z);

          if (i === 5) {
              window.about3DObjects.push(null);
              continue; // Skip rendering the 3D photo for the Advice page
          }

          let group;
          if (i === 0) group = createImageGroup(tex1, 16, 9, i); // Page 1
          else if (i === 1) group = createImageGroup(vid2, 16, 9, i); // Page 2
          else if (i === 2) {
              // Computer Stuff - Render 3 smaller overlapping photos in an arc
              group = new THREE.Group();
              group.userData.fitIndex = i;
              group.userData.aboutIndex = i;
              group.userData.onSizeUpdate = () => applyGroupFit(group, i);
              const img1 = createImageGroup(tex3_1, 9, 5.06); img1.position.set(-7.5, 1.5, 0.5); img1.rotation.z = 0.05; img1.rotation.y = 0.15;
              const img2 = createImageGroup(tex3_2, 9, 5.06); img2.position.set(0, 0, 1.5); // Center front
              const img3 = createImageGroup(tex3_3, 9, 5.06); img3.position.set(7.5, -1.5, 0.5); img3.rotation.z = -0.05; img3.rotation.y = -0.15;
              group.add(img1, img2, img3);
          }
          else if (i === 3) group = createImageGroup(vid4, 16, 6.7, i); // Cars
          else if (i === 4) group = createImageGroup(vid5, 16, 9, i); // Electronics
          else if (i === 6) group = createImageGroup(vid7, 16, 9, i); // Gaming
          else if (i === 7) group = createImageGroup(vid8, 9, 10.5, i); // Watching

          if (group) {
              group.position.set(scenePositions[i].x, scenePositions[i].y, scenePositions[i].z);
              // Slight rotation variations to make it more 3D and fun
              if (i !== 2) {
                  group.rotation.y = (Math.random() - 0.5) * 0.15;
                  group.rotation.x = (Math.random() - 0.5) * 0.1;
              }
              applyGroupFit(group, i);
              scene.add(group);
              window.about3DObjects.push({
                  mesh: group,
                  baseY: scenePositions[i].y,
                  baseScale: group.scale.clone(),
                  floatSpeed: 0.8 + Math.random() * 0.4,
                  floatAmplitude: 0.5 + Math.random() * 0.3,
                  floatOffset: i
              });
          }
      }

      // LookAt for 9th waypoint (looks towards the previous section but slightly down)
      waypoints[8].lookAt = new THREE.Vector3(scenePositions[7].x, scenePositions[7].y - 5, scenePositions[7].z);

      camera.position.copy(waypoints[0].camPos);
      camera.lookAt(waypoints[0].lookAt);
