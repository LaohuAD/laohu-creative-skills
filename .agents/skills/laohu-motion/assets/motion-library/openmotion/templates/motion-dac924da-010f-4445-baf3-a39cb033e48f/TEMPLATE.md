# Voice Circle Reveal

Reference guidance with an editable project candidate. Human visual acceptance is pending.

- Read [motion.md](source/motion.md) and open [preview.html](source/preview.html). All guide images and demo files are local.
- Edit source in this folder; refresh its manifest with `npm run templates:manifest -- motion-dac924da-010f-4445-baf3-a39cb033e48f`, stage the change and run `npm run templates:check`.
- [Reference video](https://r.open-design.ai/files/9c917b1f71d6e3d95682b968d7254b4fe52e81dc6d9e89f5ff1c5d147ab0d27a) · [Published package](https://r.open-design.ai/files/6fe7a42bbd98ec734324ce5b334fef987f6341e82d6314a1f0909c12f607ce76). Videos and duplicate archives remain in the CMS.
- Metadata, translations and imported package identity: [template.json](template.json).

## Editable project

- Entry: [source/index.html](source/index.html). Keep the project directory structure when editing or importing it. Existing reference previews and guidance are unchanged.
- The project file manifest in `template.json` restores the HTML, scripts, styles, media and licenses through the existing catalog-copy flow. Automatic creation uses verified public files and may require network access.
- For manual use from a checkout, fetch this template's optional media first:

```sh
git lfs pull --include="library/templates/catalog/motion-dac924da-010f-4445-baf3-a39cb033e48f/source/assets/lfs/**" --exclude=""
```

- Edit copy in the HTML/composition and its project scripts; preserve timing, relative asset paths and attribution. Refresh the source manifest after changes. Keep the project-file paths, byte lengths and hashes in `template.json.entry.files` aligned with the revised source. Local and hosted project creation read the registered source; a manual CMS upload or new ZIP URL is not required.
- Packaging adjustments move audio/large fonts into `assets/lfs/`. Source loading and file-integrity checks do not establish full playback, adaptation or human visual acceptance.

## Acknowledgements

[Original reference](https://x.com/claudeai/status/2080376094939603366). Reference footage, brands, screenshots and fonts retain their original rights; the repository license does not relicense them. Measured/inferred limits and import normalization remain in [manifest.json](source/manifest.json).
