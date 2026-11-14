"""Lazy, offline Chinese-to-English draft translator for site update workflows."""
import re

import argostranslate.package
import argostranslate.translate
import stanza

_pipeline = stanza.Pipeline
def _offline_pipeline(*args, **kwargs):
    kwargs.setdefault("download_method", stanza.DownloadMethod.REUSE_RESOURCES)
    return _pipeline(*args, **kwargs)
stanza.Pipeline = _offline_pipeline

_engine = None


def translate(value):
    global _engine
    if not isinstance(value, str) or not re.search(r"[\u4e00-\u9fff]", value):
        return value
    if _engine is None:
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
