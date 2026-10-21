# AI 3D Product Studio

**Status:**

- The requirement was confirmed by the owner on 2026-10-21 (D-029).
- The approach below is **Proposed**.
- Where processing runs, which paid providers are used and the budget are
  open (D-030).
- Nothing is built yet.

**About the figures:**

- Prices and limits were checked on 2026-10-21, with sources linked. They
  change often and are re-checked before any sign-up.
- **Unverified** marks figures that couldn't be confirmed from an official
  source.
- Estimates are labelled as estimates.

## 1. What the owner asked for

- **A reusable module** in the shared dashboard, available to every
  website.
- **Inputs:** several real product photos (front, side, rear, detail).
- **A 3D model that keeps the real product:** shape, proportions, colours,
  materials, finishes, buttons and socket openings. **Nothing is redesigned
  or invented.**
- **Presentation:** an interactive viewer (rotate, zoom) and Apple-style
  product pages.
- **Workflow:** preview, adjust, approve, assign to a product, publish to the
  selected website.
- **Storage:** original photos, models and previews kept for each product.
- **Delivery:** optimised for mobile and desktop, with a fallback image.
- **Cost:** modular providers, chosen for cost.
- **Quality control:**
  - never publish automatically;
  - require the owner's approval;
  - flag models that need better photos or manual correction.
- **Honesty:**
  - distinguish a true interactive 3D model from an AI-generated image or
    animation that only looks 3D;
  - if the photos aren't enough for a reliable model, say so rather than
    presenting an inaccurate result as a true reconstruction.

## 2. The key fact: a few photos can't be measured

Four to six photos (front, side, rear, detail) don't contain enough
information to **measure** a product's shape. To reconstruct a surface, it
must be seen from several overlapping angles, and the parts between those
views are never seen at all.

- **Reconstruction** measures the real object. It needs either the
  product's design files (CAD) or a **full capture**: dozens of overlapping
  photos taken from all around the product ([5.4](#54-capture-guidance)).
- **Generation** (AI image-to-3D) turns a few photos into a convincing model
  quickly and cheaply. But it **invents** whatever the photos don't show and
  approximates proportions and small details: exactly what must not be
  presented as the real product.

The Studio is built around this difference ([section 6](#6-how-the-studio-works)):

1. It checks what was uploaded.
2. It says which kind of result those inputs can honestly produce.
3. It labels every result by how it was made.

## 3. Options compared

| Method | Made from | Faithful to the real product? | What you provide | Cost per product | Best for | Weak at | Label |
|--------|-----------|-------------------------------|------------------|------------------|----------|---------|-------|
| CAD conversion | The manufacturer's 3D design files (STEP/IGES) | **Exact** shape; finishes matched to photos | CAD file, photos for the finishes | US$0 (free tools) | Switches, sockets, frames, modules: rigid, precise parts | Needs the files; gloss and texture matched by hand | Exact (CAD) |
| Photogrammetry | 50–150 overlapping photos, or a video | **Measured**, within the capture's accuracy | A full capture in controlled light | US$0 with free tools on suitable hardware ([5.1](#51-capture-tools-for-measured-models)) | Lamps, fittings, textured accessories | Glossy, plain white and transparent surfaces; very small details; needs clean-up | Measured |
| Gaussian splatting | Many photos, or a video | Real appearance, but no clean surface | A full capture | US$0 with free tools ([5.1](#51-capture-tools-for-measured-models)) | Showcase views, reflective finishes | Large files; no finish switching; can't be edited | Captured view |
| AI image-to-3D | 1–5 photos | **Estimated**: unseen parts invented, small details simplified | A quick capture | ≈ US$0.20–0.90 per attempt ([5.2](#52-ai-image-to-3d-services-results-are-always-ai-estimated)) | Fast drafts; a starting point for an artist | Exact proportions, openings, small buttons, text and logos, the rear side | AI-estimated |
| 3D artist | Photos, dimensions, drawings | High, checked by a person | A quick capture plus the datasheet dimensions | Quoted per product | Hero products; glass and complex finishes | Cost and time per product | Artist-modelled |
| AI video or images | Photos and a prompt | **Not 3D**: generated pictures | Photos | ≈ US$0.10–0.40 per second of video ([5.3](#53-ai-video-that-only-looks-3d)) | Marketing visuals, if approved and labelled | Can't be rotated or measured; the product can drift between frames | AI imagery (not 3D) |

## 4. Recommendation

The most cost-effective route to professional results, for **switches and
sockets** (the main categories):

1. **CAD first.** Ask the factory or supplier for STEP files of each
   product's visible parts; internal parts aren't needed.
   - Conversion costs nothing and gives exact geometry, small files and true
     scale, so "view on your wall" works.
   - Every finish becomes a material variant of one model: a design in five
     finishes needs one model, not five.
2. **Modular assembly,** if the ranges are modular (frames plus inserts).
   Each frame and insert is modelled once, from CAD or by an artist, and the
   Studio assembles products from them, so each further product costs almost
   nothing. To be evaluated when real products are reviewed.
3. **A full capture and photogrammetry** where there is no CAD. A turntable
   and diffuse light are needed ([5.4](#54-capture-guidance)), and glossy
   white plastic will need some clean-up. The software depends on the
   hardware available ([5.1](#51-capture-tools-for-measured-models)):
   - **Free:** Apple Object Capture on a Mac or a LiDAR iPhone, or
     RealityScan or COLMAP on a PC with a suitable graphics card.
   - **Without such hardware:** KIRI Engine's app (US$17.99 a month), which
     has a mode for plain and shiny objects.
4. **AI generation only as a labelled draft,** if the Owner approves a
   provider and a budget. At about US$0.30–0.60 an attempt it's a cheap
   starting point. It is never published without review against the photos
   and dimensions, and it often needs correction.
5. **A 3D artist** for hero products or difficult materials.

**Lamps and lighting:** photogrammetry or an artist. Glass and chrome are
difficult for every automatic method.

**"3D-looking" animations:** render turntables and scroll sequences from
the approved model on the processing runner, which is free and faithful. Use
AI video only for labelled mood visuals.

**Expected cost:**

- **CAD, photogrammetry and processing:** US$0 per model, on free tiers and
  the owner's own hardware.
- **Storage:** under about US$2.50 a month per 100 fully captured products
  ([section 7](#7-storage-requirements-and-running-costs)).
- **AI drafts:** optional, pay-per-use, capped by the Owner's budget.

## 5. Providers and prices (checked 2026-10-21)

**How these were checked:** most figures were read from each provider's
official pages through web search on 2026-10-21, because the pages
themselves couldn't be opened from this environment. Package versions and
licences were read from npm and GitHub directly. Confirm every price and policy on
the live page before signing up. **(u)** marks an unverified or ambiguous
figure.

### 5.1 Capture tools for measured models

| Tool | Runs on | Cost | Automation | Output and notes |
|------|---------|------|------------|------------------|
| [Apple Object Capture](https://developer.apple.com/documentation/realitykit/creating-3d-objects-from-photographs), Mac | macOS 12 or later with a GPU of at least 4 GB that supports ray tracing. Apple silicon is fastest ([WWDC21](https://developer.apple.com/videos/play/wwdc2021/10076/)) | Free, part of macOS | Command line ([Apple sample](https://developer.apple.com/documentation/realitykit/creating-a-photogrammetry-command-line-app)), so the Mac can act as the Studio's self-hosted runner | USDZ or OBJ. "Full" detail: up to 250,000 triangles with 8K textures, including diffuse, normal, roughness and occlusion maps ([detail levels](https://developer.apple.com/documentation/realitykit/photogrammetrysession/request/detail)). There is no metallic map, so metal finishes are set in the Studio. A high feature-sensitivity setting helps plain surfaces. **The best free option.** |
| Apple Object Capture, iPhone or iPad | iOS 17 or later on an iPhone 12 Pro or iPad Pro (2021) or newer, with LiDAR ([WWDC23](https://developer.apple.com/videos/play/wwdc2023/10191/)) | Free | Manual capture app | On the device: "reduced" detail (under 50,000 triangles, 2K textures). The same photos can be processed on a Mac at full detail. LiDAR helps with low-texture objects, and its depth data gives real scale. |
| [Epic RealityScan 2.x](https://www.realityscan.com/license) | Windows with an NVIDIA GPU, or AMD RDNA 3 and later since 2.2. Experimental Linux command-line build. No macOS. | Free if the whole company group's gross revenue in the last 12 months, including funds raised, is under US$1M ([EULA](https://www.realityscan.com/en-US/eula)). Otherwise US$1,250 per seat per year. | Command line and headless mode ([docs](https://dev.epicgames.com/documentation/en-us/realityscan/command-line-operations)) | Professional photogrammetry. Without a supported GPU it can only align photos. |
| [COLMAP 4.2](https://github.com/colmap/colmap) + [OpenMVS 2.4](https://github.com/cdcseacave/openMVS) | Linux, Windows or Mac. The dense step needs NVIDIA CUDA or AMD HIP (COLMAP), or CUDA or Metal (OpenMVS). | Free: BSD-3 (COLMAP) and AGPL-3.0 (OpenMVS) | Command line | Textured mesh. The AGPL concerns the software, not the models it produces; this is an interpretation that needs legal review before use. |
| [Meshroom 2025.1](https://github.com/alicevision/Meshroom) | Windows or Linux with NVIDIA CUDA | Free (MPL-2.0) | Graphical and command line | Without CUDA, only low-quality draft meshes. |
| [KIRI Engine](https://www.kiriengine.app/api) | Cloud: phone app or API | App Pro US$17.99 a month or US$79.99 a year ([pricing](https://www.kiriengine.app/pricing)). API US$1 per model with a US$500 minimum top-up. | API | A "Featureless Object" mode is designed for shiny or plain objects ([feature](https://www.kiriengine.app/features/featureless-object-scan)). Takes 20–300 photos and outputs OBJ, FBX, GLB, USDZ or PLY. Users own their scans and may use them commercially. Training policy not found (u). **The cloud option when there's no suitable hardware.** |
| Polycam, Scaniverse | Cloud or phone | Polycam API only on Enterprise (US$1,200 per user per year, at least 3 users). Scaniverse is free, but commercial rights need Pro (US$50 a month). | — | **Not recommended for unreleased products.** Polycam may license user content for AI training ([privacy](https://poly.cam/privacy_policy)), and Niantic takes a perpetual licence that includes AI training ([Scaniverse terms](https://scaniverse.com/terms/)). |

**Gaussian splatting (captured views):**

- **Training tools:** gsplat and nerfstudio are free (Apache-2.0) but need an
  NVIDIA GPU ([gsplat](https://github.com/nerfstudio-project/gsplat)). The
  original Inria code is non-commercial.
- **File sizes:** about 6–16 MB for a 500,000-splat object in the compact SOG,
  SPZ or `.splat` formats, compared with about 117 MB as PLY. These are
  estimates from the formats' published sizes per splat
  ([SOG](https://developer.playcanvas.com/user-manual/gaussian-splatting/formats/sog/),
  [SPZ](https://github.com/nianticlabs/spz)).
- **Web viewers:** Spark 2.4 (MIT, built on three.js) and the PlayCanvas
  engine (MIT).
- **Standard:** the Khronos registry lists `KHR_gaussian_splatting` as
  ratified in 2026
  ([registry](https://github.com/KhronosGroup/glTF/blob/main/extensions/README.md)).

Splats look real but can't switch finishes, and are larger than the 3 MB
model budget, so they remain an optional showcase.

**Fast reconstruction research models** (VGGT, MASt3R, MapAnything, Depth
Anything 3) estimate camera positions and depth from a few photos, not
finished models. Most of their weights are licensed for non-commercial use
only. They're watched for future use, not used now.

### 5.2 AI image-to-3D services (results are always *AI-estimated*)

| Service | Photos accepted | Output | Price per textured, multi-view model | Entry cost | Uploads used for training? |
|---------|-----------------|--------|--------------------------------------|------------|----------------------------|
| [Tripo](https://developers.tripo3d.ai/en/pricing) H3.1 / P1 | H3.1: four views (front, left, back, right). P1: front required, sides optional ([docs](https://docs.tripo3d.ai/model-generation/multiview-to-model-v3-0-v3-1.html)) | GLB, plus USDZ/FBX/OBJ by conversion; PBR; quad option | H3.1 US$0.20–0.40; quad +US$0.05; detailed geometry +US$0.20. P1 US$0.40–0.60 ([H3.1](https://developers.tripo3d.ai/en/models/v3-1), [P1](https://developers.tripo3d.ai/en/models/p1)) | Pay as you go, top-ups from US$1 | Terms: not for paid users ([terms](https://www.tripo3d.ai/terms)). The privacy policy allows anonymised outputs to improve models ([privacy](https://www.tripo3d.ai/privacy)) |
| [Rodin Gen-2 / 2.5](https://developer.hyper3d.ai/api-specification/rodin-generation-gen2) (Hyper3D) | Up to 5 images | GLB/USDZ/FBX/OBJ; PBR; quad | ≈ US$0.29 on the Business plan; US$0.40 through [fal](https://fal.ai/models/fal-ai/hyper3d/rodin/v2.5/api) | API needs the Business plan, US$120 a month (US$96 billed yearly) ([pricing](https://hyper3d.ai/pricing)), or pay per use through fal | "Not used for training" ([data policy](https://developer.hyper3d.ai/legal/data-policy), page about two years old). Kept 7 days on Business |
| [Tencent HY 3D](https://www.tencentcloud.com/document/product/1284/75540) (Hunyuan 3.0/3.1) | Front, sides, back; 3.1 adds top, bottom and front diagonals | GLB/OBJ/FBX/STL/USDZ; PBR | ≈ US$0.68–0.90 (u) ([pricing](https://www.tencentcloud.com/document/product/1284/75281)); US$0.675 through [fal](https://fal.ai/models/fal-ai/hunyuan-3d/v3.1/pro/image-to-3d) | Prepaid US$15 for 1,000 credits, valid one year | No statement found. Uploads deleted after processing; outputs kept up to 7 days ([data](https://www.tencentcloud.com/document/product/1284/75295)) |
| [Meshy](https://docs.meshy.ai/en/api/multi-image-to-3d) (meshy-7.1) | 1–4 images | GLB/FBX/OBJ/USDZ/STL/3MF; PBR | US$0.40 untextured, US$0.60 textured ([pricing](https://docs.meshy.ai/en/api/pricing)) | API only on paid plans: Pro US$20 a month ([plans](https://www.meshy.ai/pricing)) | **Terms allow training on non-Enterprise inputs and outputs** ([terms](https://www.meshy.ai/terms-of-use)) |
| [Hitem3D](https://docs.hi3d.ai/en/api/getting-started/pricing) | 2–4 images | GLB/OBJ/FBX/USDZ and more | US$0.50–0.90 | Packs from US$40 (u) | Conflicting statements: the FAQ says no, but the terms reserve the right |
| Open models: [TRELLIS.2](https://huggingface.co/microsoft/TRELLIS.2-4B), [Hunyuan3D 2.x](https://huggingface.co/tencent/Hunyuan3D-2.1), [Stable Fast 3D](https://stability.ai/license) | Mostly a single image | GLB | US$0.10–0.35 hosted on fal or Stability's API | None | Depends on the host |

**Which to use, if the Owner approves AI drafts:**

- **Tripo is the first choice for a trial.** It is pay-as-you-go with no
  subscription and takes the standard four views. Its terms exclude paid
  users' data from training.
- **Rodin is the alternative** when proportions matter most. It accepts the
  real dimensions as a constraint (`bbox_condition`). Through fal there's no
  US$120 monthly plan, but fal keeps request data for 30 days unless storage
  is switched off on each request
  ([fal](https://fal.ai/docs/documentation/model-apis/inference/payloads)).
  Its no-training promise covers enterprise customers only
  ([fal enterprise](https://fal.ai/enterprise)).
- **Not recommended for unreleased products:**
  - Meshy: its terms allow training;
  - Stability's API: trains on inputs unless you opt out
    ([privacy](https://stability.ai/privacypolicy));
  - Hitem3D: conflicting statements.
- **Not recommended: running open models ourselves.** It needs a GPU server,
  and the licences have limits:
  - Hunyuan3D excludes the EU, UK and South Korea, and forbids using
    outputs to improve other AI models
    ([licence](https://huggingface.co/tencent/Hunyuan3D-2.1/blob/main/LICENSE));
  - TRELLIS depends on components licensed for non-commercial use only
    ([nvdiffrast](https://github.com/NVlabs/nvdiffrast/blob/main/LICENSE.txt));
  - Stable Fast 3D is free only below US$1 million annual revenue.

  Hosting by fal or Replicate doesn't lift these licences (legal review
  needed).

**Example budget (estimate):** 100 products × 2 attempts × about US$0.40 is
about US$80 in total. A cap of US$10–20 a month allows 25–50 drafts.

**What the providers themselves say about accuracy:**

- **Unseen sides are "hallucinated".** Thin features and intricate patterns
  are hard to reconstruct
  ([Meshy](https://help.meshy.ai/en/articles/15723519-how-to-get-better-image-to-3d-results-in-meshy)).
- **Rear sides are less accurate.** Backs come out "less accurate and
  over-smoothed" ([SPAR3D paper](https://arxiv.org/abs/2501.04689)).
- **Meshes can have small holes.** Raw meshes "may occasionally contain
  small holes"
  ([TRELLIS.2](https://huggingface.co/microsoft/TRELLIS.2-4B)).
- **Socket openings are undocumented.** No provider documents how
  accurately recesses such as socket openings are reproduced.
- **None measures real size from photos.** Rodin can be *given* the
  dimensions; Tripo only *estimates* them.

### 5.3 AI video that only looks 3D

- **Google Veo 3.1** through the Gemini API
  ([pricing](https://ai.google.dev/gemini-api/docs/pricing)):
  - US$0.40 a second for standard 720p/1080p video, or US$0.10–0.12 a
    second for the fast version;
  - an 8-second clip costs about US$3.20, or about US$0.96 fast;
  - the preview model IDs are being retired on 2026-10-22
    ([Veo](https://ai.google.dev/gemini-api/docs/veo)).
- **Kling 3.0:** about US$0.08–0.11 a second, but the smallest standard pack
  is US$700 ([pricing](https://kling.ai/dev/pricing)).
- **Every frame is generated**, so the product can change between frames,
  and nothing can be rotated or measured. Turntables rendered from the
  approved model cost nothing and stay faithful.

### 5.4 Capture guidance

The Studio shows this guide when photos are uploaded, and the capture check
tests for it.

- **Quick capture** (enough for an AI-estimated draft or for an artist, never
  for a measured model):
  - views: front, left, right, rear and top;
  - 1–3 detail close-ups;
  - at least 2,000 px on the long side;
  - plain background;
  - real dimensions entered.
- **Full capture** (for a measured model):
  - **Amount:** Apple recommends 20–200 close-up photos with at least 70 %
    overlap; under 50 % may fail
    ([Apple](https://developer.apple.com/documentation/realitykit/capturing-photographs-for-realitykit-object-capture)).
    Epic advises no more than 30° between neighbouring views, with every
    point visible in at least two photos
    ([Epic](https://dev.epicgames.com/documentation/realityscan-mobile/Photogrammetry-Camera-Movement)).
  - **The Studio's standard:**
    - three rings of 36 photos (every 10°) at different heights on a
      turntable;
    - then the product turned over for the back;
    - about 100–150 photos in all.
- **Light:** soft, even light (a light tent or diffuse lamps). Apple and Epic
  both warn that reflective, transparent and plain single-colour surfaces may
  not give enough information.
- **Glossy white plastic** is the usual case for switches and sockets. In
  order of preference:
  1. a LiDAR iPhone or iPad, or KIRI's featureless mode;
  2. cross-polarised light, which removes reflections but also gloss, so the
     gloss is restored in the Studio's finish settings
     ([technique](https://paulbourke.net/miscellaneous/crosspolarisation/));
  3. a temporary scanning spray, with a second unsprayed pass for the true
     colour.

  Markers go on the turntable, never on the product.
- **Glass and chrome** remain unreliable for every capture method. Use CAD
  or an artist.
- **Scale:** LiDAR depth data (Apple), measured distances between markers
  (RealityScan), or printed scale bars. The Studio always checks the result
  against the datasheet dimensions.

## 6. How the Studio works

### Result types and labels

Every model carries one of these labels in the dashboard. The label is set
by the **method** used, never by a provider's own claims, so a generative
service can never produce a "measured" label.

| Label | Made from | Interactive 3D | "View on your wall" at true scale | Use on the website |
|-------|-----------|:-:|:-:|----|
| **Exact (CAD)** | The manufacturer's design files, with finishes matched to photos | Yes | Yes, after the dimension check | 3D viewer and AR |
| **Measured (photo reconstruction)** | Photogrammetry from a full capture | Yes | Yes, if the dimension check passes | 3D viewer and AR |
| **Artist-modelled** | A 3D artist working from photos, dimensions and drawings | Yes | Yes, if the dimension check passes | 3D viewer and AR |
| **Captured view (splat)** | Gaussian splatting from a full capture: appearance only, no clean surface | View only | No | Optional showcase, not the default |
| **AI-estimated** | Generative AI from a few photos; unseen parts are invented | Yes | No, unless corrected and the dimension check passes | Only after review, correction and approval |
| **AI imagery (not 3D)** | AI-generated images or video | No | No | As images or video, never in the 3D viewer, labelled as AI-generated |

Renders made from an approved model, such as poster images or turntable
clips, are labelled "rendered from the approved 3D model".

### Workflow

1. **Capture.** Choose the site, product and variant, then upload the photos
   (quick or full capture), a CAD file, or a finished model from a capture
   app or a 3D artist. Enter the real dimensions (width × height × depth in
   mm, from the datasheet). Photos are stored privately, with location data
   removed.
2. **Capture check (automatic).** The Studio checks:
   - that the required views are present;
   - resolution, sharpness and exposure;
   - background;
   - file validity.

   Each photo is marked *OK* or *needs a better photo*, with the reason and
   a capture guide.
3. **What's possible.** From the inputs, the Studio states which results
   can honestly be produced:
   - CAD → *Exact*;
   - a full capture that passed the checks → *Measured*;
   - only a few photos → *AI-estimated* at best.

   With only a few photos the dashboard says plainly: *these photos are not
   enough for a measured 3D model*. It then offers:
   - take more photos (with the guide);
   - upload CAD;
   - send to a 3D artist;
   - make an AI-estimated draft, only if an approved provider and budget
     exist.
4. **Processing.** A job runs on the private processing runner (D-030),
   which calls the chosen provider where needed. The estimated cost is shown
   and checked against the budget before the job starts.
5. **Optimisation and technical checks** (automatic, the same for every
   provider; see Pipeline).
6. **Review.**
   - The dashboard shows the model next to the original photos, rendered
     from the same angles, on light and dark backgrounds, and in a mobile
     preview.
   - The reviewer ticks a checklist:
     - shape and proportions;
     - number and position of buttons and rockers;
     - socket openings (number, shape, position);
     - indicators and markings;
     - colour, gloss and finish;
     - *nothing added that the product doesn't have, nothing missing*.
   - The reviewer then marks the model *ready for approval*, *needs better
     photos* or *needs manual correction*.
7. **Adjust.**
   - The reviewer can change:
     - orientation and framing;
     - camera start view;
     - the material values of each finish (colour, gloss, metal);
     - poster angles.
   - Shape corrections are done in a 3D editor (Blender, free) and
     re-imported as a new version, which goes through the checks again.
8. **Approval.** By the Owner by default (*3D Studio: approve*). Approval
   assigns the model to the product or variant.
9. **Publish.** The model goes live only when someone with the publish
   permission publishes that site. Nothing is ever published automatically.
   On publishing, the approved files are copied to the public `media` bucket.

### Quality gates

| Gate | Checks | Fails as |
|------|--------|----------|
| Capture | Required views; at least 2,000 px on the long side; sharpness; exposure; dimensions entered; valid files | *Needs better photos* (per photo, with reasons) |
| Method | Inputs match the chosen method; quick captures can't start a *Measured* job | *Not enough for a measured model* (explained, with options) |
| Technical | Khronos glTF validator with no errors; within budgets (below); real-scale size within ±2 % of the entered dimensions; orientation and origin; a material for every finish | *Needs manual correction* |
| Visual | Side-by-side comparison with the photos from matching angles. An automatic outline-match score is to be evaluated in stage 2. | *Needs manual correction* or *needs better photos* |
| Human review | Feature checklist above, signed by the reviewer | Back to adjust or recapture |
| Approval | Owner (by default) approves; separate from publishing | Not approved: never published |

**Budgets for website models.** These follow the Khronos 3D Commerce
guidelines for mobile web and AR: at most 3 MB, at most 150,000 triangles,
2K textures
([Khronos](https://github.com/KhronosGroup/3DC-Asset-Creation/blob/main/asset-creation-guidelines-1.0/full-version/sec99_PublishingTargets/PublishingTargets.md)).
Google's Scene Viewer recommends at most 100,000 triangles, ideally
30–50,000, with textures up to 2048 × 2048
([Google](https://developers.google.com/ar/develop/scene-viewer)). The
Studio targets:

| Version | File size | Triangles | Textures |
|---------|-----------|-----------|----------|
| Desktop | ≤ 3 MB | ≤ 100,000 | 2K |
| Mobile | ≤ 1.5 MB | ≤ 50,000 | 1K |

### Provider interface

Every way of making a model is a *provider* behind one interface
(`packages/studio`). Adding or replacing a service doesn't change the rest of
the Studio.

```ts
type Method = 'cad' | 'photogrammetry' | 'splat' | 'artist' | 'generative';

interface StudioProvider {
  id: string; // 'cad-step', 'apple-object-capture', 'model-import', 'meshy', …
  method: Method; // fixes the result label (see table above)
  runsOn: 'runner' | 'external-service' | 'person';
  dataPolicy: {
    trainsOnUploads: 'no' | 'yes' | 'opt-out' | 'unknown';
    retention: string;
    checkedOn: string;
    source: string;
  };
  checkInputs(capture: CaptureSummary): Eligibility; // e.g. needs CAD, needs ≥ 50 overlapping photos
  estimateCost(capture: CaptureSummary): Money; // shown and checked against the budget before starting
  start(job: JobInput): Promise<ExternalRef>;
  poll(ref: ExternalRef): Promise<JobProgress>;
  collect(ref: ExternalRef): Promise<RawModelFiles>;
}
```

Providers planned for stage 1 cost nothing per model:

- `cad-step`: STEP/IGES conversion;
- `model-import`: GLB, OBJ, USDZ or FBX from capture apps or artists.

Photogrammetry and generative providers are added in stage 2 as D-030
decides. A paid provider stays disabled until the Owner approves it and sets
its budget.

### Processing pipeline (the same for every provider)

These steps run on the processing runner, never in the dashboard Worker:

1. **Convert to glTF.** STEP via OpenCascade; OBJ, USDZ and FBX via
   glTF-Transform or Blender in headless mode.
2. **Normalise.** Metres, front facing the viewer, origin at the back
   centre. Check the size against the entered dimensions.
3. **Optimise** with glTF-Transform 4.5 and meshoptimizer:
   - weld and simplify to the budget;
   - resize textures and compress them (KTX2 or WebP);
   - Meshopt geometry compression;
   - outputs `desktop.glb` and `mobile.glb`.
4. **Finishes.** Add each of the product's finishes as a material variant
   (`KHR_materials_variants`). One model then serves every finish, and the
   website switches finish without downloading a new model.
5. **Validate** with the Khronos glTF validator, and measure triangles, file
   sizes and bounding box.
6. **Render poster images** in headless Chromium with the same viewer as the
   website: front and three-quarter views, transparent background, AVIF and
   WebP in three sizes.
7. **Save** the results to the private `studio` bucket and report back to the
   API through a signed callback.

### Viewer and delivery on the website

- **`<model-viewer>` 4.4** (Google, Apache-2.0)
  ([docs](https://modelviewer.dev/docs/)):
  - poster first;
  - loads only when near the screen, or after a tap on phones;
  - rotate and zoom;
  - finish switching through material variants;
  - AR through Scene Viewer (Android), Quick Look (iOS) and WebXR, with
    `ar-placement="wall"` for wall plates, offered only for true-scale models.
- **Size and loading.** About 289 KB compressed including three.js,
  measured from the npm package. It loads only on pages with a model, after
  the page's own content.
- **Apple-style scroll sections** (Phase 4) use three.js directly. With
  reduced motion, or without WebGL, they fall back to still images.
- **Fallback.** The poster and photo gallery always work. Product
  information never depends on 3D.
- **iOS Quick Look:** model-viewer generates the USDZ file on the fly.
  Pre-generated USDZ files are added only if testing shows they're needed.
- **Hosting and caching.** Files are served from the `media` bucket through
  the site's media domain, under content-hashed names cached for a year.
  `.glb` isn't cached by Cloudflare by default, so the media domain gets a
  Cache Rule
  ([Cloudflare](https://developers.cloudflare.com/cache/concepts/default-cache-behavior/)).

### Data model (Phase 3)

All tables below include the site:

- `studio_captures`;
- `studio_capture_files` (view, checks, private storage key, checksum);
- `studio_jobs` (provider, method, estimated and actual cost, status);
- `studio_models` (label, files, measurements, validator report, review
  status, versions);
- `studio_reviews` (checklist, decision, reviewer);
- `studio_provider_settings` (enabled, budget, data-policy record);
- `studio_spend` (cost ledger).

Approved models link to products and variants in the catalogue.

### Permissions (per site, added to the roles matrix when built)

| Permission | Standard roles (proposed) |
|------------|---------------------------|
| View the Studio | Owner, Administrator, Content Manager, Editor, Viewer |
| Create captures and start processing (within budget) | Owner, Administrator, Content Manager, Editor |
| Review (checklists, request changes) | Owner, Administrator, Content Manager |
| Approve models for publishing | **Owner** (the owner's requirement); the Owner may extend it to others in the matrix |
| Manage providers, budgets and data sharing | **Owner only** |

### Budget and cost control

- Paid providers are disabled by default. Each one needs the Owner's
  approval, a monthly budget and a recorded data policy.
- Every job shows its estimated cost before it starts. A job that would go
  over the remaining budget is blocked.
- Actual costs are recorded in a ledger and shown in the dashboard.

## 7. Storage requirements and running costs

**Assumptions (estimates):**

- photos average 5 MB (12–24 MP JPEG or HEIC);
- a quick capture is 6 photos;
- a full capture is 100–150 photos;
- processing leftovers are deleted 30 days after a model is approved or
  rejected.

**Per product:**

| Item | Quick capture | Full capture | CAD |
|------|---------------|--------------|-----|
| Originals (kept for re-processing) | ≈ 30 MB | ≈ 500–750 MB | ≈ 1–20 MB, plus reference photos ≈ 30 MB |
| Processing files (temporary, 30 days) | ≈ 10–50 MB | up to ≈ 1 GB | ≈ 10–50 MB |
| Published (two GLBs, posters) | ≈ 5–6 MB | ≈ 5–6 MB | ≈ 5–6 MB |

**Monthly R2 cost per 100 products** (Standard storage US$0.015 per GB-month
after 10 GB free; uploads and downloads within the free 1 million and
10 million operations; no egress charge;
[R2 pricing](https://developers.cloudflare.com/r2/pricing/)):

| Scenario | Stored | Cost per month |
|----------|--------|----------------|
| Quick captures only | ≈ 4 GB | US$0, within the free 10 GB |
| Full captures | ≈ 51–76 GB long-term, up to ≈ 176 GB while processing files are kept | ≈ US$0.60–1.00 long-term; up to ≈ US$2.50 while processing files are kept |
| CAD | ≈ 6 GB | US$0 |

**Running costs:**

| Where | What | Cost |
|-------|------|------|
| Dashboard Worker (Workers Free) | Uploads, job tracking, review screens. No heavy processing: the Free plan allows 10 ms of CPU per request. | US$0 |
| GitHub Actions in a **private** runner repository | Conversion, optimisation, validation, posters, calls to providers | US$0 within 2,000 minutes a month (2 vCPU, 8 GB runners) ([GitHub](https://docs.github.com/en/billing/concepts/product-billing/github-actions)). Estimated 2–5 minutes per model, to be measured. |
| The owner's own computer as a self-hosted runner | Photogrammetry, if suitable hardware exists ([5.1](#51-capture-tools-for-measured-models)) | US$0. Self-hosted runners are free; a planned GitHub platform fee for them was postponed, not cancelled ([GitHub](https://github.com/resources/insights/2026-pricing-changes-for-github-actions)). |
| Paid providers | Optional AI generation | About US$0.20–0.60 per model, within the Owner's budget ([5.2](#52-ai-image-to-3d-services-results-are-always-ai-estimated)) |

**Why not on Cloudflare itself:**

- Workers Free allows 10 ms of CPU per request.
- Cloudflare Containers need the Paid plan and have no GPU
  ([Containers pricing](https://developers.cloudflare.com/containers/platform/pricing/),
  [limits](https://developers.cloudflare.com/containers/platform/limits/)).
- Workers AI runs only Cloudflare's own model catalogue.

**Why not in this repository's CI:** the repository is public, so its
workflow logs can be read by any signed-in GitHub user and its artifacts
downloaded by any GitHub user
([logs](https://docs.github.com/en/actions/how-tos/monitor-workflows/use-workflow-run-logs),
[artifacts](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/download-workflow-artifacts)).
Unreleased product photos must never pass through it.

## 8. Limitations

- **A few photos can't be measured.** AI generation from 4–6 photos invents
  the parts it can't see, simplifies small features, can garble text and
  logos, and can change proportions. Every AI result needs review and often
  manual correction. It never carries a *measured* label.
- **The products are hard to capture.** Glossy, plain white and transparent
  surfaces, typical of switches, sockets and glass shades, are difficult for
  photogrammetry too. They need diffuse or polarised lighting and many
  photos, and glass and mirror finishes often need an artist.
- **Very small details may be lost:** fine markings, LED windows, thin gaps.
  Logos and markings are reproduced only from the owner's real artwork,
  never by AI.
- **True-scale AR** needs a model whose size matches the entered dimensions.
  Otherwise "view on your wall" is switched off.
- **Gaussian splats** are larger than the model budget (about 6–16 MB for
  an object) and can't switch finishes. Their glTF standard was ratified
  only in 2026, and viewer support is still settling. They are not the
  default.
- **No GPU is available** on free CI runners or on Cloudflare. Photogrammetry
  runs on the owner's suitable computer or through KIRI Engine's cloud
  service (D-030).
- **iOS Quick Look** files generated on the fly don't support animation, and
  very large models open slowly on phones.
- **Signed links don't work on the media domain.** R2 signed links work only
  on R2's own address, not on custom domains
  ([R2](https://developers.cloudflare.com/r2/api/s3/presigned-urls/)). Private
  files in the dashboard are therefore served through the dashboard's
  permission checks or short-lived signed R2 links, never through the public
  media domain.
- **Provider details change.** Providers' prices, models and data policies
  change. Each provider's record is re-checked before it is enabled, and
  every three months while in use.
- **Nothing is automatic.** Approval and publishing are always manual by
  design, which takes the owner's time for every model.

## 9. Decisions needed and delivery

**D-030 (pending): the owner's input decides the main path:**

1. Are 3D design files (CAD) available from the factory or supplier for the
   switches and sockets?
   **Answer (2026-10-21): no.** Photogrammetry from a full capture is the
   main path; CAD import is kept for files that may come later.
2. Which equipment is available for capture?
   - a Mac (Apple silicon is best);
   - an iPhone 12 Pro or iPad Pro (2021) or newer, with LiDAR;
   - a Windows PC with an NVIDIA or recent AMD graphics card;
   - none of these.

   This decides between the free tools and the KIRI Engine subscription
   ([5.1](#51-capture-tools-for-measured-models)).
3. Is there a monthly budget for paid AI 3D services, or free methods only?

**Delivery in stages:**

- **Stage 1 (Phase 3):**
  - captures and capture checks;
  - labels;
  - the provider interface, with CAD conversion and finished-model import;
  - the private processing runner, with optimisation, validation and
    posters;
  - review, adjustment and approval screens;
  - budget controls;
  - publishing to a site.
- **Stage 2 (Phase 4):**
  - the website viewer with posters, finish variants and AR;
  - Apple-style scroll sections;
  - automated photogrammetry on suitable hardware;
  - AI providers, only if approved;
  - the automatic outline-match score.
- **Optional, each needing approval:**
  - Gaussian splat showcases;
  - AI imagery (always labelled);
  - modular assembly for modular switch ranges.
