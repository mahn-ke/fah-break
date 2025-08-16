import fs from 'fs';
import WebSocket from 'ws';
import readline from 'readline';

let lastAccessAt = null;
async function getLastDashboardAccess(logPath, maxLines = 100) {
    const lines = [];
    const fileStream = fs.createReadStream(logPath, { encoding: 'utf8' });

    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
    });

    for await (const line of rl) {
        if (lines.length >= maxLines) {
            lines.shift();
        }
        lines.push(line);
    }

    for (let i = lines.length - 1; i >= 0; i--) {
        const tsStr = parseLogLine(lines[i]);
        if (tsStr) {
            const timeStamp = parseTimestamp(tsStr);
            lastAccessAt = timeStamp;
            return lastAccessAt;
        }
    }

    return lastAccessAt;
}


const LOG_PATH = '/mnt/nginx-logs/access.log';
const CHECK_INTERVAL = 30 * 1000; // 30 seconds
const UNPAUSE_THRESHOLD = 30 * 60 * 1000; // 30 minutes

function parseLogLine(line) {
    // Example:
    // 91.67.124.93 - - [16/Jul/2025:19:58:45 +0200]  200 "GET /dashboard HTTP/1.1" 1752 "https://paperless.by.vincent.mahn.ke/..." "UserAgent" "-"
    const timestampWithQueryRegex = /\[(.*)\].*paperless\.by\.vincent\.mahn\.ke\/dashboard/;
    const match = line.match(timestampWithQueryRegex);
    if (match) {
        return match[1];
    }
    return null;
}

function parseTimestamp(str) {
    // Format: 16/Jul/2025:19:58:45 +0200
    // Convert to ISO string
    const [date, hours, minutes, seconds, tz] = str.split(/[: ]/g);
    console.log({date, hours, minutes, seconds, tz})
    const [day, month, year] = date.split('/');
    const months = {
        Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06',
        Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12'
    };
    const iso = `${year}-${months[month]}-${day}T${hours}:${minutes}:${seconds}${tz}`;
    return new Date(iso);
}

async function sendWs(state) {
    return new Promise((resolve, reject) => {
        const ws = new WebSocket('ws://host.docker.internal:7396/api/websocket');
        ws.on('open', () => {
            const now = new Date().toISOString();
            ws.send(JSON.stringify({ state, cmd: "state", time: now }));
        });
        ws.on('message', (data) => {
            try {
                const msg = JSON.parse(data);
                if (
                    Array.isArray(msg) &&
                    msg[0] === "groups" &&
                    msg[2] === "config" &&
                    msg[3] === "paused" &&
                    msg[4] === true
                ) {
                    setTimeout(() => ws.close(), 500);
                    resolve(msg);
                }
            } catch (e) {
                // Ignore parse errors
            }
        });
        ws.on('error', (err) => {
            console.error(`WebSocket error: ${err}`);
            reject(err);
        });
        ws.on('close', () => {
            console.log('WebSocket connection closed');
        });
    });
}

async function checkDashboardAccess() {
    console.log('Checking dashboard access...');
    try {
        const latestTimestamp = await getLastDashboardAccess(LOG_PATH);

        if (!latestTimestamp) {
            console.log(`Dashboard not accessed`);
            await sendWs("fold");
            return;
        } 
        console.log(`Dashboard last accessed at: ${latestTimestamp}`);

        const now = new Date();
        if (now - latestTimestamp > UNPAUSE_THRESHOLD) {
            console.log(`No dashboard access for over 30 minutes, unpausing FAHClient.`);
            await sendWs("fold");
            return;
        }

        console.log(`Dashboard was accessed within last 30 minutes, pausing FAHClient`);
        await sendWs("pause");
    } catch (err) {
        console.error(err);
    }
}

setInterval(() => { checkDashboardAccess(); }, CHECK_INTERVAL);
(async () => {
    console.log('Starting dashboard access check...');
    await checkDashboardAccess();
})();
console.log('Dashboard access check script is running...');