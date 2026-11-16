"""Regression checks for the supported sentence splitter and lazy translator."""
import unittest
from unittest.mock import patch, Mock
import english_translation_engine as engine

class TranslationEngineTests(unittest.TestCase):
    def test_supported_splitter_avoids_legacy_stanza(self):
        self.assertEqual(engine.argostranslate.settings.chunk_type,
                         engine.argostranslate.settings.ChunkType.MINISBD)

    def test_non_chinese_does_not_load_engine(self):
        with patch.object(engine, "_engine", None):
            self.assertEqual(engine.translate("Already English"), "Already English")
            self.assertIsNone(engine.translate(None))
            self.assertIsNone(engine._engine)

    def test_installed_engine_is_reused(self):
        translator = Mock()
        translator.translate.return_value = "Hello"
        with patch.object(engine, "_engine", None), patch.object(
            engine.argostranslate.translate, "get_translation_from_codes", return_value=translator
        ) as lookup, patch.object(engine.argostranslate.package, "update_package_index") as download:
            self.assertEqual(engine.translate("你好"), "Hello")
            self.assertEqual(engine.translate("世界"), "Hello")
            lookup.assert_called_once_with("zh", "en")
            download.assert_not_called()

if __name__ == "__main__":
    unittest.main()
