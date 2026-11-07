from pathlib import Path
import subprocess
for path in sorted(Path('portfolio/static').glob('*.js')):
    subprocess.run(['node','--check',str(path)],check=True)
