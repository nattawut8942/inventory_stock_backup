import { execFile } from 'child_process';

// IPv4 only, validated before it is ever passed to a process argument (no shell, no injection).
const IPV4_RE = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
const MAC_RE = /([0-9a-f]{2}[-:]){5}[0-9a-f]{2}/i;

// Client IP: X-Forwarded-For (first hop) if behind a proxy, else the socket address.
export const getClientIp = (req) => {
    const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    const ip = (forwarded || req.socket?.remoteAddress || '').replace(/^::ffff:/, '');
    return ip ? ip.slice(0, 45) : null;
};

const runCommand = (cmd, args) => new Promise((resolve) => {
    execFile(cmd, args, { timeout: 3000, windowsHide: true }, (err, stdout) => {
        resolve(err ? '' : String(stdout || ''));
    });
});

// Client MAC: read from the server's ARP cache.
// The browser cannot provide its MAC, so this only works when the client PC is on the
// same network segment as the server. For clients on another subnet it returns null.
export const getClientMac = async (ip) => {
    if (!ip || !IPV4_RE.test(ip)) return null;
    const out = process.platform === 'win32'
        ? await runCommand('arp', ['-a', ip])
        : await runCommand('ip', ['neigh', 'show', ip]);
    const m = out.match(MAC_RE);
    return m ? m[0].toUpperCase().replace(/-/g, ':') : null;
};

// Convenience: IP + MAC of the request that is performing the action.
export const captureClient = async (req) => {
    const ip = getClientIp(req);
    const mac = await getClientMac(ip);
    return { ip, mac };
};
