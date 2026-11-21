# Motion_Pending: compact head-pose prediction

Team Motion_Pending's entry to the [9th ABC Challenge](https://sites.google.com/view/9th-abc-challenge/home) at
[ABC 2027](https://autocare.ai/abc2027). The model reads the last 4 s of head orientation from an XR headset and
forecasts the next 200 ms, for users it has never seen. It is small and fast enough to run on the device itself.

**Team:** Jacob Dorrill, Nicholas Groenewald, Ray Crowley and Duncan O'Regan, supervised by Ruairi O'Reilly and
Jing Hua Ye, Department of Computer Science, Munster Technological University, Cork, Ireland.

**Result:** joint first place (Gold) in the 9th ABC Challenge.

**Interactive site:** <https://motion-pending.github.io/motion-pending/> (source in [`visualization/`](visualization/)). It covers the
challenge, the data, a 3D view of the model running, and a dive from the headset down to the chip.

## The task

- **In:** up to 4 s of head orientation: 400 unit quaternions (w, x, y, z) at 100 Hz.
- **Out:** the next 20 samples, `[1, 20, 4]`. The score is taken at the 20th sample, **200 ms** ahead. The
  challenge site said 100 ms, and the organisers confirmed that this was an error.
- **Generalisation:** the test users are new people, recorded by the organisers on their own hardware. Fine-tuning
  on them is not allowed.
- **Training data:** [BOXRR-23](https://rdi.berkeley.edu/metaverse/boxrr-23/), which is mostly Beat Saber.
- **Judged on:** accuracy, model size, latency on a real XR platform, and innovation.

## The submitted model

`final_k8_combined_v10_s42` is a causal temporal convolutional network that runs as a stream: one new sample per
call, with its history held in state buffers.
- **Inputs.** It reads the body-frame angular velocity, a speed channel and gravity in the head frame.
- **Mirror symmetry.** Its two streams share all their weights, so a left-right mirrored input gives an exactly
  mirrored forecast.
- **Output.** It predicts a small correction to a damped constant-velocity forecast, as a polynomial in time mapped
  to a rotation. The graph needs no trigonometric operators.

| | |
| --- | ---: |
| Trainable parameters | 7,555 |
| Multiply-adds per streaming call | 16,222 |
| State | 25,088 floats (98 KB) |
| Training users | 5,243 (786 for validation) |
| **Error at 200 ms, 1,049 unseen test users** | **4.498°** (hold-last 6.700°, constant velocity 7.427°) |
| Error at 200 ms, 20-user team benchmark | 4.184° (damped velocity 5.114°, hold-last 6.037°) |
| Latency, ONNX Runtime CPU, 1 thread | 35 µs (Apple M5 Pro), 54 µs (Ryzen 9 7900X), 77 µs (Galaxy S23) |

The details are in the [model card](Submission/Motion_Pending_headpose/model_card.md): architecture, the parameter
and MAC counts worked through, warm-up, data preparation, training, latency, and limits and failure modes. All
models are compared in [`LEADERBOARD.md`](LEADERBOARD.md).

### Run it

```bash
cd Submission/Motion_Pending_headpose
pip install -r requirements.txt                 # numpy and onnxruntime, Python 3.10 to 3.14
python run_inference.py --model_dir . --input sample_input.npy --output pred.npy
```

**The input frame matters.** The model expects BOXRR-23's frame: y up, left-handed, head → world. On a z-up or
right-handed stream, convert the quaternions first. The
[submission README](Submission/Motion_Pending_headpose/README.md) gives the conversion and worked examples.

`Submission/Motion_Pending_headpose/` is kept exactly as it was submitted on 15 Nov 2026. Its README lists the paper
PDF, which was sent to the organisers separately and isn't in the folder.

## Repository map

| Path | What | Docs |
| --- | --- | --- |
| `Submission/` | The submitted model folder, and a Docker clean-room check of it | `Submission/Motion_Pending_headpose/README.md`, `Submission/docker_check/README.md` |
| `ray/` | The data pipeline: downloads BOXRR-23 from Hugging Face, applies the challenge filter, resamples to 100 Hz, exports HDF5 with the user splits inside | [`ray/README.md`](ray/README.md) |
| `jacob/training/` | The TCN trainer (PyTorch). `best/` is the k8_combined architecture and recipe; `experimental/` holds later experiments, including `v10_speed`, which trained the submitted model | [`jacob/training/README.md`](jacob/training/README.md) |
| `jacob/models/` | ONNX exports of every TCN version, from v5 to the submitted model | [`jacob/models/MODELS.md`](jacob/models/MODELS.md) |
| `jacob/ablations/` | The record of every TCN experiment: results, per-seed runs, analyses and the reasoning behind each version | [`jacob/ablations/README.md`](jacob/ablations/README.md), [`MODEL_HISTORY.md`](jacob/ablations/MODEL_HISTORY.md) |
| `nic/` | The stateful GRU and GADS-T models, with their training code and findings | [`nic/README.md`](nic/README.md), [`nic/FINDINGS.md`](nic/FINDINGS.md) |
| `bench/` | The team benchmark: one evaluator for every ONNX model, frozen test cohorts, operator audit, latency sessions | [`bench/README.md`](bench/README.md) |
| `visualization/` | The interactive site: a scroll story of the challenge, the data and the model; a 3D explorer of the network as it runs; and TAKE CONTROL, a dive from the headset to its circuit board, the chip and the model | [`visualization/README.md`](visualization/README.md) |
| `LEADERBOARD.md` | Every benchmark result, generated by `python -m bench leaderboard` | |

## Interactive visualisation

The site, built by Nicholas Groenewald, explains the challenge, the data pipeline and the model, with the model
running live in 3D. Serve it over http from the repo root, then open <http://127.0.0.1:8791/tactical/index.html>:

```bash
python visualization/tactical/proto/serve.py
```

BOXRR-23's data use agreement doesn't allow its recordings to be published, so the site replays none of them:
- **The hero clip and the explorer's first player** are one Beat Saber session from QuestSet (see [Credits](#credits)),
  a public dataset the model never trained on.
- **The explorer's four faster players** are synthetic head motion, made for the site. They are not recordings of
  anyone. (So are the example recordings of the Data side, which is switched off for now.)
- **The numbers about BOXRR-23** (the pipeline's counts and rates, the per-recording speed scatter and the results)
  are the team's real figures.

[`visualization/tactical/tools/README.md`](visualization/tactical/tools/README.md) explains how each data file is made.

## Reproducing

1. **Data.** BOXRR-23 isn't included, because its data use agreement doesn't allow redistribution.
   - Rebuild an HDF5 export with `ray/` (see its README).
   - A new download draws different users, because the tar shuffle isn't seeded.
   - The user lists behind each model are recorded: `bench/trained_on/`, `ray/manifests/` and
     `Submission/Motion_Pending_headpose/weights/manifest_moredata_final.json`.
2. **Environments** (Python 3.12, one per area):
   - bench: `pip install -r bench/requirements.txt` (numpy, scipy, h5py, onnx, onnxruntime; no torch)
   - training: `jacob/training/requirements-training.txt` (Torch 2.7.1+cu118, CUDA GPU)
   - ray: see `ray/README.md` (xror comes from GitHub)
   - `requirements.txt` at the root is the full lock file of the team's training PC.
3. **Tests** (synthetic data, no BOXRR files needed):
   ```bash
   python -m unittest discover -s bench/tests -t .                         # from the repo root
   cd jacob/training && python -m unittest discover -s tests && python -m unittest best.test_best
   ray/.venv/Scripts/python -m pytest ray/tests -p no:cacheprovider
   python -m bench score-submission Submission/Motion_Pending_headpose/     # run_inference.py vs its ONNX
   ```
4. **Score a model.**
   - `python -m bench audit model.onnx` checks the graph's operators and needs no data.
   - `python -m bench score` needs the HDF5 file a benchmark was frozen on. Each definition in
     `bench/definitions/` records that file's SHA-256 and users.
   - See `bench/README.md`.

## What isn't in the public repository

- **The BOXRR-23 recordings and the HDF5 exports.** Get BOXRR-23 from its
  [site](https://rdi.berkeley.edu/metaverse/boxrr-23/). The visualisation replays QuestSet and synthetic head motion
  instead (see [Interactive visualisation](#interactive-visualisation)).
- **Per-user scores.** The result files keep their aggregate numbers only.
  - The paired, per-player confidence intervals need the per-player numbers. On the published results,
    `python -m bench leaderboard` and `bench compare` give the difference of the means, marked `(no CI)`.
  - `LEADERBOARD.md`, with its intervals, is the frozen record.
  - Scores you make yourself are complete, so both commands give intervals on them.
- **Team-internal notes** (paper planning, organiser correspondence, rules for AI assistants).
  - Some records still name them: `PAPER_OVERVIEW.md`, `PAPER_OUTLINE.md`, `ORGANISER_FEEDBACK.md`, `AGENTS.md`.
  - The same goes for local folders: `ABC_local_test/`, `nic_scratch/`, `jacob/training/outputs/`, `data/`, the
    team Drive.
  - None of these are public.
- **The git history.** This repository starts from a single snapshot. Commit hashes and the `v9-ablations` tag
  cited in the records refer to the team's private history.
- **Local paths.** Machine-specific paths in scripts, logs and records are replaced by placeholders such as
  `<repo>` (the repository root) and `<scratch>` (a temporary session folder).

## How this was built

The team used AI coding assistants (Claude Code and Codex) for implementation help, analysis and review. The
modelling and design decisions were the team's. Where a record says an idea or a recommendation came from an AI
assistant, it is labelled as such (see
[`MODEL_HISTORY.md`](jacob/ablations/MODEL_HISTORY.md)).

## Citation

The paper is "Symmetry in Motion: A Compact Network for Head-Pose Prediction" by Jacob Dorrill, Nicholas
Groenewald, Ray Crowley, Duncan O'Regan, Ruairi O'Reilly and Jing Hua Ye (Munster Technological University). It
has been submitted to the International Journal of Activity and Behavior Computing (IJABC) for ABC 2027 and is
under review. [`CITATION.cff`](CITATION.cff) has the details, and GitHub's "Cite this repository" button reads it.

If you use the data pipeline, the models or the results, please also cite BOXRR-23. Both references its data use
agreement asks for are in [`LICENSE-MODELS.md`](LICENSE-MODELS.md).

## Credits

- **QuestSet**, the visualisation's replay data: Sara Baldoni, Federica Battisti, Federico Chiariotti, Fabio
  Mistrorigo, Alfi Baqiatus Shofi, Paolo Testolina, Alessandro Traspadini, Andrea Zanella and Michele Zorzi,
  *Questset* (2024), Research Data Unipd, <https://researchdata.cab.unipd.it/1239/>, licensed under
  [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
  - Changed: head orientation only, converted to the model's frame and resampled to 100 Hz.
  - Used in `visualization/tactical/traces/test50.js`, `visualization/tactical/hero/clip.js` and
    `visualization/tactical/figs/challenge.svg`.
- **The site's 3D models, fonts and libraries**: the "Meta Quest 3" headset model by Elin (CC BY 4.0, modified),
  the head mesh from Blender Studio's Human Base Meshes (CC0), the circuit board modelled after iFixit's
  "Meta Quest 3 Chip ID" photos, three.js (MIT), Google's Draco decoder (Apache 2.0) and the Geist fonts
  (SIL OFL 1.1). The full list, including the sources of the Blender files that are not in this repo, is in
  [`visualization/README.md`](visualization/README.md).

## Licence

- **Code:** MIT ([`LICENSE`](LICENSE)).
- **Models, checkpoints, split lists and results:** derived from BOXRR-23, so they are under CC BY-NC-SA 4.0
  ([`LICENSE-MODELS.md`](LICENSE-MODELS.md)).
- **Visualisation:** the QuestSet files stay under CC BY 4.0, and the 3D models, fonts and libraries keep their own
  licences (see [Credits](#credits)).
