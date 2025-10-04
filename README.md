# bundrop

Serve a single file over HTTP so you can temporarily share it with someone.

Requirements: Bun.

## Usage

```bash
bunx bundrop ./file.zip -p 9999
```

You'll need to forward the port to the outside world if you want to share it with someone. One option is to use [ngrok](https://ngrok.com/) or [caddy](https://caddyserver.com/) or [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/do-more-with-tunnels/local-management/create-local-tunnel/).

### CloudFlare Tunnel setup (macOS)

```bash
# install cloudflared
brew install cloudflared
# login to cloudflare
cloudflared tunnel login
# create a quick temporary tunnel
cloudflared tunnel --url http://localhost:9999
```

This will give you a URL like https://temperature-statutes-boulders-shots.trycloudflare.com/. Send this to the person you want to share the file with.
