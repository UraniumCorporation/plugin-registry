![Maiar banner](./maiar-banner.png)

# Maiar Plugin Registry

Welcome to the community plugin registry for the Maiar framework! This repository serves as the official central hub for discovering and sharing plugins that extend the capabilities of Maiar. All approved plugins in this registry will be automatically listed and made discoverable on our website at [https://maiar.dev/plugins](https://maiar.dev/plugins), making it easy for Maiar users to find and integrate your contributions.

By submitting your plugin to this registry, you'll:

- Make your plugin discoverable to the entire Maiar community
- Get featured on https://maiar.dev/plugins
- Help other developers enhance their Maiar experience
- Contribute to the growing ecosystem of Maiar plugins

## Table of Contents

- [How to Register Your Plugin](#how-to-register-your-plugin)
  - [Prerequisites](#prerequisites)
  - [Registration Process](#registration-process)
  - [Plugin Submission Format](#plugin-submission-format)
  - [Requirements Checklist](#requirements-checklist)
  - [Review Process](#review-process)
- [Support](#support)
- [License](#license)

## How to Register Your Plugin

To register your plugin in this registry, please follow these steps:

### Prerequisites

Before submitting your plugin, ensure that:

1. Your plugin repository has:
   - A public GitHub repository (private repositories are not accepted)
   - A clear and descriptive GitHub repository description
   - Relevant GitHub topics tagged (must include `maiar`)
   - Your plugin is published to the npm registry

### Registration Process

1. Fork this repository
2. Create a new branch in your fork
3. Add your plugin information to `index.json`:
   - Your entry should be added at the beginning of the array (before the last element)
   - Follow the plugin submission format (see below)
   - Ensure the repository URL is accessible (must be public)
4. Submit a Pull Request (PR) to this repository
5. Wait for the review and approval process

### Plugin Submission Format

Your plugin submission in `index.json` should follow this format:

```json
{
  "repo": "repository-name",
  "owner": "github-username-or-org",
  "npm_package_name": "package-name-on-npm"
}
```

Example:

```json
[
  {
    "repo": "plugin-terminal",
    "owner": "UraniumCorporation",
    "npm_package_name": "@maiar-ai/plugin-terminal"
  }
  // ... existing entries ...
]
```

### Requirements Checklist

Before submitting your PR, please ensure:

- [ ] Your GitHub repository is public and accessible
- [ ] Your plugin repository has a clear, descriptive GitHub description
- [ ] Your repository has appropriate topics tagged
- [ ] Your plugin is published to npm and is publicly accessible
- [ ] Your plugin follows Maiar AI's plugin development guidelines
- [ ] You have tested your plugin thoroughly
- [ ] Your submission in index.json follows the correct format
- [ ] You've added your entry to the beginning of the array in index.json

### Review Process

1. Our team will review your PR
2. We'll verify that your plugin meets all requirements
3. We may request changes if needed
4. Once approved, your plugin will be added to the registry

## Support

If you need help or have questions about:

- Plugin development: [Maiar Plugin Development Guide](https://maiar.dev/docs/building-plugins)
- Registry submission: Open an issue in this repository
- General questions: [Join our Community on Discord](https://discord.gg/maiar)

## License

This plugin registry is maintained under the MIT License. By submitting your plugin, you agree to have your plugin information shared under these terms.

---

Made with 🟩 by Uranium Corporation
