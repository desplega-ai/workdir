# mv37-workdir

Python SDK for [workdir](https://workdir.dev).

```bash
pip install mv37-workdir
```

```python
from workdir import Client

workdir = Client("https://api.workdir.dev", api_key="...")

box = workdir.sandboxes.create()
print(box.exec("echo hello").stdout)
box.delete()
```

The SDK uses only the Python standard library.
