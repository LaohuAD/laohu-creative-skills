import hashlib
import importlib.util
import json
import re
import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[4]
SCRIPT_PATH = REPO_ROOT / ".agents/skills/laohu-motion/scripts/laohu-styles.py"
SPEC = importlib.util.spec_from_file_location("laohu_styles_resources_test", SCRIPT_PATH)
styles = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(styles)


class MotionResourceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.style_index = styles.load_index()
        cls.resource_catalog = styles.load_resource_catalog()
        cls.motion_index = json.loads(styles.MOTION_INDEX.read_text(encoding="utf-8"))
        cls.overlay_index = json.loads(styles.OVERLAY_INDEX.read_text(encoding="utf-8"))
        cls.atlas_index = json.loads(styles.EFFECT_INDEX.read_text(encoding="utf-8"))

    def test_all_240_motion_l2_rows_resolve_with_hashes(self):
        entries = self.motion_index["entries"]
        self.assertEqual(len(entries), 240)
        source_root = REPO_ROOT / ".cache/research/motion-source-expansion-20261117/motion-prompt-683ecca0548a1754ada141d10dc3a009d4c59bef"
        for row in entries:
            source = (source_root / row["sourceElementPath"]).read_bytes()
            self.assertEqual(hashlib.sha256(source).hexdigest(), row["sourceElementSha256"], row["id"])
        all_text = {
            row["id"]: styles.resource_fulltext(
                {"entries": [{
                    "id": row["id"],
                    "sourceType": "motion-prompt",
                    "producerMarkdown": f"motion/{row['detailPath']}",
                    "detailLines": row["detailLines"],
                    "sharedDetailLines": row.get("sharedDetailLines", []),
                    "implementationPath": row["runtimePath"],
                }]},
                row["id"], "L2", self.style_index,
            )
            for row in entries
        }
        self.assertEqual(set(all_text), {row["id"] for row in entries})
        for row in entries:
            result = all_text[row["id"]]
            self.assertTrue(result["content"].startswith(f"## {row['id']} ·"))
            self.assertEqual(result["bytes"], len(result["content"].encode("utf-8")))
            self.assertEqual(result["sha256"], hashlib.sha256(result["content"].encode("utf-8")).hexdigest())
        for global_id in ("097", "099", "193", "217"):
            row = next(item for item in entries if item["globalId"] == global_id)
            result = all_text[row["id"]]
            self.assertTrue(row.get("sharedDetailLines"), global_id)
            self.assertEqual(len(result.get("sourceRanges", [])), 2, global_id)
            self.assertIn("共同行为", result["content"], global_id)
        photo_097 = next(item for item in entries if item["globalId"] == "097")
        photo_content = all_text[photo_097["id"]]["content"]
        for token in ("0.4–1.4 秒", "保持至 4.0 秒", "4.8 秒前完全退出", "cubic ease-in-out"):
            self.assertIn(token, photo_content)
        l2_by_global = {row["globalId"]: all_text[row["id"]]["content"] for row in entries}
        required_specs = {
            "001": ("1−e^(−6.5t)cos(15t)", "1−e^(−6t)cos(11t)", "1−e^(−7t)cos(17t)"),
            "005": ("backIn（s=1.2）",),
            "149": ("每 4.7 秒完整完成一次", "9.4 秒源周期内重复两次"),
            "154": ("每 4.7 秒完成一次 8 字轨迹", "9.4 秒源周期内重复两次"),
            "169": ("3.4–4.2 秒保持", "最后 0.5 秒"),
            "171": ("最后 0.5 秒交叉淡回起始画面", "单次通过时长为 4.7 秒"),
            "172": ("跟随运动在 4.2 秒停止", "最后 0.5 秒交叉淡回起始画面", "单次通过时长为 4.7 秒"),
            "174": ("最后 0.5 秒交叉淡回起始画面", "单次通过时长为 4.7 秒"),
            "177": ("最后 0.5 秒交叉淡回眼平起始画面", "单次通过时长为 4.7 秒"),
            "178": ("最后 0.5 秒交叉淡回眼平起始画面", "单次通过时长为 4.7 秒"),
            "181": ("3.4–4.2 秒保持", "最后 0.5 秒交叉淡回"),
            "217": ("0.3–0.7 秒以 ease-out 淡入",),
        }
        for global_id, fragments in required_specs.items():
            for fragment in fragments:
                self.assertIn(fragment, l2_by_global[global_id], f"{global_id}: {fragment}")

    def test_all_runtime_pack_modules_resolve_as_l3(self):
        modules = {row["runtimePath"] for row in self.motion_index["entries"]}
        self.assertEqual(len(modules), 10)
        for module_path in modules:
            row = next(item for item in self.motion_index["entries"] if item["runtimePath"] == module_path)
            result = styles.resource_fulltext(
                {"entries": [{
                    "id": row["id"],
                    "sourceType": "motion-prompt",
                    "implementationPath": module_path,
                }]},
                row["id"], "L3", self.style_index,
            )
            self.assertTrue(result["content"].startswith("// Motion Prompt pack"))
            self.assertIn(Path(module_path).stem, result["content"])

    def test_motion_l2_local_markdown_links_resolve_from_the_document(self):
        document = styles.STYLE_ROOT / "motion/motion-prompt.md"
        body = document.read_text(encoding="utf-8")
        links = re.findall(r"\[[^\]]+\]\(([^)]+)\)", body)
        self.assertTrue(links)
        for target in links:
            self.assertFalse(target.startswith(("http://", "https://", "#")), target)
            resolved = (document.parent / target.split("#", 1)[0]).resolve()
            self.assertTrue(resolved.exists(), f"broken L2 link: {target} -> {resolved}")

    def test_overlay_rows_expose_specific_disposition_and_retrievable_l2(self):
        entries = self.overlay_index["entries"]
        self.assertEqual(len(entries), 20)
        for row in entries:
            self.assertIn(row["availability"], {
                "implemented-local-consumer", "partial-local-consumer", "related-mit-only", "pending-local-consumer"
            })
            self.assertTrue(row["localDisposition"]["summary"])
            result = styles.resource_fulltext(
                {"entries": [{
                    "id": row["id"],
                    "sourceType": "overlay",
                    "producerMarkdown": f"motion/{row['detailPath']}",
                    "detailLines": row["detailLines"],
                }]},
                row["id"], "L2", self.style_index,
            )
            self.assertTrue(result["content"].startswith(f"## {row['id']} ·"))

    def test_all_504_atlas_entries_resolve_to_source_bound_l2(self):
        entries = self.atlas_index["entries"]
        self.assertEqual(len(entries), 504)
        unified = {row["id"]: row for row in self.resource_catalog["entries"]}
        source_root = REPO_ROOT / ".cache/research/motion-source-expansion-20261117/atlas"
        for row in entries:
            item = unified[row["id"]]
            self.assertEqual(item["availability"], "knowledge-only-no-local-runtime")
            raw_source = (source_root / row["sourceSnapshotPath"]).read_bytes()
            self.assertEqual(hashlib.sha256(raw_source).hexdigest(), row["sourceSha256"])
            result = styles.resource_fulltext(
                {"entries": [{
                    "id": row["id"], "sourceType": "atlas", "producerMarkdown": row["detailPath"],
                    "detailLines": row["detailLines"],
                }], "atlasProductionNoteZh": self.atlas_index["atlasProductionNoteZh"]},
                row["id"], "L2", self.style_index,
            )
            self.assertTrue(result["content"].startswith(f"## {row['id']} ·"))
            self.assertIn("必要输入与条件：", result["content"])
            self.assertIn("区别与边界：", result["content"])
            self.assertIn("Atlas 条目适用范围：", result["content"])
            self.assertEqual(result["sha256"], hashlib.sha256(result["content"].encode("utf-8")).hexdigest())

    def test_atlas_family_api_requires_exact_member_coverage(self):
        family = {
            "id": "atlas-family:sample-family",
            "memberCount": 2,
            "memberIds": ["atlas:one", "atlas:two"],
        }
        catalog = {
            "atlasFamilies": [family],
            "atlasProductionNoteZh": "示意可模拟，真实工艺按实际方法要求。",
            "atlasResources": [
                {"id": "atlas:one", "familyIds": [family["id"]]},
                {"id": "atlas:two", "familyIds": [family["id"]]},
            ],
        }
        result = styles.resource_family(catalog, family["id"])
        self.assertEqual(result["schema"], "laohu.motion.resource-family/1")
        self.assertEqual(result["memberCount"], 2)
        self.assertEqual({row["id"] for row in result["resources"]}, set(family["memberIds"]))

        broken = {**catalog, "atlasResources": catalog["atlasResources"][:1]}
        with self.assertRaisesRegex(ValueError, "ATLAS_FAMILY_MEMBER_COVERAGE_MISMATCH"):
            styles.resource_family(broken, family["id"])

    def test_atlas_get_preserves_source_status_and_interface_family_route(self):
        catalog = styles.load_resource_catalog()
        self.assertTrue(all(row["sourceStatus"] == "source-snapshot-hash-verified-curation"
                            for row in catalog["atlasResources"]))
        item = styles.resource_get(catalog, "atlas:1-bit-dithering")
        self.assertEqual(item["sourceStatus"], "source-snapshot-hash-verified-curation")

        canvas = styles.resource_get(catalog, "atlas:canvas-extension-schematic")
        self.assertIn("若声称为实际 outpainting 结果", canvas["limitations"])
        self.assertIn("讲解示意可用人工或数字方式模拟", canvas["limitations"])

        family_id = "atlas-family:typographic-graphics"
        family = styles.resource_family(catalog, family_id)
        self.assertEqual(family["family"]["nameZh"], "界面、字符与平面图形")
        self.assertEqual(family["memberCount"], 13)
        member_ids = {row["id"] for row in family["resources"]}
        self.assertTrue({"atlas:liquid-glass-interface", "atlas:skeuomorphic-interface"} <= member_ids)
        for resource_id in ("atlas:liquid-glass-interface", "atlas:skeuomorphic-interface"):
            self.assertEqual(styles.resource_get(catalog, resource_id)["familyId"], family_id)

    def test_global_map_projects_every_current_inventory_and_preserves_exact_vocabulary(self):
        overview = styles.resource_global_map(self.style_index)
        markdown = styles.global_map_text(overview)
        self.assertLessEqual(len(markdown), 20_000)
        groups = overview["styleCategories"]
        self.assertTrue(8 <= len(groups) <= 10)
        self.assertEqual({row["id"] for group in groups for row in group["styles"]},
                         {row["id"] for row in self.style_index["entries"]})
        self.assertEqual({row["id"] for row in overview["atlasFamilies"]},
                         {row["id"] for row in self.atlas_index["families"]})
        self.assertEqual(overview["coverage"]["atlasMembers"], len(self.atlas_index["entries"]))
        self.assertEqual({row["category"] for row in overview["motionPromptCategories"]},
                         {row["categoryZh"] for row in self.motion_index["entries"]})
        self.assertEqual(sum(row["memberCount"] for row in overview["motionPromptCategories"]), len(self.motion_index["entries"]))
        self.assertEqual({row["id"] for row in overview["overlay"]}, {row["id"] for row in self.overlay_index["entries"]})
        openmotion = styles.load_openmotion_catalog()
        if openmotion is not None:
            self.assertEqual({row["category"] for row in overview["openMotionCategories"]},
                             {row["category"] for row in openmotion["entries"]})
            self.assertEqual(sum(row["memberCount"] for row in overview["openMotionCategories"]), len(openmotion["entries"]))
        else:
            self.assertFalse(overview["openMotionInstalled"])
            self.assertIn("本地可选资料包缺失", markdown)
        fonts, uses = styles.typography_rows()
        self.assertEqual(sum(overview["typography"]["fontCategories"].values()), len(fonts))
        self.assertEqual(sum(overview["typography"]["useCategories"].values()), len(uses))
        vocabulary = styles.safe_resource_file("motion/vocabulary.md").read_text(encoding="utf-8")
        self.assertEqual(overview["motionVocabulary"], vocabulary)
        self.assertIn(vocabulary.rstrip(), markdown)
        self.assertNotIn("先验证几何节奏，再加表面质感", markdown)

    def test_l1_batch_and_full_source_preserve_evidence_and_preview_boundaries(self):
        catalog = self.resource_catalog
        ids = ["original:art-deco", "new:caption-news", "original:liquid-shader", "original:glass-material",
               "atlas:liquid-glass-interface", "motion-prompt:motion:001", "overlay:ring-metric",
               "type-use:tentative-question", "new:exploded-teardown", "new:woodcut-print"]
        cards = styles.resource_compare(catalog, self.style_index, ids)["resources"]
        self.assertEqual([row["id"] for row in cards], ids)
        art_deco, news = cards[0:2]
        self.assertIn("#162C2A", art_deco["appearance"]["colorLighting"]["summary"])
        self.assertIn("Poiret One", art_deco["appearance"]["typeLayout"]["summary"])
        self.assertTrue(art_deco["catalog"]["visual"]["evidence"])
        self.assertTrue((REPO_ROOT / news["previewPath"]).is_file())
        self.assertTrue(cards[5]["whenToUseZh"] and cards[5]["whatHappensZh"])
        style_source = next(row for row in self.style_index["entries"] if row["id"] == ids[2])
        selected_body = styles.resource_fulltext(catalog, ids[2], "L2", self.style_index)
        self.assertEqual(selected_body["content"], styles.read_content(style_source))
        scope = styles.resource_category(catalog, self.style_index, "styles", "工程与解剖")
        self.assertIn("new:exploded-teardown", {row["id"] for row in scope["resources"]})
        motion = styles.resource_category(catalog, self.style_index, "motion-prompt", "转场与强调")
        self.assertEqual(motion["memberCount"], sum(row["categoryZh"] == "转场与强调" for row in self.motion_index["entries"]))

        openmotion = styles.load_openmotion_catalog()
        if openmotion:
            row = next(item for item in openmotion["entries"] if item["hasProjectFiles"])
            category = styles.resource_category(catalog, self.style_index, "openmotion", row["category"])
            card = next(item for item in category["resources"] if item["id"] == row["id"])
            self.assertEqual(len(card["sampleTimesSeconds"]), 6)
            self.assertTrue((REPO_ROOT / card["contactSheetPath"]).is_file())
            implementation = styles.resource_fulltext(catalog, row["id"], "L3", self.style_index)
            raw = (REPO_ROOT / implementation["path"]).read_bytes()
            self.assertEqual(implementation["content"].encode("utf-8"), raw)
            self.assertEqual(implementation["sha256"], hashlib.sha256(raw).hexdigest())
            with self.assertRaisesRegex(ValueError, "INVALID_OPENMOTION_PATH"):
                styles.resource_fulltext(catalog, row["id"], "L3", self.style_index, "../template.json")

    def test_compatibility_overview_and_family_l1_still_resolve_all_members(self):
        catalog = styles.build_resource_catalog(self.style_index, styles.DEFAULT_INDEX)
        overview = styles.resource_overview(catalog, "all")
        self.assertEqual(overview["coverage"], {
            "richStyles": 75, "atlasFamilies": 21, "atlasResources": 504,
            "motionPromptItems": 240, "expressionCapabilities": 20,
        })
        self.assertTrue(overview["atlasProductionNoteZh"])
        self.assertTrue(all({"id", "sourceSet", "catalog", "appearance"} <= set(row) for row in overview["richStyles"]))
        self.assertNotIn("atlasResources", overview)
        compact_l0 = json.dumps(overview, ensure_ascii=False, separators=(",", ":"))
        self.assertLessEqual(len(compact_l0), 260_000)
        self.assertTrue(all("memberIds" in row and row["memberCount"] == len(row["memberIds"])
                            for row in overview["atlasFamilies"]))
        self.assertTrue(all(set(item) == {"summary"}
                            for row in overview["richStyles"]
                            for dimension in row["catalog"].values()
                            for item in [dimension]))
        self.assertTrue(all("evidence" not in item
                            for row in overview["richStyles"]
                            for dimension in [*row["catalog"].values(), *row["appearance"].values()]
                            for item in [dimension]))
        art_deco_l0 = next(row for row in overview["richStyles"] if row["id"] == "original:art-deco")
        self.assertIn("来源标注为示例配色", art_deco_l0["appearance"]["colorLighting"]["summary"])
        self.assertIn("#162C2A", art_deco_l0["appearance"]["colorLighting"]["summary"])
        self.assertIn("Poiret One", art_deco_l0["appearance"]["typeLayout"]["summary"])
        self.assertNotIn("下面的色值是示例", art_deco_l0["appearance"]["colorLighting"]["summary"])
        def keys_in(value):
            if isinstance(value, dict):
                return set(value) | set().union(*(keys_in(child) for child in value.values()), set())
            if isinstance(value, list):
                return set().union(*(keys_in(child) for child in value), set())
            return set()
        self.assertFalse({"sourcePath", "sourceSha256", "sourceElementSha256", "detailPath", "sourceSnapshotPath"} & keys_in(overview))
        self.assertTrue(all({"meaningZh", "whenToUseZh", "askExampleZh", "runtimePath", "localNumber"} <= set(row)
                            and "motionSpecZh" not in row and "sourceElementSha256" not in row
                            and "globalId" not in row and "implementationStatus" not in row
                            for row in overview["motionPromptItems"]))
        self.assertTrue(all(set(row) == {
            "id", "categoryZh", "nameZh", "meaningZh", "whenToUseZh", "askExampleZh",
            "runtimePath", "localNumber", "dimensions", "cycleSeconds", "availability", "assetsRequired",
        } for row in overview["motionPromptItems"]))
        ids = ([row["id"] for row in overview["richStyles"]]
               + [row["id"] for row in overview["atlasFamilies"]]
               + [member_id for family in overview["atlasFamilies"] for member_id in family["memberIds"]]
               + [row["id"] for row in overview["motionPromptItems"]]
               + [row["id"] for row in overview["expressionCapabilities"]])
        self.assertEqual(len(ids), len(set(ids)))

        for family in overview["atlasFamilies"]:
            l1 = styles.resource_family(catalog, family["id"])
            self.assertTrue(l1["atlasProductionNoteZh"])
            self.assertEqual(l1["memberCount"], family["memberCount"])
            self.assertEqual({row["id"] for row in l1["resources"]}, set(family["memberIds"]))
            for row in l1["resources"]:
                self.assertTrue(row["summaryZh"] and row["useConditionsZh"] and row["limitationsZh"])
                self.assertNotIn("sourceSnapshotPath", row)
                self.assertNotIn("sourceSha256", row)

    def test_rich_appearance_uses_matching_authored_sections_and_real_specs(self):
        rich = styles.rich_catalog(self.style_index)["entries"]
        self.assertEqual(len(rich), 75)
        source_rows = {row["id"]: row for row in self.style_index["entries"]}
        allowed_sections = {
            "shape": ("本质 / 不是什么", "辨识信号："),
            "colorLighting": ("配色", "材质与渲染"),
            "typeLayout": ("字体",),
            "material": ("材质与渲染",),
            "composition": ("镜头语法",),
            "infoOrganization": ("变化空间",),
        }
        for row in rich:
            text = styles.read_content(source_rows[row["id"]])
            lines = text.splitlines()
            old_catalog_lines = {
                number
                for item in row["catalog"].values()
                for proof in item["evidence"]
                for number in range(proof["lineStart"], proof["lineEnd"] + 1)
            }
            section_at_line = {}
            current_section = ""
            for number, line in enumerate(lines, 1):
                heading = re.match(r"^(#{1,6})\s+(.+?)\s*$", line)
                if heading and len(heading.group(1)) == 2:
                    current_section = heading.group(2).strip()
                section_at_line[number] = current_section
            table_header_lines = set()
            table_header_cells = {
                "信号", "长什么样", "来源正文中的可见/可操作描述", "适配主题", "适合的主题",
                "镜头运动", "镜头变化", "运镜方式", "表达什么", "表达作用", "表达含义",
                "适合哪类内容", "可用于", "适用场景", "区域", "位置", "内容", "用途", "数值",
                "角色", "色值", "颜色", "字体", "尺寸", "尺寸（1080p）",
            }
            for offset, line in enumerate(lines[:-1]):
                separator = lines[offset + 1].strip()
                if (line.strip().startswith("|") and separator.startswith("|")
                        and all(cell.strip() and set(cell.strip()) <= {"-", ":", " "}
                                for cell in separator.strip("|").split("|"))):
                    table_header_lines.add(offset + 1)
            seen_lines = set()
            seen_quotes = set()
            for dimension in styles.APPEARANCE_FIELDS:
                item = row["appearance"][dimension]
                self.assertEqual(item["summary"] is None, not item["evidence"], f"{row['id']}:{dimension}")
                for proof in item["evidence"]:
                    self.assertEqual(proof["sourcePath"], source_rows[row["id"]]["contentPath"])
                    self.assertIn(proof["quote"], lines[proof["lineStart"] - 1])
                    self.assertTrue(any(section_at_line[proof["lineStart"]].startswith(prefix)
                                        for prefix in allowed_sections[dimension]),
                                    f"{row['id']}:{dimension} from {section_at_line[proof['lineStart']]}")
                    self.assertNotIn("参照（只学语法）", proof["quote"])
                    self.assertNotIn("最俗的版本", proof["quote"])
                    self.assertNotIn(proof["lineStart"], old_catalog_lines,
                                     f"duplicated between legacy catalog and appearance: {row['id']}:{proof['lineStart']}")
                    self.assertNotIn(proof["lineStart"], table_header_lines,
                                     f"table heading is not appearance evidence: {row['id']}:{proof['lineStart']}")
                    cells = [cell.strip() for cell in proof["quote"].strip("|").split("|")]
                    self.assertFalse(cells and all(cell in table_header_cells for cell in cells),
                                     f"table heading is not appearance evidence: {row['id']}:{proof['lineStart']}")
                    self.assertNotIn(proof["lineStart"], seen_lines, f"duplicate appearance evidence: {row['id']}:{proof['lineStart']}")
                    self.assertNotIn(proof["quote"], seen_quotes,
                                     f"repeated appearance quote: {row['id']}:{proof['lineStart']}")
                    seen_lines.add(proof["lineStart"])
                    seen_quotes.add(proof["quote"])

        by_id = {row["id"]: row["appearance"] for row in rich}
        rich_by_id = {row["id"]: row for row in rich}
        self.assertTrue(all(row["appearance"]["colorLighting"]["summary"] for row in rich))
        self.assertTrue(all(row["appearance"]["typeLayout"]["summary"] for row in rich))
        checks = {
            "original:art-deco": {
                "colorLighting": ("来源标注为示例配色", "#162C2A", "#C4A064"),
                "typeLayout": ("Poiret One", "思源黑体"),
            },
            "original:comic-pop": {
                "colorLighting": ("#F4ECD8", "#E53A6E"),
                "typeLayout": ("Bangers", "霞鹜文楷"),
                "material": ("1.5–2 倍", "45° 网格"),
            },
            "original:paper-cut": {
                "colorLighting": ("#E8F3F1", "#C8102E"),
                "typeLayout": ("Fraunces Soft", "思源宋体 Heavy"),
                "material": ("投影", "亮边", "纸的厚度"),
            },
            "original:minimal-ui": {
                "colorLighting": ("#EFEDE8", "#3B5BFF"),
                "typeLayout": ("Geist", "JetBrains Mono"),
                "material": ("12–28px", "1.5–3px"),
            },
            "original:soft-3d-toy": {
                "colorLighting": ("#FFF4E6", "#E9E4FF"),
                "typeLayout": ("Fredoka", "站酷快乐体"),
                "material": ("噪声凹凸",),
            },
        }
        for style_id, dimensions in checks.items():
            for dimension, fragments in dimensions.items():
                summary = by_id[style_id][dimension]["summary"] or ""
                for fragment in fragments:
                    self.assertIn(fragment, summary, f"{style_id}:{dimension}: {fragment}")
        self.assertIn("4–8层", rich_by_id["original:paper-cut"]["catalog"]["visual"]["summary"])
        art_deco_palette_evidence = by_id["original:art-deco"]["colorLighting"]["evidence"]
        self.assertTrue(any("色值是示例" in proof["quote"] for proof in art_deco_palette_evidence))
        self.assertIn("88 px", by_id["new:caption-news"]["typeLayout"]["summary"])
        self.assertIn("contrast(1.07)", by_id["new:caption-news"]["material"]["summary"])
        self.assertNotIn("地图投影", by_id["new:caption-news"]["material"]["summary"])
        satellite_palette = by_id["new:satellite-briefing"]["colorLighting"]["summary"]
        self.assertIn("#FFBE55", satellite_palette)
        self.assertNotIn("发射射线", satellite_palette)
        self.assertNotIn("发射射线", by_id["new:satellite-briefing"]["material"]["summary"] or "")
        self.assertNotIn("着色器", by_id["new:satellite-briefing"]["material"]["summary"] or "")
        self.assertIsNone(by_id["new:caption-news"]["shape"]["summary"])
        self.assertIn("剪影", by_id["new:constructivist-montage"]["shape"]["summary"])


if __name__ == "__main__":
    unittest.main()
