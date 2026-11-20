# A keycap turns into voice typing

Reference guidance with an editable project candidate. Human visual acceptance is pending.

- Read [motion.md](source/motion.md) and open [preview.html](source/preview.html). All guide images and demo files are local.
- Edit source in this folder; refresh its manifest with `npm run templates:manifest -- motion-a28f0e5d-aa8b-45a7-87f9-9afcac65a09b`, stage the change and run `npm run templates:check`.
- [Reference video](https://r.open-design.ai/files/7afb51d9324bfb62b6a85517671ea314d481894b53ad1bf89b6dadce87c4877c) · [Published package](https://r.open-design.ai/files/669e4387cf4944060f0eabaa867feff7ad3d036f465c7d564edb1f1003b7c731). Videos and duplicate archives remain in the CMS.
- Metadata, translations and imported package identity: [template.json](template.json).

## Editable project

- Entry: [source/index.html](source/index.html). Keep the project directory structure when editing or importing it. Existing reference previews and guidance are unchanged.
- The project file manifest in `template.json` restores the HTML, scripts, styles, media and licenses through the existing catalog-copy flow. Automatic creation uses verified public files and may require network access.
- For manual use from a checkout, fetch this template's optional media first:

```sh
git lfs pull --include="library/templates/catalog/motion-a28f0e5d-aa8b-45a7-87f9-9afcac65a09b/source/assets/lfs/**" --exclude=""
```

- Edit copy in the HTML/composition and its project scripts; preserve timing, relative asset paths and attribution. Refresh the source manifest after changes. Keep the project-file paths, byte lengths and hashes in `template.json.entry.files` aligned with the revised source. Local and hosted project creation read the registered source; a manual CMS upload or new ZIP URL is not required.
- Packaging adjustments move audio/large fonts into `assets/lfs/`. Source loading and file-integrity checks do not establish full playback, adaptation or human visual acceptance.

## Acknowledgements

[Original reference](https://x.com/meetgranola/status/2115837013975081208). Reference footage, brands, screenshots and fonts retain their original rights; the repository license does not relicense them. Measured/inferred limits and import normalization remain in [manifest.json](source/manifest.json).
