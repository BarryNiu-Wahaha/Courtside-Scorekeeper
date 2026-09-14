"""Publish a public, allowlisted static artifact. No database or credentials in files."""
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
STAT_KEYS = ("points","fgm","fga","threeMade","threeAttempts","ftm","fta","offensive","defensive","rebounds","assists","steals","blocks","turnovers","fouls")
ROSTER_KEYS = ("player_id","player_name","jersey_number","enrollment_year","status_override")
GAME_KEYS = ("game_id","game_date","opponent","home_points","away_points","coverage","category","duration_ms","stats_complete")
PLAYER_KEYS = ("player_id","player_name","jersey_number","played_ms","played_count","starter_count","designated_count")
PUBLIC_FILES = ("index.html","admin.html","site.css","public.js","admin.js","analytics.js","dashboard.css")

def _api_url(value):
    url = urlsplit(value)
    if url.username or url.password or url.query or url.fragment or not url.hostname:
        raise ValueError("Invalid public backend URL.")
    if url.scheme != "https" and not (url.scheme == "http" and url.hostname in ("localhost","127.0.0.1","::1")):
        raise ValueError("Public backend URL must use HTTPS.")
    return value.rstrip("/")

def _pick(row, keys):
    return {key:row.get(key) for key in keys}

def public_snapshot(snapshot):
    if snapshot.get("schema_version") != 1 or not isinstance(snapshot.get("games"), list):
        raise ValueError("Unsupported public snapshot.")
    result = _pick(snapshot, ("schema_version","revision","generated_at"))
    result["roster"] = [_pick(p, ROSTER_KEYS) for p in snapshot.get("roster", []) if p.get("player_id") != "P_GUEST"]
    result["games"] = []
    for game in snapshot["games"]:
        clean = _pick(game, GAME_KEYS)
        for side in ('home_stats','away_stats'):
            clean[side] = _pick(game[side], STAT_KEYS) if isinstance(game.get(side),dict) else None
        clean["players"] = []
        for player in game.get("players", []):
            row = _pick(player, PLAYER_KEYS)
            if row["player_id"] == "P_GUEST":
                row["player_name"], row["jersey_number"] = "Guest Player", 0
            row["stats"] = {key:player.get("stats", {}).get(key, 0) for key in STAT_KEYS}
            clean["players"].append(row)
        result["games"].append(clean)
    return result

def build_artifact(root, destination, snapshot, api_base):
    root, destination = Path(root), Path(destination)
    api_base = _api_url(api_base)
    destination.mkdir(parents=True, exist_ok=True)
    for name in PUBLIC_FILES:
        shutil.copyfile(root/"site"/name, destination/name)
    shutil.copyfile(root/"src"/"remote.js", destination/"remote.js")
    config = "globalThis.COURTSIDE_CONFIG = " + json.dumps({"apiBase":api_base}).replace("<", "\\u003c") + ";"
    (destination/"config.js").write_text(config+"\n", encoding="utf-8")
    frontend = (root/"Front.html").read_text(encoding="utf-8")
    frontend = frontend.replace("<script>", "<script>"+config+"\n", 1)
    (destination/"Front.html").write_text(frontend, encoding="utf-8")
    (destination/"data").mkdir(exist_ok=True)
    (destination/"data"/"stats.json").write_text(json.dumps(public_snapshot(snapshot),ensure_ascii=False,separators=(",",":")),encoding="utf-8")
    (destination/"_headers").write_text(
        "/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: no-referrer\n"
        "  X-Frame-Options: DENY\n"
        "/data/stats.json\n  Cache-Control: public, max-age=0, must-revalidate\n"
        "/config.js\n  Cache-Control: public, max-age=0, must-revalidate\n",encoding="utf-8")

class CloudflarePublisher:
    def __init__(self, root, api_base, project, account, token, *, runner=subprocess.run, executable="wrangler"):
        self.root, self.api_base = Path(root), _api_url(api_base)
        if not re.fullmatch(r"[a-z0-9][a-z0-9-]{0,57}",project):
            raise ValueError("Invalid Cloudflare Pages project name.")
        if not account or not token:
            raise ValueError("Cloudflare account and token are required.")
        self.project, self.account, self.token = project, account, token
        self.runner, self.executable = runner, executable

    @classmethod
    def from_env(cls):
        keys = ("PUBLIC_API_BASE","CLOUDFLARE_PROJECT","CLOUDFLARE_ACCOUNT_ID","CLOUDFLARE_API_TOKEN")
        values = [os.environ.get(key,"") for key in keys]
        if not all(values):
            return None
        return cls(ROOT,*values,executable=os.environ.get("WRANGLER_BIN","wrangler"))

    def __call__(self, snapshot):
        with tempfile.TemporaryDirectory(prefix="courtside-publish-") as directory:
            build_artifact(self.root, Path(directory), snapshot, self.api_base)
            command = [self.executable,"pages","deploy",directory,"--project-name",self.project,"--branch","main","--commit-dirty=true"]
            # Restrict child environment to runtime needs and deployment credentials.
            env = {key:value for key,value in os.environ.items() if key.upper() in
                   {"PATH","SYSTEMROOT","WINDIR","TEMP","TMP","HOME","USERPROFILE","APPDATA","LOCALAPPDATA","SSL_CERT_FILE","SSL_CERT_DIR"}}
            env.update(CLOUDFLARE_ACCOUNT_ID=self.account,CLOUDFLARE_API_TOKEN=self.token,CI="true",WRANGLER_SEND_METRICS="false")
            try:
                result = self.runner(command,env=env,cwd=directory,capture_output=True,text=True,timeout=150,check=False)
            except (OSError,subprocess.SubprocessError):
                raise RuntimeError("Publication failed; retry from the admin page.") from None
            if result.returncode:
                raise RuntimeError("Publication failed; check server deployment configuration and retry.")

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Build public website files without deploying.")
    parser.add_argument("--output", required=True)
    parser.add_argument("--api-base", required=True)
    parser.add_argument("--snapshot")
    args = parser.parse_args()
    data = json.loads(Path(args.snapshot).read_text(encoding="utf-8")) if args.snapshot else dict(schema_version=1,revision=0,generated_at=None,roster=[],games=[])
    build_artifact(ROOT,Path(args.output),data,args.api_base)
    print("Public site built. No deployment performed.")
