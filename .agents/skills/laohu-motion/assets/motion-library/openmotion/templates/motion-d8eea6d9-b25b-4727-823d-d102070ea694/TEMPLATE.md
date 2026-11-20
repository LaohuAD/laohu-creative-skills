# Xiaomi — HyperOS

Reference guidance with an editable project candidate. Human visual acceptance is pending.

- Read [motion.md](source/motion.md) and open [preview.html](source/preview.html). Large reference images load from existing CMS URLs; an internet connection is required to view them. Original images remain in the published package.
- Edit source in this folder; refresh its manifest with `npm run templates:manifest -- motion-d8eea6d9-b25b-4727-823d-d102070ea694`, stage the change and run `npm run templates:check`.
- [Reference video](https://r.open-design.ai/files/e33f62926a154934565bb2e94201b3bd067476b17275900bfd450e6cfa349484) · [Published package](https://r.open-design.ai/files/2e568308d57ceab26623ac284a7e7d1712f835235d71a802083b17124634aa40). Videos and duplicate archives remain in the CMS.
- Metadata, translations, remote asset identities and imported package identity: [template.json](template.json).

## Editable project

- Entry: [source/index.html](source/index.html). Keep the project directory structure when editing or importing it. Existing reference previews and guidance are unchanged.
- The project file manifest in `template.json` restores the HTML, scripts, styles, media and licenses through the existing catalog-copy flow. Automatic creation uses verified public files and may require network access.
- For manual use from a checkout, fetch this template's optional media first:

```sh
git lfs pull --include="library/templates/catalog/motion-d8eea6d9-b25b-4727-823d-d102070ea694/source/assets/lfs/**" --exclude=""
```

- Edit copy in the HTML/composition and its project scripts; preserve timing, relative asset paths and attribution. Refresh the source manifest after changes. Keep the project-file paths, byte lengths and hashes in `template.json.entry.files` aligned with the revised source. Local and hosted project creation read the registered source; a manual CMS upload or new ZIP URL is not required.
- Packaging adjustments move audio/large fonts into `assets/lfs/`. Source loading and file-integrity checks do not establish full playback, adaptation or human visual acceptance.

## Acknowledgements

[Original reference](https://www.mi.com/global/hyperos). Reference footage, brands, screenshots and fonts retain their original rights; the repository license does not relicense them. Measured/inferred limits and import normalization remain in [manifest.json](source/manifest.json).
