import json
from pathlib import Path
import tempfile
import unittest
from types import SimpleNamespace
from scorekeeper_remote.publishing import build_artifact, CloudflarePublisher
ROOT=Path(__file__).resolve().parents[1]
def snapshot():
    return dict(schema_version=1,revision=3,generated_at="2026-09-08T12:00:00Z",roster=[],games=[],secret="never-publish")
class PublicationTests(unittest.TestCase):
    def test_artifact_contains_only_allowlisted_public_files(self):
        with tempfile.TemporaryDirectory() as d:
            build_artifact(ROOT,Path(d),snapshot(),"https://api.example")
            files={str(p.relative_to(d)).replace("\\","/") for p in Path(d).rglob("*") if p.is_file()}
            self.assertIn("data/stats.json",files)
            self.assertIn("Front.html",files)
            self.assertNotIn("README.md",files)
            all_text="".join(p.read_text(encoding="utf-8") for p in Path(d).rglob("*") if p.is_file())
            self.assertNotIn("never-publish",all_text)
            self.assertIn("https://api.example",(Path(d)/"Front.html").read_text(encoding="utf-8"))
            self.assertEqual(json.loads((Path(d)/"data/stats.json").read_text())["revision"],3)
    def test_publisher_passes_credentials_only_in_environment_and_cleans_artifacts(self):
        captured={}
        def run(command,**kwargs):
            captured.update(command=command,kwargs=kwargs,directory=Path(command[3]))
            self.assertTrue((Path(command[3])/"data/stats.json").exists())
            return SimpleNamespace(returncode=0,stdout="",stderr="")
        publisher=CloudflarePublisher(ROOT,"https://api.example","team","account","private-token",runner=run)
        publisher(snapshot())
        self.assertNotIn("private-token"," ".join(captured["command"]))
        self.assertEqual(captured["kwargs"]["env"]["CLOUDFLARE_API_TOKEN"],"private-token")
        self.assertFalse(captured["directory"].exists())
    def test_failed_command_raises_without_leaking_output(self):
        publisher=CloudflarePublisher(ROOT,"https://api.example","team","account","private-token",runner=lambda *a,**k:SimpleNamespace(returncode=1,stdout="private-token",stderr="private-token"))
        with self.assertRaisesRegex(RuntimeError,"Publication failed") as error:publisher(snapshot())
        self.assertNotIn("private-token",str(error.exception))
    def test_invalid_backend_url_never_generates_inline_script(self):
        with tempfile.TemporaryDirectory() as d:
            with self.assertRaises(ValueError):build_artifact(ROOT,Path(d),snapshot(),"https://user:password@example.com")
if __name__=="__main__":unittest.main()
