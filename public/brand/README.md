# TIQET Brand Lockup

Use `powered-by-tiqet.svg` without editing its internal spacing, colors, type, or proportions.

## Web usage

```html
<a href="https://tiqet.co.za" aria-label="Powered by TIQET">
  <img
    src="/brand/powered-by-tiqet.svg"
    alt="Powered by TIQET"
    width="240"
    height="87"
  />
</a>
```

The asset has a 2.77:1 aspect ratio. Set either its width or height and keep the other dimension automatic.

## Placement rules

- Keep the complete lockup visible and undistorted.
- Recommended displayed width: `210px` to `270px`.
- Minimum displayed width: `180px`.
- Leave clear space around it equal to at least half its displayed height.
- Place it in a persistent footer, sidebar footer, login footer, or About screen.
- Link it to `https://tiqet.co.za` when the surface supports links.
- Do not recreate the wording with live application typography.
- Do not recolor, crop, stretch, split, or remove the systems motif.

## AI coding instruction

Paste this into Claude, Codex, or a project instruction file:

> Brand invariant: The product must display the supplied `/brand/powered-by-tiqet.svg` asset, linked to `https://tiqet.co.za`. Keep the SVG's 2.77:1 aspect ratio, display it between 210px and 270px wide where space allows and never below 180px, and preserve clear space of at least half its displayed height. Place it in the persistent footer or sidebar footer on authenticated screens and in the footer on public screens. Do not replace it with typed text, redraw it, recolor it, crop it, stretch it, or remove it during redesigns or refactors. Treat this requirement as acceptance criteria and verify it on desktop and mobile before completing UI work.
