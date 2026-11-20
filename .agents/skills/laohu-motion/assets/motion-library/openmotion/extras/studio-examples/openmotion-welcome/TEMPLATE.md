# OpenMotion Welcome

An official, editable welcome film. Fresh editor workspaces and copies selected from the template library use this same source. New project actions create a separate empty composition. Existing projects are never replaced during startup.

## Edit the film

Materialize this repository source with `copyTemplate('openmotion-welcome', directory, runtimeRoot)` from `template-library.ts`. The copier includes the package-owned brand mark and Albert Sans, the existing licensed serif and Three.js, the pinned runtime's GSAP, and their notices. This source directory intentionally does not duplicate those maintained dependencies. The materialized project runs with Hyperframes 0.9.7 and has no remote rendering assets.

| Content | Entry | Related changes |
| --- | --- | --- |
| Brand, headline and welcome copy | Root composition variables in `index.html` | Inspect long words in the opening and closing titles |
| Opening prompt and invitation | Root variables; `compositions/intro.html` | Typing length and line fit |
| Main statement and caption | Root variables; `compositions/statement.html` | Highlight width and two-line fit |
| Gallery, montage and demo artwork | Named functions and measured `reel` frame table in `assets/artwork.js` | All three views and the cube reuse these functions |
| Model and Agent sequence | `compositions/choice.html` | Icon spacing and orbit timing |
| Closing object | `assets/cube.js` and `compositions/outro.html` | Geometry, surface artwork and the final two-dimensional mark |
| Mark and fonts | Materialized `assets/brand-mark.svg`, `assets/fonts/` | Replace in a project copy; maintained repository originals belong to the design system |
| Music and effects | `assets/soundtrack.m4a` | Timed audio clip in `index.html`; retain the original event offsets |

Main narrative text is native HTML. Artwork in the gallery/montage is editable Canvas source, and the closing object is editable Three.js geometry. Canvas subobjects are edited in source rather than as separate Studio layers. Changing the underlying artwork updates its repeated appearances. All animation is time-derived, with finite paused GSAP timelines and no wall-clock animation.

## Reference and reconstruction

Reference: [OpenDesign launch film](https://x.com/OpenDesignHQ/status/2111023212129829086), published October 16, 2026. Acquired from the public 1920×1080 MP4 variant on November 15, 2026. Original SHA-256: `b42a58c392f4a89def7cb73f06d8d1a1a9cbcc209261adc30026c0945fbe2f7d`.

Measured with Hyperframes 0.9.7: 1920×1080, constant 30 fps, 1119 frames, 37.3 seconds of picture, 37.355 seconds container duration, H.264 with audio. The picture duration defines the rebuilt composition. The entire source was decoded into 1119 individual frames; consecutive frame sheets were used around the title assembly, cuts, type entrances, gallery zoom, icon orbit and closing rotation. Source frame dumps and comparison outputs are review artifacts, not template dependencies.

| Frames [start, end) | Seconds | Observed system | Editable representation |
| --- | --- | --- | --- |
| 0–78 | 0–2.6 | Sky, typed prompt and moving pointer | Native text, prompt panel and GSAP pointer |
| 78–140 | 2.6–4.666667 | Letters tumble forward and settle into a deep title | Individually animated letters with depth layers |
| 140–233 | 4.666667–7.766667 | Letter entrance, compressed statement, highlighted phrase | Native statement and highlight layers |
| 233–322 | 7.766667–10.733333 | Thirty-card gallery tilts and zooms into a card | Perspective host with individually drawn artwork |
| 322–380 | 10.733333–12.666667 | Comic, dots, refraction, pixel art | Four named procedural artwork systems |
| 380–445 | 12.666667–14.833333 | Concentric type tunnel and modular grid | Rotating text rings and staggered cells |
| 445–515 | 14.833333–17.166667 | Torus and seven rapid kinetic-type/orbit beats | Deterministic curves, type and original cut frames |
| 515–578 | 17.166667–19.266667 | Artwork, growth, switch, plane, eye, character, comic, future | Eight editable short beats; adaptations listed below |
| 578–641 | 19.266667–21.366667 | Dark phrase and rotating coral highlight | Native text with retained entrance timing |
| 641–766 | 21.366667–25.533333 | Model phrase, changing background, Agent icon chain and orbit | Native letters, badges and expanding orbit |
| 766–897 | 25.533333–29.9 | Editor views rapidly change their motion content | Authored editor illustration with live shared artwork |
| 897–1034 | 29.9–34.466667 | Rounded tile becomes a rotating, textured cube | Rounded 3D mesh, lighting and six editable textures |
| 1034–1119 | 34.466667–37.3 | Mark shrinks; title and destination appear | Native mark, letter reveal and closing invitation |

The automatic cut detector also flagged changes inside the continuous title, orbit and editor motion; these are not all hard cuts. The montage uses the observed frame boundaries, including frames 338, 353, 367, 380, 430, 445, 454, 461, 468, 476, 483, 495, 510, 515, 523, 531, 539, 547, 555, 562 and 570.

## Deliberate brand adaptations and remaining differences

- The welcome copy uses OpenMotion, an invitation to create and the repository address. The original competitor comparison, model-version restriction and adoption counter are not current welcome claims.
- The reference uses a fully painted sky. The reconstruction combines two clean sky/horizon crops from frame 0 (top 240 pixels and bottom 190 pixels, with the rightmost 60 pixels excluded to remove the recorded pointer) with an interpolated sky wash; cloud placement in the middle differs. No reference title or interface text is baked into that background.
- Albert Sans is the maintained brand face. Libre Baskerville substitutes for the opening serif. The title uses layered text extrusion rather than the original unknown geometry; silhouettes at steep angles differ.
- Gallery cards are moving, source-editable drawings. Their sequence and framing follow the reference, but the historical artwork, character demo, exact model logos and fine decorative detail are approximations. Generic badges avoid implying support for unverified individual clients. The growth panel is illustrative and does not claim adoption statistics.
- The editor section is an authored illustration of an editable project, not a screen recording or evidence of an automated operation. It replaces the historical launch UI while retaining its shot timing and moving content.
- The cube is a real rounded mesh. Surface patterns, specular response and exact rotation curves approximate the observed film. Visual acceptance belongs to the reviewer; no pixel-perfect claim is made.
- The original soundtrack is retained at its original offset, encoded as 96 kbps AAC and trimmed to the picture duration. The project applies 0.85 gain and a 350 ms tail fade.

## Verification

Checked locally on November 15, 2026 with Node 26.11.1, Hyperframes 0.9.7 and Chrome on Apple Silicon. Preview SHA-256: `f2542ad71b794003660e1cb3638308139653fd83c9620abe700bfcd0c3f30836`.

| Check | State | Evidence and limits |
| --- | --- | --- |
| Native lint, timeline and info | Ran, passed | Eight HTML files; zero lint errors/warnings; seven graphics clips plus audio; 1920×1080, 30 fps, 37.3 seconds |
| Final export and full decode | Ran, passed | H.264/AAC MP4, all 1119 video frames decoded; dimensions, frame rate, duration, audio and seek checks passed |
| Same-time reference comparison | Ran, differs | Original/rebuilt comparison video and 36 sampled frame pairs, plus consecutive source-frame sheets; deliberate differences above remain. Corrected a rounded-time montage boundary, gallery entry gap and closing object scale |
| Audio alignment | Ran, passed | Original audio retained; 10 ms RMS-envelope correlation 0.990, best offset −20 ms (less than one 30 fps frame); this is signal evidence, not listening acceptance |
| Content replacement | Ran, passed | Strict variable render changed the closing brand to “Your Brand” and invitation to “Create your next story.” without changing the canonical source |
| Portable ZIP | Ran, passed | Unpacked into a separate directory, rendered all 1119 frames again with local assets, and passed the same technical checks; representative title, type and cube frames inspected. Final documentation-only updates do not change render inputs |
| Studio interaction | Ran, passed | Local development Studio played to 37.3 seconds; New project showed an empty timeline; template search and Open and edit created a separate copy; light/dark themes checked at a narrow 839 px viewport |
| Runtime and package regression | Ran, passed | 68 selected deterministic tests passed after fixes; one opt-in real Git LFS push test was skipped. npm test/stable artifact tests materialized all four templates from their extracted application archives |
| Repository checks | Ran, passed | `npm run check` (including design checks), Studio typecheck/build and `git diff --check` |
| Cold installation on another machine | Did not run | Archive materialization is not target-machine installation evidence |
| Human visual and listening acceptance | Did not run | The reviewer decides whether the brand adaptation and remaining reference differences meet the brief |

Technical verification, playback, visual comparison and human acceptance are separate outcomes. The original MP4, frame dumps and side-by-side comparison stay outside the template package.

## Attribution

See [NOTICE.md](NOTICE.md). The referenced film and extracted artwork/audio retain their original ownership; Apache-2.0 on the authored project does not relicense those materials. The original reference video and original-versus-rebuild comparison are not distributed as template assets.
