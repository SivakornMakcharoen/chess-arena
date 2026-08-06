import { WebSocketServer } from 'ws';

// ============================================================
// รีเลย์ WebSocket แบบง่าย เลียนแบบโปรโตคอล Phoenix Channel ที่ Supabase Realtime ใช้
// (topic / event / payload / ref) เพียงพอสำหรับสิ่งที่ frontend เรียกใช้จริง:
//   - phx_join  : ขอเข้าห้อง (topic)
//   - broadcast : ส่งข้อความกระจายให้ทุกคนใน topic เดียวกัน (ยกเว้นตัวเอง)
//   - heartbeat : แค่กันการเชื่อมต่อหลุด ไม่ต้องทำอะไรพิเศษ
// ไม่มีการเก็บ persistence ของข้อความ — เป็นแค่ตัวกลางส่งต่อสด (relay) เหมือนของเดิม
// ============================================================

export function attachRealtime(server) {
    const wss = new WebSocketServer({ server, path: '/realtime/v1/websocket' });

    // topic -> Set<ws>
    const rooms = new Map();

    function joinRoom(topic, ws) {
        if (!rooms.has(topic)) rooms.set(topic, new Set());
        rooms.get(topic).add(ws);
    }

    function leaveAllRooms(ws) {
        for (const [topic, sockets] of rooms.entries()) {
            sockets.delete(ws);
            if (sockets.size === 0) rooms.delete(topic);
        }
    }

    wss.on('connection', (ws) => {
        ws._topics = new Set();

        ws.on('message', (raw) => {
            let msg;
            try {
                msg = JSON.parse(raw.toString());
            } catch {
                return;
            }

            const { topic, event, payload, ref } = msg;

            if (event === 'heartbeat') {
                ws.send(JSON.stringify({ topic: 'phoenix', event: 'phx_reply', ref, payload: { status: 'ok', response: {} } }));
                return;
            }

            if (event === 'phx_join') {
                joinRoom(topic, ws);
                ws._topics.add(topic);
                ws.send(JSON.stringify({ topic, event: 'phx_reply', ref, payload: { status: 'ok', response: {} } }));
                return;
            }

            if (event === 'broadcast') {
                const sockets = rooms.get(topic);
                if (!sockets) return;
                const outgoing = JSON.stringify({ topic, event: 'broadcast', payload, ref: String(Date.now()) });
                for (const client of sockets) {
                    if (client !== ws && client.readyState === client.OPEN) {
                        client.send(outgoing);
                    }
                }
                return;
            }

            if (event === 'phx_leave') {
                if (rooms.get(topic)) rooms.get(topic).delete(ws);
                ws._topics.delete(topic);
                ws.send(JSON.stringify({ topic, event: 'phx_reply', ref, payload: { status: 'ok', response: {} } }));
            }
        });

        ws.on('close', () => leaveAllRooms(ws));
        ws.on('error', () => leaveAllRooms(ws));
    });

    return wss;
}
