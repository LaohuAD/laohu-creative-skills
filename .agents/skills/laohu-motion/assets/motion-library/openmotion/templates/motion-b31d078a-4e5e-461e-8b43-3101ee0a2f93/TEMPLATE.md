# Layered interface journey

Reference guidance with an editable project candidate. Human visual acceptance is pending.

- Read [motion.md](source/motion.md) and open [preview.html](source/preview.html). All guide images and demo files are local.
- Edit source in this folder; refresh its manifest with `npm run templates:manifest -- motion-b31d078a-4e5e-461e-8b43-3101ee0a2f93`, stage the change and run `npm run templates:check`.
- [Reference video](https://r.open-design.ai/files/91203186458d57604f8cdab7d3d1c89a94286a6e5e7c487833a6436b3044ded5) · [Published package](https://r.open-design.ai/files/62205d283777ec64d29399656baf124c953920a9a9e1c77ce675095c52e9700e). Videos and duplicate archives remain in the CMS.
- Metadata, translations and imported package identity: [template.json](template.json).

## Editable project

- Entry: [source/index.html](source/index.html). Keep the project directory structure when editing or importing it. Existing reference previews and guidance are unchanged.
- The project file manifest in `template.json` restores the HTML, scripts, styles, media and licenses through the existing catalog-copy flow. Automatic creation uses verified public files and may require network access.
- For manual use from a checkout, fetch this template's optional media first:

```sh
git lfs pull --include="library/templates/catalog/motion-b31d078a-4e5e-461e-8b43-3101ee0a2f93/source/assets/lfs/**" --exclude=""
```

- Edit copy in the HTML/composition and its project scripts; preserve timing, relative asset paths and attribution. Refresh the source manifest after changes. Keep the project-file paths, byte lengths and hashes in `template.json.entry.files` aligned with the revised source. Local and hosted project creation read the registered source; a manual CMS upload or new ZIP URL is not required.
- Packaging adjustments move audio/large fonts into `assets/lfs/`. Source loading and file-integrity checks do not establish full playback, adaptation or human visual acceptance.

## Acknowledgements

[Original reference](https://www.ordinaryfolk.co/project/webflow-a-new-era-of-no-code). Reference footage, brands, screenshots and fonts retain their original rights; the repository license does not relicense them. Measured/inferred limits and import normalization remain in [manifest.json](source/manifest.json).
