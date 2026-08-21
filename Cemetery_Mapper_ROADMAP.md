# Cemetery Mapper — Architecture & Development Roadmap

## 0. Purpose

This document is the single implementation roadmap for the **Cemetery Mapper** project.

When the user says:

> **«Делаем следующий шаг»**

Codex should:

1. open this roadmap;
2. identify the first incomplete milestone;
3. implement only that milestone and its direct prerequisites;
4. run the required checks;
5. report what changed, what was tested, and what remains;
6. update milestone status in this file;
7. commit and push to `master` unless explicitly told not to.

Do not jump several milestones ahead unless required to make the current milestone functional.

---

# 1. Product Goal

Cemetery Mapper is a mobile-first system for building an **approximate, human-readable 3D map of a cemetery while the user walks with a phone**.

The user should:

```text
Start Mapping
↓
camera starts immediately
↓
objects are automatically segmented
↓
already-seen objects stay tracked
↓
visible surfaces are reconstructed
↓
new viewpoints add previously unseen surfaces
↓
phone displays the growing 3D scene
```

The system must support arbitrary visible objects, not only gravestones:

- gravestones;
- crosses;
- slabs;
- fences;
- benches;
- trees;
- paths;
- signs;
- monuments;
- other cemetery objects.

The system does **not** need to hallucinate the invisible side of an object.

If a surface was never observed by the camera, it should remain absent until the user sees it.

---

# 2. Non-Goals for the First Architecture

Do not make these part of the critical path:

- OCR;
- genealogy database;
- name recognition;
- automatic inscription transcription;
- dedicated YOLO grave detector;
- training on tens of thousands of grave images;
- TripoSR as the primary mapper;
- InstantMesh as the primary mapper;
- photorealistic NeRF reconstruction;
- 3D Gaussian Splatting as the primary representation;
- fake geometry;
- fake depth;
- heuristic object boxes pretending to be AI;
- manually taking every photo;
- manually confirming every object;
- point cloud as the final user-facing result;
- voxel visualization in the mobile UI;
- browser SLAM as the primary Android tracking system;
- WebXR as a required foundation.

Point clouds, voxels and TSDF are allowed **internally** as reconstruction structures.

The user-facing result must be a **triangle mesh scene**.

---

# 3. High-Level Architecture

```text
┌──────────────────────────────────────┐
│            ANDROID CLIENT            │
│                                      │
│  Kotlin                              │
│  CameraX                             │
│  ARCore                              │
│  Jetpack Compose                     │
│  Filament / SceneView                │
│                                      │
│  provides:                           │
│  - RGB frames                        │
│  - camera pose                       │
│  - camera intrinsics                 │
│  - ARCore depth when available       │
└──────────────────┬───────────────────┘
                   │
                   │ Persistent WebSocket
                   │
                   ▼
┌──────────────────────────────────────┐
│          WINDOWS GPU BACKEND         │
│                                      │
│  Python                              │
│  FastAPI                             │
│  PyTorch + CUDA                      │
│  OpenCV                              │
│                                      │
│  SAM 2.1                             │
│  object discovery + video tracking   │
│                                      │
│  Depth provider                      │
│  - ARCore depth preferred            │
│  - Depth Anything fallback           │
│                                      │
│  Object Registry                     │
│  Per-object surface fusion           │
│  Open3D TSDF                         │
│  Triangle mesh extraction            │
└──────────────────┬───────────────────┘
                   │
                   │ mask/object/mesh updates
                   ▼
┌──────────────────────────────────────┐
│            ANDROID RENDERER          │
│                                      │
│  Camera overlay                      │
│  object scan status                  │
│  persistent 3D scene                 │
│  triangle meshes                     │
└──────────────────────────────────────┘
```

---

# 4. Fixed Technology Stack

## 4.1 Android

```text
Android
Kotlin
Jetpack Compose
CameraX
ARCore
Filament / SceneView
OkHttp WebSocket
Kotlin Coroutines
```

Android is the primary scanner.

The browser/PWA is no longer the primary scanning runtime.

The existing `web/` project remains useful for:

- GitHub Pages;
- debug tools;
- development visualization;
- future browser viewer;
- admin/review UI.

## 4.2 Backend

```text
Python 3.x
FastAPI
Uvicorn
PyTorch
CUDA
OpenCV
NumPy
SAM 2.1
Open3D
Depth Anything
```

Optional later:

- TensorRT;
- ONNX Runtime GPU;
- Redis;
- PostgreSQL;
- object storage.

These are not first-phase requirements.

## 4.3 Network

Current public backend:

```text
https://home-pc.tailaf644b.ts.net
```

Exposure:

```text
Tailscale Funnel
```

Primary real-time protocol:

```text
WebSocket
```

Do not use HTTP polling for live mapping.

WebRTC may be introduced later only if JPEG/WebSocket throughput becomes the actual bottleneck.

---

# 5. Core Runtime Pipelines

## 5.1 Android sensor pipeline

```text
CameraX
  │
  ├── RGB frame
  │
ARCore
  │
  ├── camera pose
  ├── intrinsics
  ├── tracking state
  └── depth/confidence when supported
```

Each transmitted frame must be associated with:

```text
session_id
frame_id
timestamp
camera_pose
camera_intrinsics
tracking_state
RGB image
optional depth image
optional depth confidence
```

## 5.2 Universal object segmentation

Main object discovery:

```text
SAM 2.1 Automatic Mask Generator
```

It must discover arbitrary visual objects without requiring cemetery-specific classes.

## 5.3 Video object tracking

After discovery:

```text
SAM 2.1 Video Predictor
```

maintains the object's mask across subsequent frames.

Stable runtime IDs:

```text
object_000001
object_000002
...
```

## 5.4 Discovery + tracking cadence

Do not run full automatic segmentation on every frame.

```text
FAST LOOP
SAM2 video tracking

SLOW LOOP
SAM2 automatic mask discovery
```

Initial target:

```text
tracking: as fast as GPU allows
discovery: ~0.5–2 sec cadence
```

---

# 6. Object Registry

Backend maintains a persistent registry per mapping session.

```python
ObjectRecord:
    object_id
    created_at
    last_seen_at

    current_mask
    current_bbox

    tracking_confidence

    observations
    viewpoints

    scan_coverage

    reconstruction_state

    mesh_revision
```

Lifecycle:

```text
DISCOVERED
↓
TRACKING
↓
RECONSTRUCTING
↓
PARTIALLY_SCANNED
↓
WELL_SCANNED
```

Possible failure state:

```text
LOST
```

Objects must not receive a new ID every frame.

---

# 7. User-Facing Scan State

The camera view should display **mask overlays**, not debug bounding boxes as the main UX.

Recommended states:

```text
NEW / DISCOVERED
yellow

SCANNING
blue

WELL_SCANNED
green

TRACKING_LOST
gray/red indicator if needed
```

No popup confirmation.

No manual frame capture.

No confirmation button per object.

---

# 8. Coverage Model

An object should not be considered complete merely because it appeared in many frames.

Coverage must represent **observed surface viewpoints**.

MVP:

```text
16 or 32 angular bins
```

Example:

```text
front          seen
front-left     seen
left           seen
back-left      unseen
back           unseen
right          unseen
```

This preserves the rule:

> Invisible sides remain absent until observed.

---

# 9. Depth Strategy

Depth source interface:

```text
DepthProvider
```

Implementations:

```text
ARCoreDepthProvider
MonocularDepthProvider
```

Priority:

```text
ARCore Raw Depth available
→ use ARCore depth

otherwise
→ use Depth Anything
```

ARCore is preferred because it can provide metric scale and confidence.

Depth Anything is fallback only. Monocular depth must never be presented as metrically exact without scale calibration.

---

# 10. Surface Reconstruction

Input for one object:

```text
RGB
+
object mask
+
depth
+
camera intrinsics
+
camera pose
```

Pipeline:

```text
masked depth
↓
back-project to camera-space geometry
↓
transform using ARCore world pose
↓
integrate into object's reconstruction volume
```

---

# 11. Internal Fusion Representation

Use per-object:

```text
Open3D TSDF
```

or Open3D tensor equivalent suitable for GPU acceleration.

TSDF/voxels are **internal backend structures only**.

The mobile user never sees the volume.

Backend periodically extracts:

```text
TriangleMesh
```

---

# 12. Mesh Policy

Do not:

- close missing backs automatically;
- mirror visible surfaces;
- extrude a mask into a fake volume;
- invent an entire gravestone from one view;
- use TripoSR to hallucinate hidden geometry in the main mapping pipeline.

Expected:

```text
front seen
→ front mesh exists

side seen later
→ side mesh added

back unseen
→ back remains absent

back observed later
→ back mesh added
```

---

# 13. Mesh Updates to Android

Do not resend the whole scene after every frame.

Conceptual packet:

```text
MESH_UPDATE

object_id
mesh_revision
vertices
normals
indices
colors / UV
bounds
```

Use binary payload where practical.

Do not encode/decode a full scene GLB for every small update.

---

# 14. Android Rendering

User-facing rendering:

```text
Filament / SceneView
```

Required interactions:

- orbit;
- pinch zoom;
- reset view;
- camera-follow mode;
- full 3D view;
- Camera + 3D split mode.

Display triangle mesh surfaces.

Do not expose raw point clouds, voxel cubes or depth debug maps in the normal UI.

---

# 15. Repository Target Structure

```text
cemetery/
│
├── android/
│   ├── app/
│   │   └── src/main/
│   │       ├── camera/
│   │       ├── ar/
│   │       ├── network/
│   │       ├── mapping/
│   │       ├── rendering/
│   │       ├── ui/
│   │       └── models/
│   ├── build.gradle.kts
│   ├── settings.gradle.kts
│   └── gradle/
│
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── api/
│   │   ├── sessions/
│   │   ├── segmentation/
│   │   ├── objects/
│   │   ├── depth/
│   │   ├── reconstruction/
│   │   ├── transport/
│   │   └── config.py
│   ├── models/
│   ├── scripts/
│   ├── tests/
│   └── requirements.txt
│
├── web/
│   └── existing Vite application
│
├── ai/
│   └── experimental/training assets
│
├── docs/
│   ├── ROADMAP.md
│   ├── PROTOCOL.md
│   └── ARCHITECTURE.md
│
└── .github/
    └── workflows/
```

Do not perform a destructive repository reorganization in one commit.

Migrate incrementally.

---

# 16. Transport Protocol

Start with one persistent WebSocket session.

Android → backend:

```text
SESSION_START
FRAME
SESSION_STOP
PING
```

Backend → Android:

```text
SESSION_READY
OBJECT_UPDATE
MASK_UPDATE
MESH_UPDATE
OBJECT_REMOVED
ERROR
PONG
```

Protocol version:

```text
protocol_version = 1
```

Breaking changes later must increment it.

---

# 17. Android Development Workflow

Use one stable debug app package.

Fast local workflow:

```text
./gradlew assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

Add helper:

```text
scripts/android-dev.ps1
```

It should build, detect device, install with `adb install -r`, and optionally launch the app.

---

# 18. Windows Backend Startup

Eventually backend must start automatically after Windows boot.

Target:

```text
Windows Task Scheduler
```

or a Windows service.

Requirements:

- start after boot/login;
- restart on failure;
- write logs;
- CUDA environment available;
- Tailscale already running.

Do this after the mapping MVP works.

---

# 19. GitHub Actions

Keep existing web deployment.

Target workflows:

```text
.github/workflows/
    deploy-pages.yml
    android-debug.yml
    android-release.yml
```

Do not add production signing secrets during the first Android milestone.

---

# 20. Milestones

## M0 — Architecture Freeze

**Status: COMPLETE**

Goal: freeze the technical direction represented by this document.

Decisions:

- Android native Kotlin;
- ARCore for phone pose;
- SAM 2.1 for universal segmentation/tracking;
- ARCore depth preferred;
- Depth Anything fallback;
- per-object reconstruction;
- Open3D TSDF internally;
- user-facing triangle mesh;
- WebSocket transport;
- Windows GPU backend.

Acceptance: this roadmap exists and future development follows it.

---

## M1 — Android Skeleton + Repeatable Debug Install

**Status: COMPLETE**

Completed in commit: 8417a0b

Implement:

- `android/`;
- Kotlin;
- Jetpack Compose;
- ARCore-compatible minimum Android configuration;
- camera permission;
- internet permission;
- basic app screen;
- backend URL configuration;
- debug/release build types;
- app version metadata;
- `scripts/android-dev.ps1`.

Acceptance:

- debug APK builds;
- installs over previous version with `adb install -r`;
- no manual uninstall required;
- app launches on target Android phone;
- stable package name;
- no AI required yet.

Implemented:

- native Kotlin Android project under `android/`;
- stable package name `com.cemetery.mapper`;
- Jetpack Compose launch screen;
- Android 26 minimum / Android 35 target;
- internet permission;
- Gradle wrapper 8.11.1;
- repeatable debug install script `scripts/android-dev.ps1`.

---

## M2 — Android CameraX Live Camera

**Status: COMPLETE**

Completed in commit: pending

Implement:

- CameraX preview;
- rear camera;
- frame analysis pipeline;
- lifecycle;
- orientation handling;
- configurable resolution/FPS;
- permission UX.

Acceptance:

- Start Mapping opens camera immediately;
- stable live preview;
- no manual shutter;
- frames programmatically available;
- rotation does not break capture;
- no obvious memory leak after several minutes.

Implemented:

- CameraX rear-camera preview;
- runtime camera permission;
- CameraX image analysis with latest-frame backpressure;
- lifecycle-bound camera provider;
- Start Mapping opens the camera immediately after permission;
- Stop Mapping releases the camera screen;
- Cemetery Mapper launcher icon.

---

## M3 — ARCore Pose + Intrinsics

**Status: TODO**

Implement:

- ARCore session;
- camera world pose;
- quaternion/rotation;
- camera intrinsics;
- tracking state;
- aligned timestamps.

Acceptance:

- every valid frame can be paired with pose + intrinsics;
- coordinates remain reasonably stable while moving;
- returning near the start produces approximately the same world location;
- tracking loss explicitly detectable;
- no fabricated pose when tracking is lost.

---

## M4 — ARCore Depth Capture

**Status: TODO**

Implement:

- Raw Depth API where supported;
- depth confidence;
- alignment with camera image;
- capability detection;
- graceful unsupported fallback.

Acceptance:

- supported device returns real depth;
- unsupported device does not crash;
- depth aligned with frame timestamp;
- no fake depth.

---

## M5 — Versioned WebSocket Transport

**Status: TODO**

Implement FastAPI WebSocket endpoint.

Android sends:

```text
session
frame
pose
intrinsics
optional depth
```

Implement:

- reconnect;
- session IDs;
- frame IDs;
- bounded send queue;
- dropped-frame policy;
- binary payload;
- protocol version.

Acceptance:

- streams continuously for >= 5 minutes;
- backend knows frame IDs;
- pose corresponds to frame;
- disconnect does not crash Android;
- reconnect works;
- queue stays bounded;
- current HTTP 422 live-mapping path is no longer critical.

---

## M6 — Backend SAM 2.1 Model Service

**Status: TODO**

Implement real SAM 2.1 CUDA service.

Requirements:

- real weights;
- CUDA;
- warm-up;
- no fake segmentation;
- model health state;
- model loaded once.

Acceptance:

- test image produces real masks;
- valid mask dimensions;
- CUDA used;
- clear `SAM2_MODEL_UNAVAILABLE` on failure.

---

## M7 — Automatic Object Discovery

**Status: TODO**

Use SAM 2.1 automatic mask generation.

Allowed filters:

- stability score;
- predicted IoU;
- mask area;
- duplicate suppression.

No cemetery-specific fake heuristics.

Acceptance scene:

```text
desk
cup
monitor
keyboard
plant
```

Expected: several meaningful masks with no user click.

---

## M8 — SAM 2.1 Video Object Tracking

**Status: TODO**

Implement persistent masks across video.

Each object has a stable `object_id`.

Discovery periodically adds newly visible objects.

Acceptance:

- same cup keeps same object ID;
- same monitor keeps same ID;
- partial occlusion does not instantly create a new object;
- newly visible object receives a new ID;
- masks update automatically.

---

## M9 — Android Live Mask Overlay

**Status: TODO**

Backend sends mask/object updates.

Android overlays masks with states:

```text
DISCOVERED
SCANNING
WELL_SCANNED
LOST
```

Acceptance:

- masks approximately align with camera objects;
- no popup;
- no manual object selection;
- responsive overlay;
- persistent IDs behind the scenes.

---

## M10 — Object Registry + Coverage

**Status: TODO**

Track:

- object ID;
- observations;
- camera viewpoints;
- angular coverage bins;
- last seen;
- tracking confidence.

Acceptance:

- front-only observation does not mark back as scanned;
- moving around object increases coverage;
- object transitions DISCOVERED → SCANNING → WELL_SCANNED;
- overlay reflects state.

---

## M11 — RGB-D Masked Surface Backprojection

**Status: TODO**

For one tracked object:

```text
mask
+
depth
+
intrinsics
+
pose
```

→ world-space visible surface geometry.

Internal points are allowed at this stage only.

Acceptance:

- geometry in approximately correct world location;
- existing geometry does not arbitrarily move with camera;
- metric dimensions when ARCore depth is used;
- invalid/low-confidence depth rejected.

---

## M12 — Single Object TSDF Fusion

**Status: TODO**

Use Open3D TSDF internally.

Initial tests:

```text
cup or box
```

then:

```text
gravestone-like vertical object
```

Acceptance:

- view 1 contributes front;
- view 2 contributes side;
- repeated observations improve same reconstruction;
- unseen back remains absent;
- no duplicated object copy.

---

## M13 — Triangle Mesh Extraction

**Status: TODO**

Implement:

- mesh extraction;
- normals;
- basic cleanup;
- optional decimation;
- bounds;
- revision number.

Acceptance:

- valid triangle mesh;
- opens in standard viewer;
- visible shape resembles observed object;
- unseen surfaces are not artificially filled.

---

## M14 — Android 3D Mesh Viewer

**Status: TODO**

Implement Filament / SceneView.

Modes:

```text
CAMERA
CAMERA + 3D
3D
```

Interactions:

- rotate;
- pinch zoom;
- reset;
- optional follow-camera.

Acceptance:

- triangle mesh visible;
- no raw point cloud as primary view;
- no voxel cubes;
- touch controls work;
- mesh revision can update the object.

---

## M15 — Incremental Mesh Updates

**Status: TODO**

Implement:

```text
object_id
mesh_revision
mesh payload
```

Only changed objects update.

Acceptance:

- updating one object does not reload all others;
- scene remains visible during updates;
- out-of-order revisions cannot corrupt scene;
- bandwidth measured.

---

## M16 — Multi-Object Reconstruction

**Status: TODO**

Backend keeps separate reconstruction for each object.

Acceptance scene:

- desk;
- cup;
- monitor;
- plant.

Expected:

- multiple separate meshes;
- approximate relative placement;
- independent coverage;
- reconstructing one object does not destroy another.

---

## M17 — Persistent World Scene

**Status: TODO**

Maintain global ARCore session coordinates.

Acceptance:

1. scan A;
2. turn toward B;
3. scan B;
4. open 3D view.

Both remain.

Returning to A approximately aligns new observations with the existing object.

---

## M18 — Outdoor Cemetery MVP

**Status: TODO**

First outdoor test without OCR.

Test:

- one gravestone;
- multiple gravestones;
- fence;
- path;
- vegetation;
- variable sunlight.

Acceptance:

- gravestone gets usable SAM mask;
- tracking survives moderate movement;
- visible surfaces reconstruct;
- scanned-state overlay works;
- multiple objects persist in 3D;
- no cemetery-trained YOLO required.

---

## M19 — Depth Anything Fallback

**Status: TODO**

Backend fallback for devices without usable ARCore depth.

Acceptance:

- no-depth device still reconstructs approximate surfaces;
- metric vs relative reconstruction clearly distinguished;
- fallback does not break ARCore path.

---

## M20 — Performance Pass

**Status: TODO**

Measure:

- capture FPS;
- network throughput;
- SAM tracking FPS;
- discovery latency;
- depth latency;
- TSDF integration time;
- mesh extraction time;
- mesh update size;
- Android render FPS;
- VRAM.

Optimize only measured bottlenecks.

Acceptance:

- stable long session;
- bounded memory;
- usable Android FPS;
- backend queue does not grow indefinitely.

---

## M21 — Session Save/Load

**Status: TODO**

Persist:

- session metadata;
- objects;
- world transforms;
- coverage;
- meshes;
- revisions.

Filesystem persistence is acceptable initially.

Acceptance:

- restart;
- reload session;
- restore scene;
- preserve object IDs within saved session.

---

## M22 — Automatic Backend Startup on Windows

**Status: TODO**

Implement startup script + Task Scheduler/service.

Acceptance:

- reboot Windows;
- backend starts automatically;
- logs available;
- Funnel endpoint becomes reachable.

---

## M23 — GitHub Actions Android Debug Build

**Status: TODO**

Workflow:

```text
checkout
setup JDK
Gradle cache
assembleDebug
upload artifact
```

Acceptance:

- push triggers build;
- APK artifact available;
- local `adb install -r` remains fastest development path.

---

## M24 — Android Release Pipeline

**Status: TODO**

Prepare:

- deterministic versioning;
- signing;
- release APK;
- optional Google Play Internal Testing.

Do only after core scanner works.

---

# 21. Later Milestones — Outside Critical Path

## L1 — Semantic Classification

Optional labels:

```text
gravestone
cross
fence
path
tree
bench
...
```

Segmentation remains independent of classification.

## L2 — OCR

```text
gravestone object
↓
best inscription surface
↓
perspective correction
↓
OCR
↓
structured person data
```

## L3 — Cemetery Database

Store cemetery, grave object, coordinates, mesh, person, inscription, relationships.

## L4 — iPhone Client

After Android stabilizes, likely native Swift / ARKit.

---

# 22. Codex Operating Rules

## Rule 1 — Read Roadmap First

Before implementing:

```text
делаем следующий шаг
```

open:

```text
docs/ROADMAP.md
```

and implement the first incomplete milestone.

## Rule 2 — One Milestone at a Time

Do not prematurely implement later architecture.

## Rule 3 — Real Functionality Only

Never substitute fake:

- mask;
- depth;
- pose;
- mesh;
- AI result.

Expose unavailable dependencies explicitly:

```text
SAM2_MODEL_UNAVAILABLE
ARCORE_DEPTH_UNAVAILABLE
DEPTH_MODEL_UNAVAILABLE
```

## Rule 4 — Preserve Working Infrastructure

Do not destroy current:

- GitHub Pages;
- web app;
- Tailscale;
- useful backend components.

Migrate incrementally.

## Rule 5 — Acceptance Tests Are Mandatory

A milestone is `COMPLETE` only if acceptance criteria were actually tested where environment allows.

If hardware testing is impossible:

```text
IMPLEMENTED_NOT_DEVICE_VERIFIED
```

## Rule 6 — Update This File

After a milestone:

```text
**Status: TODO**
```

→

```text
**Status: COMPLETE**
```

and add:

```text
Completed in commit: <sha>
```

## Rule 7 — Commit Naming

Preferred:

```text
M01 Add Android scanner skeleton
M02 Add CameraX live capture
M03 Add ARCore pose tracking
M04 Add ARCore depth capture
...
```

Push to `master` unless instructed otherwise.

---

# 23. Immediate Next Step

The first incomplete milestone is:

```text
M1 — Android Skeleton + Repeatable Debug Install
```

Therefore when the user next says:

> **«Делаем следующий шаг»**

Codex should begin M1 and **not redesign the architecture again**.

---

# 24. Definition of the First Real Product MVP

The first meaningful Cemetery Mapper MVP is reached when milestones through **M18** are complete.

At that point:

```text
Android camera
+
ARCore pose
+
automatic arbitrary-object masks
+
persistent object IDs
+
scan coverage
+
real observed depth
+
per-object surface fusion
+
triangle meshes
+
live Android 3D scene
+
outdoor gravestone test
```

work end-to-end.

Only after that should the project prioritize OCR, genealogy entities and cemetery database features.

---

# 25. Core Principle

Always preserve:

```text
OBSERVE
→ SEGMENT
→ TRACK
→ MEASURE VISIBLE SURFACE
→ FUSE
→ MESH
→ DISPLAY
```

Never:

```text
SEE ONE IMAGE
→ INVENT COMPLETE OBJECT
```

Cemetery Mapper progressively reconstructs **what the camera actually observed**, while presenting a clean, understandable 3D scene.
