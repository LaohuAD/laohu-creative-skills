# Collaboration across devices

Reference guidance with an editable project candidate. Human visual acceptance is pending.

- Read [motion.md](source/motion.md) and open [preview.html](source/preview.html). Large reference images load from existing CMS URLs; an internet connection is required to view them. Original images remain in the published package.
- Edit source in this folder; refresh its manifest with `npm run templates:manifest -- motion-1e48dea5-903d-48f6-b10e-99a70f1c183d`, stage the change and run `npm run templates:check`.
- [Reference video](https://r.open-design.ai/files/f7a1c405c195dc7ceb846fe2db2bed553798dc23f7b040ad6453d091e719f5fe) · [Published package](https://r.open-design.ai/files/ee83e695958bc4aaa703d04f9baea2cceabb267f682cb30fefe8dc6292c40d75). Videos and duplicate archives remain in the CMS.
- Metadata, translations, remote asset identities and imported package identity: [template.json](template.json).

## Editable project

- Entry: [source/index.html](source/index.html). Keep the project directory structure when editing or importing it. Existing reference previews and guidance are unchanged.
- The project file manifest in `template.json` restores the HTML, scripts, styles, media and licenses through the existing catalog-copy flow. Automatic creation uses verified public files and may require network access.
- For manual use from a checkout, fetch this template's optional media first:

```sh
git lfs pull --include="library/templates/catalog/motion-1e48dea5-903d-48f6-b10e-99a70f1c183d/source/assets/lfs/**" --exclude=""
```

- Edit copy in the HTML/composition and its project scripts; preserve timing, relative asset paths and attribution. Refresh the source manifest after changes. Keep the project-file paths, byte lengths and hashes in `template.json.entry.files` aligned with the revised source. Local and hosted project creation read the registered source; a manual CMS upload or new ZIP URL is not required.
- Packaging adjustments move audio/large fonts into `assets/lfs/`; the Lark Three.js core is minified with its license retained. Source loading and file-integrity checks do not establish full playback, adaptation or human visual acceptance.

## Acknowledgements

[Original reference](https://www.ordinaryfolk.co/project/lark-magic-share). Reference footage, brands, screenshots and fonts retain their original rights; the repository license does not relicense them. Measured/inferred limits and import normalization remain in [manifest.json](source/manifest.json).
