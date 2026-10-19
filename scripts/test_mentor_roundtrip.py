"""Check the real HTML -> JSON -> admin-rendered HTML mentor sync path."""
import importlib.util
import json
from pathlib import Path
import subprocess
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("extract_data", ROOT / "scripts/extract_data.py")
extractor = importlib.util.module_from_spec(spec)
spec.loader.exec_module(extractor)


def render(mentors):
    code = """
      import {readFileSync} from 'node:fs';
      import {syncMentors} from './worker/src/sync-html.js';
      const input = JSON.parse(readFileSync(0, 'utf8'));
      process.stdout.write(syncMentors(input.html, input.mentors));
    """
    return subprocess.check_output(
        ["node", "--input-type=module", "-e", code], cwd=ROOT, text=True,
        input=json.dumps({"html": extractor.HTML, "mentors": mentors}),
    )


class MentorRoundtripTests(unittest.TestCase):
    def setUp(self):
        self.original = extractor.HTML

    def tearDown(self):
        extractor.HTML = self.original

    def test_vivian_text_is_plain_text(self):
        vivian = next(m for m in extractor.extract_mentors() if m["name"] == "Vivian")
        self.assertEqual(vivian["company_sub"], "Strategy & Ops")
        self.assertEqual(vivian["focus"][-1], "Strategy & Operations")

    def test_all_mentor_text_stays_stable_across_repeated_syncs(self):
        mentors = extractor.extract_mentors()
        self.assertEqual(len(mentors), 23)
        for _ in range(3):
            extractor.HTML = render(mentors)
            self.assertEqual(extractor.extract_mentors(), mentors)

    def test_special_characters_remain_escaped_in_html(self):
        mentors = extractor.extract_mentors()
        mentors[0]["company"] = 'R&D <Research> "Team"'
        mentors[0]["company_sub"] = "Strategy & Ops"
        mentors[0]["focus"] = ["Research & Development", "A < B"]
        extractor.HTML = render(mentors)
        self.assertIn('R&amp;D &lt;Research&gt; &quot;Team&quot;', extractor.HTML)
        self.assertEqual(extractor.extract_mentors(), mentors)


if __name__ == "__main__":
    unittest.main()
