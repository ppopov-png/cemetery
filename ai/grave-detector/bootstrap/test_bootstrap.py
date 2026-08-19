import tempfile
import unittest
from pathlib import Path

from dataset_utils import license_allowed, semantic_relevance
from merge_datasets import merge


class BootstrapTests(unittest.TestCase):
    def test_license_filter(self):
        self.assertTrue(license_allowed("CC BY 4.0")); self.assertTrue(license_allowed("Public Domain")); self.assertFalse(license_allowed("All rights reserved"))

    def test_relevance_filter(self):
        self.assertTrue(semantic_relevance("Gravestone detection", "grave")[0]); self.assertFalse(semantic_relevance("Candlestick gravestone doji", "doji")[0])

    def test_merge_namespace_and_mapping(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp); source = root / "cache" / "roboflow_seed" / "extracted"; (source / "train" / "images").mkdir(parents=True); (source / "train" / "labels").mkdir(parents=True)
            (source / "data.yaml").write_text("names:\n  0: grave\n", encoding="utf-8")
            from PIL import Image
            Image.new("RGB", (10, 10), "white").save(source / "train" / "images" / "x.jpg"); (source / "train" / "labels" / "x.txt").write_text("0 0.5 0.5 0.4 0.4\n", encoding="utf-8")
            report = merge(root / "cache", root / "out"); self.assertEqual(report["boxes"], 1); self.assertTrue((root / "out" / "images" / "train" / "roboflow_seed_x.jpg").exists())


if __name__ == "__main__": unittest.main()
