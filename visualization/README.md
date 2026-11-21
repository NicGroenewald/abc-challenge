# Visualization: k8_combined, the interactive site

The team's interactive site for the final model (final_k8_combined_v10_s42, trained on the 5,243-player split). Built by Nic,
16 Nov 2026; this folder is a copy of the main site from his working repo.

## Run it

**Live:** <https://motion-pending.github.io/>, published from this folder by `.github/workflows/pages.yml` on
every push to `main` that changes it (or by hand from the Actions tab).

To run it locally, it must be served over http (the pages load modules and data files), from this folder:

```bash
python3 tactical/proto/serve.py
```

Then open <http://127.0.0.1:8791/tactical/index.html>. (`serve.py` turns caching off, so a reload always shows the latest files.)

## What is in it

- **The scroll page** (`tactical/index.html`): the challenge, the data, TAKE CONTROL, results, team, paper and credits.
- **TAKE CONTROL** (`tactical/journey/`): the interactive dive. VR headset → circuit board (a replica of the Meta Quest 3 main
  board, both sides, from iFixit's chip ID) → the XR2 Gen 2 die with the 10 ms data path → the model (A etched / B console, with a
  scrub bar) → SEE IT PREDICT: the 200 ms-ahead ghost and the live error.
- **The 3D model view**: `tactical/index.html?explore=1` (the model, layer by layer).
- **The Data side** (the data pipeline, nine stages as a funnel: `dataview.js`, `dataview.css`, `tactical/data/pipeline/`) is
  switched off for now but kept in the repo. To turn it back on, set `DATA_SIDE = true` in `tactical/side.js` and restore
  the two links marked `DATA SIDE OFF` in `tactical/index.html`. It then opens at `?explore=1&side=data`.

## Folders

| Path | What |
|---|---|
| `adapter.js`, `vendor/three/` | shared by the pages (three.js r185, MIT) |
| `tactical/` | the site |
| `tactical/journey/` | TAKE CONTROL (journey.js, modelviews.js, board/die textures) |
| `tactical/assets/` | the two 3D models (Draco-compressed glb) and the head |
| `tactical/traces/`, `tactical/data/` | the replay players' model traces (one QuestSet player, four synthetic), the Data side's synthetic example recordings and the pipeline's real counts |
| `tactical/tools/` | the scripts that make those files from QuestSet and synthetic head motion: see `tactical/tools/README.md` |
| `tactical/models/` | `board_build.py` (rebuilds the board glb in Blender, headless), `headset_export.py`, `CREDITS.md` |
| `tactical/PLAN.md` | design notes and decisions, in order |

Not included: the Blender source files (`headset.blend`, `board.blend`, `quest_ref.blend`, the headset textures) and test
renders. `headset_export.py` needs them; `board_build.py` rebuilds the board without them. They were built from:
- `headset.blend`: "Meta Quest 3" by Elin, <https://sketchfab.com/3d-models/meta-quest-3-65a813833dc04eeeb7d33bdca58c184c>,
  CC BY 4.0. Changed: Meta logo blanked in the base-colour and normal maps, scaled and placed on the head.
- `quest_ref.blend` (review only, nothing from it is used): the same model and "Man with Meta Quest 3 headset" by onirix,
  <https://sketchfab.com/3d-models/man-with-meta-quest-3-headset-eabf1099363a48ce9a4192539aa499b0>, CC BY 4.0.
- `board.blend`: made by `board_build.py`, with part positions and sizes measured off the photos in iFixit's
  "Meta Quest 3 Chip ID" (<https://www.ifixit.com/Guide/Meta+Quest+3+Chip+ID/165932>). No iFixit image is in the model.
- The head (`tactical/assets/head.js`, `tactical/hero/head.js`): `GEO-head_animation_realistic` from Blender Studio's
  Human Base Meshes bundle v1.4.1 (<https://download.blender.org/demo/asset-bundles/human-base-meshes/>), CC0.

## Credits and licences

Headset: "Meta Quest 3" by Elin (sketchfab.com/ElinHohler), CC BY 4.0, modified (logo removed, fitted). Not affiliated with Meta.
Circuit board: modelled from the photos and part list in iFixit's "Meta Quest 3 Chip ID"; chip markings are the parts' own
(Qualcomm, Snapdragon, SK hynix, Qorvo and STMicroelectronics are trademarks of their owners). Head mesh: Blender Studio's
Human Base Meshes v1.4.1 (CC0). three.js (MIT), Google's Draco decoder (Apache 2.0, licence in
`tactical/vendor_gltf/draco/LICENSE`), Geist fonts (SIL OFL 1.1). Full list: `tactical/models/CREDITS.md` and the page's Credits section.

Replay data: "Questset" by Sara Baldoni, Federica Battisti, Federico Chiariotti, Fabio Mistrorigo, Alfi Baqiatus Shofi, Paolo
Testolina, Alessandro Traspadini, Andrea Zanella and Michele Zorzi (2024), Research Data Unipd,
<https://researchdata.cab.unipd.it/1239/>, CC BY 4.0. Modified: head orientation only, converted to the model's frame and
resampled to 100 Hz (`tactical/traces/test50.js`, `tactical/hero/clip.js`, `tactical/figs/challenge.svg`).
Synthetic data: the Data side's example recordings and the four faster replay players are synthetic head motion made by
`tactical/tools/make_synthetic_data.py`, because BOXRR-23's data use agreement does not allow its recordings to be published.
