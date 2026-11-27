"""Lazy, offline Chinese-to-English draft translator for site update workflows."""
import re


# Argos zh_en 1.9 bundles legacy Stanza metadata/tokenizer weights that are
# incompatible with Stanza 1.10.1 (packages / feat_dropout KeyErrors on a clean
# runner). MiniSBD is a supported Argos 1.11 backend with a Chinese model.
# It downloads its model once, then uses the local cache; no article text is
# sent to a remote translation service.

_engine = None


def translate(value):
    global _engine
    if not isinstance(value, str) or not re.search(r"[\u4e00-\u9fff]", value):
        return value
    if _engine is None:
        import argostranslate.package
        import argostranslate.settings
        import argostranslate.translate
        argostranslate.settings.chunk_type = argostranslate.settings.ChunkType.MINISBD
        try:
            _engine = argostranslate.translate.get_translation_from_codes("zh", "en")
        except AttributeError:
            _engine = None
        if _engine is None:
            argostranslate.package.update_package_index()
            package = next(p for p in argostranslate.package.get_available_packages()
                           if p.from_code == "zh" and p.to_code == "en")
            argostranslate.package.install_from_path(package.download())
            _engine = argostranslate.translate.get_translation_from_codes("zh", "en")
    return _engine.translate(value)
