# Claude

[docs/spec.md](docs/spec.md) is what the app does; [README.md](README.md) is how to run it.

- **A push to `main` is a deploy.** `.github/workflows/pages.yml` runs the tests and republishes
  the site on GitHub Pages on every push. The owner asked for that here; it is the one project
  where pushing ships. Test before pushing, and say that it is going live.
- **Bump `"version"` in package.json in every commit that changes the app**, and tell the owner the
  new number. It shows in the header as `vX.Y.Z` so he can check his phone is on the latest.
- **Every screen works at 375 px wide and at 1280 x 800.** The spec targets a tablet or laptop, but
  the owner runs it on his phone. Check both before calling a UI change done.
- **One device, no server, no account.** State lives in the browser. Nothing here may need a network.

## Verify

```bash
npm test          # the logic module
npm run build     # type-check, then dist/index.html as one self-contained file
```

The dev server is `poker-tournament-manager` in `~/.claude/launch.json`, port 5183.
