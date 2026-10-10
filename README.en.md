# Laohu Creative Skills

[简体中文](README.md) | [English](README.en.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [繁體中文](README.zh-TW.md)

> Creative skills prepared by Laohu for AI dream makers.
>
> From music and covers to video and titles, the toolkit supports many parts of content creation and publishing. Choose and combine the skills with your own taste, complete your AI-assisted work, and draw a dream for this world.

Laohu Creative Skills is a human-centered collection of creative capabilities. It turns the work from an initial idea to a finished and organized piece into entries you can choose yourself. You decide what to make, who it is for, and which judgments must remain yours; AI helps move the work forward within that direction.

## Install locally or globally

Requires Git, Python 3.9+, and an Agent that can read local Skills. Keep one complete repository; global entries link to this same checkout, so edits take effect directly. No separate development or stable copy is required.

```bash
git clone https://github.com/LaohuAD/laohu-creative-skills.git
cd laohu-creative-skills
python3 tools/check_project.py
```

Reuse an existing full checkout instead of cloning again. For project-only use, open the repository in your Agent; if no command appears, ask it to read `.agents/skills/laohu/SKILL.md`. This keeps usage scoped to the project.

For reuse across projects, preview and register directly deployed first- and second-level entries only. Reserved folders are skipped; third-level capabilities are read on demand by their owning second-level entry and are not registered separately. For WeChat formatting, `/laohu-htmlshow` reads `laohu-htmlshow-gzh` when the task requires it:

```bash
python3 tools/install.py install --host codex
python3 tools/install.py install --host codex --write
```

Use `claude` instead of `codex` for local Claude Code. Choose only your intended host. The respective user directories are `~/.agents/skills` and `~/.claude/skills`; conflicting entries are never overwritten. Reload your host and verify discovery. Keep the source directory accessible. Local registration does not install into cloud sessions or other computers; other hosts and link permissions need verification.

You can ask: “Read this README and register this existing repository globally for Codex.” Reading this README alone does not authorize installation.

Agent guide: [open or download](https://raw.githubusercontent.com/LaohuAD/laohu-creative-skills/main/docs/agent-guide.txt). You can also ask: “Read the Laohu Creative Skills Agent guide first, then help me according to its instructions.”

Inside the Laohu project, works default to `works/`, with the actual path reported. Outside it, the Agent suggests a specific location and waits for your choice before the first save, unless you already specified it. The same work keeps its confirmed directory. External folders do not inherit this repository's Git ignores.

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
| /laohu-htmlshow | Readable HTML views for articles, prompts, scripts, and structured content |
| /laohu-htmlshow-gzh | WeChat article formatting, loaded by `/laohu-htmlshow` for WeChat tasks |
| /laohu-assets | Visual, audio, and creative assets |
| /laohu-archive | Creating and reusing work folders to keep each project’s files together |
| /laohu-update | Reviewing and updating the toolkit |
| /laohu-video | Video shots, audiovisual direction, and three-part prompts |
| /laohu-script | Develops story ideas into scripts, from structure and scenes to character action, dialogue, audiovisual expression, and review |
| /laohu-lyrics | Write or revise lyrics from ideas, stories, existing lyrics, or melodies; shape sections, voice, language, sound, and review |
| /laohu-arrangement | Arrange music from lyrics, melody, audio, or a brief; shape form, harmony, groove, instrumentation, texture, timbre, and vocals; deliver a production plan, AI-generation input, or notation |
| /laohu-luna | Keep the current session model as Commander, delegate every bounded task to Luna Worker, and review the result |
| /laohu-novel | Create, continue, adapt, and revise novels; turn story concepts or chapter briefs into prose |

This table lists currently defined public entries in display order; the order is for browsing and does not set recommendation priority or a fixed workflow. The live scan can discover a newly added public entry before its table entry is updated; use the `/laohu` capability directory to check its current definition. Reserved folders are not formal capabilities. Project workspaces can discover the directly deployed entries in `.agents/skills/`. Global registration includes first- and second-level entries only; third-level capabilities are read on demand by their owning second-level entry and are not registered separately. For a WeChat task, `/laohu-htmlshow` loads `laohu-htmlshow-gzh` when needed.

Use a defined entry on its own or combine several for one project. You can draft an article with `/laohu-writing` and refine its title with `/laohu-title`, or work on one title or cover with `/laohu-cover`. You decide whether to continue, revise, or change direction at every step.

## Use It with Laohu Creative Studio

Laohu Creative Studio is the interactive workspace that complements these skills. Use it to turn a direction into canvases, music, images, video, and other visible creative results with model-assisted workflows.

- Use Laohu Creative Skills to decide the direction, content, and key judgments.
- Use Laohu Creative Studio to generate, test, and visualize.
- Return to the skills to revise, diagnose, organize, or publish.

Project links:

- Laohu Creative Skills: https://github.com/LaohuAD/laohu-creative-skills
- Laohu Creative Studio: https://github.com/LaohuAD/laohu-creative-studio
- Laohu personal website: https://lao-hu.com/

## Ongoing Development

See the [changelog](CHANGELOG.md) for version changes. Ask `/laohu` for update help, or use `/laohu-update` when you want to upgrade. Maintainers can run `python3 tools/check_project.py --test`; release steps are in the [maintenance guide](docs/maintenance.md).

The project continues to improve through real creative work. If you find a problem or have a suggestion, contact Laohu through the personal website.

## License and Creative Outputs

The repository's Skills, rules, references, templates, and other project materials are licensed under CC BY-NC 4.0. Without separate permission, those repository materials themselves may not be used for commercial distribution, commercial services, or commercial products. The third-party WeChat layout skill under `.agents/skills/laohu-htmlshow-gzh` remains under its original AGPL-3.0 license; see that directory's license.

Lyrics, articles, titles, images, audio, video, scripts, and other works you create with these skills are generally not made non-commercial merely because you used the repository. Your rights to use or commercialize an output still depend on your own rights, the licenses for models and materials, platform terms, and applicable law.
