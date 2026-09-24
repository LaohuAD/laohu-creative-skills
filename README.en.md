# Laohu Creative Skills

[简体中文](README.md) | [English](README.en.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [繁體中文](README.zh-TW.md)

> Creative skills prepared by Laohu for AI dream makers.
>
> The toolkit covers music, covers, video, titles, and other areas of content creation and publishing. Dream makers choose and combine the skills according to their own aesthetic judgment, then complete AI-assisted creation and publishing. Let us draw a dream for this world together.

Laohu Creative Skills is a human-centered AI creation toolkit. It does not decide what a person should do next. Instead, it turns different creative abilities into entries that people can choose, invoke independently, and combine step by step. The person decides the goal, scope, and important trade-offs; AI performs the professional work within that scope.

## What It Solves

Choose the ability you need: develop a topic, write lyrics, design a cover, write a video prompt, organize a work, or find the real problem in an existing piece.

If you do not know which entry to use, start with `/laohu`. It helps clarify the task, compare available abilities, and return the choice to you.

A complete workflow entry and a focused entry can be used separately. For example, `laohu-lyrics` will handle the lyric-writing workflow, while a future `laohu-lyrics-rhyme` can focus only on rhyme problems. The workflow reads professional methods when needed, and focused abilities can also be used on their own.

## Current Entries

| Entry | Purpose |
| --- | --- |
| `laohu` | Top-level routing and task clarification |
| `laohu-topic` | Topic development |
| `laohu-writing` | Writing |
| `laohu-lyrics` | Lyrics |
| `laohu-title` | Titles |
| `laohu-cover` | Covers |
| `laohu-script` | Scripts |
| `laohu-image` | Images |
| `laohu-assets` | Visual and creative assets |
| `laohu-story` | Story ideas |
| `laohu-video` | Video and video prompts |
| `laohu-update` | Toolkit updates |
| `laohu-diagnosis` | Finding problems in a work |
| `laohu-archive` | Organizing, collecting, and archiving works |
| `laohu-arrangement` | Music arrangement |
| `laohu-benchmark` | Benchmark and reference analysis |
| `laohu-evolution` | Self-evolution and experience capture |

These entries currently contain directory scaffolds only. Their `SKILL.md` files will be built from real creative tasks over time.

## How It Works

```text
A person's goal and materials
        ↓
/laohu or a directly selected entry
        ↓
Confirm the task scope, protected decisions, and deliverable
        ↓
The entry reads methods, cases, and assets as needed
        ↓
Deliver the current result and let the person decide whether to revise, continue, or stop
```

The directory can be organized by responsibility, but every entry that must be discovered independently by different Agents remains a registrable top-level Skill. A workflow Skill may coordinate focused abilities. If the host cannot invoke one Skill from another, the current entry reads the same Reference instead; a recommendation is never presented as an execution that did not happen.

## Project Structure

```text
laohu-creative-skill/
├── AGENTS.md       Project rules, routing boundaries, and asset protection
├── README.md       Project introduction and entry guide
├── LICENSE         CC BY-NC 4.0
├── skills/         Discoverable, user-invoked Skill entries
├── works/          Work projects, drafts, confirmed files, and publishing materials
└── knowledge/      Reusable knowledge, cases, experience, and long-term assets
```

The `.gitkeep` files under `skills/` only preserve the empty directories in Git. They do not mean the corresponding abilities are complete. `SKILL.md`, `references/`, `templates/`, `scripts/`, and tests will be added as needed.

## Design Principles

- People decide what to do; AI completes what it is authorized to do.
- When the goal is clear, invoke the corresponding entry directly; use `/laohu` when it is not.
- Split an independent problem into its own Skill; keep methods such as lighting, rhyme, and shot size as professional References by default.
- Keep works, personal materials, and knowledge assets separate from toolkit methods; updating the toolkit must not overwrite user assets.
- Every Skill must state its trigger, inputs, outputs, protected content, and stopping conditions.

## Project Materials and Creative Outputs

This project uses the [CC BY-NC 4.0](LICENSE) license. The restriction applies to the repository's own materials, including Skills, rules, References, cases, templates, scripts, and other content published with the repository. Those materials may not be used for commercial distribution, commercial services, or commercial products without separate permission.

Lyrics, articles, titles, images, audio, video, scripts, and other works created by users with these abilities are not automatically subject to the license's non-commercial restriction merely because the toolkit was used. Creators may use, publish, or commercialize those works according to their own rights and permissions.

Third-party materials, model services, platform content, and external methods used in a work remain subject to their own licenses, terms, and applicable law. This project does not grant those third-party rights, and it does not extend the repository's commercial-use restriction to creative outputs.

## Repository

[GitHub: LaohuAD/laohu-creative-skill](https://github.com/LaohuAD/laohu-creative-skill)
