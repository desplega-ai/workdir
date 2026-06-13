# @mv37/workdir

TypeScript SDK for [workdir](https://workdir.dev).

```bash
npm install @mv37/workdir
```

```ts
import { Client } from "@mv37/workdir";

const workdir = new Client("https://api.workdir.dev", process.env.WORKDIR_API_KEY!);

const box = await workdir.sandboxes.create();
const { stdout } = await box.exec("echo hello");
console.log(stdout);
await box.delete();
```

The SDK uses the global `fetch` API and supports Node.js 18+, Deno, Bun, and browsers.
