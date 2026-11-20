# A brand symbol becomes a chat tool

Reference guidance with an editable project candidate. Human visual acceptance is pending.

- Read [motion.md](source/motion.md) and open [preview.html](source/preview.html). All guide images and demo files are local.
- Edit source in this folder; refresh its manifest with `npm run templates:manifest -- motion-0ad92fd0-b2fb-4885-957c-b71152df15fd`, stage the change and run `npm run templates:check`.
- [Reference video](https://r.open-design.ai/files/ee7a7dacc9ed4fdb4f14b4537a015b896a02d7d585cb2dc5a020c43654ee7218) · [Published package](https://r.open-design.ai/files/3669fa3f67e44e40309b92f4f3137cbd7edf1cd6ad69c62cf8b3b7fc579567c4). Videos and duplicate archives remain in the CMS.
- Metadata, translations and imported package identity: [template.json](template.json).

## Editable project

- Entry: [source/index.html](source/index.html). Keep the project directory structure when editing or importing it. Existing reference previews and guidance are unchanged.
- The project file manifest in `template.json` restores the HTML, scripts, styles, media and licenses through the existing catalog-copy flow. Automatic creation uses verified public files and may require network access.
- For manual use from a checkout, fetch this template's optional media first:

```sh
git lfs pull --include="library/templates/catalog/motion-0ad92fd0-b2fb-4885-957c-b71152df15fd/source/assets/lfs/**" --exclude=""
```

- Edit copy in the HTML/composition and its project scripts; preserve timing, relative asset paths and attribution. Refresh the source manifest after changes. Keep the project-file paths, byte lengths and hashes in `template.json.entry.files` aligned with the revised source. Local and hosted project creation read the registered source; a manual CMS upload or new ZIP URL is not required.
- Packaging adjustments move audio/large fonts into `assets/lfs/`. Source loading and file-integrity checks do not establish full playback, adaptation or human visual acceptance.

## Acknowledgements

[Original reference](https://x.com/browsercompany/status/1932800009860272494). Reference footage, brands, screenshots and fonts retain their original rights; the repository license does not relicense them. Measured/inferred limits and import normalization remain in [manifest.json](source/manifest.json).
