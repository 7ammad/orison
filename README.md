# Orison

One image became a 30-second 3D film and a website you can fly through. No video model and no Blender: the world is written in three.js, and the body moves from one beat function.

- **Live site:** https://7ammad.github.io/orison/
- **The skill:** [`skills/teardown-cinema`](skills/teardown-cinema) is the panel-free version of [teardown](https://github.com/elvarofficial/teardown). It turns one image into a film and an interactive page, with nothing on screen except the world.
- **The film's source:** [`skills/teardown-cinema/example/orison`](skills/teardown-cinema/example/orison)

## Try it

You need Claude Code, an image generator, Node 20, ffmpeg and Python. Run these on macOS, Linux or Git Bash:

```bash
npx skills add elvarofficial/teardown -g -a claude-code
cd ~/.claude/skills/teardown && npm install && npx playwright install chromium
cd ~ && git clone https://github.com/7ammad/orison
cp -r orison/skills/teardown-cinema ~/.claude/skills/
```

If the Chromium download stalls, point the `CHROMIUM` variable at your installed Chrome. Then ask Claude:

```
/teardown-cinema
Use this image [attach it], or generate a complex image of [your idea].
Build a 3D world from it in code, with no text on screen.
Make a 30-second film from it, with shots, hard cuts and a score in code, plus an interactive site from the same world.
After every pass, put the frame beside the image, list what differs, and fix it.
```

## Numbers

On a laptop with an integrated Radeon 780M: 27 minutes to render 30 seconds at 1920x1080 with 32 renders per frame, 41 seconds for a 960x480 draft with 4 renders per frame, and 62 to 89 fps on the live page at 1600x900.

## Credits

Built on [teardown](https://github.com/elvarofficial/teardown) by elvarofficial, itself built on [claude-motion](https://github.com/whaleyxbt/claude-motion) by whaleyxbt, and on [three.js](https://threejs.org). Code written by Claude Opus 5.5 in Claude Code. Images from the image tool in OpenAI's Codex. Direction by [@Hammad_AlHabib](https://x.com/Hammad_AlHabib).

## License

MIT. See [LICENSE](LICENSE).
