"""Start an isolated loopback-only MySQL server and run integration tests."""
import os
from pathlib import Path
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import pymysql

ROOT=Path(__file__).resolve().parents[1]
ARTIFACTS=ROOT/'tests'/'artifacts';ARTIFACTS.mkdir(exist_ok=True)
binary=Path(os.environ.get('MYSQLD_PATH',r'C:\Program Files\MySQL\MySQL Server 9.7\bin\mysqld.exe'))
if not binary.is_file():raise SystemExit('Set MYSQLD_PATH to your installed mysqld executable.')
workspace=Path(tempfile.mkdtemp(prefix='mysql-test-',dir=ARTIFACTS)).resolve()
data=workspace/'data';process=None
base=[str(binary),'--no-defaults',f'--basedir={binary.parent.parent}',f'--datadir={data}']
try:
    with (workspace/'initialize.log').open('w') as log:
        initialized=subprocess.run(base+['--initialize-insecure'],stdout=log,stderr=subprocess.STDOUT,timeout=120)
    if initialized.returncode:raise RuntimeError('Temporary MySQL initialization failed: '+(workspace/'initialize.log').read_text(errors='replace')[-3000:])
    with socket.socket() as sock:sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
    with (workspace/'server.log').open('w') as log:
        process=subprocess.Popen(base+[f'--port={port}','--bind-address=127.0.0.1','--mysqlx=OFF','--skip-log-bin','--console'],stdout=log,stderr=subprocess.STDOUT)
    for _ in range(150):
        try:
            connection=pymysql.connect(host='127.0.0.1',port=port,user='root',password='',connect_timeout=1);connection.close();break
        except pymysql.Error:
            if process.poll() is not None:raise RuntimeError('Temporary MySQL stopped: '+(workspace/'server.log').read_text(errors='replace')[-3000:])
            time.sleep(.2)
    else:raise RuntimeError('Temporary MySQL did not become ready.')
    print(f'Running integration tests on isolated localhost:{port}; user localhost:3306 is untouched.',flush=True)
    env={**os.environ,'SCOREKEEPER_TEST_PORT':str(port),'PYTHONUTF8':'1'}
    result=subprocess.run([sys.executable,'-m','unittest','discover','-s','tests','-p','test_mysql_integration.py','-v'],cwd=ROOT,env=env)
    sys.exit(result.returncode)
finally:
    if process is not None and process.poll() is None:
        try:
            connection=pymysql.connect(host='127.0.0.1',port=port,user='root',password='',connect_timeout=2)
            with connection.cursor() as cursor:cursor.execute('SHUTDOWN')
            connection.close();process.wait(timeout=10)
        except Exception:process.terminate();process.wait(timeout=10)
    # Only delete this run's generated directory inside the expected artifact root.
    if workspace.parent==ARTIFACTS.resolve() and workspace.name.startswith('mysql-test-'):
        shutil.rmtree(workspace)
