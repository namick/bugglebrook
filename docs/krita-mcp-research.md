# Krita versions and agent bridges

Researched 2026-10-02. The comparison below began as a source review. A subsequent isolated test of `fanzhuyifan/krita6-mcp` on LED is recorded at the end. Upstream test reports are identified as such.

## Recommendation

Keep Krita 6 for the painting experiment. Evaluate `fanzhuyifan/krita6-mcp` in an isolated profile if the priority is using Krita's actual brushes. Its source calls the native painting API, and the author retained Linux/Krita 6 test results. Its CLI only starts the MCP server or diagnoses its connection, so a painting CLI adapter would still be needed. [Native implementation](https://github.com/fanzhuyifan/krita6-mcp/blob/36388b85d96f526c61d97a400989c09b96c5c30a/plugin/krita6_bridge/host.py), [CLI source](https://github.com/fanzhuyifan/krita6-mcp/blob/36388b85d96f526c61d97a400989c09b96c5c30a/src/krita6_mcp/cli.py).

If having both an existing painting CLI and MCP immediately matters more, `SanSaSane/krita-mcp` is the strongest alternative found. It has merged Qt6 support and an external contributor's passing test report on Krita 6.0.4. Its drawing operation uses QPainter raster drawing, which does not provide the same brush workflow. [Qt6 contribution](https://github.com/SanSaSane/krita-mcp/pull/1), [drawing source](https://github.com/SanSaSane/krita-mcp/blob/93f485d7499a0abae5a515a93ad427b7275ffa8d/pykrita/krita_mcp/ops.py).

Krita 5.3.4 is a reasonable optional fallback for production artwork and older plugins. It is not necessary just to get MCP working. The evidence below supports testing a bridge built for Qt6 before changing the application's major version.

## Krita 5.3 versus 6

Krita released 5.3.4 and 6.0.4 together on September 15, 2026. The project recommends 5.3.4 for productive work and still describes 6.0.4 as more experimental because of the Qt migration. Both official Linux AppImages are available. [Release announcement](https://krita.org/en/posts/2026/krita-5.3.4-released/).

These versions share a codebase: a Qt5 build is Krita 5.3, and a Qt6 build is Krita 6. Apart from the Qt6 version's Wayland support, including Linux HDR, they share features. The new Python brushstroke API belongs to this shared release, so native brush automation is not exclusive to 6. [Official release notes](https://krita.org/en/release-notes/krita-5-3-release-notes/).

Krita 6 has real distribution and plugin activity. Arch currently packages 6.0.4, and the bridge projects below publish Linux 6.0.3 and 6.0.4 test reports. That establishes use, not how many artists or agents use it. [Arch package](https://archlinux.org/packages/extra/x86_64/krita/).

## Bridge comparison

| Project | Qt6 evidence | CLI and painting behavior | Assessment |
| --- | --- | --- | --- |
| `edithatogo/krita-cli` | Reviewed upstream commit `8245fd4` still imports PyQt5 directly. | Broad painting CLI and MCP; strokes write pixels through the plugin's renderer. | The existing local compatibility patch is useful, but upstream is not Qt6-ready as reviewed. [Plugin source](https://github.com/edithatogo/krita-cli/blob/8245fd4c92ed2b413cb975230891f4e8cda61d0a/krita-plugin/kritamcp/__init__.py). |
| `fanzhuyifan/krita6-mcp` | Explicit PyQt6 imports and a Krita 6 host check. | Native `Node.paintPath` and `Node.paintLine`; MCP painting, but CLI only `serve` and `doctor`. | Best fit for a native-brush experiment, with a CLI gap. [Host source](https://github.com/fanzhuyifan/krita6-mcp/blob/36388b85d96f526c61d97a400989c09b96c5c30a/plugin/krita6_bridge/host.py), [CLI source](https://github.com/fanzhuyifan/krita6-mcp/blob/36388b85d96f526c61d97a400989c09b96c5c30a/src/krita6_mcp/cli.py). |
| `SanSaSane/krita-mcp` | Qt5/Qt6 compatibility layer merged September 25. | MCP plus `--call OP --params JSON` or `--params-file`; QPainter shapes, text, gradients and images. | Best existing combination of Qt6 support and a generic drawing CLI found in this review. [Compatibility source](https://github.com/SanSaSane/krita-mcp/blob/93f485d7499a0abae5a515a93ad427b7275ffa8d/pykrita/krita_mcp/compat.py), [CLI source](https://github.com/SanSaSane/krita-mcp/blob/93f485d7499a0abae5a515a93ad427b7275ffa8d/mcp_server.py). |
| `BackendScroll/krita-mcp` | Documents a PyQt6, NixOS/Krita 6 bridge. | Native line/path painting, MCP, authenticated transport and one writer lease. No painting CLI established by this review. | Interesting for shared-agent coordination, but its README describes headless contract tests and leaves live verification to the user. [README](https://github.com/BackendScroll/krita-mcp). |
| `cyyprezz/krita-codex-mcp` | Windows-first; documented tested host is 5.3.2.1. | Native brush APIs and a capability check. | No verified Linux/Krita 6 test evidence found in the reviewed documentation, so it is not the first choice for LED. [README](https://github.com/cyyprezz/krita-codex-mcp). |

## How strong is the evidence?

`fanzhuyifan/krita6-mcp` calls itself early alpha, with version 0.1.0 unreleased. Its retained validation record covers Linux/Krita 6.0.3, Qt 6.11.2, PyQt 6.11.0 and the Basic-5 Size pixel brush on small documents. It reports native strokes, pressure lines, undo/redo, MCP previews, layered KRA saves and reopen checks. The reports are stronger evidence than a compatibility badge, but do not establish every brush engine, large document, or the installed 6.0.4 AppImage. [Project status](https://github.com/fanzhuyifan/krita6-mcp), [validation record](https://github.com/fanzhuyifan/krita6-mcp/blob/36388b85d96f526c61d97a400989c09b96c5c30a/docs/validation.md).

Its reviewed default-branch head is September 7, 2026. The public repository is young; this review found no broad independent adoption evidence. [Commit history](https://github.com/fanzhuyifan/krita6-mcp/commits/master/).

`SanSaSane/krita-mcp` has a concrete outside contribution. Haiagari reported passing 9 self-tests, 77 MCP checks and 8 close-stress iterations on Arch Linux with Krita 6.0.4 and PyQt6 6.11.0. The maintainer merged that change. Its README still names 5.3.3 as the original tested version, so the merged PR and current source are more informative about Qt6. These are contributor-reported results, not tests repeated on LED. [Merged PR and verification](https://github.com/SanSaSane/krita-mcp/pull/1).

SanSaSane also documents a crash when closing documents after long editing sessions and says its drawing operation bypasses undo. The short passing close test does not establish that the long-session issue is fixed. That limits its appeal for sustained artwork even though it meets the CLI/MCP requirement. [Known limitations](https://github.com/SanSaSane/krita-mcp#known-issue-closing-documents-can-crash-krita).

The practical next check is a scratch document on LED: select a real preset, paint and inspect a stroke, undo/redo it, create named layers, save and reopen KRA, then export the ORA needed by Bugglebrook. Successful KRA/PNG tests do not establish ORA compatibility. That check should precede replacing the current global bridge or using an alternative on Dot's source artwork.

## Isolated test on LED

On 2026-10-02, the unmodified `fanzhuyifan/krita6-mcp` plugin passed its MCP smoke scenario on the installed Krita 6.0.4 AppImage. A 768 × 768 Dot study exercised Basic-5 Size, Pencil-3 Large 4B and Chalk Grainy, with native paths, cubic curves, shapes and pressure lines. Native undo and redo restored byte-identical before/after previews.

The study saved as KRA and exported through Krita's own command-line exporter to ORA. Both reopened with all 15 layers and unchanged previews; the ORA merged image matched the exported PNG pixel for pixel. The bridge's own file tools still expose only KRA and PNG. The study is not a rig pack and did not replace Dot's game assets.

Artifacts, command logs, and verification reports are in `~/.local/share/krita6-mcp-test/`; its `README.md` records the checks and limitations. The candidate remains isolated, with no change to global MCP registrations.
