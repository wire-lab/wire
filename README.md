# @wire Libraries Monorepo

This repository hosts the source code for `@wire` TypeScript libraries, published to [JSR](https://jsr.io). It is managed as a [Deno Workspace](https://docs.deno.com/runtime/fundamentals/workspaces/).

## 📦 Packages

All active packages are located in the `packages/` directory.

- [`@wire/logger`](packages/logger/): A blazing fast, strongly-typed logger with async context support.

> **Note**: The `legacy/` directory contains deprecated code and should be ignored.

## 🛠️ Development

This project uses **Deno**. Ensure you have Deno 1.45+ installed.

### Common Tasks

- **Run all tests**:
  ```bash
  deno task test
  ```
- **Lint code**:
  ```bash
  deno task lint
  ```
- **Format code**:
  ```bash
  deno task fmt
  ```
- **Type check**:
  ```bash
  deno task check
  ```

## 🚀 Publishing & Release Workflow

We use **GitHub Actions** to automate publishing to JSR.

### Versioning Strategy

Each package in `packages/` is versioned independently via its own `deno.json`.

### Tagging Convention

To trigger a release for a specific package, use a **scoped tag**:

```text
package-name/vX.Y.Z
```

**Examples:**
- `logger/v1.0.0` → Triggers release for `@wire/logger` version `1.0.0`.
- `utils/v1.2.3` → Triggers release for `@wire/utils` version `1.2.3`.

### Publishing Process

1.  Update the `version` in the package's `deno.json`.
2.  Commit the change using [Conventional Commits](https://www.conventionalcommits.org/).
    ```bash
    git commit -m "feat(logger): add new transport"
    ```
3.  Create the tag:
    ```bash
    git tag logger/v1.1.0
    ```
4.  Push the tag:
    ```bash
    git push origin logger/v1.1.0
    ```

The **Publish** workflow will run `deno publish` from the workspace root. It uses OIDC (OpenID Connect) to authenticate securely with JSR without requiring manual secrets. Deno will automatically detect which packages match the current version on JSR and publish only the updated ones.
