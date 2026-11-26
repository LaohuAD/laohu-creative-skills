# Laohu Creative Skills

[简体中文](README.md) | [English](README.en.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [繁體中文](README.zh-TW.md)

> Creative skills prepared by Laohu for AI dream makers.
>
> From topics, stories, writing, and titles to covers, images, video prompts, lyrics, arrangements, native motion graphics, and audio cuts, this toolkit covers the full creative workflow. You hold the taste and direction; AI helps move each step forward inside clear boundaries.
>
> **Laohu AI Creative Ecosystem**: This repo is the **creative brain and methods**; pair it with the local open-source workbench **[Laohu Creative Studio](https://github.com/LaohuAD/laohu-creative-studio)** for visual canvases, media generation, and local workflows; connect **[Laohu Model Hut](https://api.lao-hu.com)** for one-account, low-cost pay-as-you-go access to hundreds of models; and visit **[lao-hu.com](https://lao-hu.com/)** for showcase works, tutorials, and community.

Laohu Creative Skills is a human-centered collection of creative capabilities. It turns the work from an initial idea to a finished and organized piece into entries you can choose yourself. You decide what to make, who it is for, and which judgments must remain yours; AI helps move the work forward within that direction.

## Install locally or globally

Requires Git, Python 3.9+, and an Agent that can read local Skills. Keep one complete repository; global entries link to this same checkout, so edits take effect directly. No separate development or stable copy is required.

```bash
git clone https://github.com/LaohuAD/laohu-creative-skills.git
cd laohu-creative-skills
python3 tools/check_project.py
```

Reuse an existing full checkout instead of cloning again. For project-only use, open the repository in your Agent; if no command appears, ask it to read `.agents/skills/laohu/SKILL.md`. This keeps usage scoped to the project.

For reuse across projects, preview and register directly deployed first- and second-level entries only. Reserved folders are skipped; third-level internal specializations (including WeChat formatting under `/laohu-htmlshow`) are read on demand by their owning second-level entry and are not registered separately:

```bash
python3 tools/install.py install --host codex
python3 tools/install.py install --host codex --write
```

Use `claude` instead of `codex` for local Claude Code. Choose only your intended host. The respective user directories are `~/.agents/skills` and `~/.claude/skills`; conflicting entries are never overwritten. Reload your host and verify discovery. Keep the source directory accessible. Local registration does not install into cloud sessions or other computers; other hosts and link permissions need verification.

You can ask: “Read this README and register this existing repository globally for Codex.” Reading this README alone does not authorize installation.

Agent guide: [open or download](https://raw.githubusercontent.com/LaohuAD/laohu-creative-skills/main/docs/agent-guide.txt). You can also ask: “Read the Laohu Creative Skills Agent guide first, then help me according to its instructions.”

Inside the Laohu project, works default to `works/` (with the actual path reported), and personal preferences or local notes live in `knowledge/`. Both `works/` and user files in `knowledge/` are ignored by `.gitignore` so your private drafts and preferences stay local and are never uploaded to GitHub. Outside the repo, the Agent suggests a specific location and waits for your choice before the first save, unless you already specified it. The same work keeps its confirmed directory. External folders do not inherit this repository's Git ignores.

Use `/laohu-update` in either mode; it preserves local edits and synchronizes managed global entries. Run `python3 tools/install.py status` to inspect registration. To uninstall entries, preview `python3 tools/install.py uninstall --host codex`, then add `--write`; repository and works remain. Unregister before moving the repository, then register again. See [installation details (Chinese)](.agents/skills/laohu-update/references/installation.md).


## What You Can Make

- Develop a topic, story, or creative direction from a first idea.
- Write lyrics, articles, scripts, and other forms of text with a stronger structure and voice.
- Design titles, covers, images, and video prompts so a work is easier to notice and understand.
- Plan arrangements, organize creative assets, and build materials you can reuse.
- Study reference works, diagnose problems, and archive completed work.
- Capture useful experience so the next project starts with more clarity.

## Choose an Entry

Enter `/laohu`, or start with one of these modes. You can describe the same request in your own language:

- `/laohu 新手入门`: Learn the basics and get a first example request.
- `/laohu 能力目录`: Browse currently available skills and their uses.
- `/laohu 帮我选`: Share a goal or material to get a recommendation, its rationale, and a ready-to-send prompt.
- `/laohu 更新帮助`: Update the complete project through Git; if your customizations conflict with an official update, you decide how to merge them.

The entry reads the current skill information each time. New capabilities added to the same collection become candidates on the next scan. You decide whether to start execution.

When you know what you want to do, choose the matching command. When you only know that you want to create something, start with /laohu. It helps clarify the goal, materials, and next decision, then lets you choose the right direction.

| Command | Use it for |
| --- | --- |
| /laohu | Clarifying a request and choosing a creative direction |
| /laohu-audit | Confirm concrete issues in works, prompts, Skills, and workflows against their goals and evidence |
| /laohu-analysis | Explain causes or turn confirmed goals into actionable plans |
| /laohu-evolution | Capturing experience and improving creative methods |
| /laohu-story | Finding and developing creative starting points for music, writing, images, and other media |
| /laohu-writing | Writing, revision, spoken scripts, and expression |
| /laohu-cover | Cover concepts and cover prompts |
| /laohu-image | Image concepts and image-generation prompts |
| /laohu-title | Titles, names, and entry points |
| /laohu-htmlshow | Polished, readable HTML views for articles, reports, prompts, and scripts, plus on-demand WeChat article formatting |
| /laohu-assets | Reusable visual assets (default seamless four-grid or single image) and authorized voice prompts |
| /laohu-archive | Creating and reusing work folders to keep each project’s files together |
| /laohu-update | Installing the repo, managing global entries, updating via Git, and releasing verified changes |
| /laohu-video | Script splitting (default 15s, adjustable) and 4-track drama/martial-arts/VFX/animation video prompts |
| /laohu-script | Develops story ideas into scripts, from pre-design and scenes to action, dialogue, and audiovisual expression |
| /laohu-lyrics | Write or revise lyrics across 28 on-demand genre/language/purpose specializations with chorus hook alignment |
| /laohu-arrangement | Arrange music from lyrics, melody, audio, or a brief (plans, AI control packs, notation, MIDI) and design animation/video sound |
| /laohu-luna | Keep the current session model as Commander, flexibly delegate bounded tasks via the host's subagents or user-selected CLI/model, and review actual outputs |
| /laohu-novel | Create, continue, adapt, and revise novels; turn story concepts or chapter briefs into prose |
| /laohu-topic | Top-level cross-category strategic topic planning: core needs, audience value, trend potential, and handoff briefs |
| /laohu-motion | Turn an idea, narration, or existing project into deterministic native-code Showreel animations, rendered and verified locally |
| /laohu-asrcut | Create traceable virtual rough/fine cuts, a compiled timeline, and a review report from recordings, screen captures, ASR, or SRT; export edited audio only when authorized |
| /laohu-benchmark | Closely analyze works, build evidence-bounded transferable methods, and search or save local method atoms when authorized |

This table lists currently defined public entries in display order; the order is for browsing and does not set recommendation priority or a fixed workflow. The live scan can discover a newly added public entry before its table entry is updated; use the `/laohu` capability directory to check its current definition. Reserved folders are not formal capabilities. Project workspaces can discover the directly deployed entries in `.agents/skills/`. Global registration includes first- and second-level entries only; third-level internal specializations (including WeChat formatting inside `/laohu-htmlshow`) are read on demand by their owning second-level entry and are not registered separately.

Use a defined entry on its own or combine several for one project. You can use `/laohu-topic` to settle the full content direction, then decide whether to pass its brief to `/laohu-title` for title work, `/laohu-cover` for visual design, or writing; you can also use only the entry needed for the current step. You decide whether to continue, revise, or change direction at every step.

## The Laohu AI Creative Ecosystem: Four Pieces Working as One

Creating solo with AI usually breaks in two places: great ideas and prompts still force you to bounce across five cloud sites, re-upload references, and top up fragmented balances; meanwhile, running generators without clear direction just burns credits on unusable outputs.

These four pieces connect into one practical workflow—use just the piece you need today, or link them end to end:

| Piece | Role | What it solves | Link |
| --- | --- | --- | --- |
| **Laohu Creative Skills** (this repo) | **Brain & methods** | 23 modular Agent skills covering topics, writing, titles, covers, scripts, novels, lyrics, arrangements, video prompts, motion graphics, and review | [GitHub](https://github.com/LaohuAD/laohu-creative-skills) |
| **Laohu Creative Studio** (local workbench) | **Hands & canvas** | Local infinite canvas, video cloning, native animation, and multimodal creation—keeping your assets, parameters, and reusable workflows on your own machine (with native Agent & `laohu-motion` support) | [GitHub](https://github.com/LaohuAD/laohu-creative-studio) |
| **Laohu Model Hut** | **Affordable model API** | One account for hundreds of text, image, video, music, and voice models—natively integrated in Creative Studio with budget-friendly low-price routes and transparent pay-as-you-go billing | [Models & Live Pricing](https://api.lao-hu.com/pricing) |
| **Laohu Website** | **Works, guides & community** | Finished AI works, step-by-step [tutorials & workflows](https://lao-hu.com/learn/), all open-source tools, and the [Dream Maker community](https://lao-hu.com/#community) | [lao-hu.com](https://lao-hu.com/) |

A typical loop:

1. **Set direction with Laohu Creative Skills**: lock your topic, script, cover concept, video prompts, or animation brief inside your Agent.
2. **Generate and iterate in Laohu Creative Studio**: bring prompts and assets into the local canvas or motion/video workbench, connect models to generate images, clips, and music, and keep every winning parameter locally.
3. **Review, polish, and archive**: return to `/laohu-audit`, `/laohu-htmlshow`, or `/laohu-archive` to refine and deliver (and pair with [CapMotion](https://github.com/LaohuAD/laohu-CapMotion) for talking-head screen tutorials).

### Want lower iteration costs for images and video? Try Creative Studio + Model Hut

Polishing a real cover, storyboard, or video clip takes multiple iterations. Pairing local **Laohu Creative Studio** with **[Laohu Model Hut](https://api.lao-hu.com)** keeps that iteration fast and inexpensive:

- **One account instead of juggling platforms**: access hundreds of mainstream image, video, music, audio, and text models from one key, natively supported under the `laohu` provider in Creative Studio.
- **Budget-friendly low-price routes, pay only for what you run**: transparent per-use pricing with low-cost tiers designed for multi-round creative iteration (check current per-model rates on the [live pricing page](https://api.lao-hu.com/pricing) before running).
- **Zero lock-in**: both open-source repos work independently with local ComfyUI, RunningHub, ModelScope, Volcengine, or any API you already use. Test Model Hut on one small task, compare quality, speed, and cost, and keep using it only if it genuinely saves you money.

Explore real works, full tutorials, and the community at **[lao-hu.com](https://lao-hu.com/)**.

## Ongoing Development

See the [changelog](CHANGELOG.md) for version changes. Ask `/laohu` for update help, or use `/laohu-update` when you want to upgrade. Maintainers can run `python3 tools/check_project.py --test`; release steps are in the [maintenance guide](docs/maintenance.md).

The project continues to improve through real creative work. If you find a problem or have a suggestion, contact Laohu through the personal website.

## License and Creative Outputs

The repository's Skills, rules, references, templates, and other project materials are licensed under CC BY-NC 4.0. Without separate permission, those repository materials themselves may not be used for commercial distribution, commercial services, or commercial products. The third-party WeChat layout assets under `.agents/skills/laohu-htmlshow/gzh` remain under their original AGPL-3.0 license (with MIT notices preserved for locally adapted WeDraft themes); see that directory's license files.

Lyrics, articles, titles, images, audio, video, scripts, and other works you create with these skills are generally not made non-commercial merely because you used the repository. Your rights to use or commercialize an output still depend on your own rights, the licenses for models and materials, platform terms, and applicable law.
