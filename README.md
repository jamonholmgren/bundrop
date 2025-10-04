# bundrop

Serve a single file over HTTP so you can temporarily share it with someone.

Requirements: Bun.

## Usage

```bash
# Simplest usage
bunx bundrop ./file.zip
# Create a cloudflare tunnel so you can share the file with someone
bunx bundrop --tunnel ./file.zip
# Full options
bunx bundrop --port 9876 --tunnel --debug ./file.zip
```

You'll need a CloudFlare account and `cloudflared` CLI installed to use the temporary tunnel. [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/do-more-with-tunnels/local-management/create-local-tunnel/).

### CloudFlare Tunnel setup (macOS)

```bash
# install cloudflared
brew install cloudflared
# login to cloudflare
cloudflared tunnel login
# create a quick temporary tunnel (bundrop will do this for you if you specify --tunnel)
cloudflared tunnel --url http://localhost:9999
```

This will give you a URL like https://temperature-statutes-boulders-shots.trycloudflare.com/. Send this to the person you want to share the file with.

You can also create a permanent tunnel. See the [Cloudflare Tunnel documentation](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/do-more-with-tunnels/local-management/create-local-tunnel/) for more details.

## License

MIT
